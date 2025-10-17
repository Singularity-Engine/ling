"""
用户会话管理器
处理WebSocket连接和用户状态的映射管理
"""

import asyncio
import hashlib
import time
from typing import Dict, List, Optional
from fastapi import WebSocket
from loguru import logger

from .user_state import UserState, UserStateManager


class UserSessionManager:
    """管理用户WebSocket会话和状态映射"""

    def __init__(self):
        self.user_state_manager = UserStateManager()
        self.websocket_to_client: Dict[WebSocket, str] = {}  # websocket -> client_uid
        self.client_to_websocket: Dict[str, WebSocket] = {}  # client_uid -> websocket

    async def extract_user_identity(self, websocket: WebSocket) -> str:
        """从WebSocket连接中提取用户身份标识"""
        try:
            # 方法1: 查询参数 (推荐方式)
            # 前端连接: ws://localhost:12393/ws?user_id=alice
            query_params = dict(websocket.query_params)
            if "user_id" in query_params:
                user_id = query_params["user_id"]
                logger.info(f"🔑 从查询参数获取用户ID: {user_id}")
                return user_id

            # 方法2: Cookie
            # 前端设置: document.cookie = "user_id=alice"
            cookies = websocket.cookies
            if "user_id" in cookies:
                user_id = cookies["user_id"]
                logger.info(f"🍪 从Cookie获取用户ID: {user_id}")
                return user_id

            # 方法3: Header
            # 前端设置: headers: {"X-User-ID": "alice"}
            headers = dict(websocket.headers)
            if "x-user-id" in headers:
                user_id = headers["x-user-id"]
                logger.info(f"📋 从Header获取用户ID: {user_id}")
                return user_id

            # 方法4: 基于客户端信息生成临时用户ID
            client_ip = websocket.client.host if websocket.client else "unknown"
            user_hash = hashlib.md5(f"{client_ip}_{time.time()}".encode()).hexdigest()[:8]
            temp_user_id = f"temp_{user_hash}"
            logger.warning(f"⚠️ 未找到用户身份信息，生成临时用户ID: {temp_user_id}")
            return temp_user_id

        except Exception as e:
            logger.error(f"❌ 提取用户身份失败: {e}")
            fallback_user_id = f"anonymous_{int(time.time())}"
            return fallback_user_id

    def register_connection(self, websocket: WebSocket, client_uid: str, user_id: str) -> UserState:
        """注册WebSocket连接和用户会话"""
        # 建立WebSocket映射
        self.websocket_to_client[websocket] = client_uid
        self.client_to_websocket[client_uid] = websocket

        # 创建用户状态
        user_state = self.user_state_manager.create_user_session(user_id, client_uid)

        logger.info(f"🔗 注册用户连接: {user_id} -> {client_uid}")
        return user_state

    def get_user_state_by_client(self, client_uid: str) -> Optional[UserState]:
        """通过客户端ID获取用户状态"""
        return self.user_state_manager.get_user_state(client_uid=client_uid)

    def get_user_state_by_websocket(self, websocket: WebSocket) -> Optional[UserState]:
        """通过WebSocket获取用户状态"""
        client_uid = self.websocket_to_client.get(websocket)
        if client_uid:
            return self.get_user_state_by_client(client_uid)
        return None

    def get_user_id_by_client(self, client_uid: str) -> Optional[str]:
        """通过客户端ID获取用户ID"""
        return self.user_state_manager.get_user_id_by_client(client_uid)

    def get_websocket_by_client(self, client_uid: str) -> Optional[WebSocket]:
        """通过客户端ID获取WebSocket连接"""
        return self.client_to_websocket.get(client_uid)

    def disconnect_client(self, client_uid: str):
        """断开客户端连接"""
        # 获取WebSocket
        websocket = self.client_to_websocket.get(client_uid)

        # 清理WebSocket映射
        if websocket:
            self.websocket_to_client.pop(websocket, None)
        self.client_to_websocket.pop(client_uid, None)

        # 清理用户状态
        self.user_state_manager.remove_client_session(client_uid)

        logger.info(f"🔌 断开客户端连接: {client_uid}")

    def get_all_online_users(self) -> List[str]:
        """获取所有在线用户ID"""
        return self.user_state_manager.get_all_users()

    def get_user_connection_count(self, user_id: str) -> int:
        """获取用户的连接数"""
        return self.user_state_manager.get_user_client_count(user_id)

    def cleanup_inactive_sessions(self, inactive_minutes: int = 30) -> int:
        """清理不活跃的会话"""
        return self.user_state_manager.cleanup_inactive_users(inactive_minutes)

    def validate_user_message(self, client_uid: str, websocket: WebSocket) -> bool:
        """验证消息来源是否合法"""
        stored_websocket = self.client_to_websocket.get(client_uid)
        return stored_websocket is websocket

    def get_session_stats(self) -> Dict:
        """获取会话统计信息"""
        return {
            "total_users": len(self.user_state_manager.user_states),
            "total_connections": len(self.client_to_websocket),
            "users": [
                {
                    "user_id": user_id,
                    "connection_count": self.get_user_connection_count(user_id),
                    "last_interaction": user_state.last_interaction.isoformat(),
                    "connection_time": user_state.connection_time.isoformat()
                }
                for user_id, user_state in self.user_state_manager.user_states.items()
            ]
        }