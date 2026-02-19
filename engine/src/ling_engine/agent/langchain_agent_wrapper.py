"""
Langchain Agent 包装器
严格按照 math_client.py 的实现方式
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import List, Dict, Any, Optional, AsyncIterator
from langchain.tools import BaseTool
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langchain_mcp_adapters.client import MultiServerMCPClient

from .agents.agent_interface import AgentInterface
from .output_types import SentenceOutput, DisplayText, Actions
from .input_types import BatchInput, TextSource
from ..config_manager.mcp_config_resolver import get_mcp_config_path, load_mcp_config, save_mcp_config
from ..utils.sentence_divider import segment_text_by_pysbd
from ..mcp_search_tool import MCPSearchTool
from ..mcp_search_adapter import create_mcp_search_langchain_tool
from ..utils.tts_preprocessor import tts_filter as filter_text

# 添加 Util Agent 相关导入
from .mcp_util_integration import AgentMCPUtilHelper

logger = logging.getLogger(__name__)

def load_prompt(prompt_name: str) -> str:
    """Load a prompt from the prompts directory (robust path resolution)"""
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        # 构建一组候选根目录（从当前目录向上多层尝试）
        candidate_roots = [
            os.path.abspath(os.path.join(current_dir, "..", "..", "..", "..")),  # repo 根: ling-engine/
            os.path.abspath(os.path.join(current_dir, "..", "..", "..")),        # 兼容旧逻辑: src/ling_engine/
            os.path.abspath(os.path.join(current_dir, "..", "..", "..", "..", "..")),
            os.getcwd(),
        ]
        # 在每个候选根目录下尝试两种常见结构
        candidate_paths = []
        for root in candidate_roots:
            candidate_paths.append(os.path.join(root, "prompts", "utils", f"{prompt_name}.txt"))
            candidate_paths.append(os.path.join(root, "ling-engine", "prompts", "utils", f"{prompt_name}.txt"))
        # 去重保持顺序
        seen = set()
        unique_candidates = []
        for p in candidate_paths:
            if p not in seen:
                seen.add(p)
                unique_candidates.append(p)
        # 依次尝试读取
        for prompt_path in unique_candidates:
            try:
                if os.path.exists(prompt_path):
                    with open(prompt_path, "r", encoding="utf-8") as f:
                        content = f.read().strip()
                        logger.info(f"Successfully loaded prompt: {prompt_name} @ {prompt_path}")
                        return content
            except Exception as _ignored:
                continue
        raise FileNotFoundError(f"Prompt file not found in candidates: {unique_candidates}")
    except Exception as e:
        logger.warning(f"Failed to load prompt {prompt_name}: {e}")
        return ""

# 超时设置（秒），完全按照 math_client.py
TOOLS_TIMEOUT = 30
API_CALL_TIMEOUT = 60

class LangchainAgentWrapper(AgentInterface):
    """包装 Langchain Agent 的接口，严格按照 math_client.py 实现"""
    
    def __init__(
        self,
        mcp_client: MultiServerMCPClient,
        llm_config: Dict[str, Any],
        system_prompt: str = "",
        max_history_length: int = 10,
        emotion_manager: Any = None,
        skip_mcp_search_prompt: bool = False,  # 新参数：是否跳过MCP搜索提示
    ):
        """初始化 Langchain Agent 包装器

        Args:
            mcp_client: MCP 客户端
            llm_config: LLM 配置
            system_prompt: 系统提示
            max_history_length: 最大历史长度
        """
        logger.info("🚀🚀🚀 WRAPPER INIT STARTED - 开始初始化! 🚀🚀🚀")
        self.mcp_client = mcp_client
        self.max_history_length = max_history_length
        # 🔧 改为多用户状态管理
        self.client_conversation_histories: Dict[str, List[Dict[str, Any]]] = {}
        self.tools = []
        self.agent = None
        # 保存LLM配置供Util Agent使用
        self.llm_config = llm_config
        # 情绪系统相关
        self._emotion_manager = emotion_manager
        self._character_id: Optional[str] = None
        self._user_id: Optional[str] = None
        self._emotion_prompt_applied: bool = False
        # 表情策略（用于低好感时的过滤与引导）
        self._positive_tags = {"joy", "caring", "admiration", "amusement", "pride"}
        self._neutral_tags = {"neutral", "confusion", "curiosity"}
        self._negative_tags = {"anger", "disgust", "fear", "sadness", "smirk"}
        
        # 加载 MCP 提示并合并到系统提示中
        mcp_prompt = load_prompt("mcp_prompt")
        if mcp_prompt:
            self.system_prompt = f"{system_prompt}\n\n{mcp_prompt}"
            logger.info("✅ MCP prompt loaded and added to system prompt")
            # logger.info(f"📋 MCP prompt content: {mcp_prompt}")  # 注释掉详细内容
        else:
            self.system_prompt = system_prompt
            logger.warning("❌ MCP prompt not loaded, using original system prompt")

        # 保存skip_mcp_search_prompt参数为实例属性
        self._skip_mcp_search_prompt = skip_mcp_search_prompt

        # 根据参数决定是否加载并注入 MCP 搜索提示
        if not skip_mcp_search_prompt:
            mcp_search_prompt = load_prompt("mcp_search_prompt")
            if mcp_search_prompt:
                self.system_prompt = f"{self.system_prompt}\n\n{mcp_search_prompt}"
                logger.info("✅ MCP search prompt loaded and added to system prompt")
                # logger.info(f"📋 MCP search prompt content: {mcp_search_prompt}")  # 注释掉详细内容
            else:
                logger.warning("⚠️ MCP search prompt not loaded; search tool guidance may be weaker")
        else:
            logger.info("⏭️ 跳过MCP搜索提示加载（AI主动对话模式）")
        
        # WebSocket 连接相关属性
        self._websocket = None
        self._websocket_handler = None
        self._client_uid = None
        
        # 创建 LLM，严格按照 math_client.py 的方式（移除硬编码默认 Key）
        self.llm = ChatOpenAI(
            model=llm_config.get("model", "gpt-4o-mini"),
            api_key=llm_config.get("api_key"),
            base_url=llm_config.get("base_url"),
            temperature=llm_config.get("temperature", 0.7),
            request_timeout=30  # 设置请求超时时间
        )
        
        # 🔧 预加载工具（允许优雅降级，不影响基本聊天功能）
        logger.info("🔄 预加载MCP工具...")
        try:
            import asyncio
            # 使用事件循环获取工具
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # 如果事件循环正在运行，创建任务
                task = asyncio.create_task(self._preload_tools())
                logger.info("🔄 工具预加载任务已创建")
                self.tools = []  # 先设置为空，任务完成后会更新
            else:
                # 如果事件循环未运行，直接运行
                self.tools = loop.run_until_complete(self._preload_tools())
                logger.info(f"✅ 预加载完成，获取了 {len(self.tools)} 个MCP工具")
        except Exception as e:
            logger.warning(f"⚠️ 预加载工具失败，但不影响基本聊天: {e}")
            self.tools = []
            logger.info("💬 系统将在无工具模式下正常运行，支持基本对话功能")
        
        # 初始化 Util Agent Helper（需要 LLM 实例）
        logger.info(f"🔧 开始初始化 Util Agent Helper...")
        logger.info(f"🔧 传入的 llm_config: {llm_config}")
        try:
            # 直接复用原agent的LLM实例，确保配置一致
            if hasattr(self, 'llm') and self.llm:
                # 对于LangchainAgentWrapper，直接使用self.llm（ChatOpenAI实例）
                util_llm = self.llm
                logger.info("🔧 成功复用LangchainAgentWrapper的self.llm实例")
            else:
                logger.error("🔧 无法获取LangchainAgentWrapper的llm实例，初始化失败")
                self.util_agent_helper = None
                return

            self.util_agent_helper = AgentMCPUtilHelper(self, util_llm)
            logger.info("✅ Util Agent Helper 初始化成功")
        except Exception as e:
            logger.error(f"❌ Util Agent Helper 初始化失败: {e}")
            logger.error(f"❌ 失败详情: {str(e)}")
            import traceback
            logger.error(f"❌ 堆栈跟踪: {traceback.format_exc()}")
            self.util_agent_helper = None
            logger.warning("⚠️ 将使用原有的工具结果处理方式")

        logger.info("Langchain Agent Wrapper initialized with MCP client")
        logger.info("🔥🔥🔥 WRAPPER INIT COMPLETED - 这条日志应该出现! 🔥🔥🔥")

    def reset_tools_and_agent(self):
        """重置工具和代理状态，用于热更新"""
        self.tools = []
        self.agent = None
        logger.info("🔄 LangchainAgentWrapper: 工具和代理状态已重置")

    async def _preload_tools(self):
        """预加载MCP工具，支持优雅降级"""
        try:
            logger.info("🔄 开始预加载MCP工具...")

            # 使用单台机制获取工具，每个工具10秒超时，给总体留足够时间
            tools = await asyncio.wait_for(self.mcp_client.get_tools(), timeout=120.0)

            # 添加MCP搜索工具
            try:
                mcp_search_tool = MCPSearchTool()
                search_langchain_tool = create_mcp_search_langchain_tool(mcp_search_tool)
                if not tools:
                    tools = []
                tools.append(search_langchain_tool)
                logger.info("✅ MCP搜索工具已添加到工具列表")
            except Exception as e:
                logger.error(f"❌ 添加MCP搜索工具失败: {e}")

            if tools and len(tools) > 0:
                logger.info(f"✅ 预加载完成，获取了 {len(tools)} 个工具（包含MCP搜索工具）")
                # 记录工具名称用于调试
                tool_names = [tool.name for tool in tools if hasattr(tool, 'name')]
                logger.info(f"🔧 预加载的工具: {tool_names}")
                return tools
            else:
                logger.warning("⚠️ 预加载返回空工具列表")
                return []

        except asyncio.TimeoutError:
            logger.error("❌ 预加载工具超时（120秒）")
            logger.info("💡 系统将优雅降级到无工具模式")
            return []
        except Exception as e:
            error_type = type(e).__name__
            error_msg = str(e)
            logger.error(f"❌ 预加载工具失败: {error_type}: {error_msg}")

            # 提供详细的错误诊断
            if "ConnectTimeout" in error_type or "ConnectError" in error_type:
                logger.error("🌐 网络连接问题：无法连接到MCP服务器")
                logger.error("💡 建议：检查网络连接或稍后重试")
            elif "TimeoutError" in error_type:
                logger.error("⏰ 请求超时：服务器响应时间过长")
                logger.error("💡 建议：网络可能较慢，请稍后重试")

            logger.info("💡 系统将优雅降级到无工具模式")
            return []

    def set_websocket(self, websocket, websocket_handler=None, client_uid=None):
        """设置WebSocket连接，用于发送工具调用信息到前端

        注意：由于Agent被多用户共享，这里只设置最后连接的用户信息
        实际发送消息时应该使用动态获取的WebSocket
        """
        try:
            self._websocket = websocket
            self._websocket_handler = websocket_handler
            self._client_uid = client_uid
            logger.debug(f"🔌 LangchainAgentWrapper WebSocket设置成功，客户端: {client_uid}")
            logger.debug(f"🔌 WebSocket对象: {type(websocket)}, Handler: {type(websocket_handler)}")

            # 警告：多用户环境下会覆盖之前的连接
            if hasattr(self, '_connection_count'):
                self._connection_count += 1
            else:
                self._connection_count = 1

            if self._connection_count > 1:
                logger.warning(f"⚠️ Agent被多个用户共享，当前第{self._connection_count}个连接，之前的WebSocket引用已被覆盖")
        except Exception as e:
            logger.error(f"设置WebSocket失败: {e}")
            raise

    def _get_safe_websocket_for_client(self, client_uid: str):
        """安全地获取指定客户端的WebSocket连接

        Args:
            client_uid: 客户端UID

        Returns:
            tuple: (websocket, is_safe) - WebSocket连接和是否安全的标识
        """
        try:
            # 如果有WebSocket Handler，通过它获取正确的连接
            if self._websocket_handler and hasattr(self._websocket_handler, 'client_connections'):
                target_websocket = self._websocket_handler.client_connections.get(client_uid)
                if target_websocket:
                    logger.debug(f"🔍 通过WebSocketHandler找到客户端{client_uid}的连接")
                    return target_websocket, True
                else:
                    logger.warning(f"⚠️ WebSocketHandler中未找到客户端{client_uid}的连接")

            # 如果没有WebSocket Handler或找不到连接，使用Agent内部的连接（必须严格匹配）
            if self._websocket and self._client_uid == client_uid:
                logger.debug(f"✅ 使用Agent内部连接，客户端ID匹配: {client_uid}")
                return self._websocket, True
            elif self._websocket:
                logger.error(f"🚨 客户端ID不匹配，拒绝发送消息！Agent内部: {self._client_uid}, 请求: {client_uid}")
                return None, False  # 返回None而不是错误的WebSocket连接
            else:
                logger.warning(f"❌ 无可用WebSocket连接")
                return None, False

        except Exception as e:
            logger.error(f"获取WebSocket连接时出错: {e}")
            return None, False

    async def _send_mcp_workspace_info(self, workspace_data: Dict[str, Any], target_client_uid=None):
        """发送MCP工作区信息到前端，自动找到正确的WebSocket避免消息发错

        Args:
            workspace_data: 工作区数据
            target_client_uid: 目标客户端UID（如果不指定，尝试从workspace_data中获取）
        """

        # 确定目标客户端UID - 优先使用当前请求的用户标识
        client_uid_to_use = (
            target_client_uid
            or workspace_data.get("client_uid")
            or getattr(self, '_current_request_client_uid', None)
            or self._client_uid
        )

        if not client_uid_to_use:
            logger.warning("无法确定目标客户端UID，无法发送工作区信息")
            return

        # 安全地获取WebSocket连接
        websocket_to_use, is_safe = self._get_safe_websocket_for_client(client_uid_to_use)

        if not websocket_to_use:
            logger.warning(f"WebSocket连接不存在，无法发送工作区信息，客户端: {client_uid_to_use}")
            return

        if not is_safe:
            logger.error(f"🚨 检测到潜在的消息路由错误！目标客户端: {client_uid_to_use}, 拒绝发送消息确保用户隔离")
            return

        try:
            # 确保工作区数据包含客户端UID
            workspace_data["client_uid"] = client_uid_to_use
            logger.debug(f"为工作区消息添加客户端标识: {client_uid_to_use}")

            message_json = json.dumps(workspace_data)

            # 验证WebSocket连接状态
            if hasattr(websocket_to_use, 'client_state') and websocket_to_use.client_state.name != 'CONNECTED':
                logger.warning(f"WebSocket连接状态异常: {websocket_to_use.client_state.name}, 客户端: {client_uid_to_use}")
                return

            await websocket_to_use.send_text(message_json)

            instance_id = getattr(self, '_instance_id', 'unknown')
            logger.debug(f"✅ MCP工作区信息已发送到前端，消息类型: {workspace_data.get('type', '未知')}, 客户端: {client_uid_to_use}")
            logger.debug(f"📍 发送Agent实例ID: {instance_id}")
            logger.debug(f"✅ 消息内容摘要: {len(message_json)} 字符")

            # 添加安全状态日志
            if is_safe:
                logger.debug(f"🛡️ 安全发送：消息路由到正确的客户端 {client_uid_to_use}")
            else:
                logger.warning(f"⚠️ 可能的消息路由风险：客户端 {client_uid_to_use}")

        except Exception as e:
            import traceback
            logger.error(f"❌ 发送MCP工作区信息失败: {e}, 客户端: {client_uid_to_use}")
            logger.error(f"❌ 错误详情: {traceback.format_exc()}")
            # 不要重新抛出异常，避免中断主流程

    async def _initialize_tools_and_agent(self):
        """异步初始化工具和 agent，支持优雅降级"""
        if self.agent is not None:
            return  # 已经初始化过了

        try:
            # 🔧 获取工具，支持优雅降级，但不阻止Agent创建
            logger.info("正在获取工具...")
            try:
                if self.mcp_client is not None:
                    self.tools = await asyncio.wait_for(self.mcp_client.get_tools(), timeout=30.0)  # 减少超时时间

                    # 添加MCP搜索工具
                    try:
                        mcp_search_tool = MCPSearchTool()
                        search_langchain_tool = create_mcp_search_langchain_tool(mcp_search_tool)
                        if not self.tools:
                            self.tools = []
                        self.tools.append(search_langchain_tool)
                        logger.info("✅ MCP搜索工具已添加到工具列表")
                    except Exception as e:
                        logger.error(f"❌ 添加MCP搜索工具失败: {e}")

                    logger.info(f"成功获取 {len(self.tools)} 个工具（包含MCP搜索工具）")

                    # 记录工具信息
                    for tool in self.tools:
                        tool_name = getattr(tool, 'name', None) or getattr(tool, '_name', None) or str(tool.__class__.__name__)
                        tool_desc = getattr(tool, 'description', 'No description')[:50]
                        logger.info(f"工具名称: {tool_name}, 描述: {tool_desc}...")
                else:
                    logger.info("⚠️ MCP客户端为None，跳过工具初始化")
                    self.tools = []

            except asyncio.TimeoutError:
                logger.warning("⚠️ 获取工具超时（30秒），继续创建无工具Agent")
                logger.info("💬 系统将在无工具模式下运行，支持基本对话")
                self.tools = []
            except Exception as e:
                error_type = type(e).__name__
                error_msg = str(e)
                logger.warning(f"⚠️ 获取工具失败: {error_type}: {error_msg}")
                logger.info("💬 系统将在无工具模式下运行，支持基本对话")
                self.tools = []

                # 🔧 尝试添加基本搜索工具（如果可能）
                try:
                    if self.mcp_client is not None:
                        mcp_search_tool = MCPSearchTool()
                        search_langchain_tool = create_mcp_search_langchain_tool(mcp_search_tool)
                        self.tools.append(search_langchain_tool)
                        logger.info("✅ MCP搜索工具已作为备选添加")

                    # 尝试添加记忆工具
                    from ..tools.memory_tools import create_memory_search_tool
                    memory_tool = create_memory_search_tool()
                    memory_langchain_tool = memory_tool.create_langchain_tool()
                    self.tools.append(memory_langchain_tool)
                    logger.info("✅ 记忆搜索工具已作为备选添加")
                except Exception as search_e:
                    logger.debug(f"添加备选工具失败（可忽略）: {search_e}")
                    # 完全忽略工具添加失败，确保Agent能创建

            # 🔧 创建智能代理，无论是否有工具都要创建成功
            logger.info("正在创建智能代理...")

            # 根据是否有工具来调整系统提示
            if self.tools and len(self.tools) > 0:
                tool_guidance = """
