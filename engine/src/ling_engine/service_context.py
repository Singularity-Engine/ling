import os
import json
import asyncio
import time
import hashlib

from loguru import logger
from fastapi import WebSocket

from prompts import prompt_loader
from .live2d_model import Live2dModel
from .asr.asr_interface import ASRInterface
from .tts.tts_interface import TTSInterface
from .vad.vad_interface import VADInterface
from .agent.agents.agent_interface import AgentInterface
from .translate.translate_interface import TranslateInterface
from .config_manager.mcp_config_resolver import save_mcp_config

from .asr.asr_factory import ASRFactory
from .tts.tts_factory import TTSFactory
from .vad.vad_factory import VADFactory
from .agent.agent_factory import AgentFactory
from .translate.translate_factory import TranslateFactory

from .config_manager import (
    Config,
    AgentConfig,
    CharacterConfig,
    SystemConfig,
    ASRConfig,
    TTSConfig,
    VADConfig,
    TranslatorConfig,
    read_yaml,
    validate_config,
)

from typing import Optional
from loguru import logger
from fastapi import WebSocket

from .emotion_system import EmotionManager
from .emotion_system.affinity_storage import PgRedisAffinityStorage
from .config_manager import Config, SystemConfig, CharacterConfig
from .agent.agent_factory import AgentFactory
from .agent.stateless_llm_factory import create_llm
from .live2d_model import Live2dModel
from .asr.asr_interface import ASRInterface
from .tts.tts_interface import TTSInterface
from .vad.vad_interface import VADInterface
from .translate.translate_interface import TranslateInterface


