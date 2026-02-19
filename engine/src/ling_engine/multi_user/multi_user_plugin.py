"""
多用户会话插件 - 支持用户ID + 会话ID双重隔离的即插即用组件
使用方法：在现有代码中只需几行代码即可启用多用户多会话支持
"""

import hashlib
import time
import uuid
from typing import Dict, Optional, Any, List
from fastapi import WebSocket
from loguru import logger

from .user_state import ConversationSession, SessionManager


class MultiUserSessionPlugin:
    """
    多用户会话插件 - 支持用户ID + 会话ID双重隔离的解决方案

    使用示例:
    ```python
    # 1. 创建插件实例
    multi_session = MultiUserSessionPlugin()

    # 2. WebSocket连接时注册用户会话
    session_info = multi_session.register_websocket(websocket, client_uid, user_id, session_id)

    # 3. 处理消息时获取会话上下文
    session_context = multi_session.get_session_context(client_uid)

    # 4. 断开连接时清理
    multi_session.unregister_client(client_uid)
    ```
    """

    def __init__(self):
        self._session_manager = SessionManager()
        self._websocket_map: Dict[str, WebSocket] = {}  # client_uid -> websocket
        self._initialized = True
        logger.info("🚀 多用户会话插件已初始化")

    def register_websocket(self, websocket: WebSocket, client_uid: str, user_id: str = None, session_id: str = None) -> Dict[str, str]:
        """
        注册WebSocket连接，返回会话信息

        Args:
            websocket: WebSocket连接对象
            client_uid: 客户端唯一标识
            user_id: 用户ID（可选，如果不提供则自动提取）
            session_id: 会话ID（可选，如果不提供则自动生成）

        Returns:
            Dict[str, str]: 包含user_id, session_id和session_key的字典
        """
        try:
            # 提取用户ID
            if not user_id:
                user_id = self._extract_user_id(websocket)

            # 提取或生成会话ID
            if not session_id:
                session_id = self._extract_session_id(websocket)

            # 创建会话
            session = self._session_manager.create_session(user_id, session_id, client_uid)

            # 存储WebSocket映射
            self._websocket_map[client_uid] = websocket

            session_info = {
                "user_id": user_id,
                "session_id": session_id,
                "session_key": session.session_key
            }

            logger.info(f"✅ 注册用户会话: {user_id}:{session_id} -> {client_uid}")
            return session_info

        except Exception as e:
            logger.error(f"❌ 注册用户会话失败: {e}")
            raise

    def get_session_context(self, client_uid: str) -> Optional[Dict[str, Any]]:
        """
        获取会话上下文信息

        Args:
            client_uid: 客户端标识

        Returns:
            包含会话信息的字典，如果会话不存在则返回None
        """
        session = self._session_manager.get_session(client_uid=client_uid)
        if not session:
            return None

        return {
            "user_id": session.user_id,
            "session_id": session.session_id,
            "session_key": session.session_key,
            "client_uid": session.client_uid,
            "history_uid": session.history_uid,
            "session": session,
            "websocket": self._websocket_map.get(client_uid)
        }

    def get_session_info(self, client_uid: str) -> Optional[Dict[str, str]]:
        """
        通过客户端ID获取会话信息

        Args:
            client_uid: 客户端标识

        Returns:
            包含user_id, session_id等信息的字典，如果不存在则返回None
        """
        return self._session_manager.get_session_info_by_client(client_uid)

    def get_user_sessions(self, user_id: str) -> List[ConversationSession]:
        """
        获取用户的所有会话

        Args:
            user_id: 用户ID

        Returns:
            用户的所有会话列表
        """
        return self._session_manager.get_user_sessions(user_id)

    def update_session_interaction(self, client_uid: str, user_input: str = None, ai_response: str = None):
        """
        更新会话交互记录

        Args:
            client_uid: 客户端标识
            user_input: 用户输入（可选）
            ai_response: AI响应（可选）
        """
        session = self._session_manager.get_session(client_uid=client_uid)
        if session:
            if user_input:
                session.add_conversation("user", user_input)
            if ai_response:
                session.add_conversation("assistant", ai_response)

    def unregister_client(self, client_uid: str):
        """
        注销客户端连接

        Args:
            client_uid: 客户端标识
        """
        try:
            # 清理WebSocket映射
            self._websocket_map.pop(client_uid, None)

            # 清理会话状态
            self._session_manager.remove_client_from_session(client_uid)

            logger.info(f"🔌 注销客户端: {client_uid}")

        except Exception as e:
            logger.error(f"❌ 注销客户端失败: {e}")

    def is_session_message_valid(self, client_uid: str, websocket: WebSocket) -> bool:
        """
        验证消息来源是否合法

        Args:
            client_uid: 客户端标识
            websocket: WebSocket连接

        Returns:
            True如果消息合法，False否则
        """
        stored_websocket = self._websocket_map.get(client_uid)
        return stored_websocket is websocket

    def get_stats(self) -> Dict[str, Any]:
        """
        获取多用户统计信息

        Returns:
            统计信息字典
        """
        return {
            "total_users": len(self._state_manager.user_states),
            "total_connections": len(self._websocket_map),
            "active_users": list(self._state_manager.user_states.keys()),
            "users_detail": [
                {
                    "user_id": user_id,
                    "client_count": self._state_manager.get_user_client_count(user_id),
                    "last_interaction": user_state.last_interaction.isoformat()
                }
                for user_id, user_state in self._state_manager.user_states.items()
            ]
        }

    def cleanup_inactive_users(self, inactive_minutes: int = 30) -> int:
        """
        清理不活跃用户

        Args:
            inactive_minutes: 不活跃时间阈值（分钟）

        Returns:
            清理的用户数量
        """
        return self._state_manager.cleanup_inactive_users(inactive_minutes)

    def _extract_user_id(self, websocket: WebSocket) -> str:
        """从WebSocket中提取用户ID"""
        try:
            # 查询参数
            query_params = dict(websocket.query_params)
            if "user_id" in query_params:
                return query_params["user_id"]

            # Cookie
            cookies = websocket.cookies
            if "user_id" in cookies:
                return cookies["user_id"]

            # Header
            headers = dict(websocket.headers)
            if "x-user-id" in headers:
                return headers["x-user-id"]

            # 生成临时ID
            client_ip = websocket.client.host if websocket.client else "unknown"
            user_hash = hashlib.md5(f"{client_ip}_{time.time()}".encode()).hexdigest()[:8]
            return f"temp_{user_hash}"

        except Exception as e:
            logger.error(f"提取用户ID失败: {e}")
            return f"anonymous_{int(time.time())}"

    def _extract_session_id(self, websocket: WebSocket) -> str:
        """从WebSocket中提取会话ID"""
        try:
            # 查询参数
            query_params = dict(websocket.query_params)
            if "session_id" in query_params:
                return query_params["session_id"]

            # Cookie
            cookies = websocket.cookies
            if "session_id" in cookies:
                return cookies["session_id"]

            # Header
            headers = dict(websocket.headers)
            if "x-session-id" in headers:
                return headers["x-session-id"]

            # 生成新的会话ID
            session_id = str(uuid.uuid4())[:8]
            logger.info(f"生成新的会话ID: {session_id}")
            return session_id

        except Exception as e:
            logger.error(f"提取会话ID失败: {e}")
            return str(uuid.uuid4())[:8]