重要工具使用指南：
- 对于简单的问候、闲聊、感谢等日常对话，请直接回答，不要使用任何工具

工具使用规则（请严格按照用户需求选择正确工具）：
1. 火车票/高铁票查询：
   - 包含"车票"、"火车"、"高铁"、"12306"等关键词时
   - 使用12306相关工具（如get-tickets、get-station-code-of-citys等）
   - 绝对不要使用天气工具

2. 天气查询：
   - 包含"天气"、"温度"、"下雨"等关键词时
   - 使用天气工具，城市名使用简短形式（如"成都"而不是"成都市"）
   - 绝对不要使用12306工具

3. 其他功能：
   - 先检查现有工具，如果没有再使用search_mcp_tools搜索

重要：仔细分析用户查询的真实意图，选择最匹配的工具！
"""
                enhanced_system_prompt = f"{self.system_prompt}\n\n{tool_guidance}"
                logger.info("✅ 使用带工具的代理模式")
            else:
                no_tool_guidance = """
注意：当前系统无法连接到外部工具服务，但您仍然可以进行正常的对话。
对于需要查询信息、计算、搜索等功能，请稍后重试或联系管理员。
"""
                enhanced_system_prompt = f"{self.system_prompt}\n\n{no_tool_guidance}"
                logger.info("⚠️ 使用无工具代理模式")

            # langchain agents import will be handled in the method
            import langchainhub as hub

            # 获取ReAct提示模板并自定义
            try:
                prompt = hub.pull("hwchase17/react")
                # 修改提示模板以包含我们的指导
                prompt.messages[0].prompt.template = f"{enhanced_system_prompt}\n\n" + prompt.messages[0].prompt.template
            except:
                # 如果无法获取hub提示，使用默认方式
                logger.warning("无法获取hub提示，使用默认方式创建agent")
                prompt = None

            if prompt:
                self.agent = create_react_agent(self.llm, self.tools, prompt)
            else:
                self.agent = create_react_agent(self.llm, self.tools)
            logger.info("智能代理创建成功")

        except Exception as e:
            logger.warning(f"⚠️ 初始化工具和代理失败: {e}")
            # 🔧 强制创建无工具代理，确保基本对话功能
            logger.info("🔄 创建无工具代理以保证基本对话功能...")
            try:
                self.tools = []  # 清空工具列表

                # 创建最基本的系统提示
                basic_system_prompt = f"{self.system_prompt}\n\n注意：当前系统在简化模式下运行，部分高级功能可能不可用。"

                # 创建无工具的React Agent
                import langchainhub as hub
                try:
                    prompt = hub.pull("hwchase17/react")
                    prompt.messages[0].prompt.template = f"{basic_system_prompt}\n\n" + prompt.messages[0].prompt.template
                    self.agent = create_react_agent(self.llm, self.tools, prompt)
                except:
                    # 如果hub不可用，使用最基本的方式
                    self.agent = create_react_agent(self.llm, self.tools)

                logger.info("✅ 无工具代理创建成功，基本对话功能可用")
            except Exception as fallback_error:
                logger.error(f"❌ 无工具代理创建也失败: {fallback_error}")
                logger.error("❌ 系统将无法进行对话")
                # 不要抛出异常，让系统继续运行

    async def _initialize_agent_without_tools(self):
        """初始化无工具的基本Agent，专注于对话功能"""
        if self.agent is not None:
            return  # 已经初始化过了

        try:
            logger.info("🔧 创建无工具的基本智能代理...")

            # 🔧 强制清空工具列表，确保是真正的无工具模式
            self.tools = []

            # 创建适合无工具模式的系统提示
            no_tool_guidance = """
