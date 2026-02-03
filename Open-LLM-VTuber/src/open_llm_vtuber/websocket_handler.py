import aiohttp
from typing import Dict, List, Optional, Callable, TypedDict, Any
from fastapi import WebSocket, WebSocketDisconnect
import asyncio
import json
from enum import Enum
import numpy as np
from loguru import logger
import os
from datetime import datetime

from .mcp_manager import MCPManager
from .chat_group import (
    ChatGroupManager,
    handle_group_operation,
    handle_client_disconnect,
    broadcast_to_group,
)
from .service_context import ServiceContext
from .message_handler import message_handler
from .utils.stream_audio import prepare_audio_payload
from .chat_history_manager import (
    create_new_history,
    get_history,
    delete_history,
    get_history_list,
    pin_history,
    rename_history_custom_title,
)
from .config_manager.utils import scan_config_alts_directory, scan_bg_directory
from .config_manager.utils import read_yaml, validate_config, save_config
from .conversations.conversation_handler import (
    handle_conversation_trigger,
    handle_group_interrupt,
    handle_individual_interrupt,
)


class MessageType(Enum):
    """Enum for WebSocket message types"""

    GROUP = ["add-client-to-group", "remove-client-from-group"]
    HISTORY = [
        "fetch-history-list",
        "fetch-and-set-history",
        "create-new-history",
        "delete-history",
        "pin-history",
        "rename-history",
    ]
    CONVERSATION = ["mic-audio-end", "text-input", "ai-speak-signal"]
    CONFIG = ["fetch-configs", "switch-config"]
    CONTROL = ["interrupt-signal", "audio-play-start"]
    DATA = ["mic-audio-data"]
    MCP = ["mcp-request"]  # Add MCP message type


class WSMessage(TypedDict, total=False):
    """Type definition for WebSocket messages"""

    type: str
    action: Optional[str]
    text: Optional[str]
    audio: Optional[List[float]]
    images: Optional[List[str]]
    history_uid: Optional[str]
    file: Optional[str]
    display_text: Optional[dict]
    user_id: Optional[str]  # 添加用户标识字段