# 全局插件实例（单例模式）
_plugin_instance = None

def get_multi_user_session_plugin() -> MultiUserSessionPlugin:
    """获取多用户会话插件实例（单例）"""
    global _plugin_instance
    if _plugin_instance is None:
        _plugin_instance = MultiUserSessionPlugin()
    return _plugin_instance


# 便捷函数
def register_session_websocket(websocket: WebSocket, client_uid: str, user_id: str = None, session_id: str = None) -> Dict[str, str]:
    """便捷函数：注册用户会话WebSocket"""
    return get_multi_user_session_plugin().register_websocket(websocket, client_uid, user_id, session_id)

def get_session_context(client_uid: str) -> Optional[Dict[str, Any]]:
    """便捷函数：获取会话上下文"""
    return get_multi_user_session_plugin().get_session_context(client_uid)

def get_session_info(client_uid: str) -> Optional[Dict[str, str]]:
    """便捷函数：获取会话信息"""
    return get_multi_user_session_plugin().get_session_info(client_uid)

def cleanup_session(client_uid: str):
    """便捷函数：清理会话"""
    get_multi_user_session_plugin().unregister_client(client_uid)

def update_session_interaction(client_uid: str, user_input: str = None, ai_response: str = None):
    """便捷函数：更新会话交互"""
    get_multi_user_session_plugin().update_session_interaction(client_uid, user_input, ai_response)


# 向后兼容的别名
MultiUserPlugin = MultiUserSessionPlugin
get_multi_user_plugin = get_multi_user_session_plugin
register_user_websocket = register_session_websocket
get_user_context = get_session_context
cleanup_user_session = cleanup_session