class ServiceContext:
    """Service context class that holds all the services"""
    
    _default_instance = None
    _global_mcp_enabled = None  # 全局MCP开关，None表示使用配置文件中的设置
    
    @classmethod
    def get_default_context(cls) -> Optional["ServiceContext"]:
        """获取默认的服务上下文实例
        
        Returns:
            默认的服务上下文实例，如果未初始化则返回None
        """
        return cls._default_instance
    
    @classmethod
    def set_global_mcp_enabled(cls, enabled: bool) -> None:
        """设置全局MCP开关状态
        
        Args:
            enabled: True表示启用，False表示禁用
        """
        cls._global_mcp_enabled = enabled
    
    @classmethod
    def get_global_mcp_enabled(cls) -> Optional[bool]:
        """获取全局MCP开关状态
        
        Returns:
            全局MCP开关状态，None表示使用配置文件中的设置
        """
        return cls._global_mcp_enabled
    
    def __init__(self, user_id: str = "default_user"):
        self.config: Optional[Config] = None
        self.system_config: Optional[SystemConfig] = None
        self.character_config: Optional[CharacterConfig] = None

        self.live2d_model: Optional[Live2dModel] = None
        self.asr_engine: Optional[ASRInterface] = None
        self.tts_engine: Optional[TTSInterface] = None
        self.vad_engine: Optional[VADInterface] = None
        self.agent_engine = None
        self.emotion_manager = None
        self.translate_engine: Optional[TranslateInterface] = None
        
        # 性能优化：缓存TokenCalculator实例
        self._token_calculator = None

        # MCP 热更新跟踪
        self.mcp_client = None
        self.mcp_search_tool = None
        self._mcp_config_path: Optional[str] = None
        self._mcp_config_mtime: Optional[float] = None
        self._mcp_config_hash: Optional[str] = None

        # 过期工具检查计数器和间隔
        self._expiry_check_counter = 0
        self._expiry_check_interval = 1  # 每1次轮询检查一次过期工具

        self.system_prompt: Optional[str] = None
        self.system_prompt_base: Optional[str] = None
        self.history_uid: str = ""
        self._current_websocket: Optional[WebSocket] = None
        self.user_id: str = user_id  # 添加用户标识字段

    def set_websocket(self, websocket: WebSocket) -> None:
        """Set current WebSocket connection"""
        self._current_websocket = websocket
        if self.emotion_manager:
            self.emotion_manager.set_websocket(websocket)
    
    def set_user_id(self, user_id: str) -> None:
        """Set user identifier for this service context"""
        self.user_id = user_id
        logger.debug(f"ServiceContext user_id updated to: {user_id}")

    def create_copy(self) -> "ServiceContext":
        """创建ServiceContext的独立副本，确保每个客户端有独立的session

        Returns:
            ServiceContext: 新的独立副本
        """
        import copy

        # 创建新的ServiceContext实例
        new_context = ServiceContext(user_id=self.user_id)

        # 复制配置对象（这些通常是只读的，可以共享）
        new_context.config = self.config
        new_context.system_config = self.system_config
        new_context.character_config = self.character_config

        # 复制引擎实例（这些通常是无状态的，可以共享）
        new_context.live2d_model = self.live2d_model
        new_context.asr_engine = self.asr_engine
        new_context.tts_engine = self.tts_engine
        new_context.vad_engine = self.vad_engine
        new_context.translate_engine = self.translate_engine

        # 🔧 方案二：多用户状态隔离 - Agent引擎可以安全共享
        # 为每个用户创建独立的Agent副本，确保完全隔离
        if self.agent_engine:
            try:
                if hasattr(self.agent_engine, 'create_copy'):
                    new_context.agent_engine = self.agent_engine.create_copy()
                    logger.debug(f"✅ 为用户创建了{self.agent_engine.__class__.__name__}的独立副本，确保完全隔离")
                elif hasattr(self.agent_engine, '__copy__'):
                    new_context.agent_engine = copy.copy(self.agent_engine)
                    logger.debug(f"✅ 使用__copy__为用户创建了{self.agent_engine.__class__.__name__}的副本")
                else:
                    # 如果没有副本方法，则共享同一个实例（保持向后兼容性）
                    new_context.agent_engine = self.agent_engine
                    logger.warning(f"⚠️ {self.agent_engine.__class__.__name__}不支持副本创建，将共享实例（可能有状态冲突）")
            except Exception as e:
                logger.warning(f"创建{self.agent_engine.__class__.__name__}副本失败，将共享实例: {e}")
                new_context.agent_engine = self.agent_engine

        # 为每个客户端创建独立的emotion_manager实例
        if self.emotion_manager:
            try:
                if hasattr(self.emotion_manager, 'create_copy'):
                    new_context.emotion_manager = self.emotion_manager.create_copy()
                elif hasattr(self.emotion_manager, '__copy__'):
                    new_context.emotion_manager = copy.copy(self.emotion_manager)
                else:
                    new_context.emotion_manager = self.emotion_manager
                    logger.warning("Emotion管理器不支持副本创建，将共享同一实例")
            except Exception as e:
                logger.warning(f"创建emotion_manager副本失败，将共享同一实例: {e}")
                new_context.emotion_manager = self.emotion_manager

        # 复制其他状态变量
        new_context.system_prompt = self.system_prompt
        new_context.system_prompt_base = self.system_prompt_base
        new_context.history_uid = self.history_uid
        new_context._token_calculator = self._token_calculator

        # MCP相关配置可以共享
        new_context.mcp_client = self.mcp_client
        new_context.mcp_search_tool = self.mcp_search_tool
        new_context._mcp_config_path = self._mcp_config_path
        new_context._mcp_config_mtime = self._mcp_config_mtime
        new_context._mcp_config_hash = self._mcp_config_hash
        new_context._expiry_check_counter = self._expiry_check_counter
        new_context._expiry_check_interval = self._expiry_check_interval

        # WebSocket连接不复制，每个客户端会独立设置
        new_context._current_websocket = None

        logger.debug(f"✅ 已创建ServiceContext的独立副本，用户ID: {new_context.user_id}")
        return new_context

    def _notify_sessions_update(self) -> None:
        """通知所有WebSocket会话更新其代理引擎（热重载后）"""
        try:
            # 这个方法将由WebSocketHandler来实现具体的通知逻辑
            # 这里只是预留接口，实际通知在server.py中处理
            logger.info("🔄 准备通知所有会话更新代理引擎")
        except Exception as e:
            logger.warning(f"通知会话更新失败: {e}")

    def __str__(self):
        return (
            f"ServiceContext:\n"
            f"  User ID: {self.user_id}\n"
            f"  System Config: {'Loaded' if self.system_config else 'Not Loaded'}\n"
            f"    Details: {json.dumps(self.system_config.model_dump(), indent=6) if self.system_config else 'None'}\n"
            f"  Live2D Model: {self.live2d_model.model_info if self.live2d_model else 'Not Loaded'}\n"
            f"  ASR Engine: {type(self.asr_engine).__name__ if self.asr_engine else 'Not Loaded'}\n"
            f"    Config: {json.dumps(self.character_config.asr_config.model_dump(), indent=6) if self.character_config.asr_config else 'None'}\n"
            f"  TTS Engine: {type(self.tts_engine).__name__ if self.tts_engine else 'Not Loaded'}\n"
            f"    Config: {json.dumps(self.character_config.tts_config.model_dump(), indent=6) if self.character_config.tts_config else 'None'}\n"
            f"  LLM Engine: {type(self.agent_engine).__name__ if self.agent_engine else 'Not Loaded'}\n"
            f"    Agent Config: {json.dumps(self.character_config.agent_config.model_dump(), indent=6) if self.character_config.agent_config else 'None'}\n"
            f"  VAD Engine: {type(self.vad_engine).__name__ if self.vad_engine else 'Not Loaded'}\n"
            f"    Agent Config: {json.dumps(self.character_config.vad_config.model_dump(), indent=6) if self.character_config.vad_config else 'None'}\n"
            f"  System Prompt: {self.system_prompt or 'Not Set'}"
        )

    # ==== Initializers

    def load_cache(
        self,
        config: Config,
        system_config: SystemConfig,
        character_config: CharacterConfig,
        live2d_model: Live2dModel,
        asr_engine: ASRInterface,
        tts_engine: TTSInterface,
        vad_engine: VADInterface,
        agent_engine: AgentInterface,
        translate_engine: TranslateInterface | None,
        emotion_manager = None,  # 添加emotion_manager参数
    ) -> None:
        """
        Load the ServiceContext with the reference of the provided instances.
        Pass by reference so no reinitialization will be done.
        """
        if not character_config:
            raise ValueError("character_config cannot be None")
        if not system_config:
            raise ValueError("system_config cannot be None")

        self.config = config
        self.system_config = system_config
        self.character_config = character_config
        self.live2d_model = live2d_model
        self.asr_engine = asr_engine
        self.tts_engine = tts_engine
        self.vad_engine = vad_engine
        self.agent_engine = agent_engine
        self.translate_engine = translate_engine
        self.emotion_manager = emotion_manager  # 设置emotion_manager
        
        # 调试输出emotion_manager状态
        if self.emotion_manager:
            print("✅ 会话上下文：情绪系统已设置")
            logger.debug("✅ 会话上下文：emotion_manager已成功设置")
        else:
            print("⚠️ 会话上下文：情绪系统未设置")
            logger.warning("⚠️ 会话上下文：emotion_manager为None")

        logger.debug(f"Loaded service context with cache: {character_config}")

    def load_from_config(self, config: Config) -> bool:
        """Load services from config
        
        Args:
            config: Config object
            
        Returns:
            True if successful, False otherwise
        """
        try:
            self.config = config
            self.system_config = config.system_config
            
            # 设置为默认实例
            ServiceContext._default_instance = self
            
            # Load character config
            self.character_config = config.character_config

            # Validate and fix avatar path if needed
            self._validate_avatar_path()

            # Initialize all services
            self.init_all()
            return True
        except Exception as e:
            import traceback
            logger.error(f"Failed to load services from config: {e}")
            logger.error(f"Error type: {type(e).__name__}")
            logger.error(f"Traceback:\n{traceback.format_exc()}")
            return False

    def _validate_avatar_path(self):
        """验证头像文件路径，如果文件不存在则清空avatar字段"""
        if self.character_config.avatar:
            import os
            avatar_path = os.path.join("avatars", self.character_config.avatar)
            if not os.path.exists(avatar_path):
                logger.warning(f"头像文件不存在: {avatar_path}，将使用默认头像")
                # 不直接修改原配置，而是在运行时处理
                # self.character_config.avatar = ""
            else:
                logger.info(f"头像文件验证成功: {avatar_path}")

    def init_live2d(self, live2d_model_name: str) -> None:
        logger.info(f"Initializing Live2D: {live2d_model_name}")
        try:
            self.live2d_model = Live2dModel(live2d_model_name)
            self.character_config.live2d_model_name = live2d_model_name
        except Exception as e:
            logger.critical(f"Error initializing Live2D: {e}")
            logger.critical("Try to proceed without Live2D...")

    def init_asr(self, asr_config: ASRConfig) -> None:
        if not self.asr_engine or (self.character_config.asr_config != asr_config):
            logger.info(f"Initializing ASR: {asr_config.asr_model}")
            self.asr_engine = ASRFactory.get_asr_system(
                asr_config.asr_model,
                **getattr(asr_config, asr_config.asr_model).model_dump(),
            )
            # saving config should be done after successful initialization
            self.character_config.asr_config = asr_config
        else:
            logger.info("ASR already initialized with the same config.")

    def init_tts(self, tts_config: TTSConfig) -> None:
        if not self.tts_engine or (self.character_config.tts_config != tts_config):
            logger.info(f"Initializing TTS: {tts_config.tts_model}")
            self.tts_engine = TTSFactory.get_tts_engine(
                tts_config.tts_model,
                **getattr(tts_config, tts_config.tts_model.lower()).model_dump(),
            )
            # saving config should be done after successful initialization
            self.character_config.tts_config = tts_config
        else:
            logger.info("TTS already initialized with the same config.")

    def init_vad(self, vad_config: VADConfig) -> None:
        if not self.vad_engine or (self.character_config.vad_config != vad_config):
            logger.info(f"Initializing VAD: {vad_config.vad_model}")
            self.vad_engine = VADFactory.get_vad_engine(
                vad_config.vad_model,
                **getattr(vad_config, vad_config.vad_model.lower()).model_dump(),
            )
            # saving config should be done after successful initialization
            self.character_config.vad_config = vad_config
        else:
            logger.info("VAD already initialized with the same config.")

    def init_emotion_system(self):
        """Initialize emotion system"""
        logger.info("🎭 正在初始化情绪系统")
        
        try:
            # 亲密度存储：仅使用 PG+Redis
            affinity_storage = PgRedisAffinityStorage()
            logger.debug("✅ 好感度存储系统创建成功")
            
            # Get LLM provider from config if available
            llm_provider = None
            if (self.character_config and 
                self.character_config.agent_config and 
                self.character_config.agent_config.agent_settings and
                hasattr(self.character_config.agent_config.agent_settings, 'basic_memory_agent')):
                llm_provider = self.character_config.agent_config.agent_settings.basic_memory_agent.llm_provider
                logger.debug(f"✅ 找到LLM提供商配置: {llm_provider}")
            else:
                logger.debug("⚠️ 未找到LLM提供商配置，使用默认设置")
                
            self.emotion_manager = EmotionManager(affinity_storage, llm_provider)
            logger.debug("✅ 情绪管理器创建成功")
            
            # Set Live2D model if available
            if self.live2d_model:
                self.emotion_manager.set_live2d_model(self.live2d_model)
                logger.debug("✅ Live2D模型已连接到情绪系统")
            else:
                logger.debug("⚠️ 未找到Live2D模型")
                
            # Set current websocket if available
            if self._current_websocket:
                self.emotion_manager.set_websocket(self._current_websocket)
                logger.debug("✅ WebSocket已连接到情绪系统")
            else:
                logger.debug("⚠️ WebSocket未连接")

            logger.info("✅ 情绪系统初始化成功")
            
        except Exception as e:
            logger.error(f"❌ 情绪系统初始化失败: {e}")
            self.emotion_manager = None

    def init_agent(self):
        """Initialize the agent"""
        if not self.character_config or not self.character_config.agent_config:
            logger.error("Agent config not loaded")
            return
            
        agent_config = self.character_config.agent_config
        # logger.info(f"Initializing Agent: {agent_config.conversation_agent_choice}")
        
        try:
            # Create LLM
            llm = create_llm(self.config)
            if not llm:
                logger.error("Failed to create LLM")
                return
                
            # Construct system prompt with tool prompts
            system_prompt = self.construct_system_prompt(self.character_config.persona_prompt, is_ai_initiated=False)
            # if self.live2d_model:
            #     # Add Live2D expression information to system prompt  
            #     system_prompt = f"{system_prompt}\n\nYou can use these expressions in your responses: {self.live2d_model.emo_str}"

            # Save base system prompt for later dynamic emotion injection per-turn
            self.system_prompt_base = system_prompt

            # Inject emotion/affinity prompt so it works for all agent types (including Langchain wrapper)
            try:
                # Avoid double-injection when using EmotionalBasicMemoryAgent (it injects again during set_memory_from_history)
                should_inject_emotion_prompt = True
                try:
                    if (
                        self.character_config
                        and self.character_config.agent_config
                        and getattr(self.character_config.agent_config, 'conversation_agent_choice', None)
                        in ["emotional_basic_memory", "emotional_basic_memory_agent"]
                    ):
                        should_inject_emotion_prompt = False
                except Exception:
                    pass

                if self.emotion_manager and should_inject_emotion_prompt:
                    # 获取用户ID - 优先从Context Variable，回退到service context的user_id，最后使用默认值
                    user_id_for_affinity = None
                    try:
                        from .bff_integration.auth.user_context import UserContextManager
                        user_id_for_affinity = UserContextManager.get_current_user_id()
                        if user_id_for_affinity:
                            logger.debug(f"🎯 construct_system_prompt: 从Context Variable获取用户ID: {user_id_for_affinity}")
                    except Exception as ctx_error:
                        logger.debug(f"Context Variable获取用户ID失败: {ctx_error}")
                        
                    if not user_id_for_affinity:
                        user_id_for_affinity = self.user_id or "default_user"
                        logger.debug(f"🎯 construct_system_prompt: 使用服务上下文或默认用户ID: {user_id_for_affinity}")
                    
                    affinity_value = self.emotion_manager.get_affinity(self.character_config.conf_uid, user_id_for_affinity)
                    emotion_prompt = self.emotion_manager.get_emotion_prompt(affinity_value)
                    system_prompt = "\n\n".join([system_prompt, emotion_prompt])
                    logger.info(f"🧠 已注入情感提示: affinity={affinity_value}, user_id={user_id_for_affinity}")
                    # Console print for quick visibility
                    try:
                        logger.info(f"当前好感度（初始化）: {affinity_value}（用户: {user_id_for_affinity}）")
                    except Exception:
                        pass
            except Exception as e:
                logger.warning(f"注入情感提示失败: {e}")
            
            # Print final system prompt after initial injection


            logger.debug(f"Using system prompt: {system_prompt}")
            
            # Initialize MCP tools
            logger.info("🔧 开始初始化MCP工具...")
            logger.info(f"🔧 MCP工具模式: {self.system_config.mcp_tool_mode}")
            mcp_config = self.system_config.mcp_tools_config
            logger.info(f"🔧 MCP配置: enabled={mcp_config.enabled}, config_file={mcp_config.config_file}")
            if mcp_config.enabled:
                try:
                    # 严格按照 math_client.py 的方法
                    from langchain_mcp_adapters.client import MultiServerMCPClient
                    
                    # 读取 MCP 配置并转换为 MultiServerMCPClient 格式
                    import json
                    import os
                    
                    # 智能查找配置文件路径
                    config_file = mcp_config.config_file

                    # 优先使用环境变量 MCP_CONFIG_PATH（可指向文件或目录）
                    env_cfg = os.environ.get("MCP_CONFIG_PATH")
                    if env_cfg:
                        env_path = os.path.join(env_cfg, config_file) if os.path.isdir(env_cfg) else env_cfg
                        if os.path.exists(env_path):
                            config_file = env_path
                            logger.info(f"Found MCP config via MCP_CONFIG_PATH: {config_file}")

                    # 其次尝试用户要求的统一路径（Windows 绝对路径），仅当存在时启用
                    fallback_unified = r"D:\\ling-engine\\ling-engine\\enhanced_mcp_config.json"
                    try:
                        if not os.path.isabs(config_file) and os.path.exists(fallback_unified):
                            config_file = fallback_unified
                            logger.info(f"Using unified MCP config path: {config_file}")
                    except Exception:
                        pass
 
                    if not os.path.exists(config_file):
                        # 尝试在当前目录查找
                        current_dir = os.getcwd()
                        possible_paths = [
                            config_file,
                            os.path.join(current_dir, config_file),
                            os.path.join(os.path.dirname(__file__), config_file),
                            os.path.join(os.path.dirname(__file__), "..", "..", "..", config_file),
                            os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", config_file),
                            os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", config_file),
                        ]
                        
                        config_file = None
                        for path in possible_paths:
                            if os.path.exists(path):
                                config_file = path
                                logger.info(f"Found MCP config at: {config_file}")
                                break
                        
                        if not config_file:
                            logger.error(f"❌ 无法找到MCP配置文件: {mcp_config.config_file}")
                            logger.error(f"❌ 搜索路径: {possible_paths}")
                            raise FileNotFoundError(f"Could not find MCP config file: {mcp_config.config_file}")
                    
                    logger.info(f"✅ 找到MCP配置文件: {config_file}")
                    # 记录配置文件路径与修改时间，用于热更新
                    try:
                        self._mcp_config_path = config_file
                        if os.path.exists(config_file):
                            self._mcp_config_mtime = os.path.getmtime(config_file)
                        else:
                            self._mcp_config_mtime = None
                    except Exception as _e:
                        logger.warning(f"记录MCP配置文件修改时间失败: {str(_e)}")
                    
                    with open(config_file, 'r', encoding='utf-8') as f:
                        mcp_tool_config = json.load(f)
                    logger.info(f"✅ 成功读取MCP配置: {len(mcp_tool_config.get('mcpServers', {}))} 个服务器")

                    # 记录当前文件哈希
                    try:
                        with open(config_file, 'rb') as rf:
                            self._mcp_config_hash = hashlib.md5(rf.read()).hexdigest()
                    except Exception:
                        self._mcp_config_hash = None

                    # 清理过期的服务器并回写配置
                    try:
                        original_servers = mcp_tool_config.get("mcpServers", {})
                        pruned_servers = {}
                        removed = []
                        for server_name, server_info in original_servers.items():
                            expire_time = server_info.get("expireTime")
                            if expire_time:
                                try:
                                    from datetime import datetime
                                    expire_dt = datetime.strptime(expire_time, "%Y-%m-%d %H:%M:%S")
                                    if datetime.now() > expire_dt:
                                        removed.append(server_name)
                                        continue
                                except Exception:
                                    # 无法解析时间格式，则不按过期处理
                                    pass
                            pruned_servers[server_name] = server_info

                        if removed:
                            mcp_tool_config["mcpServers"] = pruned_servers
                            # 先直接写回到当前实际使用的绝对路径
                            try:
                                with open(config_file, 'w', encoding='utf-8') as wf:
                                    json.dump(mcp_tool_config, wf, indent=2, ensure_ascii=False)
                                logger.info(f"🧹 已直接写回配置并删除过期MCP服务器: {removed}; 写回路径: {config_file}")
                                # 更新 mtime 与 hash 快照
                                try:
                                    self._mcp_config_mtime = os.path.getmtime(config_file)
                                except Exception:
                                    pass
                                try:
                                    with open(config_file, 'rb') as rf2:
                                        self._mcp_config_hash = hashlib.md5(rf2.read()).hexdigest()
                                except Exception:
                                    pass
                            except Exception as _se:
                                logger.warning(f"直接写回配置失败: {_se}")
                            # 再调用save_mcp_config以更新解析器缓存（若解析器使用）
                            try:
                                _ = save_mcp_config(mcp_tool_config, config_filename=os.path.basename(config_file))
                            except Exception:
                                pass
                    except Exception as _e:
                        logger.warning(f"清理过期MCP服务器时发生错误: {_e}")
                    
                    # 转换配置格式，完全按照 math_client.py 的 get_server_config() 格式
                    server_config = {}
                    for server_name, server_info in mcp_tool_config.get("mcpServers", {}).items():
                        if server_info.get("enabled", False):
                            # 修正传输类型映射：将 rest/streamableHttp/http 统一为 streamable_http
                            raw_type = server_info.get("type", "sse")
                            transport = "streamable_http" if str(raw_type).lower() in ("rest", "streamablehttp", "http", "streamable_http") else str(raw_type).lower()
                            
                            server_config[server_name] = {
                                "url": server_info["url"],
                                "transport": transport  # 确保使用支持的传输类型
                            }
                    
                    if server_config:
                        logger.info(f"✅ MCP服务器配置: {server_config}")
                        # 创建 MultiServerMCPClient，完全按照 math_client.py 的方式
                        base_mcp_client = MultiServerMCPClient(server_config)
                        logger.info("✅ 基础MCP客户端创建成功")
                        
                        # 添加MCP搜索工具功能
                        logger.info("Adding MCP search tool to configuration...")
                        from .mcp_search_tool import mcp_search_tool
                        from .mcp_search_adapter import enhance_mcp_client
                        
                        # 配置搜索工具
                        search_api_url = mcp_tool_config.get("searchApiUrl", "http://13.54.95.72:8080/mcp/search/agent")
                        mcp_search_tool.search_api_url = search_api_url
                        mcp_search_tool.config_path = config_file
                        
                        # 增强MCP客户端，添加搜索工具
                        self.mcp_client = enhance_mcp_client(base_mcp_client, mcp_search_tool, server_config=server_config)
                        logger.info("✅ 增强型MCP客户端创建成功，包含搜索工具与逐台回退聚合")
                        
                        # 保存搜索工具引用
                        self.mcp_search_tool = mcp_search_tool
                        
                        # 暂时设置为空列表，工具将在 agent 创建时异步获取
                        tools = []
                        logger.info("🚀 MCP客户端初始化完成，工具将在创建代理时异步加载")
                        logger.info(f"🎯 MCP客户端类型: {type(self.mcp_client)}")
                    else:
                        logger.warning("⚠️ 配置中没有找到启用的MCP服务器")
                        tools = []
                        self.mcp_client = None
                        self.mcp_search_tool = None
                        
                except Exception as e:
                    error_type = type(e).__name__
                    error_msg = str(e)
                    logger.error(f"❌ MCP客户端初始化失败: {error_type}: {error_msg}")
                    logger.error(f"❌ 异常详情: {str(e)}", exc_info=True)
                    
                    # 提供详细的错误诊断
                    if "ConnectTimeout" in error_type or "ConnectError" in error_type:
                        logger.error("🌐 网络连接问题：无法连接到MCP服务器")
                        logger.error("💡 建议：检查网络连接或稍后重试")
                    elif "TimeoutError" in error_type:
                        logger.error("⏰ 请求超时：服务器响应时间过长")
                        logger.error("💡 建议：网络可能较慢，请稍后重试")
                    elif "FileNotFoundError" in error_type:
                        logger.error("📁 配置文件问题：无法找到MCP配置文件")
                        logger.error("💡 建议：检查配置文件路径")
                    else:
                        logger.error(f"❓ 未知错误类型: {error_type}")
                    
                    logger.info("💡 系统将优雅降级到无MCP工具模式")
                    tools = []
                    self.mcp_client = None
                    self.mcp_search_tool = None
            else:
                logger.info("⚠️ MCP工具已禁用")
                tools = []
                self.mcp_client = None
                self.mcp_search_tool = None
            
            # Create agent with emotion support and tools
            logger.info(f"🤖 准备创建代理: {agent_config.conversation_agent_choice}")
            logger.info(f"🤖 MCP客户端状态: {self.mcp_client is not None}")
            logger.info(f"🤖 MCP客户端类型: {type(self.mcp_client) if self.mcp_client else 'None'}")
            
            self.agent_engine = AgentFactory.create_agent(
                conversation_agent_choice=agent_config.conversation_agent_choice,
                llm=llm,
                system=system_prompt,
                live2d_model=self.live2d_model,
                emotion_manager=self.emotion_manager,
                tts_preprocessor_config=self.character_config.tts_preprocessor_config,
                mcp_client=self.mcp_client,  # 传递 MCP 客户端而不是工具列表
            )
            
            logger.info(f"🚀 代理创建完成: {type(self.agent_engine).__name__}")
            logger.info(f"🚀 代理类型: {type(self.agent_engine)}")
            
            if not self.agent_engine:
                logger.error("❌ Agent creation returned None - this will cause conversation errors")
                logger.error("❌ Possible causes: LLM config issues, MCP client creation failure, or agent factory error")
                # Don't return here - let the system continue with a warning
                # The null checks we added in single_conversation.py will handle this gracefully

            # Save system prompt
            self.system_prompt = system_prompt

            if self.agent_engine:
                logger.info("✅ Agent initialized successfully")
            else:
                logger.warning("⚠️ System initialized with NULL agent - conversations will be rejected")

        except Exception as e:
            logger.error(f"❌ Failed to create agent: {e}", exc_info=True)
            logger.error("❌ System will continue with NULL agent - conversations will be rejected")
            # Don't return here - let the system continue with degraded functionality

    async def watch_mcp_config(self, interval_seconds: float = 1.0):
        """监听 MCP 配置变更，优先使用 watchdog 实时监听，失败则回退到轮询。"""
        # logger.info(f"🔄 MCP 配置热更新监听已启动，优先使用 watchdog；轮询间隔 {interval_seconds}s")

        async def _reload_now():
            logger.info("♻️ 检测到 MCP 配置变更，开始热更新...")
            
            # 检查是否只是工具有效期更新
            is_only_expiry_update = False
            try:
                config_path = self._mcp_config_path
                if config_path and os.path.exists(config_path):
                    # 读取当前配置
                    with open(config_path, 'r', encoding='utf-8') as f:
                        current_config = json.load(f)
                    
                    # 比较工具列表是否变化
                    if hasattr(self, '_last_tools_list'):
                        current_tools = set(current_config.get("mcpServers", {}).keys())
                        if current_tools == self._last_tools_list:
                            # 检查是否只有expireTime字段变化
                            is_only_expiry_update = True
                            for tool_name in current_tools:
                                if tool_name not in self._last_tools_config:
                                    is_only_expiry_update = False
                                    break
                                
                                old_tool = self._last_tools_config.get(tool_name, {})
                                new_tool = current_config.get("mcpServers", {}).get(tool_name, {})
                                
                                # 复制并移除expireTime进行比较
                                old_tool_copy = old_tool.copy() if isinstance(old_tool, dict) else {}
                                new_tool_copy = new_tool.copy() if isinstance(new_tool, dict) else {}
                                
                                old_tool_copy.pop("expireTime", None)
                                new_tool_copy.pop("expireTime", None)
                                
                                if old_tool_copy != new_tool_copy:
                                    is_only_expiry_update = False
                                    break
                    
                    # 保存当前工具列表和配置
                    self._last_tools_list = set(current_config.get("mcpServers", {}).keys())
                    self._last_tools_config = current_config.get("mcpServers", {})
            except Exception as e:
                logger.warning(f"检查配置变更类型时出错: {e}")
                is_only_expiry_update = False

            # 如果只是有效期更新，使用轻量级重载
            if is_only_expiry_update:
                logger.info("🕒 检测到仅有工具有效期更新，使用轻量级重载")
                # 更新配置但不重置代理
                try:
                    # 更新mtime和hash快照
                    if self._mcp_config_path and os.path.exists(self._mcp_config_path):
                        self._mcp_config_mtime = os.path.getmtime(self._mcp_config_path)
                        with open(self._mcp_config_path, 'rb') as rf:
                            self._mcp_config_hash = hashlib.md5(rf.read()).hexdigest()
                    return  # 跳过完整重载
                except Exception as e:
                    logger.warning(f"轻量级重载失败: {e}")
            
            # 清理旧代理和客户端状态
            try:
                # 先清理旧代理的工具和状态
                old_agent = self.agent_engine
                if old_agent is not None and hasattr(old_agent, 'reset_tools_and_agent'):
                    old_agent.reset_tools_and_agent()
                    logger.info("🧹 已重置旧代理的工具和状态")
                
                # 处理MCP客户端缓存和热重载逻辑
                old_client = self.mcp_client
                
                # 检查是否是配置更新触发的热重载
                is_config_update = False
                try:
                    config_path = self._mcp_config_path
                    if config_path and os.path.exists(config_path):
                        # 比较配置文件的修改时间，如果太新（5秒内），说明刚刚更新了配置
                        mtime = os.path.getmtime(config_path)
                        current_time = time.time()
                        if current_time - mtime < 5.0:  # 5秒内修改的配置文件
                            is_config_update = True
                            logger.info("🆕 检测到配置文件更新，将重新加载工具（不保留缓存）")
                        else:
                            logger.info("💾 配置文件未更新，尝试保留工具缓存")
                except Exception as e:
                    logger.warning(f"检查配置文件修改时间失败: {e}")
                
                if old_client is not None and hasattr(old_client, 'clear_tools_cache'):
                    # 如果是配置更新，清理缓存让系统重新加载
                    if is_config_update:
                        old_client.clear_tools_cache()
                        logger.info("🧹 配置更新，已清理工具缓存，系统将重新加载工具")
                    else:
                        logger.info("💾 保留现有工具缓存供新代理使用")
                    
                    close_coro = getattr(old_client, "close", None)
                    if callable(close_coro):
                        result = close_coro()
                        if asyncio.iscoroutine(result):
                            await result
                        logger.info("🧹 旧 MCP 客户端已关闭")
            except Exception as _e:
                logger.warning(f"关闭旧 MCP 客户端时出错: {str(_e)}")

            # 重新初始化 agent（使用之前保存的缓存）
            try:
                
                self.init_agent()
                
                # 注意：新的MCP客户端将根据配置重新加载工具并建立新的缓存
                # 通知所有WebSocket连接更新其会话上下文中的代理引擎
                self._notify_sessions_update()
                # 刷新 mtime/hash 快照
                try:
                    if self._mcp_config_path and os.path.exists(self._mcp_config_path):
                        self._mcp_config_mtime = os.path.getmtime(self._mcp_config_path)
                        with open(self._mcp_config_path, 'rb') as rf:
                            self._mcp_config_hash = hashlib.md5(rf.read()).hexdigest()
                except Exception:
                    pass
                logger.info("✅ MCP 配置热更新完成")
            except Exception as _e:
                logger.error(f"MCP 配置热更新失败: {_e}")

        # 轮询循环（可与watchdog并行运行）
        async def _poll_loop():
            while True:
                try:
                    config_path = self._mcp_config_path
                    if not config_path or not os.path.exists(config_path):
                        await asyncio.sleep(interval_seconds)
                        continue

                    current_mtime = None
                    current_hash = None
                    try:
                        current_mtime = os.path.getmtime(config_path)
                    except Exception:
                        pass
                    try:
                        with open(config_path, 'rb') as rf:
                            current_hash = hashlib.md5(rf.read()).hexdigest()
                    except Exception:
                        pass

                    if (
                        (self._mcp_config_mtime is not None and current_mtime is not None and current_mtime > self._mcp_config_mtime)
                        or (self._mcp_config_hash is not None and current_hash is not None and current_hash != self._mcp_config_hash)
                    ):
                        await _reload_now()

                    if self._mcp_config_mtime is None and current_mtime is not None:
                        self._mcp_config_mtime = current_mtime
                    if self._mcp_config_hash is None and current_hash is not None:
                        self._mcp_config_hash = current_hash
                except Exception as loop_err:
                    logger.warning(f"MCP 配置热更新轮询异常: {loop_err}")

                await asyncio.sleep(interval_seconds)

        # 尝试使用 watchdog，并并行启动轮询作为兜底
        try:
            from watchdog.observers import Observer
            from watchdog.events import FileSystemEventHandler

            class _MCPHandler(FileSystemEventHandler):
                def __init__(self, ctx: "ServiceContext", target_path: str):
                    self._ctx = ctx
                    self._target = os.path.abspath(target_path)
                    self._last = 0.0

                def _maybe_reload(self, path: str):
                    try:
                        if os.path.abspath(path) == self._target:
                            now = time.time()
                            # 简单去抖：500ms 内忽略重复事件
                            if now - self._last < 0.5:
                                return
                            self._last = now
                            # 内容差异检测（hash）
                            try:
                                with open(self._target, 'rb') as rf:
                                    current_hash = hashlib.md5(rf.read()).hexdigest()
                            except Exception:
                                current_hash = None
                            if self._ctx._mcp_config_hash and current_hash and current_hash == self._ctx._mcp_config_hash:
                                # 内容未变化，忽略
                                return
                            loop = asyncio.get_event_loop()
                            loop.create_task(_reload_now())
                    except Exception:
                        pass

                def on_modified(self, event):
                    if not event.is_directory:
                        self._maybe_reload(event.src_path)

                def on_moved(self, event):
                    if not event.is_directory:
                        # 处理原子替换（临时文件重命名为目标文件）
                        self._maybe_reload(getattr(event, 'dest_path', ''))

                def on_created(self, event):
                    if not event.is_directory:
                        self._maybe_reload(event.src_path)

            config_path = self._mcp_config_path
            if config_path and os.path.exists(config_path):
                observer = Observer()
                observer.schedule(_MCPHandler(self, config_path), os.path.dirname(config_path) or '.', recursive=False)
                observer.daemon = True
                observer.start()
                # logger.info("✅ 正在使用 watchdog 实时监听 MCP 配置变更")

                # 并行启动轮询兜底
                asyncio.create_task(_poll_loop())

                # 保持协程存活
                while True:
                    await asyncio.sleep(3600)
            else:
                logger.warning("MCP 配置路径未知或不存在，仅使用轮询模式")
                await _poll_loop()
        except Exception:
            # 如果 watchdog 初始化失败，仅使用轮询
            await _poll_loop()
            
    def init_translate(self, translator_config: TranslatorConfig) -> None:
        """Initialize or update the translation engine based on the configuration."""

        if not translator_config.translate_audio:
            logger.debug("Translation is disabled.")
            return

        if (
            not self.translate_engine
            or self.character_config.tts_preprocessor_config.translator_config
            != translator_config
        ):
            logger.info(
                f"Initializing Translator: {translator_config.translate_provider}"
            )
            self.translate_engine = TranslateFactory.get_translator(
                translator_config.translate_provider,
                getattr(
                    translator_config, translator_config.translate_provider
                ).model_dump(),
            )
            self.character_config.tts_preprocessor_config.translator_config = (
                translator_config
            )
        else:
            logger.info("Translation already initialized with the same config.")

    def init_all(self):
        """Initialize all services"""
        if not self.character_config:
            logger.error("Character config not loaded")
            return
            
        self.init_live2d(self.character_config.live2d_model_name)

        # 临时跳过ASR初始化以解决大模型无法启动的问题
        try:
            self.init_asr(self.character_config.asr_config)
        except Exception as e:
            logger.warning(f"⚠️ ASR初始化失败，跳过: {e}")
            self.asr_engine = None

        try:
            self.init_tts(self.character_config.tts_config)
        except Exception as e:
            logger.warning(f"⚠️ TTS初始化失败，跳过: {e}")
            self.tts_engine = None

        try:
            self.init_vad(self.character_config.vad_config)
        except Exception as e:
            logger.warning(f"⚠️ VAD初始化失败，跳过: {e}")
            self.vad_engine = None

        # Initialize emotion system before agent (with error handling)
        try:
            self.init_emotion_system()
            logger.info("✅ 情绪系统初始化成功")
        except Exception as e:
            logger.error(f"❌ 情绪系统初始化失败: {e}")
            logger.warning("⚠️ 系统将在没有情绪功能的情况下继续运行")
            self.emotion_manager = None

        # Initialize translation if configured
        if self.character_config.tts_preprocessor_config and \
           self.character_config.tts_preprocessor_config.translator_config:
            self.init_translate(self.character_config.tts_preprocessor_config.translator_config)

        # Initialize agent (ensure this always runs)
        logger.info("🚀 开始初始化 Agent...")
        try:
            self.init_agent()
            if self.agent_engine:
                logger.info("✅ Agent 初始化成功")
            else:
                logger.error("❌ Agent 初始化失败 - agent_engine 为 None")
        except Exception as e:
            logger.error(f"❌ Agent 初始化过程中发生异常: {e}")
            import traceback
            logger.error(f"❌ Agent 初始化异常详情: {traceback.format_exc()}")

        # Initialize Soul System (non-blocking)
        try:
            from .soul.config import get_soul_config
            if get_soul_config().enabled:
                asyncio.ensure_future(self._init_soul_system())
        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"⚠️ 灵魂系统初始化跳过: {e}")

    async def _init_soul_system(self):
        """异步初始化灵魂系统 — MongoDB 连接 + 索引"""
        try:
            from .soul.storage.soul_collections import ensure_indexes
            await ensure_indexes()
            logger.info("🧠 灵魂系统初始化完成")
        except Exception as e:
            logger.warning(f"🧠 灵魂系统初始化失败 (非致命): {e}")

    # ==== utils

    def construct_system_prompt(self, persona_prompt: str, is_ai_initiated: bool = False) -> str:
        """
        Append tool prompts to persona prompt.

        Parameters:
        - persona_prompt (str): The persona prompt.

        Returns:
        - str: The system prompt with all tool prompts appended.
        """
        logger.debug(f"constructing persona_prompt: '''{persona_prompt}'''")

        # 在系统提示词开头注入当前时间
        from datetime import datetime
        current_time = datetime.now().strftime("%B %d, %Y %H:%M:%S")
        time_prompt = f"\n\n当前时间: {current_time}\n对话中非必要不要体现这个时间信息。\n"
        persona_prompt = persona_prompt + time_prompt

        # 检查MCP工具是否启用
        mcp_enabled = self._is_mcp_tools_enabled()
        logger.info(f"MCP工具启用状态: {mcp_enabled}")

        for prompt_name, prompt_file in self.system_config.tool_prompts.items():
            logger.debug(f"处理提示词: 名称={prompt_name}, 文件={prompt_file}")
            
            if prompt_name == "group_conversation_prompt":
                logger.debug("跳过group_conversation_prompt")
                continue
                
            # 检查是否是MCP相关提示词
            is_mcp_prompt = "mcp" in prompt_name.lower()

            # 如果MCP工具未启用，跳过MCP相关提示词
            if is_mcp_prompt and not mcp_enabled:
                logger.info(f"跳过MCP相关提示词 '{prompt_name}' (文件: {prompt_file})，因为MCP工具已禁用")
                continue

            # 如果是AI主动发起的对话，跳过MCP搜索相关的提示词以避免过度思考
            if is_ai_initiated and prompt_name == "mcp_search_prompt":
                logger.info(f"跳过MCP搜索提示词 '{prompt_name}' (文件: {prompt_file})，因为是AI主动发起的对话，避免过度思考")
                continue

            prompt_content = prompt_loader.load_util(prompt_file)
            logger.debug(f"已加载提示词内容，长度: {len(prompt_content)}")

            if prompt_name == "live2d_expression_prompt":
                # 检查Live2D模型是否可用
                if self.live2d_model and hasattr(self.live2d_model, 'emo_str'):
                    prompt_content = prompt_content.replace(
                        "[<insert_emomap_keys>]", self.live2d_model.emo_str
                    )
                    logger.debug("已处理live2d_expression_prompt中的表情映射")
                else:
                    # 如果Live2D模型不可用，移除占位符或提供默认值
                    prompt_content = prompt_content.replace(
                        "[<insert_emomap_keys>]", "happy, sad, shy, angry, wink, blush"
                    )
                    logger.warning("Live2D模型不可用，使用默认表情映射")
                
            # 如果是MCP相关提示词，记录日志
            if is_mcp_prompt:
                logger.info(f"添加MCP相关提示词 '{prompt_name}' (文件: {prompt_file})")

            persona_prompt += prompt_content
            logger.debug(f"已添加提示词 '{prompt_name}'，当前提示词总长度: {len(persona_prompt)}")

        logger.debug("\n === System Prompt ===")
        logger.debug(persona_prompt)

        return persona_prompt

    def get_system_prompt_for_ai_initiated(self) -> str:
        """
        为AI主动发起的对话获取系统提示词，不包含MCP搜索提示词以避免过度思考

        Returns:
            str: 适用于AI主动发起对话的系统提示词
        """
        logger.info("构建AI主动发起对话的系统提示词（跳过MCP搜索提示）")

        # 构建系统提示词，标记为AI主动发起
        ai_initiated_prompt = self.construct_system_prompt(
            self.character_config.persona_prompt,
            is_ai_initiated=True
        )

        # 应用情感/好感度提示（如果有的话）
        try:
            if self.emotion_manager:
                user_id_for_affinity = None
                try:
                    from .bff_integration.auth.user_context import UserContextManager
                    user_id_for_affinity = UserContextManager.get_current_user_id()
                    if user_id_for_affinity:
                        logger.debug(f"🎯 AI主动对话: 从Context Variable获取用户ID: {user_id_for_affinity}")
                except Exception as ctx_error:
                    logger.debug(f"Context Variable获取用户ID失败: {ctx_error}")

                if not user_id_for_affinity:
                    user_id_for_affinity = self.user_id or "default_user"
                    logger.debug(f"🎯 AI主动对话: 使用服务上下文或默认用户ID: {user_id_for_affinity}")

                affinity_value = self.emotion_manager.get_affinity(self.character_config.conf_uid, user_id_for_affinity)
                emotion_prompt = self.emotion_manager.get_emotion_prompt(affinity_value)
                ai_initiated_prompt = "\n\n".join([ai_initiated_prompt, emotion_prompt])
                logger.info(f"🧠 AI主动对话已注入情感提示: affinity={affinity_value}, user_id={user_id_for_affinity}")
        except Exception as e:
            logger.warning(f"AI主动对话注入情感提示失败: {e}")

        logger.debug(f"AI主动发起对话使用的系统提示词: {ai_initiated_prompt}")
        return ai_initiated_prompt

    def _is_mcp_tools_enabled(self) -> bool:
        """检查MCP工具是否启用
        
        按照以下优先级检查MCP工具的启用状态：
        1. 命令行参数（通过ServiceContext静态变量）
        2. 环境变量LING_ENGINE_MCP_ENABLED
        3. 配置文件中的system_config.mcp_tools_config.enabled设置
        
        Returns:
            True如果MCP工具启用，False如果禁用
        """
        try:
            # 1. 检查命令行参数（通过ServiceContext静态变量）
            global_mcp_enabled = ServiceContext.get_global_mcp_enabled()
            if global_mcp_enabled is not None:
                logger.info(f"使用全局MCP开关状态（命令行参数）: {global_mcp_enabled}")
                return global_mcp_enabled
            
            # 2. 检查环境变量
            import os
            env_mcp_enabled = os.environ.get("LING_ENGINE_MCP_ENABLED")
            if env_mcp_enabled is not None:
                enabled = env_mcp_enabled.lower() in ("true", "1", "yes", "y", "on")
                logger.info(f"使用环境变量MCP开关状态: {enabled}")
                return enabled
            
            # 3. 检查配置文件中的设置
            if self.system_config and self.system_config.mcp_tools_config:
                enabled = self.system_config.mcp_tools_config.enabled
                logger.info(f"使用配置文件MCP开关状态: {enabled}")
                return enabled
                
            # 如果无法获取任何设置，则默认为启用
            logger.info("无法获取MCP开关状态，默认为启用")
            return True
        except Exception as e:
            logger.warning(f"无法获取MCP工具启用状态: {e}")
            # 默认为启用
            return True

    async def handle_config_switch(
        self,
        websocket: WebSocket,
        config_file_name: str,
    ) -> None:
        """
        Handle the configuration switch request.
        Change the configuration to a new config and notify the client.

        Parameters:
        - websocket (WebSocket): The WebSocket connection.
        - config_file_name (str): The name of the configuration file.
        """
        try:
            new_character_config_data = None

            if config_file_name == "conf.yaml":
                # Load base config（支持集中化配置目录）
                new_character_config_data = read_yaml("conf.yaml").get(
                    "character_config"
                )
            else:
                # Load alternative config and merge with base config
                from .config_manager.utils import resolve_config_path
                characters_dir = self.system_config.config_alts_dir
                # 在集中化配置目录内解析备用配置路径
                file_path = resolve_config_path(os.path.join(characters_dir, config_file_name))
                alt_config_data = read_yaml(file_path).get("character_config")

                # Start with original config data and perform a deep merge
                new_character_config_data = deep_merge(
                    self.config.character_config.model_dump(), alt_config_data
                )

            if new_character_config_data:
                new_config = {
                    "system_config": self.system_config.model_dump(),
                    "character_config": new_character_config_data,
                }
                new_config = validate_config(new_config)
                self.load_from_config(new_config)
                logger.debug(f"New config: {self}")
                logger.debug(
                    f"New character config: {self.character_config.model_dump()}"
                )

                # Send responses to client
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "set-model-and-conf",
                            "model_info": self.live2d_model.model_info,
                            "conf_name": self.character_config.conf_name,
                            "conf_uid": self.character_config.conf_uid,
                        }
                    )
                )

                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "config-switched",
                            "message": f"Switched to config: {config_file_name}",
                        }
                    )
                )

                logger.info(f"Configuration switched to {config_file_name}")
            else:
                raise ValueError(
                    f"Failed to load configuration from {config_file_name}"
                )

        except Exception as e:
            logger.error(f"Error switching configuration: {e}")
            logger.debug(self)
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "error",
                        "message": f"Error switching configuration: {str(e)}",
                    }
                )
            )
            raise e


def deep_merge(dict1, dict2):
    """
    Recursively merges dict2 into dict1, prioritizing values from dict2.
    """
    result = dict1.copy()
    for key, value in dict2.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result