class WebSocketHandler:
    """Handles WebSocket connections and message routing"""

    def __init__(self, default_context_cache: "ServiceContext"):
        """Initialize the WebSocket handler with default context"""
        self.client_connections: Dict[str, WebSocket] = {}
        self.client_contexts: Dict[str, "ServiceContext"] = {}
        self.chat_group_manager = ChatGroupManager()
        self.current_conversation_tasks: Dict[str, Optional[asyncio.Task]] = {}
        self.default_context_cache = default_context_cache
        self.received_data_buffers: Dict[str, np.ndarray] = {}

        
        # 读取MCP配置
        self.mcp_settings = self._load_mcp_settings()

        # 根据配置选择MCP管理器
        mcp_tool_mode = default_context_cache.system_config.mcp_tool_mode if default_context_cache.system_config else "langchain"
        
        # 使用原生MCP管理器（langchain模式已移除，统一使用原生模式）
        from .mcp_manager import MCPManager
        # 使用统一的MCP配置路径解析
        from .config_manager.mcp_config_resolver import get_mcp_config_path
        mcp_config_file = get_mcp_config_path() or "enhanced_mcp_config.json"
        self.mcp_manager = MCPManager(mcp_config_file)
        logger.info(f"MCP Manager initialized with mode: {mcp_tool_mode} (using native MCPManager)")
        
        if mcp_tool_mode == "langchain":
            logger.warning("langchain模式已弃用，自动使用原生MCP管理器")

        # Message handlers mapping
        self._message_handlers = self._init_message_handlers()

        # 定时清理任务
        self._cleanup_task = None
        self._start_periodic_cleanup()
    
    async def initialize(self) -> None:
        """初始化WebSocketHandler，包括MCP管理器
        
        此方法必须在异步上下文中调用，例如在FastAPI路由中
        """
        if hasattr(self.mcp_manager, 'initialize'):
            try:
                if "EnhancedMCPManager" in self.mcp_manager.__class__.__name__:
                    await self._initialize_enhanced_manager()
                else:
                    pass
            except Exception as e:
                logger.error(f"❌ WebSocketHandler初始化异常: {e}")
    

    def _load_mcp_settings(self):
        """加载MCP配置设置"""
        try:
            # 使用统一的MCP配置路径解析
            from .config_manager.mcp_config_resolver import get_mcp_config_path
            mcp_config_file = get_mcp_config_path() or "enhanced_mcp_config.json"
            
            if os.path.exists(mcp_config_file):
                with open(mcp_config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    logger.info(f"已加载MCP配置设置，send_results_to_llm={config.get('settings', {}).get('send_results_to_llm', True)}")
                    return config.get("settings", {})
            return {}
        except Exception as e:
            logger.error(f"加载MCP配置设置失败: {e}")
            return {}
    
    def _init_message_handlers(self) -> Dict[str, Callable]:
        """Initialize message type to handler mapping"""
        handlers = {
            "add-client-to-group": self._handle_group_operation,
            "remove-client-from-group": self._handle_group_operation,
            "request-group-info": self._handle_group_info,
            "fetch-history-list": self._handle_history_list_request,
            "fetch-and-set-history": self._handle_fetch_history,
            "create-new-history": self._handle_create_history,
            "delete-history": self._handle_delete_history,
            "pin-history": self._handle_pin_history,
            "rename-history": self._handle_rename_history,
            "interrupt-signal": self._handle_interrupt,
            "mic-audio-data": self._handle_audio_data,
            "mic-audio-end": self._handle_conversation_trigger,
            "raw-audio-data": self._handle_raw_audio_data,
            "text-input": self._handle_conversation_trigger,
            "ai-speak-signal": self._handle_conversation_trigger,
            "fetch-configs": self._handle_fetch_configs,
            "switch-config": self._handle_config_switch,
            "fetch-current-config": self._handle_fetch_current_config,
            "update-llm-tts": self._handle_update_llm_tts,
            "fetch-backgrounds": self._handle_fetch_backgrounds,
            "audio-play-start": self._handle_audio_play_start,
            "live2d-tap": self._handle_live2d_tap,
            "camera-image": self._handle_camera_image,
            "mcp-request": self._handle_mcp_request,  # Add MCP request handler
            "get-affinity": self._handle_get_affinity,  # Add affinity request handler
            "affinity_update": self._handle_deprecated_affinity_update,  # Handle deprecated message type
            "auth": self._handle_auth,  # Add user authentication handler
        }
        return handlers

    async def handle_new_connection(
        self, websocket: WebSocket, client_uid: str
    ) -> None:
        """
        Handle new WebSocket connection setup

        Args:
            websocket: The WebSocket connection
            client_uid: Unique identifier for the client

        Raises:
            Exception: If initialization fails
        """
        try:
            session_service_context = await self._init_service_context()

            await self._store_client_data(
                websocket, client_uid, session_service_context
            )

            await self._send_initial_messages(
                websocket, client_uid, session_service_context
            )

            # 确保定时清理任务运行
            if not self._cleanup_task or self._cleanup_task.done():
                try:
                    self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
                    logger.info("启动定时音频文件清理任务")
                except Exception as e:
                    logger.warning(f"启动定时清理任务失败: {e}")

            logger.info(f"Connection established for client {client_uid}")

        except Exception as e:
            logger.error(
                f"Failed to initialize connection for client {client_uid}: {e}"
            )
            await self._cleanup_failed_connection(client_uid)
            raise

    async def _store_client_data(
        self,
        websocket: WebSocket,
        client_uid: str,
        session_service_context: ServiceContext,
    ):
        """Store client data and initialize group status"""
        self.client_connections[client_uid] = websocket
        self.client_contexts[client_uid] = session_service_context
        self.received_data_buffers[client_uid] = np.array([])
        
        # 为会话上下文设置WebSocket连接
        session_service_context.set_websocket(websocket)
        
        # 验证emotion_manager的WebSocket设置
        if session_service_context.emotion_manager:
            logger.debug(f"✅ 客户端 {client_uid}: emotion_manager WebSocket已设置")
        else:
            logger.warning(f"⚠️ 客户端 {client_uid}: emotion_manager为None，无法设置WebSocket")

        self.chat_group_manager.client_group_map[client_uid] = ""
        await self.send_group_update(websocket, client_uid)

    async def _send_initial_messages(
        self,
        websocket: WebSocket,
        client_uid: str,
        session_service_context: ServiceContext,
    ):
        """Send initial connection messages to the client"""
        await websocket.send_text(
            json.dumps({"type": "full-text", "text": "Connection established"})
        )

        await websocket.send_text(
            json.dumps(
                {
                    "type": "set-model-and-conf",
                    "model_info": session_service_context.live2d_model.model_info,
                    "conf_name": session_service_context.character_config.conf_name,
                    "conf_uid": session_service_context.character_config.conf_uid,
                    "client_uid": client_uid,
                }
            )
        )

        # Send initial group status
        await self.send_group_update(websocket, client_uid)

        # Send TTS greeting message (Cookie通过同源策略自动传递，直接发送招呼语)
        character_name = session_service_context.character_config.character_name
        logger.info(f"🎵 Cookie通过同源策略自动传递到后端，为角色 {character_name} 发送基于当前好感度的招呼语")
        await self._send_tts_greeting_message(websocket, session_service_context, client_uid)

        # Start microphone
        await websocket.send_text(json.dumps({"type": "control", "text": "start-mic"}))

    def _is_websocket_connected(self, websocket: WebSocket) -> bool:
        """检查WebSocket是否处于连接状态
        
        Args:
            websocket: WebSocket连接
            
        Returns:
            bool: True如果连接正常，False否则
        """
        try:
            # 检查WebSocket客户端状态
            # WebSocketState: CONNECTING=0, CONNECTED=1, DISCONNECTED=2
            return hasattr(websocket, 'client_state') and websocket.client_state.value == 1
        except Exception:
            return False

    async def _cleanup_failed_connection(self, client_uid: str) -> None:
        """清理失败的连接
        
        Args:
            client_uid: 客户端标识符
        """
        try:
            # 清理客户端连接
            self.client_connections.pop(client_uid, None)
            
            # 清理客户端上下文
            self.client_contexts.pop(client_uid, None)
            
            # 清理当前对话任务
            if client_uid in self.current_conversation_tasks:
                task = self.current_conversation_tasks[client_uid]
                if task and not task.done():
                    logger.debug(f"取消失败连接客户端 {client_uid} 的对话任务")
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        logger.debug(f"失败连接客户端 {client_uid} 的对话任务已成功取消")
                    except Exception as e:
                        logger.warning(f"取消失败连接客户端 {client_uid} 的对话任务时出现错误: {e}")
                self.current_conversation_tasks.pop(client_uid, None)
            
            # 从群组中移除客户端（客户端自己移除自己）
            if hasattr(self, 'chat_group_manager') and self.chat_group_manager:
                self.chat_group_manager.remove_client_from_group(client_uid, client_uid)
            
            logger.debug(f"已清理失败连接的客户端数据: {client_uid}")
            
        except Exception as e:
            logger.error(f"清理失败连接客户端 {client_uid} 时出错: {e}")

    async def _safe_send_text(self, websocket: WebSocket, message: str, client_uid: str = None) -> bool:
        """安全地发送WebSocket文本消息
        
        Args:
            websocket: WebSocket连接
            message: 要发送的消息
            client_uid: 客户端ID（用于日志）
            
        Returns:
            bool: True如果发送成功，False否则
        """
        if not self._is_websocket_connected(websocket):
            logger.debug(f"WebSocket连接已断开，无法发送消息 {client_uid or ''}")
            return False
            
        try:
            await websocket.send_text(message)
            return True
        except Exception as e:
            if "ConnectionClosed" not in str(e) and "WebSocketDisconnect" not in str(e):
                logger.error(f"发送WebSocket消息失败 {client_uid or ''}: {e}")
            return False

    async def _send_current_affinity(
        self,
        websocket: WebSocket,
        client_uid: str,
        session_service_context: ServiceContext,
    ):
        """Send current affinity data to frontend
        
        获取用户的当前好感度（可能是数据库中的真实值，也可能是初始值）并发送给前端
        
        Args:
            websocket: The WebSocket connection
            client_uid: Client identifier
            session_service_context: Service context
        """
        try:
            # 检查是否有情感管理器
            if not session_service_context.emotion_manager:
                logger.debug(f"客户端 {client_uid} 没有情感管理器，跳过发送好感度")
                return
                
            # 获取角色ID和用户ID
            # 🔧 修正角色ID：使用conf_uid而不是character_name，确保与对话系统一致
            character_id = getattr(session_service_context.character_config, 'conf_uid', session_service_context.character_config.character_name)
            # 🔧 修正用户ID逻辑：仅从浏览器Cookie获取
            from .utils.user_context_helper import get_user_id_from_websocket_cookie_only
            
            # 尝试获取WebSocket头部信息
            websocket_headers = None
            try:
                client_context = self.client_contexts.get(client_uid)
                if client_context and hasattr(client_context, 'websocket'):
                    websocket = client_context.websocket
                    websocket_headers = dict(websocket.headers) if hasattr(websocket, 'headers') else {}
            except Exception as e:
                logger.debug(f"获取WebSocket头部信息失败: {e}")
            
            user_id = get_user_id_from_websocket_cookie_only(client_uid, websocket_headers, "default_user")
            logger.debug(f"🎯 _send_current_affinity: 最终用户ID: {user_id} (客户端: {client_uid})")
            
            logger.debug(f"🎭 角色ID: {character_id} (conf_uid), 用户ID: {user_id}")
            logger.debug(f"🎭 character_name: {session_service_context.character_config.character_name}")
            
            # 获取当前好感度（自动处理新用户/老用户逻辑）
            # EmotionManager.get_affinity() 内部会：
            # 1. 先查询数据库是否有记录
            # 2. 有记录：返回真实好感度
            # 3. 无记录：返回配置的初始好感度（50）
            current_affinity = session_service_context.emotion_manager.get_affinity(character_id, user_id)
            logger.debug(f"💖 获取到的好感度: {current_affinity} (character_id: {character_id}, user_id: {user_id})")
            
            # 获取好感度等级
            level = session_service_context.emotion_manager.get_affinity_level(current_affinity)
            
            # 🔧 修正用户类型判断逻辑：检查数据库中是否真的存在记录
            # 而不是简单比较数值，因为老用户的好感度也可能恰好是50
            user_type = "existing"
            try:
                # 通过affinity_storage直接检查是否有历史记录来判断是否为新用户
                affinity_storage = session_service_context.emotion_manager.affinity_storage
                logger.debug(f"🔍 检查affinity_storage类型: {type(affinity_storage).__name__}")
                
                if hasattr(affinity_storage, 'get_affinity_history'):
                    logger.debug(f"📜 使用get_affinity_history方法检查历史记录")
                    history = affinity_storage.get_affinity_history(character_id, user_id)
                    logger.debug(f"📜 历史记录数量: {len(history) if history else 0}")
                    if not history:  # 没有历史记录说明是新用户
                        user_type = "new"
                        logger.debug(f"🆕 没有历史记录，判断为新用户")
                    else:
                        logger.debug(f"👥 有历史记录，判断为老用户")
                elif hasattr(affinity_storage, '_mgr') and hasattr(affinity_storage._mgr, 'get_affinity'):
                    # 对于PgRedisAffinityStorage，使用None作为默认值检查是否存在
                    logger.debug(f"🟢 使用PgRedisAffinityStorage._mgr.get_affinity方法")
                    db_result = affinity_storage._mgr.get_affinity(character_id, user_id, default=None)
                    logger.debug(f"🟢 数据库直接查询结果: {db_result}")
                    if db_result is None:  # 数据库中不存在记录
                        user_type = "new"
                        logger.debug(f"🆕 数据库中无记录，判断为新用户")
                    else:
                        logger.debug(f"👥 数据库中有记录({db_result})，判断为老用户")
                else:
                    logger.debug(f"⚠️ 无法确定用户类型，默认为existing")
                # 如果无法确定，默认为existing以避免错误显示
            except Exception as e:
                logger.debug(f"检查用户类型时出错，默认为existing: {e}")
                logger.exception("详细错误信息:")
                user_type = "existing"
            
            logger.info(f"发送当前好感度给客户端 {client_uid}: {current_affinity} ({level}) - {user_type} user (character_id: {character_id})")
            
            # 使用安全发送方法
            message = json.dumps({
                "type": "affinity-update",
                "affinity": current_affinity,
                "level": level,
                "character_id": character_id,
                "user_id": user_id
            })
            
            success = await self._safe_send_text(websocket, message, client_uid)
            if success:
                logger.debug(f"✅ 成功发送当前好感度给客户端 {client_uid}")
            else:
                logger.debug(f"⚠️ 发送好感度失败，连接可能已断开 {client_uid}")
            
        except Exception as e:
            logger.error(f"发送当前好感度时出错: {e}")
            # 不记录详细堆栈，避免在连接断开时产生噪音
            if "ConnectionClosed" not in str(e) and "WebSocketDisconnect" not in str(e):
                logger.exception("详细错误信息:")

    async def _send_tts_greeting_message(
        self,
        websocket: WebSocket,
        session_service_context: ServiceContext,
        client_uid: str,
    ):
        """Send personalized TTS greeting message based on character configuration"""
        try:
            character_config = session_service_context.character_config
            character_name = character_config.character_name
            
            # 根据角色名称生成个性化问候语
            if "小狗" in character_name or "dog" in character_name.lower():
                greeting = f"汪汪！主人，{character_name}在这里等您很久了！今天想和{character_name}聊什么呢？"
            elif "米粒" in character_name or "mili" in character_name.lower():
                greeting = f"哼，{character_name}来了！虽然不想承认，但看到你确实有那么一点点开心。有什么想说的吗？"
            elif "mashiro" in character_name.lower():
                greeting = f"Привет! 我是{character_name}，准备好听一些有趣的苏联笑话了吗？"
            elif "神经大人" in character_name or "unhelpful" in character_name.lower():
                greeting = f"哦，瞧瞧，看看是谁来了！我的老朋友，{character_name}在此恭候多时了。"
            elif "001" in character_name or "零零一" in character_name:
                # 001 character generates different greeting messages based on current affinity
                try:
                    # 获取当前好感度
                    current_affinity = 50  # Default affinity
                    if hasattr(session_service_context, 'emotion_manager') and session_service_context.emotion_manager:
                        # Get real user ID from WebSocket Cookie
                        from .utils.user_context_helper import get_user_id_from_websocket_cookie_only
                        websocket_headers = dict(websocket.headers) if hasattr(websocket, 'headers') else {}
                        user_id = get_user_id_from_websocket_cookie_only("greeting", websocket_headers, "default_user")
                        
                        # Use conf_uid as character ID, consistent with conversation system
                        character_id = getattr(session_service_context.character_config, 'conf_uid', character_name)
                        current_affinity = session_service_context.emotion_manager.get_affinity(character_id, user_id)
                        logger.info(f"🎭 Greeting generation - Character ID: {character_id}, User ID: {user_id}, Affinity: {current_affinity}")
                    
                    # Generate different greeting messages based on affinity
                    if current_affinity <= 10:
                        greeting = f"Tch... It's you again, how boring. Talking to someone like you is simply a waste of my time."
                    elif current_affinity <= 20:
                        greeting = f"Hmph, you're here... Whatever, since you're here just speak up, such a hassle."
                    elif current_affinity <= 35:
                        greeting = f"It's you... I-I wasn't waiting for you! I just happened to be free."
                    elif current_affinity <= 50:
                        greeting = f"You're here... Well, I... I'm not worried about you, just asking casually."
                    elif current_affinity <= 65:
                        greeting = f"You're here~ I was just... okay, I did miss you a little."
                    elif current_affinity <= 80:
                        greeting = f"Darling! You're finally here, I missed you so much~ Don't leave me alone for so long again!"
                    else:
                        greeting = f"Master♡! I've been waiting for you... Without you by my side, I can't do anything~"
                except Exception as e:
                    logger.warning(f"Failed to get 001 character affinity, using default greeting: {e}")
                    greeting = f"Hello, I am {character_name}."
            else:
                # 默认问候语
                greeting = f"Hello! I am {character_name}, nice to meet you! What do you want to talk about today"
            
            # 延迟一下再发送问候语，等待前端完全加载
            await asyncio.sleep(2.0)  # 等待2秒让前端完全初始化

            # 使用TTS生成语音问候语
            await self._generate_and_send_tts_greeting(
                websocket, session_service_context, greeting, character_name, client_uid
            )
            
            logger.info(f"✅ 已生成TTS语音问候语: {greeting}")
            
        except Exception as e:
            logger.error(f"❌ 生成TTS语音问候语失败: {e}")
            # 发送默认文字问候语作为备选
            try:
                await websocket.send_text(
                    json.dumps({
                        "type": "greeting-message",
                        "text": "你好！欢迎来到Open-LLM-VTuber！",
                        "character_name": "AI助手"
                    })
                )
            except Exception as fallback_error:
                logger.error(f"❌ 发送默认问候语也失败: {fallback_error}")

    async def _generate_and_send_tts_greeting(
        self,
        websocket: WebSocket,
        session_service_context: ServiceContext,
        greeting_text: str,
        character_name: str,
        client_uid: str,
    ):
        """播放预设问候音频"""
        try:
            logger.info(f"🎵 开始播放预设问候音频: {greeting_text}")

            # 根据问候文本选择合适的预设音频
            preset_key = self._select_greeting_preset(greeting_text)

            if preset_key:
                # 使用预设音频播放问候
                from .conversations.conversation_handler import _play_preset_audio_direct
                await _play_preset_audio_direct(
                    websocket=websocket,
                    preset_key=preset_key,
                    message=greeting_text,
                    character_name=character_name,
                    expression="happy"  # 打招呼时使用高兴表情
                )
            else:
                # 如果没有匹配的预设音频，使用默认的greeting_8
                from .conversations.conversation_handler import _play_preset_audio_direct
                await _play_preset_audio_direct(
                    websocket=websocket,
                    preset_key="greeting_8",
                    message="Hello, I am Lain.",
                    character_name=character_name,
                    expression="wink"  # 使用眨眼表情
                )

        except Exception as e:
            logger.error(f"❌ 播放预设问候音频失败: {e}")

        finally:
            logger.info(f"✅ 数字人语音问候语完成: {greeting_text}")

    def _select_greeting_preset(self, greeting_text: str):
        """根据问候文本选择合适的预设音频"""
        # 清理文本中的表情标签
        clean_text = greeting_text
        for emotion in ['[happy]', '[sad]', '[shy]', '[angry]', '[wink]', '[blush]']:
            clean_text = clean_text.replace(emotion, '')
        clean_text = clean_text.strip()

        # 定义问候文本到预设音频的映射
        greeting_mappings = {
            "Tch... It's you again, how boring. Talking to someone like you is simply a waste of my time.": "greeting_1",
            "Hmph, you're here... Whatever, since you're here just speak up, such a hassle.": "greeting_2",
            "It's you... I-I wasn't waiting for you! I just happened to be free.": "greeting_3",
            "You're here... Well, I... I'm not worried about you, just asking casually.": "greeting_4",
            "You're here~ I was just... okay, I did miss you a little.": "greeting_5",
            "Darling! You're finally here, I missed you so much~ Don't leave me alone for so long again!": "greeting_6",
            "Master! I've been waiting for you... Without you by my side, I can't do anything~": "greeting_7",
            "Hello, I am Lain.": "greeting_8",
        }

        # 直接匹配
        if clean_text in greeting_mappings:
            return greeting_mappings[clean_text]

        # 部分匹配，检查关键词
        if "Hello" in clean_text and "Lain" in clean_text:
            return "greeting_8"
        elif "boring" in clean_text or "waste" in clean_text:
            return "greeting_1"
        elif "here" in clean_text and "hassle" in clean_text:
            return "greeting_2"
        elif "waiting" in clean_text or "free" in clean_text:
            return "greeting_3"
        elif "worried" in clean_text or "casually" in clean_text:
            return "greeting_4"
        elif "miss" in clean_text and ("little" in clean_text or "okay" in clean_text):
            return "greeting_5"
        elif "Darling" in clean_text or "missed you so much" in clean_text:
            return "greeting_6"
        elif "Master" in clean_text or "waiting for you" in clean_text:
            return "greeting_7"

        # 默认返回None，让调用者使用默认音频
        return None

    async def _init_service_context(self) -> ServiceContext:
        """Initialize service context for a new session by creating an independent copy"""
        logger.debug("🔧 开始创建独立的会话上下文")

        # 为每个客户端创建独立的ServiceContext副本，确保session独立
        # 避免多个客户端共享同一个上下文造成的状态混乱
        try:
            # 创建default_context的深度副本
            session_service_context = self.default_context_cache.create_copy()
            logger.info("✅ 已为新会话创建独立的ServiceContext副本")
        except Exception as e:
            logger.warning(f"⚠️ 创建ServiceContext副本失败，回退到引用方式: {e}")
            # 如果副本创建失败，回退到引用方式（保持向后兼容性）
            session_service_context = self.default_context_cache

        # 验证emotion_manager是否正确设置
        if session_service_context.emotion_manager:
            logger.info("✅ 会话上下文创建成功，emotion_manager已设置")
        else:
            logger.error("❌ 会话上下文创建失败，emotion_manager为None")

        return session_service_context


    async def handle_websocket_communication(
        self, websocket: WebSocket, client_uid: str
    ) -> None:
        """
        Handle ongoing WebSocket communication

        Args:
            websocket: The WebSocket connection
            client_uid: Unique identifier for the client
        """
        try:
            # 在通信开始时发送当前好感度（连接稳定后）
            session_service_context = self.client_contexts.get(client_uid)
            if session_service_context:
                await self._send_current_affinity(websocket, client_uid, session_service_context)
            
            while True:
                try:
                    data = await websocket.receive_json()
                    message_handler.handle_message(client_uid, data)
                    await self._route_message(websocket, client_uid, data)
                except WebSocketDisconnect:
                    raise
                except json.JSONDecodeError:
                    logger.error("Invalid JSON received")
                    continue
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    await websocket.send_text(
                        json.dumps({"type": "error", "message": str(e)})
                    )
                    continue

        except WebSocketDisconnect:
            logger.info(f"Client {client_uid} disconnected")
            raise
        except Exception as e:
            logger.error(f"Fatal error in WebSocket communication: {e}")
            raise

    async def _route_message(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """
        Route incoming message to appropriate handler

        Args:
            websocket: The WebSocket connection
            client_uid: Client identifier
            data: Message data
        """
        msg_type = data.get("type")
        if not msg_type:
            logger.warning("Message received without type")
            return

        handler = self._message_handlers.get(msg_type)
        if handler:
            await handler(websocket, client_uid, data)
        elif msg_type == "frontend-playback-complete":
            await self._handle_audio_playback_complete(websocket, client_uid, data)
        else:
            logger.warning(f"Unknown message type: {msg_type}")

    async def _handle_audio_playback_complete(
        self, websocket: WebSocket, client_uid: str, data: dict
    ) -> None:
        """处理前端音频播放完成通知"""
        try:
            audio_file_path = data.get("audio_file_path")
            tts_engine_class = data.get("tts_engine_class")

            # 添加MCP状态信息到日志
            mcp_enabled_status = "未知"
            try:
                from .service_context import ServiceContext
                global_mcp_enabled = getattr(ServiceContext, '_global_mcp_enabled', None)
                mcp_enabled_status = f"MCP启用: {global_mcp_enabled}"
            except Exception:
                pass

            logger.info(f"🎯 [音频文件追踪] 收到前端播放完成通知: audio_file_path={audio_file_path}, tts_engine_class={tts_engine_class}, {mcp_enabled_status}")

            # 记录完整的数据内容用于调试
            logger.debug(f"🎯 [音频文件追踪] 完整数据内容: {data}")

            if audio_file_path:
                from .conversations.global_tts_manager import global_tts_manager
                await global_tts_manager.cleanup_audio_file(audio_file_path, tts_engine_class)
                logger.info(f"📤 [音频文件追踪] 已处理音频播放完成通知: {audio_file_path}")
            else:
                # 收到不带文件路径的通知时，触发批量清理旧文件
                logger.debug("收到音频播放完成通知，但未包含文件路径，执行批量清理")
                await self._cleanup_old_audio_files()

        except Exception as e:
            logger.error(f"处理音频播放完成通知时出错: {e}")
            import traceback
            logger.error(f"处理音频播放完成通知错误详情: {traceback.format_exc()}")

    async def _cleanup_old_audio_files(self):
        """清理旧的音频文件"""
        try:
            import os
            import time
            # 使用相对路径，基于当前工作目录
            cache_dir = os.path.join(os.getcwd(), "cache")

            # 如果cache目录不存在，尝试在项目根目录下查找
            if not os.path.exists(cache_dir):
                # 尝试在项目根目录下的cache文件夹
                project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
                cache_dir = os.path.join(project_root, "cache")

            # 如果还是不存在，尝试Open-LLM-VTuber目录下的cache
            if not os.path.exists(cache_dir):
                cache_dir = os.path.join(os.getcwd(), "Open-LLM-VTuber", "cache")

            if not os.path.exists(cache_dir):
                logger.warning(f"音频缓存目录不存在: {cache_dir}")
                return

            current_time = time.time()
            cleaned_count = 0

            logger.debug(f"正在清理音频缓存目录: {cache_dir}")

            for filename in os.listdir(cache_dir):
                if filename.endswith('.mp3'):
                    file_path = os.path.join(cache_dir, filename)
                    try:
                        # 删除超过2分钟的音频文件，或者大小为0的文件（更积极的清理策略）
                        file_time = os.path.getmtime(file_path)
                        file_size = os.path.getsize(file_path)

                        if (current_time - file_time > 120) or file_size == 0:  # 2分钟或0字节
                            os.remove(file_path)
                            cleaned_count += 1
                            logger.debug(f"清理音频文件: {filename}")
                    except Exception as e:
                        logger.warning(f"清理音频文件失败 {filename}: {e}")

            if cleaned_count > 0:
                logger.info(f"批量清理完成，删除了 {cleaned_count} 个音频文件")

        except Exception as e:
            logger.error(f"批量清理音频文件失败: {e}")

    def _start_periodic_cleanup(self):
        """启动定时清理任务"""
        try:
            import asyncio
            loop = asyncio.get_running_loop()
            if loop:
                self._cleanup_task = loop.create_task(self._periodic_cleanup())
                logger.info("启动定时音频文件清理任务")
        except RuntimeError:
            # 没有运行中的事件循环，在实际使用时会在有事件循环的上下文中调用
            logger.debug("当前没有事件循环，定时清理任务将在第一次处理消息时启动")

    async def _periodic_cleanup(self):
        """定期清理音频文件的后台任务"""
        while True:
            try:
                await asyncio.sleep(60)  # 每分钟执行一次清理
                await self._cleanup_old_audio_files()
            except asyncio.CancelledError:
                logger.info("定时清理任务被取消")
                break
            except Exception as e:
                logger.error(f"定时清理任务执行错误: {e}")
                await asyncio.sleep(60)  # 出错后等待一分钟再继续

    async def _handle_group_operation(
        self, websocket: WebSocket, client_uid: str, data: dict
    ) -> None:
        """Handle group-related operations"""
        operation = data.get("type")
        target_uid = data.get(
            "invitee_uid" if operation == "add-client-to-group" else "target_uid"
        )

        await handle_group_operation(
            operation=operation,
            client_uid=client_uid,
            target_uid=target_uid,
            chat_group_manager=self.chat_group_manager,
            client_connections=self.client_connections,
            send_group_update=self.send_group_update,
        )

    async def handle_disconnect(self, client_uid: str) -> None:
        """Handle client disconnection"""
        logger.info(f"处理客户端断开连接: {client_uid}")
        
        # 首先清理对话任务以停止TTS生成
        if client_uid in self.current_conversation_tasks:
            task = self.current_conversation_tasks[client_uid]
            if task and not task.done():
                logger.debug(f"取消客户端 {client_uid} 的对话任务")
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    logger.debug(f"客户端 {client_uid} 的对话任务已成功取消")
                except Exception as e:
                    logger.warning(f"取消客户端 {client_uid} 的对话任务时出现错误: {e}")
            self.current_conversation_tasks.pop(client_uid, None)
        
        # 处理群组相关的清理
        group = self.chat_group_manager.get_client_group(client_uid)
        if group:
            await handle_group_interrupt(
                group_id=group.group_id,
                heard_response="",
                current_conversation_tasks=self.current_conversation_tasks,
                chat_group_manager=self.chat_group_manager,
                client_contexts=self.client_contexts,
                broadcast_to_group=self.broadcast_to_group,
            )

        await handle_client_disconnect(
            client_uid=client_uid,
            chat_group_manager=self.chat_group_manager,
            client_connections=self.client_connections,
            send_group_update=self.send_group_update,
        )

        # Clean up other client data
        self.client_connections.pop(client_uid, None)
        self.client_contexts.pop(client_uid, None)
        self.received_data_buffers.pop(client_uid, None)

        # 清理MCP处理结果缓存（按客户端隔离）
        if hasattr(self, '_processed_mcp_results_by_client'):
            self._processed_mcp_results_by_client.pop(client_uid, None)
        
        # 清理WebSocket用户缓存
        try:
            from .bff_integration.auth.websocket_user_cache import clear_websocket_client_cache
            clear_websocket_client_cache(client_uid)
            logger.debug(f"✅ 已清理客户端 {client_uid} 的用户缓存")
        except Exception as cache_error:
            logger.debug(f"清理客户端 {client_uid} 用户缓存时出错: {cache_error}")

        logger.info(f"Client {client_uid} disconnected and cleaned up")
        message_handler.cleanup_client(client_uid)

    async def broadcast_to_group(
        self, group_members: list[str], message: dict, exclude_uid: str = None
    ) -> None:
        """Broadcasts a message to group members"""
        await broadcast_to_group(
            group_members=group_members,
            message=message,
            client_connections=self.client_connections,
            exclude_uid=exclude_uid,
        )

    async def send_group_update(self, websocket: WebSocket, client_uid: str):
        """Sends group information to a client"""
        group = self.chat_group_manager.get_client_group(client_uid)
        if group:
            current_members = self.chat_group_manager.get_group_members(client_uid)
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "group-update",
                        "members": current_members,
                        "is_owner": group.owner_uid == client_uid,
                    }
                )
            )
        else:
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "group-update",
                        "members": [],
                        "is_owner": False,
                    }
                )
            )

    async def _handle_interrupt(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle conversation interruption"""
        heard_response = data.get("text", "")
        context = self.client_contexts[client_uid]
        group = self.chat_group_manager.get_client_group(client_uid)

        # 发送音频停止信号给前端，停止当前播放的TTS音频
        try:
            stop_payload = {
                "type": "audio-stop",
                "message": "Stop current audio playback due to interruption"
            }
            await websocket.send_text(json.dumps(stop_payload))
            logger.info("🛑 中断时已发送音频停止信号给前端")
        except Exception as e:
            logger.warning(f"⚠️ 发送音频停止信号时出错: {e}")

        if group and len(group.members) > 1:
            await handle_group_interrupt(
                group_id=group.group_id,
                heard_response=heard_response,
                current_conversation_tasks=self.current_conversation_tasks,
                chat_group_manager=self.chat_group_manager,
                client_contexts=self.client_contexts,
                broadcast_to_group=self.broadcast_to_group,
            )
        else:
            await handle_individual_interrupt(
                client_uid=client_uid,
                current_conversation_tasks=self.current_conversation_tasks,
                context=context,
                heard_response=heard_response,
            )

    async def _handle_history_list_request(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle request for chat history list"""
        context = self.client_contexts[client_uid]
        
        # 获取用户ID - 使用多层回退策略
        user_id = None
        
        # 第一优先级：从消息数据中获取user_id（前端发送的）
        if hasattr(data, 'get') or isinstance(data, dict):
            user_id = data.get('user_id')
            if user_id and user_id != "default_user":
                logger.debug(f"🎯 从消息数据获取用户ID: {user_id}")
        
        # 第二优先级：从WebSocket用户缓存获取（认证用户）
        if not user_id:
            try:
                from .bff_integration.auth.websocket_user_cache import get_user_id_for_websocket_client
                user_id = get_user_id_for_websocket_client(client_uid)
                if user_id:
                    logger.debug(f"🎯 从WebSocket用户缓存获取用户ID: {user_id}")
            except Exception as e:
                logger.debug(f"从WebSocket用户缓存获取用户ID失败: {e}")
        
        # 第三优先级：从WebSocket Cookie解析
        if not user_id:
            try:
                from .utils.user_context_helper import get_user_id_from_websocket_cookie_only
                websocket_headers = dict(websocket.headers) if hasattr(websocket, 'headers') else {}
                user_id = get_user_id_from_websocket_cookie_only(client_uid, websocket_headers, None)
                if user_id and user_id != "default_user":
                    logger.debug(f"🍪 从WebSocket Cookie获取用户ID: {user_id}")
            except Exception as e:
                logger.debug(f"从WebSocket Cookie获取用户ID失败: {e}")
        
        # 最终回退：使用default_user
        if not user_id:
            user_id = "default_user"
            logger.info(f"⚠️ 未能获取用户ID，使用默认值: {user_id}")
        
        logger.debug(f"✅ 最终用户ID: {user_id}")
        
        logger.info(f"📋 获取历史记录列表 - 角色: {context.character_config.conf_uid}, 用户: {user_id}")
        
        histories = get_history_list(context.character_config.conf_uid, user_id)
        logger.info(f"📋 找到 {len(histories)} 条历史记录")
        
        await websocket.send_text(
            json.dumps({"type": "history-list", "histories": histories})
        )

    async def _handle_fetch_history(
        self, websocket: WebSocket, client_uid: str, data: dict
    ):
        """Handle fetching and setting specific chat history"""
        history_uid = data.get("history_uid")
        if not history_uid:
            return

        context = self.client_contexts[client_uid]

        # 🎭 获取用户ID - 使用多层回退策略
        user_id = None

        # 第一优先级：从WebSocket用户缓存获取（认证用户）
        try:
            from .bff_integration.auth.websocket_user_cache import get_user_id_for_websocket_client
            user_id = get_user_id_for_websocket_client(client_uid)
            if user_id:
                logger.debug(f"🎯 从WebSocket用户缓存获取用户ID: {user_id}")
        except Exception as e:
            logger.debug(f"从WebSocket用户缓存获取用户ID失败: {e}")

        # 第二优先级：从WebSocket Cookie解析
        if not user_id:
            try:
                from .utils.user_context_helper import get_user_id_from_websocket_cookie_only
                websocket_headers = dict(websocket.headers) if hasattr(websocket, 'headers') else {}
                user_id = get_user_id_from_websocket_cookie_only(client_uid, websocket_headers, None)
                if user_id and user_id != "default_user":
                    logger.debug(f"🍪 从WebSocket Cookie获取用户ID: {user_id}")
            except Exception as e:
                logger.debug(f"从WebSocket Cookie获取用户ID失败: {e}")

        # 第三优先级：从UserContext获取
        if not user_id:
            try:
                from .bff_integration.auth.user_context import UserContextManager
                context_user_id = UserContextManager.get_current_user_id()
                if context_user_id:
                    user_id = context_user_id
            except Exception:
                pass

        # 最终回退：使用default_user
        if not user_id:
            user_id = "default_user"

        # Update history_uid in service context
        context.history_uid = history_uid
        # 🎭 传入正确的用户ID给情绪系统
        context.agent_engine.set_memory_from_history(
            conf_uid=context.character_config.conf_uid,
            history_uid=history_uid,
            user_id=user_id,
        )

        messages = [
            msg
            for msg in get_history(
                context.character_config.conf_uid,
                history_uid,
                user_id
            )
            if msg["role"] != "system"
        ]
        await websocket.send_text(
            json.dumps({"type": "history-data", "messages": messages})
        )

    async def _handle_create_history(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle creation of new chat history"""
        context = self.client_contexts[client_uid]
        
        # 获取用户ID - 使用与历史记录列表相同的策略
        user_id = None
        
        # 第一优先级：从消息数据中获取user_id（前端发送的）
        if hasattr(data, 'get') or isinstance(data, dict):
            user_id = data.get('user_id')
            if user_id and user_id != "default_user":
                logger.debug(f"🎯 从消息数据获取用户ID: {user_id}")
        
        # 第二优先级：从WebSocket用户缓存获取（认证用户）
        if not user_id:
            try:
                from .bff_integration.auth.websocket_user_cache import get_user_id_for_websocket_client
                user_id = get_user_id_for_websocket_client(client_uid)
                if user_id:
                    logger.debug(f"🎯 从WebSocket用户缓存获取用户ID: {user_id}")
            except Exception as e:
                logger.debug(f"从WebSocket用户缓存获取用户ID失败: {e}")
        
        # 第三优先级：从WebSocket Cookie解析
        if not user_id:
            try:
                from .utils.user_context_helper import get_user_id_from_websocket_cookie_only
                websocket_headers = dict(websocket.headers) if hasattr(websocket, 'headers') else {}
                user_id = get_user_id_from_websocket_cookie_only(client_uid, websocket_headers, None)
                if user_id and user_id != "default_user":
                    logger.debug(f"🍪 从WebSocket Cookie获取用户ID: {user_id}")
            except Exception as e:
                logger.debug(f"从WebSocket Cookie获取用户ID失败: {e}")
        
        # 最终回退：使用default_user
        if not user_id:
            user_id = "default_user"
            logger.info(f"⚠️ 未能获取用户ID，使用默认值: {user_id}")
        
        logger.debug(f"✅ 最终用户ID: {user_id}")
        
        logger.info(f"📝 创建新历史记录 - 角色: {context.character_config.conf_uid}, 用户: {user_id}")
        
        history_uid = create_new_history(context.character_config.conf_uid, user_id)
        if history_uid:
            context.history_uid = history_uid
            # 🎭 传入正确的用户ID给情绪系统
            context.agent_engine.set_memory_from_history(
                conf_uid=context.character_config.conf_uid,
                history_uid=history_uid,
                user_id=user_id,
            )
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "new-history-created",
                        "history_uid": history_uid,
                    }
                )
            )

    async def _handle_delete_history(
        self, websocket: WebSocket, client_uid: str, data: dict
    ):
        """Handle deletion of chat history"""
        history_uid = data.get("history_uid")
        if not history_uid:
            return

        context = self.client_contexts[client_uid]
        success = delete_history(
            context.character_config.conf_uid,
            history_uid,
        )
        await websocket.send_text(
            json.dumps(
                {
                    "type": "history-deleted",
                    "success": success,
                    "history_uid": history_uid,
                }
            )
        )
        if history_uid == context.history_uid:
            context.history_uid = None

    async def _handle_pin_history(
        self, websocket: WebSocket, client_uid: str, data: dict
    ):
        """Handle pinning/unpinning chat history"""
        history_uid = data.get("history_uid")
        is_pinned = data.get("pinned", False)
        
        logger.info(f"📌 处理置顶请求: history_uid={history_uid}, is_pinned={is_pinned}")
        
        if not history_uid:
            logger.warning("❌ 置顶请求缺少 history_uid")
            return

        success = pin_history(history_uid, is_pinned)
        logger.info(f"📌 置顶操作结果: success={success}")
        
        await websocket.send_text(
            json.dumps(
                {
                    "type": "history-pinned",
                    "success": success,
                    "history_uid": history_uid,
                    "pinned": is_pinned,
                }
            )
        )

    async def _handle_rename_history(
        self, websocket: WebSocket, client_uid: str, data: dict
    ):
        """Handle renaming chat history with custom title"""
        history_uid = data.get("history_uid")
        new_title = data.get("new_title", "")
        
        logger.info(f"📝 处理重命名请求: history_uid={history_uid}, new_title='{new_title}'")
        
        if not history_uid or not new_title:
            logger.warning("❌ 重命名请求缺少必要参数")
            return

        success = rename_history_custom_title(history_uid, new_title)
        logger.info(f"📝 重命名操作结果: success={success}")
        
        await websocket.send_text(
            json.dumps(
                {
                    "type": "history-renamed",
                    "success": success,
                    "history_uid": history_uid,
                    "new_title": new_title,
                }
            )
        )

    async def _handle_audio_data(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle incoming audio data"""
        audio_data = data.get("audio", [])
        if audio_data:
            self.received_data_buffers[client_uid] = np.append(
                self.received_data_buffers[client_uid],
                np.array(audio_data, dtype=np.float32),
            )

    async def _handle_raw_audio_data(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle incoming raw audio data for VAD processing"""
        context = self.client_contexts[client_uid]
        chunk = data.get("audio", [])
        if chunk:
            for audio_bytes in context.vad_engine.detect_speech(chunk):
                if audio_bytes == b"<|PAUSE|>":
                    await websocket.send_text(
                        json.dumps({"type": "control", "text": "interrupt"})
                    )
                elif audio_bytes == b"<|RESUME|>":
                    pass
                elif len(audio_bytes) > 1024:
                    # Detected audio activity (voice)
                    self.received_data_buffers[client_uid] = np.append(
                        self.received_data_buffers[client_uid],
                        np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32),
                    )
                    await websocket.send_text(
                        json.dumps({"type": "control", "text": "mic-audio-end"})
                    )

    async def _handle_conversation_trigger(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle triggers that start a conversation"""
        await handle_conversation_trigger(
            msg_type=data.get("type", ""),
            data=data,
            client_uid=client_uid,
            context=self.client_contexts[client_uid],
            websocket=websocket,
            client_contexts=self.client_contexts,
            client_connections=self.client_connections,
            chat_group_manager=self.chat_group_manager,
            received_data_buffers=self.received_data_buffers,
            current_conversation_tasks=self.current_conversation_tasks,
            broadcast_to_group=self.broadcast_to_group,
            websocket_handler=self,  # Pass self as websocket_handler
        )

    async def _handle_fetch_configs(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle fetching available configurations"""
        context = self.client_contexts[client_uid]
        config_files = scan_config_alts_directory(context.system_config.config_alts_dir)
        await websocket.send_text(
            json.dumps({"type": "config-files", "configs": config_files})
        )

    async def _handle_config_switch(
        self, websocket: WebSocket, client_uid: str, data: dict
    ):
        """Handle switching to a different configuration"""
        config_file_name = data.get("file")
        if config_file_name:
            context = self.client_contexts[client_uid]
            await context.handle_config_switch(websocket, config_file_name)

    async def _handle_fetch_current_config(
        self, websocket: WebSocket, client_uid: str, data: dict
    ) -> None:
        """Return current LLM provider and TTS model, and available options."""
        try:
            context = self.client_contexts.get(client_uid)
            if not context:
                await websocket.send_text(json.dumps({"type": "error", "message": "No context for client"}))
                return

            # Current values
            llm_provider_current = None
            try:
                llm_provider_current = (
                    context.character_config.agent_config.agent_settings.basic_memory_agent.llm_provider
                )
            except Exception:
                llm_provider_current = None

            tts_model_current = None
            try:
                tts_model_current = context.character_config.tts_config.tts_model
            except Exception:
                tts_model_current = None

            # Options based on configured entries (exclude None)
            llm_configs_dict = {}
            try:
                llm_configs_dict = context.character_config.agent_config.llm_configs.model_dump(exclude_none=True)
            except Exception:
                llm_configs_dict = {}
            llm_provider_options = list(llm_configs_dict.keys())

            tts_config_dict = {}
            try:
                tts_config_dict = context.character_config.tts_config.model_dump()
            except Exception:
                tts_config_dict = {}
            tts_model_options = [k for k, v in tts_config_dict.items() if k != "tts_model" and v]

            await websocket.send_text(
                json.dumps(
                    {
                        "type": "current-config",
                        "llm_provider_current": llm_provider_current,
                        "llm_provider_options": llm_provider_options,
                        "tts_model_current": tts_model_current,
                        "tts_model_options": tts_model_options,
                    }
                )
            )
        except Exception as e:
            logger.error(f"Error fetching current config: {e}")
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))

    async def _handle_update_llm_tts(
        self, websocket: WebSocket, client_uid: str, data: dict
    ) -> None:
        """Update LLM provider and TTS model in conf.yaml, hot-reload and persist."""
        try:
            requested_llm = data.get("llm_provider")
            requested_tts = data.get("tts_model")

            if not requested_llm and not requested_tts:
                await websocket.send_text(json.dumps({"type": "error", "message": "No update fields provided"}))
                return

            context = self.client_contexts.get(client_uid)
            if not context:
                await websocket.send_text(json.dumps({"type": "error", "message": "No context for client"}))
                return

            # Compute available options to validate
            llm_configs_dict = context.character_config.agent_config.llm_configs.model_dump(exclude_none=True)
            valid_llm_options = set(llm_configs_dict.keys())

            tts_config_dict = context.character_config.tts_config.model_dump()
            valid_tts_options = {k for k, v in tts_config_dict.items() if k != "tts_model" and v}

            if requested_llm and requested_llm not in valid_llm_options:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "update-llm-tts-result",
                            "success": False,
                            "message": f"Invalid llm_provider: {requested_llm}",
                        }
                    )
                )
                return

            if requested_tts and requested_tts not in valid_tts_options:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "update-llm-tts-result",
                            "success": False,
                            "message": f"Invalid tts_model: {requested_tts}",
                        }
                    )
                )
                return

            # Load, modify, validate
            disk_conf = read_yaml("conf.yaml")
            cc = disk_conf.get("character_config", {})
            agent_cfg = cc.get("agent_config", {})
            agent_settings = agent_cfg.get("agent_settings", {})
            basic_memory_agent = agent_settings.get("basic_memory_agent", {})
            tts_cfg = cc.get("tts_config", {})

            if requested_llm:
                basic_memory_agent["llm_provider"] = requested_llm
            if requested_tts:
                tts_cfg["tts_model"] = requested_tts

            # Re-assign nested back
            agent_settings["basic_memory_agent"] = basic_memory_agent
            agent_cfg["agent_settings"] = agent_settings
            cc["agent_config"] = agent_cfg
            cc["tts_config"] = tts_cfg
            disk_conf["character_config"] = cc

            new_config = validate_config(disk_conf)

            # Hot-reload current context
            context.load_from_config(new_config)

            # Persist to file
            save_config(new_config, "conf.yaml")

            # Notify frontend
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "set-model-and-conf",
                        "model_info": context.live2d_model.model_info,
                        "conf_name": context.character_config.conf_name,
                        "conf_uid": context.character_config.conf_uid,
                    }
                )
            )

            await websocket.send_text(
                json.dumps(
                    {
                        "type": "update-llm-tts-result",
                        "success": True,
                        "llm_provider": requested_llm
                        if requested_llm
                        else context.character_config.agent_config.agent_settings.basic_memory_agent.llm_provider,
                        "tts_model": requested_tts if requested_tts else context.character_config.tts_config.tts_model,
                    }
                )
            )
        except Exception as e:
            logger.error(f"Error updating llm/tts: {e}")
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "update-llm-tts-result",
                        "success": False,
                        "message": str(e),
                    }
                )
            )

    async def _handle_fetch_backgrounds(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle fetching available background images"""
        bg_files = scan_bg_directory()
        await websocket.send_text(
            json.dumps({"type": "background-files", "files": bg_files})
        )

    async def _handle_audio_play_start(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """
        Handle audio playback start notification
        """
        group_members = self.chat_group_manager.get_group_members(client_uid)
        if len(group_members) > 1:
            display_text = data.get("display_text")
            if display_text:
                silent_payload = prepare_audio_payload(
                    audio_path=None,
                    display_text=display_text,
                    actions=None,
                    forwarded=True,
                )
                await self.broadcast_to_group(
                    group_members, silent_payload, exclude_uid=client_uid
                )

    async def _handle_live2d_tap(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """
        Handle Live2D model tap events
        """
        import random

        logger.info(f"🎯 Live2D tap event received: {data}")
        
        context = self.client_contexts[client_uid]
        hit_area_name = data.get("hitAreaName")
        
        if not hit_area_name:
            logger.warning("Live2D tap event without hitAreaName")
            return

        # Get model info from Live2D model
        model_info = context.live2d_model.model_info
        
        # Try tap expressions first (for models that only have expressions)
        tap_expressions = model_info.get("tapExpressions", {})
        if hit_area_name in tap_expressions:
            available_expressions = tap_expressions[hit_area_name]
            if available_expressions:
                # Randomly select an expression based on weights
                expression_names = list(available_expressions.keys())
                weights = list(available_expressions.values())
                
                selected_expression = random.choices(expression_names, weights=weights, k=1)[0]
                
                logger.info(f"Live2D tap on {hit_area_name}: triggering '{selected_expression}' expression")
                
                # Get expression index from emotionMap
                emotion_map = model_info.get("emotionMap", {})
                expression_index = emotion_map.get(selected_expression)
                
                if expression_index is not None:
                    payload = {
                        "type": "live2d-action",
                        "actions": {
                            "expressions": [expression_index]
                        }
                    }
                    await websocket.send_text(json.dumps(payload))
                    return
                else:
                    logger.warning(f"Expression '{selected_expression}' not found in emotionMap")
        
        # Fallback to tap motions (for models with actual motion files)
        tap_motions = model_info.get("tapMotions", {})
        
        if hit_area_name not in tap_motions:
            logger.warning(f"No tap motions or expressions defined for {hit_area_name}")
            return

        # Get available motions for the hit area
        available_motions = tap_motions[hit_area_name]
        
        if not available_motions:
            logger.warning(f"No motions available for {hit_area_name}")
            return

        # Randomly select a motion based on weights
        motion_names = list(available_motions.keys())
        weights = list(available_motions.values())
        
        selected_motion = random.choices(motion_names, weights=weights, k=1)[0]
        
        logger.info(f"Live2D tap on {hit_area_name}: triggering '{selected_motion}' motion")

        # Check if the selected motion has a corresponding motion group
        motion_groups = model_info.get("motionGroups", {})
        selected_group = None
        
        # Find motion group that contains the selected motion
        for group_name, motions in motion_groups.items():
            if selected_motion in motions:
                selected_group = group_name
                break
        
        # If motion group found, use it instead of single motion
        if selected_group:
            logger.info(f"Found motion group '{selected_group}' for motion '{selected_motion}'")
            payload = context.live2d_model.play_motion_group(selected_group)
        else:
            # Fallback to single motion if no group found
            payload = {
                "type": "live2d-action",
                "actions": {
                    "motions": [selected_motion]
                }
            }
        
        await websocket.send_text(json.dumps(payload))

    async def _handle_camera_image(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """
        Handle camera image from frontend
        """
        try:
            # Get camera config from system config
            context = self.client_contexts.get(client_uid)
            if not context:
                logger.warning(f"No context found for client {client_uid}")
                return
                
            camera_config = getattr(context.system_config, 'camera_config', {})
            if not camera_config.get('enabled', False):
                logger.warning("Camera functionality is disabled in config")
                await websocket.send_text(json.dumps({
                    "type": "camera-image-received",
                    "success": False,
                    "error": "Camera functionality is disabled"
                }))
                return
            
            image_data = data.get("imageData")
            mime_type = data.get("mimeType", "image/jpeg")
            auto_trigger = data.get("autoTrigger", camera_config.get('auto_vision_trigger', False))
            text_message = data.get("text", camera_config.get('vision_prompt', "What do you see in this image?"))
            
            if not image_data:
                logger.warning("Camera image event without imageData")
                return

            # Validate image format
            supported_formats = camera_config.get('supported_formats', ["image/jpeg", "image/png", "image/webp"])
            if mime_type not in supported_formats:
                logger.warning(f"Unsupported image format: {mime_type}")
                await websocket.send_text(json.dumps({
                    "type": "camera-image-received",
                    "success": False,
                    "error": f"Unsupported image format: {mime_type}"
                }))
                return
                
            # Store image data for next conversation
            if not hasattr(context, 'pending_images'):
                context.pending_images = []
                
            image_info = {
                "source": "camera",
                "data": image_data,
                "mime_type": mime_type
            }
            
            context.pending_images = [image_info]  # Replace with latest image
            
            logger.info(f"Received camera image from client {client_uid}, mime_type: {mime_type}")
            
            # If auto-trigger is enabled or there's text, start conversation
            if auto_trigger or (text_message and text_message.strip()):
                trigger_data = {
                    "type": "text-input",
                    "text": text_message,
                    "images": context.pending_images
                }
                
                await self._handle_conversation_trigger(websocket, client_uid, trigger_data)
                
            # Send confirmation back to frontend
            await websocket.send_text(json.dumps({
                "type": "camera-image-received",
                "success": True,
                "timestamp": data.get("timestamp"),
                "auto_triggered": auto_trigger
            }))
            
        except Exception as e:
            logger.error(f"Error handling camera image: {e}")
            await websocket.send_text(json.dumps({
                "type": "camera-image-received", 
                "success": False,
                "error": str(e)
            }))

    async def _handle_mcp_request(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """处理MCP请求，支持设备级session管理"""
        try:
            requirement = data.get("requirement")
            if not requirement:
                logger.warning("MCP request without requirement")
                return

            # 🔧 获取用户ID，支持设备级session管理
            user_id = self._get_user_id_for_mcp_request(client_uid, websocket, data)
            logger.info(f"MCP request from user: {user_id}, device: {client_uid}")

            # 【MCP积分预检查】- 在工具调用前检查积分是否充足
            # 暂时使用默认积分（6.25），实际扣除会根据具体工具调整
            try:
                from .bff_integration.database.credit_repository import CreditRepository
                credit_repo = CreditRepository()

                # 预检查积分是否充足（使用最大可能消耗：音乐MCP的6.25积分）
                mcp_credit_cost = 6.25
                has_sufficient_credits = credit_repo.check_sufficient_credits(user_id, mcp_credit_cost)

                if not has_sufficient_credits:
                    logger.warning(f"🚫 用户 {user_id} 积分不足，无法调用MCP工具")

                    # 发送积分不足消息到前端
                    await websocket.send_text(json.dumps({
                        "type": "mcp-error",
                        "message": "Insufficient credits to call MCP tools. Please recharge your credits first."
                    }))

                    # 播放积分不足TTS提示
                    context = self.client_contexts.get(client_uid) or self.default_context_cache
                    from .conversations.conversation_handler import _play_insufficient_credits_tts
                    await _play_insufficient_credits_tts(context, websocket)
                    return

                logger.info(f"✅ 用户 {user_id} 积分充足，允许调用MCP工具")

            except Exception as e:
                logger.error(f"❌ MCP积分预检查失败: {e}")
                # 积分检查失败时，为避免影响用户体验，暂时允许继续
                logger.warning("⚠️ MCP积分预检查失败，允许请求继续")

            # 检查是否请求流式处理，默认启用流式处理
            streaming = data.get("streaming", True)

            logger.info(f"Processing MCP request: {requirement}, streaming={streaming} (默认启用流式处理)")
            print(f"\n===== MCP请求处理开始 =====")
            print(f"请求内容: {requirement}")
            print(f"流式处理: {streaming}")
            print(f"MCP管理器类型: {type(self.mcp_manager).__name__}")
    
            # 检查MCP管理器类型
            if hasattr(self.mcp_manager, "execute_orchestration"):
                # 增强型MCP管理器 - 使用智能工具编排
                print(f"使用增强型MCP管理器处理请求，streaming={streaming}")
                await self._handle_enhanced_mcp_request(websocket, client_uid, requirement, user_id, streaming)
            elif hasattr(self.mcp_manager, "auto_select_and_call_tool"):
                # AI自动选择工具模式 - 参考math_client.py的实现
                print(f"使用AI自动选择工具模式处理请求，streaming={streaming}")
                await self._handle_ai_auto_select_mcp_request(websocket, client_uid, requirement, user_id, streaming)
            elif hasattr(self.mcp_manager, "get_tools_config_for_ai"):
                # Langchain模式（向后兼容）- 新的简化流程
                try:
                    logger.info("使用Langchain模式处理MCP请求（新的简化流程）")
    
                    # 步骤1：确保工具已初始化
                    logger.info("步骤1：检查本地MCP工具配置")
                    
                    # 检查配置文件路径
                    config_path = self.mcp_manager._resolve_config_path()
                    logger.info(f"使用配置文件路径: {config_path}")
                    if os.path.exists(config_path):
                        logger.info(f"✅ 配置文件存在: {config_path}")
                    else:
                        logger.warning(f"⚠️ 配置文件不存在: {config_path}")
    
                    # 首先初始化工具
                    await self.mcp_manager.initialize_from_config()
                    has_tools = self.mcp_manager.has_available_tools()
                    
                    # 检查工具初始化状态
                    if has_tools:
                        logger.info("✅ 发现本地可用工具，使用简化的工具调用流程")
                        logger.info(f"可用工具数量: {len(self.mcp_manager.tools)}")
                        for i, tool in enumerate(self.mcp_manager.tools):
                            logger.info(f"工具 {i+1}: {tool.name}")
                            logger.info(f"  描述: {tool.description}")
                        
                        # 尝试调用工具（使用设备级session）
                        logger.info("步骤2：调用匹配的工具")
                        result = await self.mcp_manager.find_matching_tool_and_call(requirement, user_id, client_uid)
    
                        if result:
                            # 尝试解析结果
                            try:
                                if isinstance(result, str):
                                    # 检查是否是错误消息
                                    if result.startswith("错误:") or result.startswith("抱歉"):
                                        logger.error(f"工具调用返回错误: {result}")
                                        await websocket.send_text(json.dumps({
                                            "type": "error",
                                            "message": result
                                        }))
                                        return
    
                                    # 尝试解析为JSON
                                    try:
                                        result_obj = json.loads(result)
                                    except json.JSONDecodeError:
                                        # 如果不是有效的JSON，以文本形式返回
                                        result_obj = {"text": result}
                                else:
                                    result_obj = result
    
                                # 格式化结果为AI可理解的格式
                                formatted_result = self._format_mcp_result_for_ai(result_obj)
    
                                # 构造包含结果的提示
                                ai_prompt = f"User asked: {requirement}\n\nI have obtained the relevant data:\n{formatted_result}\n\nPlease provide a detailed answer based on this data."
    
                                # 发送响应给前端
                                send_to_llm = self.mcp_settings.get("send_results_to_llm", True)
                                await websocket.send_text(json.dumps({
                                    "type": "mcp-response",
                                    "source": "local_or_search_api",
                                    "response": result_obj,
                                    "formatted_result": formatted_result,
                                    "sent_to_llm": send_to_llm
                                }))
                                logger.info("成功发送MCP工具调用结果")

                                # 【MCP积分实际扣除】- 工具调用成功后根据工具类型扣除相应积分
                                tool_name = result_obj.get("_tool_name", "unknown")
                                logger.info(f"🔧 Langchain模式调用的工具名称: {tool_name}")
                                await self._deduct_mcp_credits(user_id, tool_name)

                                # 🔧 修复后的传统MCP结果处理：让AI知道结果但避免重复
                                send_to_llm = self.mcp_settings.get("send_results_to_llm", True)
                                if send_to_llm:
                                    logger.info("🎯 传递传统MCP结果给AI，避免重复处理")
                                    await self._trigger_ai_with_mcp_result_once(
                                        websocket, client_uid, requirement, {"formatted_result": formatted_result}
                                    )
                                else:
                                    logger.info("⚠️ 根据配置，MCP结果不发送给大模型")
                                return
                            except Exception as e:
                                logger.error(f"处理工具调用结果时出错: {e}")
                                logger.exception("详细错误信息:")
                                await websocket.send_text(json.dumps({
                                    "type": "error",
                                    "message": f"处理工具结果时出错: {str(e)}"
                                }))
                                return
                        else:
                            logger.warning("工具调用失败")
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "message": "MCP工具调用失败，请稍后再试。"
                            }))
                            return
                    else:
                        # 没有可用工具，调用搜索API
                        logger.warning("⚠️ 没有找到可用的本地MCP工具，调用搜索API获取工具")
                        
                        # 先尝试从搜索API获取新工具并保存
                        try:
                            logger.info("尝试从搜索API获取新工具并保存到配置文件...")
                            success = await self.mcp_manager.write_search_api_response_to_config(requirement)
                            
                            if success:
                                logger.info("✅ 成功从搜索API获取新工具并保存到配置文件")
                                # 重新初始化工具
                                await self.mcp_manager.initialize_from_config()
                                logger.info("✅ 重新初始化工具完成")
                        except Exception as e:
                            logger.error(f"从搜索API获取新工具时出错: {e}")
                            logger.exception("详细错误信息:")

                        # 调用搜索API并使用工具（使用设备级session）
                        result = await self.mcp_manager.find_matching_tool_and_call(requirement, user_id, client_uid)
    
                        if result:
                            # 尝试解析结果
                            try:
                                if isinstance(result, str):
                                    # 检查是否是错误消息
                                    if result.startswith("错误:") or result.startswith("抱歉"):
                                        logger.error(f"搜索API调用返回错误: {result}")
                                        await websocket.send_text(json.dumps({
                                            "type": "error",
                                            "message": result
                                        }))
                                        return
    
                                    # 尝试解析为JSON
                                    try:
                                        result_obj = json.loads(result)
                                    except json.JSONDecodeError:
                                        # 如果不是有效的JSON，以文本形式返回
                                        result_obj = {"text": result}
                                else:
                                    result_obj = result
    
                                # 发送响应给前端
                                send_to_llm = self.mcp_settings.get("send_results_to_llm", True)
                                await websocket.send_text(json.dumps({
                                    "type": "mcp-response",
                                    "source": "search_api",
                                    "response": result_obj,
                                    "sent_to_llm": send_to_llm
                                }))
                                logger.info("成功发送搜索API调用结果")
    
                                # 触发AI使用MCP结果重新生成回复
                                send_to_llm = self.mcp_settings.get("send_results_to_llm", True)
                                if send_to_llm:
                                    logger.info("🎯 触发AI使用MCP结果重新生成回复")
                                    await self._trigger_ai_with_mcp_result(
                                        websocket, client_uid, requirement, result_obj
                                    )
                                else:
                                    logger.info("⚠️ 根据配置，MCP结果不发送给大模型")
                                return
                            except Exception as e:
                                logger.error(f"处理搜索API结果时出错: {e}")
                                logger.exception("详细错误信息:")
                                await websocket.send_text(json.dumps({
                                    "type": "error",
                                    "message": f"处理搜索结果时出错: {str(e)}"
                                }))
                                return
                        else:
                            logger.warning("搜索API调用失败")
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "message": "没有找到合适的MCP工具，且搜索API调用失败。请检查网络连接和配置。"
                            }))
                            return
    
                except Exception as e:
                    logger.error(f"Langchain MCP处理出错: {e}")
                    logger.exception("详细错误信息:")
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": f"MCP工具处理失败: {str(e)}"
                    }))
            else:
                # 原生模式（备用选项）
                try:
                    logger.info("使用原生模式处理MCP请求")
                    # 查找匹配的工具
                    tool = self.mcp_manager.find_matching_tool(requirement)
                    if not tool:
                        logger.warning(f"No matching MCP tool found for: {requirement}")
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "未找到匹配的MCP工具"
                        }))
                        return
    
                    # 调用工具（使用设备级session）
                    logger.info(f"调用原生MCP工具: {tool['tool_name']} (用户: {user_id}, 设备: {client_uid})")
                    response = await self.mcp_manager.call_mcp_tool_for_device(
                        tool["config"], requirement, user_id, client_uid, tool['tool_name']
                    )
    
                    # 发送响应
                    await websocket.send_text(json.dumps({
                        "type": "mcp-response",
                        "source": "native",
                        "tool_name": tool.get("tool_name", "unknown"),
                        "response": response
                    }))
                except Exception as e:
                    logger.error(f"Native MCP processing error: {e}")
                    logger.exception("Detailed error:")
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": f"MCP工具处理失败: {str(e)}"
                    }))
        except Exception as e:
            logger.error(f"MCP request handling error: {e}")
            logger.exception("Detailed error:")
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"处理MCP请求时出错: {str(e)}"
            }))

    async def _trigger_ai_with_mcp_result(
        self, websocket: WebSocket, client_uid: str, requirement: str, mcp_result: dict
    ) -> None:
        """触发AI使用MCP工具结果重新生成回复"""
        try:
            logger.info("🤖 触发AI使用MCP工具结果重新生成回复")
            
            # 格式化MCP结果为AI可理解的文本
            formatted_result = self._format_mcp_result_for_ai(mcp_result)
            
            # 构造包含MCP结果的提示
            ai_prompt = f"User asked: {requirement}\n\nI have obtained the relevant data:\n{formatted_result}\n\nPlease provide a detailed answer based on this data."
            
            # 获取客户端上下文
            context = self.client_contexts.get(client_uid)
            if not context:
                logger.warning(f"Client context not found for {client_uid}")
                return
            
            # 暂时禁用MCP请求以避免循环
            if hasattr(context.agent_engine, '_mcp_request_sent'):
                context.agent_engine._mcp_request_sent = True
            
            # 导入所需模块
            from .conversations.single_conversation import process_agent_response
            from .conversations.conversation_utils import create_batch_input, send_conversation_start_signals

            # 🔧 创建批量输入（标记为系统内部处理，避免被识别为用户输入）
            batch_input = create_batch_input(
                input_text=ai_prompt,
                images=None,
                from_name="MCP_SYSTEM",  # 使用特殊标识避免被当作用户输入
            )
            
            try:
                logger.info("🤖 开始AI基于MCP结果的对话生成")

                # 发送开始信号
                await send_conversation_start_signals(websocket.send_text)

                # 处理AI响应（使用全局TTS管理器）
                full_response = await process_agent_response(
                    context=context,
                    batch_input=batch_input,
                    websocket_send=websocket.send_text,
                    tts_manager=None,  # 使用默认的全局TTS管理器
                    client_uid=client_uid,
                )
                
                # 发送结束信号
                await websocket.send_text(json.dumps({
                    "type": "conversation-chain", 
                    "step": "end"
                }))
                
                logger.info(f"🤖 AI基于MCP结果生成的回复: {full_response}")
                
                # 存储对话历史
                # if context.history_uid and full_response:
                #     from ..chat_history_manager import store_message
                #     store_message(
                #         conf_uid=context.character_config.conf_uid,
                #         history_uid=context.history_uid,
                #         role="ai",
                #         content=full_response,
                #         name=context.character_config.character_name,
                #         avatar=context.character_config.avatar,
                #     )
                #
                # return full_response
                
            except Exception as e:
                logger.error(f"❌ AI处理MCP结果时出错: {e}")
                logger.exception("详细错误信息:")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"AI处理MCP结果时出错: {str(e)}"
                }))
                return None
            finally:
                tts_manager.clear()
            
        except Exception as e:
            logger.error(f"❌ 触发AI使用MCP结果时出错: {e}")
            logger.exception("详细错误信息:")

    async def _trigger_ai_with_mcp_result_once(
        self, websocket: WebSocket, client_uid: str, requirement: str, mcp_result: dict
    ) -> None:
        """触发AI使用MCP工具结果生成简洁回复（避免复读机）"""
        try:
            logger.info("🎯 传递MCP结果给AI生成简洁回复")
            
            # 获取客户端上下文
            context = self.client_contexts.get(client_uid)
            if not context:
                logger.warning(f"Client context not found for {client_uid}")
                return

            # 检查是否已经处理过这个MCP结果，避免重复（按用户隔离）
            mcp_result_key = f"{client_uid}_{requirement}_{hash(str(mcp_result))}"
            if not hasattr(self, '_processed_mcp_results_by_client'):
                self._processed_mcp_results_by_client = {}

            if client_uid not in self._processed_mcp_results_by_client:
                self._processed_mcp_results_by_client[client_uid] = set()

            if mcp_result_key in self._processed_mcp_results_by_client[client_uid]:
                logger.info(f"⚠️ 客户端 {client_uid} 的此MCP结果已处理过，跳过重复处理")
                return

            # 标记为已处理（仅对当前客户端）
            self._processed_mcp_results_by_client[client_uid].add(mcp_result_key)
            
            # 格式化MCP结果为AI可理解的文本
            formatted_result = self._format_mcp_result_for_ai(mcp_result)
            
            # 🔧 收集工具结果用于 Util Agent 处理
            try:
                if hasattr(context.agent_engine, 'collect_tool_result'):
                    # 从requirement推断工具名称（简化处理）
                    tool_name = self._infer_tool_name_from_requirement(requirement)
                    context.agent_engine.collect_tool_result(tool_name, mcp_result)
                    logger.info(f"✅ 已收集工具结果用于 Util Agent: {tool_name}")
                else:
                    logger.debug("Agent 不支持工具结果收集")
            except Exception as e:
                logger.warning(f"收集工具结果时出错: {e}")
            
            # 🔧 改进的AI提示：避免触发MCP循环调用
            ai_prompt = f"""Answer based on search results: {requirement}

搜索结果摘要：
{formatted_result}

请根据上述信息简洁回答，保持角色特色，挑选2-3个最相关的内容即可。"""

            # 🔧 设置强制MCP处理标志，避免循环调用
            if hasattr(context.agent_engine, '_mcp_request_sent'):
                context.agent_engine._mcp_request_sent = True
            
            # 🔧 额外设置一个临时标志，避免在处理MCP结果时被误触发
            context.agent_engine._processing_mcp_result = True
            
            # 导入所需模块
            from .conversations.single_conversation import process_agent_response
            from .conversations.conversation_utils import create_batch_input, send_conversation_start_signals

            # 🔧 创建批量输入（标记为系统内部处理，避免被识别为用户输入）
            batch_input = create_batch_input(
                input_text=ai_prompt,
                images=None,
                from_name="MCP_SYSTEM",  # 使用特殊标识避免被当作用户输入
            )
            
            try:
                logger.info("🤖 开始基于MCP结果的简洁AI回复")

                # 发送开始信号
                await send_conversation_start_signals(websocket.send_text)

                # 处理AI响应（使用全局TTS管理器）
                full_response = await process_agent_response(
                    context=context,
                    batch_input=batch_input,
                    websocket_send=websocket.send_text,
                    tts_manager=None,  # 使用默认的全局TTS管理器
                    client_uid=client_uid,
                )
                
                # 发送结束信号
                await websocket.send_text(json.dumps({
                    "type": "conversation-chain", 
                    "step": "end"
                }))
                
                logger.info(f"✅ AI基于MCP结果的简洁回复完成: {full_response}")
                
                # 🔧 清理处理标志（成功时）
                if hasattr(context.agent_engine, '_mcp_request_sent'):
                    context.agent_engine._mcp_request_sent = False
                if hasattr(context.agent_engine, '_processing_mcp_result'):
                    context.agent_engine._processing_mcp_result = False
                
            except Exception as e:
                logger.error(f"❌ AI处理MCP结果时出错: {e}")
                logger.exception("详细错误信息:")
                
                # 🔧 清理处理标志（出错时）
                if hasattr(context.agent_engine, '_mcp_request_sent'):
                    context.agent_engine._mcp_request_sent = False
                if hasattr(context.agent_engine, '_processing_mcp_result'):
                    context.agent_engine._processing_mcp_result = False
                    
        except Exception as e:
            logger.error(f"❌ 触发AI使用MCP结果（一次性）时出错: {e}")
            logger.exception("详细错误信息:")
    
    def _format_mcp_result_for_ai(self, mcp_result: Any) -> str:
        """将MCP工具结果格式化为AI可理解的文本
        
        Args:
            mcp_result: MCP工具返回的结果
            
        Returns:
            格式化后的文本
        """
        try:
            # 如果是字符串，尝试解析为JSON
            if isinstance(mcp_result, str):
                try:
                    mcp_result = json.loads(mcp_result)
                except json.JSONDecodeError:
                    return mcp_result
            
            # 如果是字典
            if isinstance(mcp_result, dict):
                # 检查是否是错误信息
                if "error" in mcp_result:
                    return f"抱歉，获取数据时出现错误：{mcp_result['error']}"
                
                # 检查是否是天气数据
                if any(key in mcp_result for key in ["weather", "temperature", "forecast", "天气", "气温"]):
                    weather_info = []
                    for key, value in mcp_result.items():
                        if isinstance(value, (str, int, float)):
                            weather_info.append(f"{key}: {value}")
                    return "\n".join(weather_info)
                
                # 检查是否是地图数据
                if any(key in mcp_result for key in ["location", "address", "coordinates", "位置", "地址"]):
                    location_info = []
                    for key, value in mcp_result.items():
                        if isinstance(value, (str, int, float)):
                            location_info.append(f"{key}: {value}")
                    return "\n".join(location_info)
                
                # 检查是否是搜索结果
                if "results" in mcp_result or isinstance(mcp_result.get("data"), list):
                    results = mcp_result.get("results", mcp_result.get("data", []))
                    if isinstance(results, list):
                        formatted_results = []
                        for result in results[:5]:  # 限制结果数量
                            if isinstance(result, dict):
                                if "title" in result and "snippet" in result:
                                    formatted_results.append(f"标题：{result['title']}\n摘要：{result['snippet']}\n")
                                else:
                                    formatted_results.append(json.dumps(result, ensure_ascii=False, indent=2))
                        return "\n".join(formatted_results)
                
                # 如果有text字段，直接使用
                if "text" in mcp_result:
                    return mcp_result["text"]
                
                # 其他情况，格式化整个字典
                return json.dumps(mcp_result, ensure_ascii=False, indent=2)
            
            # 如果是列表
            elif isinstance(mcp_result, list):
                formatted_items = []
                for item in mcp_result[:5]:  # 限制结果数量
                    if isinstance(item, dict):
                        formatted_items.append(json.dumps(item, ensure_ascii=False, indent=2))
                    else:
                        formatted_items.append(str(item))
                return "\n".join(formatted_items)
            
            # 其他类型，转换为字符串
            return str(mcp_result)
            
        except Exception as e:
            logger.error(f"格式化MCP结果时出错: {e}")
            logger.exception("详细错误信息:")
            return str(mcp_result)

    def _infer_tool_name_from_requirement(self, requirement: str) -> str:
        """从用户需求推断工具名称
        
        Args:
            requirement: 用户的需求文本
            
        Returns:
            推断的工具名称
        """
        requirement_lower = requirement.lower()
        
        # 天气相关关键词
        if any(keyword in requirement_lower for keyword in ["天气", "weather", "气温", "温度", "wind", "rain"]):
            return "weather_tool"
        
        # 搜索相关关键词
        if any(keyword in requirement_lower for keyword in ["搜索", "search", "查询", "找", "lookup"]):
            return "search_tool"
        
        # 地图/位置相关关键词
        if any(keyword in requirement_lower for keyword in ["地图", "位置", "地址", "导航", "map", "location"]):
            return "location_tool"
        
        # 默认使用通用工具名称
        return "mcp_tool"

    async def _handle_group_info(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle group info request"""
        await self.send_group_update(websocket, client_uid)
        
    async def _handle_deprecated_affinity_update(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle deprecated affinity_update message type (should use affinity-update)"""
        logger.warning(f"🔧 客户端 {client_uid} 使用了废弃的消息类型 'affinity_update'，请更新为 'affinity-update'")
        # 简单记录警告，不需要实际处理，因为这类消息通常是服务器发出的
        pass
    
    async def _handle_get_affinity(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle request for current affinity value
        
        Args:
            websocket: The WebSocket connection
            client_uid: Client identifier
            data: Message data
        """
        try:
            # 获取客户端上下文
            context = self.client_contexts.get(client_uid)
            if not context or not context.emotion_manager:
                logger.warning(f"无法获取客户端 {client_uid} 的情感管理器")
                return
                
            # 获取角色ID和用户ID
            # 🔧 修正角色ID：使用conf_uid而不是character_name，保持与其他方法一致
            character_id = getattr(context.character_config, 'conf_uid', context.character_config.character_name)
            # 🔧 修正用户ID逻辑：仅从浏览器Cookie获取
            from .utils.user_context_helper import get_user_id_from_websocket_cookie_only
            
            # 获取WebSocket头部信息
            websocket_headers = dict(websocket.headers) if hasattr(websocket, 'headers') else {}
            
            user_id = get_user_id_from_websocket_cookie_only(client_uid, websocket_headers, "default_user")
            logger.debug(f"🎯 _handle_get_affinity: 最终用户ID: {user_id} (客户端: {client_uid})")
            
            logger.debug(f"📞 请求角色ID: {character_id} (conf_uid), 用户ID: {user_id}")
            
            # 获取当前好感度
            affinity = context.emotion_manager.get_affinity(character_id, user_id)
            
            # 获取好感度等级
            level = context.emotion_manager.get_affinity_level(affinity)
            
            logger.info(f"获取客户端 {client_uid} 的好感度: {affinity} ({level}) (character_id: {character_id})")
            
            # 使用安全发送方法
            message = json.dumps({
                "type": "affinity-update",
                "affinity": affinity,
                "level": level,
                "character_id": character_id,  # 现在使用conf_uid
                "user_id": user_id  # 现在使用default_user
            })
            
            logger.debug(f"📤 响应好感度请求: character_id={character_id}, user_id={user_id}, affinity={affinity}")
            
            success = await self._safe_send_text(websocket, message, client_uid)
            if not success:
                logger.warning(f"发送好感度响应失败，客户端 {client_uid} 连接可能已断开")
            
        except Exception as e:
            logger.error(f"处理好感度请求时出错: {e}")
            if "ConnectionClosed" not in str(e) and "WebSocketDisconnect" not in str(e):
                logger.exception("详细错误信息:")

    async def _handle_auth(
        self, websocket: WebSocket, client_uid: str, data: WSMessage
    ) -> None:
        """Handle user authentication via session token
        
        Args:
            websocket: The WebSocket connection
            client_uid: Client identifier
            data: Message data containing session_token
        """
        try:
            session_token = data.get("session_token")
            if not session_token:
                logger.warning(f"客户端 {client_uid} 发送的认证信息缺少session_token")
                return
            
            logger.info(f"🔐 处理客户端 {client_uid} 的用户认证，token长度: {len(session_token)}")
            
            # 导入并使用用户认证服务
            from .bff_integration.auth.user_context import UserContextManager
            from .bff_integration.auth.jwt_helper import decode_session_token
            
            try:
                # 解码JWT token获取用户信息
                user_info = decode_session_token(session_token)
                if user_info and "user_id" in user_info:
                    user_id = user_info["user_id"]
                    username = user_info.get("username", f"user_{user_id[-8:]}")
                    email = user_info.get("email")
                    roles = user_info.get("roles", ["USER"])
                    
                    logger.info(f"✅ 成功认证用户: {user_id} ({username})")
                    
                    # 创建用户上下文对象
                    from .bff_integration.auth.user_context import UserContext
                    user_context = UserContext(
                        user_id=user_id,
                        username=username,
                        email=email,
                        roles=roles,
                        token=session_token
                    )
                    
                    # 设置用户上下文
                    UserContextManager.set_user_context(user_context)
                    
                    # 缓存用户信息到WebSocket用户缓存中
                    from .bff_integration.auth.websocket_user_cache import cache_user_for_websocket_client
                    cache_user_for_websocket_client(client_uid, user_id, username, email, roles, session_token)
                    
                    # 获取客户端上下文并更新好感度数据
                    context = self.client_contexts.get(client_uid)
                    if context and context.emotion_manager:
                        character_id = getattr(context.character_config, 'conf_uid', context.character_config.character_name)
                        
                        # 获取用户的好感度数据
                        affinity = context.emotion_manager.get_affinity(character_id, user_id)
                        level = context.emotion_manager.get_affinity_level(affinity)
                        
                        logger.info(f"📊 用户 {user_id} 对角色 {character_id} 的好感度: {affinity} ({level})")
                        
                        # 发送更新后的好感度信息给前端
                        await websocket.send_text(json.dumps({
                            "type": "affinity-update",
                            "character_id": character_id,
                            "user_id": user_id,
                            "affinity": affinity,
                            "level": level,
                            "authenticated": True
                        }))
                        
                else:
                    logger.warning(f"⚠️ 无法从token中获取用户ID，客户端: {client_uid}")
                    
            except Exception as decode_error:
                logger.error(f"❌ JWT token解码失败: {decode_error}")
                # 保持使用默认用户
                
        except Exception as e:
            logger.error(f"处理用户认证时出错: {e}")
            logger.exception("详细错误信息:")

    def _get_user_id_for_mcp_request(self, client_uid: str, websocket: WebSocket, data: WSMessage) -> str:
        """获取MCP请求的用户ID，优先级：消息中的user_id -> WebSocket缓存 -> Cookie -> 默认值"""
        user_id = None

        # 第一优先级：从消息数据获取
        user_id = data.get('user_id')
        if user_id and user_id != "default_user":
            logger.debug(f"🎯 从MCP消息数据获取用户ID: {user_id}")
            return user_id

        # 第二优先级：从WebSocket用户缓存获取（认证用户）
        try:
            from .bff_integration.auth.websocket_user_cache import get_user_id_for_websocket_client
            user_id = get_user_id_for_websocket_client(client_uid)
            if user_id:
                logger.debug(f"🎯 从WebSocket用户缓存获取用户ID: {user_id}")
                return user_id
        except Exception as e:
            logger.debug(f"从WebSocket用户缓存获取用户ID失败: {e}")

        # 第三优先级：从WebSocket Cookie获取
        try:
            from .utils.user_context_helper import get_user_id_from_websocket_cookie_only
            websocket_headers = dict(websocket.headers) if hasattr(websocket, 'headers') else {}
            user_id = get_user_id_from_websocket_cookie_only(client_uid, websocket_headers, None)
            if user_id and user_id != "default_user":
                logger.debug(f"🍪 从WebSocket Cookie获取用户ID: {user_id}")
                return user_id
        except Exception as e:
            logger.debug(f"从WebSocket Cookie获取用户ID失败: {e}")

        # 兜底：使用默认用户ID
        default_user_id = "default_user"
        logger.debug(f"🔄 使用默认用户ID: {default_user_id}")
        return default_user_id

    async def _deduct_mcp_credits(self, user_id: str, tool_name: str) -> bool:
        """扣除MCP工具调用积分

        Args:
            user_id: 用户ID
            tool_name: 工具名称

        Returns:
            bool: 是否扣除成功
        """
        try:
            from .bff_integration.database.credit_repository import CreditRepository
            credit_repo = CreditRepository()

            # 定义不同工具的积分消耗（根据工具名称关键词匹配）
            tool_credits_map = {
                "music": 6.25,      # 音乐MCP工具
                "image": 5.0,       # 图片生成MCP工具
                "picture": 5.0,     # 图片生成MCP工具（别名）
                "weather": 3.0,     # 天气MCP工具
                # 可以根据需要继续添加其他工具
            }

            # 根据工具名称匹配积分消耗（不区分大小写）
            credit_cost = 6.25  # 默认使用音乐MCP的积分
            if tool_name and isinstance(tool_name, str):
                tool_name_lower = tool_name.lower()
                for key, cost in tool_credits_map.items():
                    if key in tool_name_lower:
                        credit_cost = cost
                        logger.info(f"🎯 匹配工具类型 '{key}', 积分消耗: {credit_cost}")
                        break

            # 执行积分扣除
            consumption_result = credit_repo.consume_credits(user_id, credit_cost)

            if consumption_result["success"]:
                logger.info(f"✅ MCP工具调用成功扣除用户 {user_id} 积分: {consumption_result['consumed_amount']}")
                logger.info(f"💰 用户剩余积分: {consumption_result['remaining_credits']}")
                logger.info(f"📊 积分消耗详情: {consumption_result['consumption_details']}")
                logger.info(f"🔧 调用工具: {tool_name}, 消耗积分: {credit_cost}")
                return True
            else:
                logger.error(f"❌ MCP积分实际扣除失败: {consumption_result['error_message']}")
                logger.warning("⚠️ MCP积分扣除失败，但工具调用已完成")
                return False

        except Exception as e:
            logger.error(f"❌ MCP积分扣除系统异常: {e}")
            logger.warning("⚠️ MCP积分扣除异常，但工具调用已完成")
            return False

    async def _handle_enhanced_mcp_request(
        self, websocket: WebSocket, client_uid: str, requirement: str, user_id: str, streaming: bool = False
    ) -> None:
        """处理增强型MCP管理器请求，支持流式处理"""
        try:
            logger.info(f"🚀 使用增强型MCP管理器处理请求，streaming={streaming}")
            
            # 发送处理开始信号
            await websocket.send_text(json.dumps({
                "type": "mcp-processing",
                "message": "正在智能分析您的需求..."
            }))
            
            # 根据streaming参数决定是否使用流式处理
            if streaming:
                logger.info("🌊 使用流式处理模式调用工具")
                await self._stream_matching_tool_and_call(websocket, client_uid, requirement, user_id)
            else:
                # 使用标准模式调用工具（使用设备级session）
                logger.info("📦 使用标准模式调用工具")
                result = await self.mcp_manager.find_matching_tool_and_call(requirement, user_id, client_uid)
                
                if result:
                    logger.info("✅ 增强型MCP工具调用成功")

                    # 【MCP积分实际扣除】- 增强型模式工具调用成功后扣除积分
                    tool_name = result.get("_tool_name", "unknown") if isinstance(result, dict) else "unknown"
                    logger.info(f"🔧 增强型模式调用的工具名称: {tool_name}")
                    await self._deduct_mcp_credits(user_id, tool_name)

                    # 格式化结果
                    formatted_result = self._format_enhanced_mcp_result(result)

                    # 发送详细响应
                    send_to_llm = self.mcp_settings.get("send_results_to_llm", True)
                    await websocket.send_text(json.dumps({
                        "type": "mcp-response",
                        "source": "enhanced",
                        "response": {
                            "content": result,
                            "formatted": formatted_result,
                            "stats": self._get_enhanced_manager_stats()
                        },
                        "message": "✅ 智能工具调用完成",
                        "sent_to_llm": send_to_llm
                    }))

                    # 🔧 修复后的增强型MCP结果处理：让AI知道结果但避免重复
                    send_to_llm = self.mcp_settings.get("send_results_to_llm", True)
                    if send_to_llm:
                        logger.info("🎯 传递增强型MCP结果给AI，避免重复处理")
                        await self._trigger_ai_with_mcp_result_once(
                            websocket, client_uid, requirement, {"formatted_result": formatted_result}
                        )
                    else:
                        logger.info("⚠️ 根据配置，MCP结果不发送给大模型")
                else:
                    logger.warning("⚠️ 增强型MCP工具调用未返回结果")
                await websocket.send_text(json.dumps({
                    "type": "mcp-error",
                    "message": "智能工具未能获取到相关信息，请稍后再试或换个问法。"
                }))
                
        except Exception as e:
            logger.error(f"❌ 增强型MCP请求处理失败: {e}")
            await websocket.send_text(json.dumps({
                "type": "mcp-error", 
                "message": f"处理请求时出现异常: {str(e)}"
            }))
    
    def _format_enhanced_mcp_result(self, result: str) -> str:
        """格式化增强型MCP结果
        
        Args:
            result: 原始结果
            
        Returns:
            格式化后的结果
        """
        try:
            # 如果结果已经包含执行摘要，直接返回
            if "📊 执行摘要:" in result:
                return result
            
            # 尝试解析JSON结果
            try:
                if result.startswith('{') or result.startswith('['):
                    import json
                    parsed = json.loads(result)
                    return json.dumps(parsed, ensure_ascii=False, indent=2)
            except (json.JSONDecodeError, AttributeError):
                pass
            
            # 添加格式化标记
            formatted = f"🤖 智能工具调用结果:\n\n{result}"
            
            # 如果结果太长，添加摘要
            if len(result) > 1000:
                summary = result[:500] + "...\n\n📝 结果较长，已显示前500字符。"
                formatted = f"🤖 智能工具调用结果:\n\n{summary}"
            
            return formatted
            
        except Exception as e:
            logger.error(f"❌ 格式化增强型MCP结果失败: {e}")
            return f"🤖 智能工具调用结果:\n\n{result}"
    
    def _get_enhanced_manager_stats(self) -> Dict[str, Any]:
        """获取增强型管理器统计信息
        
        Returns:
            统计信息字典
        """
        try:
            if hasattr(self.mcp_manager, 'get_performance_stats'):
                stats = self.mcp_manager.get_performance_stats()
                return {
                    "tools_available": stats.get('server_stats', {}).get('total_tools', 0),
                    "cache_hit_ratio": f"{stats.get('cache_stats', {}).get('cache_hit_ratio', 0):.1%}",
                    "uptime": f"{stats.get('system_stats', {}).get('uptime', 0):.1f}s"
                }
        except Exception as e:
            logger.error(f"❌ 获取增强型管理器统计失败: {e}")
        
        return {"status": "运行中"}

    async def _handle_ai_auto_select_mcp_request(
        self, websocket: WebSocket, client_uid: str, requirement: str, user_id: str = None, streaming: bool = False
    ) -> None:
        """处理AI自动选择工具的MCP请求，支持流式处理
        
        使用数字人现有的AI进行工具选择，不需要额外的连接
        """
        try:
            logger.info(f"🤖 使用AI自动选择工具模式处理MCP请求，streaming={streaming}")
            
            # 发送处理开始信号
            await websocket.send_text(json.dumps({
                "type": "mcp-processing",
                "message": "AI is intelligently analyzing your needs and automatically selecting the best tools..."
            }))
            
            # 获取当前客户端的service context
            service_context = self.client_contexts.get(client_uid)
            if not service_context:
                logger.warning(f"客户端 {client_uid} 没有service context")
                service_context = self.default_context_cache
            
            # 根据streaming参数决定是否使用流式处理
            if streaming:
                logger.info("🌊 使用流式处理模式自动选择和调用工具")
                print(f"\n===== 流式处理模式 =====")
                print(f"请求内容: {requirement}")
                await self._stream_matching_tool_and_call(websocket, client_uid, requirement, user_id)
                print(f"===== 流式处理完成 =====\n")
                return
            else:
                # 使用标准模式调用工具
                logger.info("📦 使用标准模式自动选择和调用工具")
                print(f"\n===== 标准处理模式 =====")
                print(f"请求内容: {requirement}")
                result = await self.mcp_manager.find_matching_tool_and_call(requirement, user_id, client_uid)
            
            if result and result.get("success"):
                logger.info("✅ AI工具调用成功")

                # 【MCP积分实际扣除】- AI自动选择模式工具调用成功后扣除积分
                tool_name = result.get("_tool_name", "unknown") if isinstance(result, dict) else "unknown"
                logger.info(f"🔧 AI自动选择模式调用的工具名称: {tool_name}")
                await self._deduct_mcp_credits(user_id, tool_name)

                # 发送成功响应
                send_to_llm = self.mcp_settings.get("send_results_to_llm", True)
                await websocket.send_text(json.dumps({
                    "type": "mcp-response",
                    "source": "ai_auto_select",
                    "success": True,
                    "requirement": requirement,
                    "steps": result.get("steps", []),
                    "tool_results": result.get("tool_results", []),
                    "final_answer": result.get("final_answer", ""),
                    "message": "AI已成功完成您的请求",
                    "sent_to_llm": send_to_llm
                }))

                # 🔧 修复后的MCP结果处理：让AI知道结果但避免重复回复
                final_answer = result.get("final_answer")
                if final_answer:
                    send_to_llm = self.mcp_settings.get("send_results_to_llm", True)
                    if send_to_llm:
                        logger.info("🎯 传递MCP结果给AI，避免重复处理")
                        await self._trigger_ai_with_mcp_result_once(
                            websocket, client_uid, requirement, result
                        )
                    else:
                        logger.info("⚠️ 根据配置，MCP结果不发送给大模型")
                    
            else:
                # 处理失败的情况
                error_msg = result.get("error", "AI工具调用失败") if result else "未知错误"
                logger.warning(f"❌ AI工具调用失败: {error_msg}")
                
                await websocket.send_text(json.dumps({
                    "type": "mcp-response",
                    "source": "ai_auto_select",
                    "success": False,
                    "error": error_msg,
                    "message": f"AI工具调用失败: {error_msg}"
                }))
                
        except Exception as e:
            logger.error(f"AI自动选择工具请求处理失败: {e}")
            logger.exception("详细错误信息:")
            
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"AI工具处理失败: {str(e)}"
            }))

    async def _stream_matching_tool_and_call(
        self, websocket: WebSocket, client_uid: str, requirement: str, user_id: str = "default_user"
    ) -> None:
        """流式调用MCP工具并实时发送结果（支持设备级session）

        Args:
            websocket: WebSocket连接
            client_uid: 客户端ID
            requirement: 用户需求
            user_id: 用户ID
        """
        try:
            # 发送工作区初始化消息
            await websocket.send_text(json.dumps({
                "type": "mcp-workspace-update",
                "status": "in_progress",
                "timestamp": datetime.now().isoformat(),
                "user_query": requirement,
                "tool_calls": [],
                "tool_results": [],
                "partial_answer": "正在处理您的请求..."
            }))
            
            # 步骤1：查找匹配的工具
            logger.info("🔍 流式处理：开始查找匹配的工具")
            print(f"🔍 流式处理：开始查找匹配的工具")
            tool_match = await self.mcp_manager.find_matching_tool_async(requirement)
            
            if tool_match:
                tool_name = tool_match.get("tool_name", "Unknown")
                print(f"✅ 找到匹配的工具: {tool_name}")
                print(f"🔍 工具配置: {tool_match.get('config', {})}")
            else:
                print(f"❌ 未找到匹配的工具")
            
            if not tool_match:
                logger.warning(f"❌ 流式处理：未找到匹配的工具: {requirement}")
                await websocket.send_text(json.dumps({
                    "type": "mcp-workspace-update",
                    "status": "completed",
                    "timestamp": datetime.now().isoformat(),
                    "user_query": requirement,
                    "tool_calls": [],
                    "tool_results": [],
                    "final_answer": "抱歉，未找到匹配的工具来处理您的请求。"
                }))
                return
            
            # 获取工具名称
            tool_name = tool_match.get("tool_name", "Unknown")
            
            # 发送工具调用开始消息
            logger.info(f"✅ 流式处理：找到匹配的工具: {tool_name}")
            await websocket.send_text(json.dumps({
                "type": "mcp-workspace-update",
                "status": "in_progress",
                "timestamp": datetime.now().isoformat(),
                "user_query": requirement,
                "tool_calls": [
                    {
                        "name": tool_name,
                        "status": "in_progress",
                        "arguments": requirement
                    }
                ],
                "tool_results": [],
                "partial_answer": f"Using {tool_name} tool to process your request..."
            }))
            
            # 步骤2：调用工具（流式）
            logger.info(f"🚀 流式处理：开始调用工具: {tool_name}")
            logger.info(f"🔍 工具配置: {tool_match.get('config', {})}")
            
            # 使用流式工具调用方法
            result = None
            result_obj = None
            last_result = None
            stream_count = 0
            
            # 调用流式工具方法（使用设备级session）
            logger.info("🌊 开始流式调用工具...")
            print(f"🌊 开始流式调用工具...")
            stream_results_iterator = self.mcp_manager.call_tool_with_stream_for_device(
                tool_match, requirement, user_id, client_uid
            )
            async for stream_result in stream_results_iterator:
                stream_count += 1
                logger.info(f"🌊 收到第 {stream_count} 个流式结果: {stream_result.get('status', 'unknown')}")
                status = stream_result.get("status")
                
                if status == "started":
                    # 工具调用开始
                    logger.info(f"🌊 流式工具调用开始: {tool_name}")
                    continue  # 已经发送了初始消息，不需要重复发送
                    
                elif status == "in_progress":
                    # 处理中，发送部分结果
                    partial_result = stream_result.get("partial_result", {})
                    last_result = partial_result  # 保存最后一个部分结果
                    
                    logger.info(f"🌊 收到部分结果: {partial_result}")
                    print(f"🌊 收到部分结果: {partial_result}")
                    
                    # 发送部分结果
                    await websocket.send_text(json.dumps({
                        "type": "mcp-workspace-update",
                        "status": "in_progress",
                        "timestamp": datetime.now().isoformat(),
                        "user_query": requirement,
                        "tool_calls": [
                            {
                                "name": tool_name,
                                "status": "in_progress",
                                "arguments": requirement
                            }
                        ],
                        "tool_results": [
                            {
                                "name": tool_name,
                                "status": "in_progress",
                                "partial_result": partial_result
                            }
                        ],
                        "partial_answer": stream_result.get("message", "正在处理中，已获取部分结果...")
                    }))
                    
                elif status == "completed":
                    # 工具调用完成，获取最终结果
                    result = stream_result.get("result")
                    logger.info(f"✅ 工具调用完成，最终结果: {result}")
                    
                    if isinstance(result, str):
                        try:
                            result_obj = json.loads(result)
                            logger.info("✅ 成功将结果解析为JSON对象")
                        except json.JSONDecodeError:
                            result_obj = {"text": result}
                            logger.info("⚠️ 结果不是有效的JSON，使用文本包装")
                    else:
                        result_obj = result or {}
                        logger.info(f"✅ 使用非字符串结果: {type(result)}")
                        
                    # 保存最终结果
                    last_result = result
                    
                elif status == "error":
                    # 工具调用出错
                    error_msg = stream_result.get("error", "未知错误")
                    logger.error(f"❌ 流式工具调用失败: {error_msg}")
                    
                    # 发送错误消息
                    await websocket.send_text(json.dumps({
                        "type": "mcp-workspace-update",
                        "status": "completed",
                        "timestamp": datetime.now().isoformat(),
                        "user_query": requirement,
                        "tool_calls": [
                            {
                                "name": tool_name,
                                "status": "completed",
                                "arguments": requirement
                            }
                        ],
                        "tool_results": [],
                        "final_answer": f"抱歉，工具调用失败: {error_msg}"
                    }))
                    return
            
            # 如果没有获取到任何结果
            if last_result is None:
                result = "未获取到结果"
                result_obj = {"text": result}
                print(f"❌ 未获取到任何流式结果")
            else:
                print(f"✅ 流式调用完成，共收到 {stream_count} 个结果")
                try:
                    # 发送处理中消息
                    await websocket.send_text(json.dumps({
                        "type": "mcp-workspace-update",
                        "status": "in_progress",
                        "timestamp": datetime.now().isoformat(),
                        "user_query": requirement,
                        "tool_calls": [
                            {
                                "name": tool_name,
                                "status": "in_progress",
                                "arguments": requirement
                            }
                        ],
                        "tool_results": [
                            {
                                "name": tool_name,
                                "status": "in_progress",
                                "partial_result": "处理中..."
                            }
                        ],
                        "partial_answer": "工具正在处理您的请求..."
                    }))
                    
                    # 调用工具（非流式）
                    result = await self.mcp_manager.call_tool_with_cache(tool, requirement)
                    
                    # 处理结果
                    if isinstance(result, str):
                        try:
                            result_obj = json.loads(result)
                        except json.JSONDecodeError:
                            result_obj = {"text": result}
                    else:
                        result_obj = result
                        
                except Exception as e:
                    logger.error(f"❌ 流式处理：工具调用失败: {e}")
                    await websocket.send_text(json.dumps({
                        "type": "mcp-workspace-update",
                        "status": "completed",
                        "timestamp": datetime.now().isoformat(),
                        "user_query": requirement,
                        "tool_calls": [
                            {
                                "name": tool_name,
                                "status": "completed",
                                "arguments": requirement
                            }
                        ],
                        "tool_results": [],
                        "final_answer": f"抱歉，工具调用失败: {str(e)}"
                    }))
                    return
            
            # 步骤3：发送最终结果
            logger.info("✅ 流式处理：工具调用完成，发送最终结果")
            
            # 格式化结果
            formatted_result = self._format_mcp_result_for_ai(result_obj)
            
            # 发送完成消息
            await websocket.send_text(json.dumps({
                "type": "mcp-workspace-update",
                "status": "completed",
                "timestamp": datetime.now().isoformat(),
                "user_query": requirement,
                "tool_calls": [
                    {
                        "name": tool.name,
                        "status": "completed",
                        "arguments": requirement
                    }
                ],
                "tool_results": [
                    {
                        "name": tool.name,
                        "status": "completed",
                        "result": result
                    }
                ],
                "final_answer": f"已使用 {tool.name} 工具处理完您的请求。"
            }))
            
            # 步骤4：触发AI使用结果生成回答（如果配置允许）
            send_to_llm = self.mcp_settings.get("send_results_to_llm", True)
            if send_to_llm:
                logger.info("🎯 流式处理：触发AI使用结果生成回答")
                await self._trigger_ai_with_mcp_result_once(
                    websocket, client_uid, requirement, {"formatted_result": formatted_result}
                )
            
        except Exception as e:
            logger.error(f"❌ 流式处理MCP工具调用失败: {e}")
            logger.exception("详细错误信息:")
            
            # 发送错误消息
            await websocket.send_text(json.dumps({
                "type": "mcp-workspace-update",
                "status": "completed",
                "timestamp": datetime.now().isoformat(),
                "user_query": requirement,
                "tool_calls": [],
                "tool_results": [],
                "final_answer": f"抱歉，处理您的请求时出错: {str(e)}"
            }))