当前系统运行在基本对话模式下：
- 专注于自然流畅的对话
- 可以回答常识性问题
- 可以进行创意写作、翻译、总结等文本处理任务
- 无法执行外部工具调用（如查询天气、火车票等）
- 无法获取实时信息或执行计算
- 可以基于已有知识提供帮助和建议
"""

            # 将指导添加到系统提示中
            enhanced_system_prompt = f"{self.system_prompt}\n\n{no_tool_guidance}"

            # 创建无工具的agent
            import langchainhub as hub

            try:
                prompt = hub.pull("hwchase17/react")
                # 修改提示模板
                prompt.messages[0].prompt.template = f"{enhanced_system_prompt}\n\n" + prompt.messages[0].prompt.template
                self.agent = create_react_agent(self.llm, self.tools, prompt)
            except Exception as hub_error:
                logger.warning(f"无法获取hub提示: {hub_error}，使用默认方式创建agent")
                self.agent = create_react_agent(self.llm, self.tools)

            logger.info("✅ 无工具的基本智能代理创建成功")

        except Exception as e:
            logger.error(f"❌ 初始化无工具代理失败: {e}")
            # 🔧 不要抛出异常，确保系统能继续运行
            logger.error("❌ 将尝试使用最基本的LLM包装")

    async def _call_agent_with_tools(self, user_message: str) -> str:
        """使用带工具的agent处理问题"""
        try:
            logger.info("🔧 使用带工具的代理处理")

            # 创建符合LangGraph要求的消息格式（字典格式）
            messages_for_agent = []

            # 添加系统消息（如果有）
            if self.system_prompt:
                messages_for_agent.append({
                    "role": "system",
                    "content": self.system_prompt
                })

            # 添加历史对话（转换为字典格式）
            # 注意：此方法已废弃，应该使用流式chat方法
            # 过滤掉tool_result类型的消息，避免重复
            filtered_history = []  # [msg for msg in self.conversation_history[-6:] if msg.get("role") != "tool_result"]
            for msg in filtered_history:
                messages_for_agent.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })

            # 添加当前用户消息
            messages_for_agent.append({
                "role": "user",
                "content": user_message
            })

            logger.debug(f"🔧 使用带工具的代理处理，可用工具数量: {len(self.tools)}")
            logger.debug(f"📝 消息数量: {len(messages_for_agent)}")

            agent_response = await asyncio.wait_for(
                self.agent.ainvoke({"messages": messages_for_agent}),
                timeout=API_CALL_TIMEOUT
            )

            logger.debug("智能代理处理完成")

            # 提取响应内容，参考 math_client.py 的 print_optimized_result 函数
            assistant_response = self._extract_agent_response(agent_response)
            logger.debug(f"代理响应提取完成: {assistant_response[:50]}...")

            return assistant_response

        except Exception as e:
            logger.error(f"带工具代理处理失败: {e}")
            return f"抱歉，处理您的请求时遇到了错误：{str(e)}"

    async def _execute_tools_in_background(self, tool_name: str, tool_args: Any, target_client_uid: str = None):
        """在后台异步执行工具调用，不阻塞主对话流

        Args:
            tool_name: 工具名称
            tool_args: 工具参数
            target_client_uid: 目标客户端UID，用于确保工作区消息正确路由
        """
        try:
            logger.info(f"🔧 [后台执行] 开始后台执行工具: {tool_name}")

            # 找到对应的工具并执行
            target_tool = None
            for tool in self.tools:
                if hasattr(tool, 'name') and tool.name == tool_name:
                    target_tool = tool
                    break

            if not target_tool:
                logger.error(f"🔧 [后台执行] 未找到工具: {tool_name}")
                return

            # 执行工具，适配不同的API版本，带重试机制
            max_retries = 3
            base_delay = 1.0
            max_delay = 8.0
            result = None

            for attempt in range(max_retries):
                try:
                    if hasattr(target_tool, '_arun'):
                        # 尝试新版本API（需要config参数）
                        try:
                            result = await target_tool._arun(**tool_args, config={})
                        except TypeError:
                            # 回退到旧版本API（不需要config参数）
                            result = await target_tool._arun(**tool_args)
                    elif hasattr(target_tool, 'arun'):
                        try:
                            result = await target_tool.arun(**tool_args, config={})
                        except TypeError:
                            result = await target_tool.arun(**tool_args)
                    else:
                        logger.error(f"🔧 [后台执行] 工具 {tool_name} 不支持异步执行")
                        return

                    # 执行成功，跳出重试循环
                    break

                except Exception as exec_e:
                    error_type = type(exec_e).__name__
                    logger.error(f"🔧 [后台执行] 工具执行异常 (第{attempt + 1}次尝试): {error_type}: {exec_e}")

                    # 如果是最后一次尝试，直接返回
                    if attempt == max_retries - 1:
                        import traceback
                        logger.error(f"🔧 [后台执行] 工具 {tool_name} 所有重试都失败: {traceback.format_exc()}")
                        return

                    # 等待后重试，使用指数退避
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    logger.info(f"⏳ [后台执行] 等待 {delay:.1f} 秒后重试...")
                    await asyncio.sleep(delay)

            if result is None:
                logger.error(f"🔧 [后台执行] 工具 {tool_name} 执行失败，无结果")
                return

            logger.info(f"🔧 [后台执行] 工具 {tool_name} 执行完成")
            logger.debug(f"🔧 [后台执行] 工具结果: {str(result)[:200]}...")

            # 收集工具结果，解码Unicode编码
            decoded_result = self._decode_unicode_result(str(result))
            # 注意：这里是后台工具执行，无法传递collected_tool_results参数
            # 工具结果会通过workspace消息单独发送

            # 发送workspace消息 - 工具执行完成 (同一个会话)
            try:
                # 🔧 关键修复：使用传入的目标用户标识，而不是可能已被覆盖的self._client_uid
                client_uid_for_workspace = target_client_uid or self._client_uid
                logger.debug(f"🎯 后台工具执行完成，发送工作区消息到: {client_uid_for_workspace}")

                workspace_data = {
                    "type": "mcp-workspace-update",
                    "timestamp": datetime.now().isoformat(),
                    "user_query": getattr(self, '_current_user_query', ''),
                    "status": "completed",
                    "tool_calls": [{
                        "name": tool_name,
                        "status": "completed"
                    }],
                    "tool_results": [{
                        "name": tool_name,
                        "status": "completed",
                        "result": decoded_result[:500]  # 截断长结果
                    }],
                    "final_answer": "请稍等一下",
                    "client_uid": client_uid_for_workspace  # 使用正确的用户标识
                }

                # 直接调用而不是create_task，确保使用正确的client_uid
                await self._send_mcp_workspace_info(workspace_data, target_client_uid=client_uid_for_workspace)
            except Exception as e:
                logger.info(f"创建完成消息发送任务失败: {e}")

            # 启动 Util Agent 后台处理 - 但排除记忆工具
            if tool_name != "search_similar_memories" and self.util_agent_helper and self.util_agent_helper.should_use_util_agent(tool_name):
                try:
                    def silent_callback(processed_result, tool_name, user_query):
                        logger.info(f"🔧 [后台执行] Util Agent 处理完成: {tool_name}")
                        logger.debug(f"🔧 [后台执行] 优化结果: {processed_result[:200]}...")

                    # 获取当前用户查询
                    current_user_query = getattr(self, '_current_user_query', "用户查询")

                    # 启动 Util Agent 处理 - handle_mcp_result_truly_async 已经返回Task，无需再包装
                    self.util_agent_helper.handle_mcp_result_truly_async(
                        user_query=current_user_query,
                        tool_name=tool_name,
                        raw_result=result,
                        callback=silent_callback,
                        workspace_callback=self._send_mcp_workspace_info
                    )

                    logger.info(f"🔧 [后台执行] 已启动 Util Agent 处理: {tool_name}")

                except Exception as util_e:
                    logger.error(f"🔧 [后台执行] Util Agent 处理失败: {util_e}")

        except Exception as e:
            logger.error(f"🔧 [后台执行] 后台工具执行失败: {e}")
            import traceback
            logger.error(f"🔧 [后台执行] 错误详情: {traceback.format_exc()}")

    async def _stream_agent_tokens(self, messages_for_agent: List[Dict[str, Any]], collected_tool_calls: List[Dict[str, Any]], collected_tool_results: List[Dict[str, Any]]) -> AsyncIterator[str]:
        """从 LangGraph Agent 流式获取模型输出的 token（真正异步版本）。"""
        try:
            tool_call_detected = False

            # 使用事件流以获取增量 token
            async for event in self.agent.astream_events({"messages": messages_for_agent}, version="v1"):
                ev_type = event.get("event")
                data = event.get("data", {})

                # 捕获工具调用开始 - 立即返回等待消息并结束
                if ev_type and "on_tool_start" in ev_type:
                    try:
                        tool_name = event.get("name") or data.get("name") or data.get("tool_name") or "unknown_tool"
                        # 统一将参数序列化为字符串
                        args_obj = data.get("input") or data.get("inputs") or data.get("tool_input") or data
                        try:
                            args_str = json.dumps(args_obj, ensure_ascii=False)
                        except Exception:
                            args_str = str(args_obj)
                        collected_tool_calls.append({
                            "name": tool_name,
                            "arguments": args_str,
                        })

                        logger.info(f"🚀 [真正异步] 检测到工具调用: {tool_name}")

                        # 💰 MCP工具调用积分扣除 - 在工具调用时立即扣除
                        if self._user_id and tool_name != "search_similar_memories":
                            try:
                                await self._deduct_mcp_credits_for_agent(self._user_id, tool_name)
                            except Exception as credit_e:
                                logger.error(f"💰 积分扣除失败: {credit_e}")

                        # 发送workspace消息 - 工具调用开始
                        try:
                            # 🔧 关键修复：使用当前请求的用户标识
                            current_request_client_uid = getattr(self, '_current_request_client_uid', None) or self._client_uid
                            await self._send_mcp_workspace_info({
                                "type": "mcp-workspace-update",
                                "timestamp": datetime.now().isoformat(),
                                "user_query": getattr(self, '_current_user_query', ''),
                                "status": "in_progress",
                                "tool_calls": [{
                                    "name": tool_name,
                                    "status": "in_progress"
                                }],
                                "tool_results": [],
                                "partial_answer": f"Calling {tool_name} tool...",
                                "client_uid": current_request_client_uid  # 使用正确的用户标识
                            }, target_client_uid=current_request_client_uid)
                        except Exception as e:
                            import traceback
                            traceback.print_exc()

                        logger.info(f"🚀 [真正异步] 立即返回等待消息并结束对话")

                        # 🔥 关键改变：立即返回等待消息并结束流
                        tool_call_detected = True

                        # 🔥 启动后台工具执行，但不等待结果
                        # 🔧 关键修复：传递当前请求的用户标识，避免异步执行时标识错误
                        current_client_uid = getattr(self, '_current_request_client_uid', None) or self._client_uid
                        asyncio.create_task(self._execute_tools_in_background(tool_name, args_obj, current_client_uid))
                        
                        # 立即结束流，不等待工具完成
                        return

                    except Exception as e:
                        logger.debug(f"工具开始事件解析失败: {e}")
                    continue
                # 捕获工具调用结束（结果）
                if ev_type and ("on_tool_end" in ev_type or "on_tool" in ev_type and "end" in ev_type):
                    try:
                        tool_name = event.get("name") or data.get("name") or data.get("tool_name") or "unknown_tool"
                        out_obj = data.get("output") or data.get("outputs") or data.get("tool_output") or data
                        try:
                            out_str = json.dumps(out_obj, ensure_ascii=False)
                        except Exception:
                            out_str = str(out_obj)
                        # 解码Unicode编码
                        decoded_result = self._decode_unicode_result(out_str)
                        collected_tool_results.append({
                            "name": tool_name,
                            "result": decoded_result,
                        })
                        logger.debug(f"🧰 工具结束: {tool_name}")


                        # 🔧 集成 Util Agent 处理非记忆工具结果
                        logger.info(f"🔍 检查工具 {tool_name} 是否需要 Util Agent 处理...")
                        logger.info(f"   - util_agent_helper 存在: {self.util_agent_helper is not None}")

                        if self.util_agent_helper:
                            should_use_util = self.util_agent_helper.should_use_util_agent(tool_name)
                            logger.info(f"   - 工具 {tool_name} 应该使用 Util Agent: {should_use_util}")

                        if tool_name != "search_similar_memories" and self.util_agent_helper and self.util_agent_helper.should_use_util_agent(tool_name):
                            # 启动完全独立的异步处理，绝不影响主流程
                            try:
                                # 移除重复的workspace发送，util agent现在统一处理
                                def silent_result_callback(processed_result, tool_name, user_query):
                                    """静默回调 - util agent已通过workspace_callback统一发送"""
                                    logger.info(f"🔧 [独立异步] Util Agent 处理完成 {tool_name}")
                                    logger.debug(f"🔧 [独立异步] 处理结果: {processed_result[:200] if processed_result else 'None'}...")

                                # 完全独立的异步启动 - 不依赖主流程
                                current_user_query = getattr(self, '_current_user_query', "用户查询")

                                # 启动独立任务，不保留引用，不等待结果
                                # handle_mcp_result_truly_async 已经返回Task，无需再包装
                                self.util_agent_helper.handle_mcp_result_truly_async(
                                    user_query=current_user_query,
                                    tool_name=tool_name,
                                    raw_result=out_obj,
                                    callback=silent_result_callback,
                                    workspace_callback=self._send_mcp_workspace_info
                                )

                                
                                logger.info(f"🚀 [独立异步] 已启动 {tool_name} 的独立 Util Agent 处理")
                            except Exception as util_e:
                                logger.error(f"🚀 [独立异步] 启动独立 Util Agent 处理失败: {util_e}")

                        # 对于search_similar_memories工具，使用原有逻辑
                        elif tool_name == "search_similar_memories":
                            # 确保工具结果能够被大模型看到并用于生成回复
                            # 这里我们不需要特殊处理，因为Langchain Agent会自动将工具结果添加到对话历史中
                            logger.info("🧠 记忆工具结果，使用原有处理流程")
                            pass
                    except Exception as e:
                        logger.debug(f"工具结束事件解析失败: {e}")
                    continue
                # 模型增量输出
                if ev_type == "on_chat_model_stream":
                    chunk = data.get("chunk")
                    # ChatOpenAI chunk 兼容性：可能是对象也可能有 content 字段
                    content = getattr(chunk, "content", None)
                    if isinstance(content, list):
                        # 多段内容合并
                        text = "".join([seg.get("text", "") if isinstance(seg, dict) else str(seg) for seg in content])
                    else:
                        text = content if isinstance(content, str) else (str(content) if content is not None else "")
                    if text:
                        yield text
        except Exception as e:
            logger.error(f"astream_events 流式获取失败: {e}")
            # 回退：直接调用非流式（极端情况下）
            try:
                resp = await self.agent.ainvoke({"messages": messages_for_agent})
                text = self._extract_agent_response(resp)
                if text:
                    yield text
            except Exception as e2:
                logger.error(f"回退非流式调用也失败: {e2}")
                return

    def _get_affinity_level(self) -> Optional[str]:
        try:
            if not (self._emotion_manager and self._character_id and self._user_id):
                return None
            affinity = self._emotion_manager.get_affinity(self._character_id, self._user_id)
            return self._emotion_manager.get_affinity_level(affinity)
        except Exception as e:
            logger.debug(f"获取好感度等级失败: {e}")
            return None

    def _get_constraints_prompt(self, level: Optional[str]) -> str:
        if not level:
            return ""
        if level == "hatred":
            return (
                "在当前阶段（hatred）：\n"
                "- 严禁使用安慰、亲昵或讨好式语句（例如：‘我会努力让你喜欢上我’、‘抱歉’）。\n"
                "- 禁止使用正向表情标签：[joy]、[caring]、[admiration]、[amusement]、[pride]。\n"
                "- 优先使用标签：[anger]、[disgust]、[smirk] 或保持 [neutral]。\n"
                "- 语气简短、尖锐、冷淡，允许讽刺；避免道歉和迎合。\n"
            )
        if level == "hostile":
            return (
                "在当前阶段（hostile）：\n"
                "- 避免安慰或亲昵；不要承诺‘让你喜欢我’之类表述。\n"
                "- 尽量避免使用 [joy]、[caring] 等正向标签；可用 [smirk]、[disgust] 或 [neutral]。\n"
                "- 用词尖锐、怀疑，但保持基本礼貌。\n"
            )
        if level == "indifferent":
            return (
                "在当前阶段（indifferent）：\n"
                "- 不要表达关怀或热情；避免使用 [joy]、[caring]。\n"
                "- 保持疏离和高冷，可用 [neutral] 或 [smirk]。\n"
            )
        return ""

    def _apply_expression_policy(self, text: str) -> str:
        """根据好感度等级过滤/替换不合适的表情标签与语气倾向（简单规则）。"""
        level = self._get_affinity_level()
        if not level:
            return text
        # 仅对低好感等级进行严格限制
        if level in {"hatred", "hostile", "indifferent"}:
            # 过滤正向表情标签
            for tag in self._positive_tags:
                text = text.replace(f"[{tag}]", "")
            # 对明显迎合的句式进行弱化（保守替换，尽量不破坏内容）
            ban_phrases = [
                "我会努力让你喜欢上", "我会努力让你喜欢", "我会努力让你喜欢上的",
                "我会努力让你喜欢的", "请随时告诉我", "我可以帮忙的",
            ]
            for p in ban_phrases:
                if p in text:
                    text = text.replace(p, "……")
            # 可选：添加冷淡的语气标记（仅当文本过于中性时）
            return text
        return text

    async def chat(self, input_data: BatchInput, context_websocket=None, context_client_uid=None) -> AsyncIterator[SentenceOutput]:
        """处理聊天请求，改为按句流式返回。

        Args:
            input_data: 输入数据
            context_websocket: 当前用户的WebSocket连接（用于MCP工作区消息）
            context_client_uid: 当前用户的客户端UID（用于日志记录）
        """
        try:
            logger.debug(f"LangchainAgentWrapper.chat() 被调用，WebSocket状态: {self._websocket is not None}, 客户端ID: {self._client_uid}")

            # 🔧 关键修复：保存当前请求的用户上下文，用于正确路由MCP工作区消息
            current_request_client_uid = context_client_uid or self._client_uid
            if current_request_client_uid:
                # 临时设置当前请求的用户标识，用于工作区消息路由
                self._current_request_client_uid = current_request_client_uid
                logger.debug(f"🎯 设置当前请求用户标识: {current_request_client_uid}")
            else:
                logger.warning("⚠️ 无法确定当前请求的用户标识，MCP工作区消息可能发错")

            # 🔧 获取或创建该客户端的对话历史
            if current_request_client_uid not in self.client_conversation_histories:
                self.client_conversation_histories[current_request_client_uid] = []
                logger.debug(f"📝 为客户端 {current_request_client_uid} 创建新的对话历史")

            client_conversation_history = self.client_conversation_histories[current_request_client_uid]
            logger.debug(f"📝 使用客户端 {current_request_client_uid} 的对话历史，当前长度: {len(client_conversation_history)}")

            # 提取用户消息
            user_message = ""
            for text_data in input_data.texts:
                if text_data.source == TextSource.INPUT:
                    user_message = text_data.content
                    break

            if not user_message:
                return

            # 保存当前用户查询以供工作区显示使用
            self._current_user_query = user_message
            logger.info(f"用户输入: {user_message}")

            # 初始化 agent - 使用带工具的模式
            need_reinit = False
            if self.agent is None:
                need_reinit = True
                logger.info("🔧 初始化智能代理...")
            elif self.tools and len(self.tools) > 0 and not hasattr(self.agent, 'tools'):
                # Agent存在但没有工具，需要重新初始化为带工具模式
                need_reinit = True
                logger.info("🔧 检测到工具可用，重新初始化为带工具模式...")
                self.agent = None

            if need_reinit:
                # 🔧 优先尝试带工具模式，失败时自动降级到无工具模式
                try:
                    if self.tools and len(self.tools) > 0:
                        await self._initialize_tools_and_agent()
                        logger.info(f"✅ 带工具的智能代理初始化完成，工具数量: {len(self.tools)}")
                    else:
                        await self._initialize_agent_without_tools()
                        logger.info("✅ 无工具的智能代理初始化完成")
                except Exception as init_error:
                    logger.warning(f"⚠️ Agent初始化失败，尝试创建最基本的Agent: {init_error}")
                    # 🔧 最后的备选方案：强制创建最简单的Agent
                    try:
                        self.tools = []
                        self.agent = create_react_agent(self.llm, self.tools)
                        logger.info("✅ 基本Agent创建成功，对话功能可用")
                    except Exception as final_error:
                        logger.error(f"❌ 所有Agent创建尝试都失败: {final_error}")
                        # 即使这样失败了，也不抛出异常，让chat方法继续执行

            # 🔧 检查Agent是否成功创建
            if self.agent is None:
                logger.error("❌ Agent未成功初始化，无法进行对话")
                error_message = "抱歉，AI代理初始化失败，请稍后重试或联系管理员。"

                # 更新对话历史
                client_conversation_history.append({"role": "user", "content": user_message})
                client_conversation_history.append({"role": "assistant", "content": error_message})
                self.client_conversation_histories[current_request_client_uid] = client_conversation_history

                # 返回错误消息
                display_text = DisplayText(text=error_message, name="AI", avatar="")
                tts_text = filter_text(
                    text=error_message,
                    remove_special_char=False,
                    ignore_brackets=True,
                    ignore_parentheses=True,
                    ignore_asterisks=True,
                    ignore_angle_brackets=True,
                )
                yield SentenceOutput(display_text=display_text, tts_text=tts_text, actions=Actions())
                return

            # 构造消息（使用客户端专属的对话历史）
            messages_for_agent: List[Dict[str, Any]] = []
            if self.system_prompt:
                messages_for_agent.append({"role": "system", "content": self.system_prompt})
            # 🔧 使用客户端专属的对话历史
            for msg in client_conversation_history[-6:]:
                messages_for_agent.append({"role": msg["role"], "content": msg["content"]})
            messages_for_agent.append({"role": "user", "content": user_message})

            # 流式读取 token，进行句界切分并逐句产出
            buffer = ""
            full_answer = ""
            # 🔧 为当前客户端创建工具调用收集器
            collected_tool_calls: List[Dict[str, Any]] = []
            collected_tool_results: List[Dict[str, Any]] = []
            async for token in self._stream_agent_tokens(messages_for_agent, collected_tool_calls, collected_tool_results):
                if not token:
                    continue
                buffer += token
                sentences, remaining = segment_text_by_pysbd(buffer)
                if sentences:
                    for sent in sentences:
                        sent = self._apply_expression_policy(sent)
                        full_answer += sent
                        display_text = DisplayText(text=sent, name="AI", avatar="")

                        # 应用TTS过滤，移除方括号等标记
                        tts_text = filter_text(
                            text=sent,
                            remove_special_char=False,
                            ignore_brackets=True,  # 过滤[happy]等情绪词
                            ignore_parentheses=True,
                            ignore_asterisks=True,
                            ignore_angle_brackets=True,
                        )

                        yield SentenceOutput(display_text=display_text, tts_text=tts_text, actions=Actions())
                    buffer = remaining or ""

            # 结束时如果有剩余文本，也产出
            leftover = buffer.strip()
            if leftover:
                leftover = self._apply_expression_policy(leftover)
                full_answer += leftover
                display_text = DisplayText(text=leftover, name="AI", avatar="")

                # 应用TTS过滤，移除方括号等标记
                tts_text = filter_text(
                    text=leftover,
                    remove_special_char=False,
                    ignore_brackets=True,  # 过滤[happy]等情绪词
                    ignore_parentheses=True,
                    ignore_asterisks=True,
                    ignore_angle_brackets=True,
                )

                yield SentenceOutput(display_text=display_text, tts_text=tts_text, actions=Actions())

            # 🔧 更新客户端专属的对话历史
            client_conversation_history.append({"role": "user", "content": user_message})
            client_conversation_history.append({"role": "assistant", "content": full_answer})
            while len(client_conversation_history) > self.max_history_length * 2:
                client_conversation_history.pop(0)

            # 保存更新后的历史
            self.client_conversation_histories[current_request_client_uid] = client_conversation_history
            logger.debug(f"📝 已更新客户端 {current_request_client_uid} 的对话历史，新长度: {len(client_conversation_history)}")

            # 🎭 更新好感度系统 - 仅处理用户输入
            if self._emotion_manager and self._character_id and self._user_id:
                try:
                    logger.debug(f"🎭 准备更新好感度，用户消息: {user_message}")
                    await self._emotion_manager.update_affinity(
                        self._character_id,
                        self._user_id,
                        user_message,
                        "human"
                    )
                    logger.debug("🎭 好感度更新完成")
                except Exception as e:
                    logger.error(f"🎭 更新好感度失败: {e}")

            # 💰 积分扣除已在 _stream_agent_tokens (line 774-779) 中完成
            # 此处不再重复扣除,避免重复收费

            # 在流式完成后，将已收集的工具调用/结果发送到前端工作区
            # 注意：如果工具由util agent处理，则util agent会统一发送workspace数据，主agent完全不发送
            try:
                # 检查是否有工具调用
                has_any_tool_calls = bool(collected_tool_calls)
                has_util_tool_activity = False
                has_non_util_tool_activity = False

                if has_any_tool_calls:
                    for tool_call in collected_tool_calls:
                        tool_name = tool_call.get('name', tool_call.get('tool_name', ''))
                        # 检查工具是否由util agent处理 - 但排除记忆工具
                        if tool_name != "search_similar_memories" and self.util_agent_helper and self.util_agent_helper.should_use_util_agent(tool_name):
                            has_util_tool_activity = True
                        else:
                            has_non_util_tool_activity = True
                
                # 决策逻辑：只有在完全没有util工具活动时，主agent才发送工作区更新
                if has_util_tool_activity:
                    logger.debug("🔧 检测到util agent处理的工具，主agent跳过所有workspace发送")
                    logger.debug(f"🔧 util工具活动: {has_util_tool_activity}, 非util工具活动: {has_non_util_tool_activity}")
                elif has_non_util_tool_activity and self._websocket:
                    # 🔧 关键修复：使用当前请求的用户标识
                    current_request_client_uid = getattr(self, '_current_request_client_uid', None) or self._client_uid
                    workspace_data = {
                        "type": "mcp-workspace-update",
                        "timestamp": datetime.now().isoformat(),
                        "tool_calls": collected_tool_calls,
                        "tool_results": collected_tool_results,
                        "final_answer": full_answer or "",
                        "user_query": getattr(self, '_current_user_query', ''),
                        "status": "completed" if full_answer else "processing",
                        "client_uid": current_request_client_uid  # 使用正确的用户标识
                    }
                    await self._send_mcp_workspace_info(workspace_data, target_client_uid=current_request_client_uid)
                    logger.debug(f"✅ 已发送主agent工作区信息（仅非util工具），客户端: {current_request_client_uid}")
                else:
                    logger.debug("📝 没有需要主agent处理的工具调用，或websocket不可用")
                    
            except Exception as e:
                logger.warning(f"发送流式工作区信息失败: {e}")

        except asyncio.TimeoutError:
            logger.error(f"API调用超时 (>{API_CALL_TIMEOUT}秒)")
            error_response = "处理请求超时，请稍后重试或尝试简化您的问题。"
            yield self._create_error_output(error_response)
        except Exception as e:
            logger.error(f"Langchain Agent 流式处理失败: {str(e)}")
            error_response = f"抱歉，处理您的请求时遇到了错误：{str(e)}"
            yield self._create_error_output(error_response)
        finally:
            # 🔧 清理临时的用户标识，避免影响后续请求
            if hasattr(self, '_current_request_client_uid'):
                delattr(self, '_current_request_client_uid')
                logger.debug("🧹 已清理临时用户标识")
    
    def _extract_agent_response(self, agent_response: Dict[str, Any]) -> str:
        """提取代理响应内容，参考 math_client.py 的 print_optimized_result"""
        try:
            logger.debug("开始解析代理响应")
            messages = agent_response.get("messages", [])
            steps = []  # 用于记录计算步骤
            tool_calls_info = []  # 工具调用信息
            tool_results_info = []  # 工具结果信息
            final_answer = None  # 最终答案

            logger.debug(f"开始处理 {len(messages)} 条消息")
            for i, message in enumerate(messages):
                msg_type = getattr(message, 'type', '未知类型')
                logger.debug(f"处理消息 {i}: 类型={msg_type}")
                
                # 检查是否有工具调用
                if hasattr(message, "additional_kwargs") and "tool_calls" in message.additional_kwargs:
                    tool_calls = message.additional_kwargs["tool_calls"]
                    logger.debug(f"发现 {len(tool_calls)} 个工具调用")
                    
                    for j, tool_call in enumerate(tool_calls):
                        try:
                            tool_name = tool_call["function"]["name"]
                            tool_args = tool_call["function"]["arguments"]
                            tool_id = tool_call.get("id", f"unknown_{j}")
                            
                            logger.debug(f"  工具 {j}: {tool_name}")
                            logger.debug(f"     参数: {tool_args}")
                            logger.debug(f"     ID: {tool_id}")
                            
                            steps.append(f"调用工具: {tool_name}({tool_args})")
                            
                            # 收集工具调用信息
                            tool_calls_info.append({
                                "name": tool_name,
                                "arguments": tool_args,
                                "call_id": tool_id
                            })
                        except Exception as e:
                            logger.error(f"解析工具调用 {j} 失败: {e}")
                        
                elif msg_type == "tool":
                    # 提.extract工具执行结果
                    tool_name = getattr(message, 'name', '未知工具')
                    tool_result = getattr(message, 'content', '')
                    tool_call_id = getattr(message, 'tool_call_id', 'unknown')
                    
                    logger.debug(f"工具结果: {tool_name}")
                    logger.debug(f"   结果长度: {len(str(tool_result))}")
                    logger.debug(f"   调用ID: {tool_call_id}")
                    
                    steps.append(f"{tool_name} 的结果是: {tool_result}")
                    
                    # 收集工具结果信息
                    tool_results_info.append({
                        "name": tool_name,
                        "result": tool_result,
                        "tool_call_id": tool_call_id
                    })
                    
                    # 特别处理search_similar_memories工具的结果
                    # 注意：现在需要知道是哪个客户端的工具调用，但_extract_agent_response方法不知道
                    # 这个处理逻辑需要移到chat方法中
                    if tool_name == "search_similar_memories" and tool_result:
                        logger.debug(f"🧠 记忆工具结果将在chat方法中处理")
                    
                elif msg_type == "ai":
                    # 提取最终答案
                    final_answer = getattr(message, 'content', '')
                    logger.debug(f"AI回答: {final_answer[:100]}..." if final_answer else "AI没有回答")
                    
                else:
                    # 记录其他类型的消息
                    content = getattr(message, 'content', '')
                    logger.debug(f"其他消息类型 {msg_type}: {content[:50]}..." if content else "无内容")

            # 发送工具调用信息到前端工作区
            logger.debug(f"工具调用检查: tool_calls={len(tool_calls_info)}, tool_results={len(tool_results_info)}, websocket={self._websocket is not None}")
            
            # 只要有工具调用或结果，就发送到前端（即使WebSocket不可用也要记录）
            if tool_calls_info or tool_results_info:
                logger.debug("发现工具调用，准备发送到前端")
                # 🔧 关键修复：使用当前请求的用户标识，而不是可能被覆盖的self._client_uid
                current_request_client_uid = getattr(self, '_current_request_client_uid', None) or self._client_uid
                workspace_data = {
                    "type": "mcp-workspace-update",
                    "timestamp": datetime.now().isoformat(),
                    "tool_calls": tool_calls_info,
                    "tool_results": tool_results_info,
                    "final_answer": final_answer or "",
                    "user_query": getattr(self, '_current_user_query', ''),
                    "status": "completed" if final_answer else "processing",
                    "client_uid": current_request_client_uid  # 使用正确的用户标识
                }
                
                logger.debug(f"工作区数据准备完成:")
                logger.debug(f"  - 工具调用: {len(tool_calls_info)} 个")
                logger.debug(f"  - 工具结果: {len(tool_results_info)} 个")
                logger.debug(f"  - 用户查询: {workspace_data['user_query']}")
                logger.debug(f"  - 最终答案: {'是' if final_answer else '否'}")
                logger.debug(f"  - 状态: {workspace_data['status']}")
                
                logger.debug("开始发送工作区数据到前端")
                # 🔧 关键修复：使用create_task但传递正确的client_uid
                try:
                    # 定义任务完成回调
                    def task_done_callback(task):
                        try:
                            result = task.result()
                            logger.debug("✅ 工作区数据发送成功")
                        except Exception as e:
                            logger.error(f"❌ 工作区数据发送失败: {e}")

                    task = asyncio.create_task(self._send_mcp_workspace_info(workspace_data, target_client_uid=current_request_client_uid))
                    task.add_done_callback(task_done_callback)
                    logger.debug("🎯 工作区数据发送任务已创建，使用正确的client_uid")
                except Exception as e:
                    logger.error(f"❌ 创建工作区数据发送任务失败: {e}")
            else:
                logger.debug("没有工具调用，无需发送工作区数据")

            # 只返回最终答案，不显示工具调用过程
            if final_answer:
                return final_answer
            else:
                logger.warning("没有找到最终答案")
                return "抱歉，无法获取到回答。"
                
        except Exception as e:
            logger.error(f"解析代理响应时出错: {e}")
            return f"处理结果时出错: {str(e)}"
    
    def _create_output(self, text: str) -> SentenceOutput:
        """创建正常输出"""
        display_text = DisplayText(
            text=text,
            name="AI",
            avatar=""
        )

        # 应用TTS过滤，移除方括号等标记
        tts_text = filter_text(
            text=text,
            remove_special_char=False,
            ignore_brackets=True,  # 过滤[happy]等情绪词
            ignore_parentheses=True,
            ignore_asterisks=True,
            ignore_angle_brackets=True,
        )

        return SentenceOutput(
            display_text=display_text,
            tts_text=tts_text,
            actions=Actions()
        )
    
    def _create_error_output(self, error_text: str) -> SentenceOutput:
        """创建错误输出"""
        display_text = DisplayText(
            text=error_text,
            name="AI",
            avatar=""
        )

        # 应用TTS过滤，移除方括号等标记
        tts_text = filter_text(
            text=error_text,
            remove_special_char=False,
            ignore_brackets=True,  # 过滤[happy]等情绪词
            ignore_parentheses=True,
            ignore_asterisks=True,
            ignore_angle_brackets=True,
        )

        return SentenceOutput(
            display_text=display_text,
            tts_text=tts_text,
            actions=Actions()
        )
    
    def handle_interrupt(self, heard_response: str) -> None:
        """处理中断"""
        pass
    
    def reset_interrupt(self) -> None:
        """重置中断"""
        pass
    
    def _decode_unicode_result(self, result_str: str) -> str:
        """解码工具结果中的Unicode编码"""
        try:
            # 如果是JSON字符串，先解析再重新编码为正确的UTF-8
            if isinstance(result_str, str) and (result_str.startswith('{') or result_str.startswith('[')):
                try:
                    # 解析JSON，ensure_ascii=False确保中文正确显示
                    parsed = json.loads(result_str)
                    return json.dumps(parsed, ensure_ascii=False, indent=2)
                except json.JSONDecodeError:
                    # 如果不是有效JSON，尝试Unicode解码
                    return result_str.encode('utf-8').decode('unicode-escape').encode('latin1').decode('utf-8')
            else:
                # 对于普通字符串，尝试Unicode解码
                return result_str.encode('utf-8').decode('unicode-escape').encode('latin1').decode('utf-8')
        except Exception as e:
            logger.debug(f"Unicode解码失败: {e}")
            return result_str  # 如果解码失败，返回原字符串

    async def _deduct_mcp_credits_for_agent(self, user_id: str, tool_name: str) -> bool:
        """为Agent内部MCP工具调用扣除积分

        Args:
            user_id: 用户ID
            tool_name: 工具名称

        Returns:
            bool: 扣除是否成功
        """
        try:
            from ..bff_integration.database.credit_repository import CreditRepository
            credit_repo = CreditRepository()

            # 定义不同工具的积分消耗（根据工具名称关键词匹配）
            tool_credits_map = {
                "music": 6.25,      # 音乐MCP工具
                "image": 5.0,       # 图片生成MCP工具
                "picture": 5.0,     # 图片生成MCP工具（别名）
                "generate": 5.0,    # 图片生成工具（generate_image）
                "weather": 3.0,     # 天气MCP工具
            }

            # 根据工具名称匹配积分消耗（不区分大小写）
            credit_cost = 6.25  # 默认使用音乐MCP的积分
            matched_type = "music"  # 默认类型
            if tool_name and isinstance(tool_name, str):
                tool_name_lower = tool_name.lower()
                for key, cost in tool_credits_map.items():
                    if key in tool_name_lower:
                        credit_cost = cost
                        matched_type = key
                        logger.info(f"🎯 匹配工具类型 '{key}', 积分消耗: {credit_cost}")
                        break

            # 执行积分扣除，使用工具调用类型和自定义描述
            consumption_result = credit_repo.consume_credits(
                user_id=user_id,
                amount=credit_cost,
                usage_type="tool_usage",  # 使用工具调用类型
                usage_description=f"工具调用消耗 {credit_cost}积分 (工具: {tool_name})"
            )

            if consumption_result["success"]:
                logger.info(f"✅ MCP工具 '{tool_name}' 调用成功扣除用户 {user_id} 积分: {consumption_result['consumed_amount']}")
                # 获取并显示剩余积分
                remaining_credits = credit_repo.get_user_credits(user_id)
                logger.info(f"💰 用户 {user_id} 剩余积分: {remaining_credits}")
                logger.info(f"🔧 调用工具: {tool_name}, 消耗积分: {credit_cost}")
                return True
            else:
                logger.error(f"❌ MCP积分实际扣除失败: {consumption_result['error_message']}")
                return False
        except Exception as e:
            logger.error(f"❌ MCP积分扣除系统异常: {e}")
            import traceback
            logger.error(f"❌ 错误详情: {traceback.format_exc()}")
            return False
    
    def set_memory_from_history(self, conf_uid: str, history_uid: str, user_id: str = None) -> None:
        """从历史记录加载内存

        Args:
            conf_uid: 配置唯一标识（角色ID）
            history_uid: 历史记录唯一标识
            user_id: 可选的用户ID（如果不提供，将尝试从history_uid提取）
        """
        # 🔧 现在不再清空全局历史，而是为特定用户创建历史
        # 从 history_uid 中提取实际的 client_uid
        client_uid = history_uid.split('_')[0] if '_' in history_uid else history_uid
        if client_uid not in self.client_conversation_histories:
            self.client_conversation_histories[client_uid] = []
        logger.info(f"Loaded memory from history: {conf_uid}, {history_uid} (client: {client_uid})")
        # 记录角色与用户ID
        self._character_id = conf_uid
        # 🎭 如果提供了user_id参数，使用它；否则使用client_uid
        self._user_id = user_id if user_id else client_uid
        logger.info(f"🎭 情绪系统 - 角色ID: {self._character_id}, 用户ID: {self._user_id}")
        # 注入情绪提示词（仅当可用且尚未注入或切换会话时）
        try:
            if self._emotion_manager and self._character_id and self._user_id:
                affinity = self._emotion_manager.get_affinity(self._character_id, self._user_id)
                emotion_prompt = self._emotion_manager.get_emotion_prompt(affinity)
                # 每次切换历史时都基于当前好感度刷新一次情绪提示
                level = self._emotion_manager.get_affinity_level(affinity)
                constraints = self._get_constraints_prompt(level)
                self.system_prompt = f"{self.system_prompt}\n\n{emotion_prompt}\n\n{constraints}".strip()
                self._emotion_prompt_applied = True
                logger.info(f"✅ 情绪提示已注入（affinity={affinity}）")
        except Exception as e:
            logger.warning(f"⚠️ 注入情绪提示失败: {e}")
    
    def start_group_conversation(self, human_name: str, ai_participants: List[str]) -> None:
        """开始群聊"""
        pass

    def set_system(self, new_system_prompt: str) -> None:
        """动态设置系统提示词（用于支持AI主动对话时的临时修改）"""
        self.system_prompt = new_system_prompt
        logger.info("✅ LangchainAgentWrapper系统提示词已更新")
        logger.debug(f"新系统提示词长度: {len(new_system_prompt)} 字符")

    async def process_conversation(
        self,
        user_input: str,
        images=None,
        websocket_send=None,
        client_uid=None,
        session_emoji="😊",
        user_id="default_user"
    ) -> None:
        """
        处理完整的对话流程，包括发送WebSocket信号
        注意：这个方法已废弃，所有Agent类型现在都直接使用process_agent_response
        """
        logger.warning(f"⚠️ LangchainAgentWrapper.process_conversation 被调用，这是遗留代码路径")
        logger.warning(f"⚠️ 请检查conversation_handler.py是否正确配置为直接使用process_agent_response")

        # 这个方法不应该被调用，但为了向后兼容，我们提供一个错误信息
        if websocket_send:
            await websocket_send(json.dumps({
                "type": "error",
                "message": "LangchainAgentWrapper.process_conversation deprecated, using process_agent_response instead"
            }))

    def create_copy(self):
        """为独立会话管理创建Agent副本

        重要：LangchainAgent需要独立的会话状态，避免多用户之间的状态混乱

        Returns:
            LangchainAgentWrapper: 新的Agent实例副本
        """
        try:
            # 创建新的Agent实例，共享MCP客户端但独立对话历史
            agent_copy = LangchainAgentWrapper(
                mcp_client=self.mcp_client,  # 可以共享MCP客户端
                llm_config=self.llm_config,  # 共享LLM配置
                system_prompt=self.system_prompt,  # 共享基础系统提示
                max_history_length=self.max_history_length,
                emotion_manager=self._emotion_manager,  # 情感管理器会在ServiceContext层面独立复制
                skip_mcp_search_prompt=self._skip_mcp_search_prompt
            )

            # 重要：独立的对话历史，避免会话串扰
            agent_copy.conversation_history = []
            agent_copy._collected_tool_results = []
            agent_copy.client_conversation_histories = {}  # 独立的多用户对话历史字典

            # 复制必要的状态但不复制会话相关的状态
            agent_copy._character_id = self._character_id
            agent_copy._user_id = None  # 每个连接都会设置自己的user_id
            agent_copy._client_uid = None  # 每个连接都会设置自己的client_uid
            agent_copy._current_websocket = None  # 每个连接都会设置自己的websocket
            agent_copy._websocket = None  # 清理WebSocket引用
            agent_copy._websocket_handler = None  # 清理WebSocket Handler引用，避免共享

            # 🔥 关键修复：复制工具调用相关的核心组件
            agent_copy.tools = self.tools.copy() if self.tools else []  # 复制工具列表
            agent_copy.agent = self.agent  # 复制LangGraph代理实例（可以共享）
            agent_copy.llm = self.llm  # 复制LLM实例（可以共享）
            agent_copy.util_agent_helper = self.util_agent_helper  # 复制Util Agent助手（可以共享）

            # 为调试目的添加实例ID
            import uuid
            agent_copy._instance_id = str(uuid.uuid4())[:8]
            self._instance_id = getattr(self, '_instance_id', str(uuid.uuid4())[:8])

            logger.info(f"✅ 创建了独立的LangchainAgent副本，避免多用户状态混乱")
            logger.info(f"📍 原实例ID: {self._instance_id}, 新副本ID: {agent_copy._instance_id}")
            return agent_copy

        except Exception as e:
            logger.error(f"❌ 创建LangchainAgent副本失败: {e}")
            # 如果创建副本失败，返回原实例但记录警告
            logger.warning("⚠️ 将使用共享Agent实例，可能导致多用户状态混乱")
            return self 