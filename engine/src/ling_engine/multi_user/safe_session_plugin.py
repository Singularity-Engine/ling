"""
安全的多用户会话插件 - 使用三重标识符避免用户混乱
user_id + client_uid + session_id 复合键方案
"""

import hashlib
import time
import uuid
from typing import Dict, Optional, Any, List, Tuple
from fastapi import WebSocket
from loguru import logger

# 导入现有的历史记录管理功能
from ..chat_history_manager import (
    create_new_history,
    store_message,
    get_history,
    get_history_list,
    delete_history
)


class SafeUserSessionPlugin:
    """
    安全的多用户会话插件 - 使用三重标识符确保零混乱

    标识符体系：
    - user_id: 用户身份标识
    - client_uid: 客户端连接标识
    - session_id: 对话会话标识
    - composite_key: user_id:client_uid:session_id 复合键

    这种设计确保：
    1. 同一用户的不同连接完全隔离
    2. 同一连接的不同会话完全隔离
    3. 任何情况下都不会消息混乱
    """

    def __init__(self):
        # 核心存储：使用复合键确保唯一性
        self._sessions: Dict[str, Dict[str, Any]] = {}  # composite_key -> session_data

        # WebSocket映射
        self._websockets: Dict[str, WebSocket] = {}  # client_uid -> websocket

        # 反向查找索引
        self._client_to_composite: Dict[str, str] = {}  # client_uid -> composite_key
        self._user_sessions: Dict[str, List[str]] = {}  # user_id -> [composite_keys]
        self._user_clients: Dict[str, List[str]] = {}   # user_id -> [client_uids]

        logger.info("🔒 安全用户会话插件已初始化（三重标识符方案）")

    def _make_composite_key(self, user_id: str, client_uid: str, session_id: str) -> str:
        """生成复合键：user_id:client_uid:session_id"""
        return f"{user_id}:{client_uid}:{session_id}"

    def _parse_composite_key(self, composite_key: str) -> Tuple[str, str, str]:
        """解析复合键"""
        parts = composite_key.split(":", 2)
        if len(parts) != 3:
            raise ValueError(f"Invalid composite key: {composite_key}")
        return parts[0], parts[1], parts[2]

    def register_connection(
        self,
        websocket: WebSocket,
        client_uid: str,
        conf_uid: str,
        user_id: str = None,
        session_id: str = None
    ) -> Dict[str, str]:
        """
        注册WebSocket连接

        Args:
            websocket: WebSocket连接
            client_uid: 客户端唯一标识
            conf_uid: 角色配置ID
            user_id: 用户ID（可选，自动提取）
            session_id: 会话ID（可选，自动创建）

        Returns:
            Dict包含: user_id, client_uid, session_id, composite_key
        """
        try:
            # 1. 提取或生成用户ID
            if not user_id:
                user_id = self._extract_user_id(websocket)

            # 2. 生成或获取会话ID
            if not session_id:
                # 检查是否要继续现有会话
                existing_session_id = self._extract_session_id(websocket)
                if existing_session_id:
                    session_id = existing_session_id
                    logger.info(f"继续现有会话: {session_id}")
                else:
                    # 创建新的会话
                    session_id = create_new_history(conf_uid, user_id)
                    logger.info(f"创建新会话: {session_id}")

            # 3. 生成复合键
            composite_key = self._make_composite_key(user_id, client_uid, session_id)

            # 4. 检查复合键唯一性
            if composite_key in self._sessions:
                logger.warning(f"复合键已存在，覆盖旧会话: {composite_key}")

            # 5. 存储会话数据
            session_data = {
                "user_id": user_id,
                "client_uid": client_uid,
                "session_id": session_id,
                "conf_uid": conf_uid,
                "composite_key": composite_key,
                "created_at": time.time(),
                "last_activity": time.time()
            }

            self._sessions[composite_key] = session_data
            self._websockets[client_uid] = websocket
            self._client_to_composite[client_uid] = composite_key

            # 6. 更新索引
            if user_id not in self._user_sessions:
                self._user_sessions[user_id] = []
            if composite_key not in self._user_sessions[user_id]:
                self._user_sessions[user_id].append(composite_key)

            if user_id not in self._user_clients:
                self._user_clients[user_id] = []
            if client_uid not in self._user_clients[user_id]:
                self._user_clients[user_id].append(client_uid)

            logger.info(f"✅ 注册安全会话: {composite_key}")

            return {
                "user_id": user_id,
                "client_uid": client_uid,
                "session_id": session_id,
                "composite_key": composite_key,
                "conf_uid": conf_uid
            }

        except Exception as e:
            logger.error(f"❌ 注册连接失败: {e}")
            raise

    def get_session_by_client(self, client_uid: str) -> Optional[Dict[str, Any]]:
        """
        通过client_uid获取会话信息

        Args:
            client_uid: 客户端ID

        Returns:
            会话信息字典
        """
        composite_key = self._client_to_composite.get(client_uid)
        if not composite_key:
            logger.warning(f"找不到客户端 {client_uid} 的会话映射")
            return None

        session_data = self._sessions.get(composite_key)
        if not session_data:
            logger.warning(f"找不到复合键 {composite_key} 的会话数据")
            return None

        # 更新活动时间
        session_data["last_activity"] = time.time()

        try:
            # 获取历史记录
            # 获取用户ID用于历史查询
            user_id = session_data.get("user_id", "default_user")
            history = get_history(session_data["conf_uid"], session_data["session_id"], user_id)

            return {
                **session_data,
                "websocket": self._websockets.get(client_uid),
                "history": history,
                "message_count": len(history)
            }

        except Exception as e:
            logger.error(f"获取会话详情失败: {e}")
            return session_data

    def get_session_by_composite(self, user_id: str, client_uid: str, session_id: str) -> Optional[Dict[str, Any]]:
        """
        通过完整的三重标识符获取会话

        Args:
            user_id: 用户ID
            client_uid: 客户端ID
            session_id: 会话ID

        Returns:
            会话信息字典
        """
        composite_key = self._make_composite_key(user_id, client_uid, session_id)
        session_data = self._sessions.get(composite_key)

        if session_data:
            session_data["last_activity"] = time.time()

        return session_data

    def save_message(
        self,
        client_uid: str,
        role: str,
        content: str,
        name: str = None,
        avatar: str = None
    ) -> bool:
        """
        保存消息到数据库（通过复合键确保正确性）

        Args:
            client_uid: 客户端ID
            role: 消息角色 ("human" 或 "ai")
            content: 消息内容
            name: 发送者名称（可选）
            avatar: 头像URL（可选）

        Returns:
            是否保存成功
        """
        session_data = self.get_session_by_client(client_uid)
        if not session_data:
            logger.error(f"找不到客户端 {client_uid} 的会话数据")
            return False

        try:
            store_message(
                conf_uid=session_data["conf_uid"],
                history_uid=session_data["session_id"],
                role=role,
                content=content,
                name=name,
                avatar=avatar,
                user_id=session_data["user_id"]
            )

            # 记录保存详情以便调试
            logger.debug(f"保存消息成功: {session_data['composite_key']} | {role} | {content[:50]}...")
            return True

        except Exception as e:
            logger.error(f"保存消息失败: {e}")
            return False

    def switch_session(self, client_uid: str, new_session_id: str) -> bool:
        """
        切换到不同的会话

        Args:
            client_uid: 客户端ID
            new_session_id: 新的会话ID

        Returns:
            是否切换成功
        """
        # 获取当前会话信息
        current_composite = self._client_to_composite.get(client_uid)
        if not current_composite:
            logger.error(f"找不到客户端 {client_uid} 的当前会话")
            return False

        current_session = self._sessions.get(current_composite)
        if not current_session:
            logger.error(f"找不到复合键 {current_composite} 的会话数据")
            return False

        try:
            # 生成新的复合键
            user_id = current_session["user_id"]
            new_composite_key = self._make_composite_key(user_id, client_uid, new_session_id)

            # 创建新的会话数据
            new_session_data = {
                **current_session,
                "session_id": new_session_id,
                "composite_key": new_composite_key,
                "last_activity": time.time()
            }

            # 移除旧会话
            del self._sessions[current_composite]
            if user_id in self._user_sessions:
                if current_composite in self._user_sessions[user_id]:
                    self._user_sessions[user_id].remove(current_composite)

            # 添加新会话
            self._sessions[new_composite_key] = new_session_data
            self._client_to_composite[client_uid] = new_composite_key

            if user_id not in self._user_sessions:
                self._user_sessions[user_id] = []
            if new_composite_key not in self._user_sessions[user_id]:
                self._user_sessions[user_id].append(new_composite_key)

            logger.info(f"会话切换成功: {current_composite} -> {new_composite_key}")
            return True

        except Exception as e:
            logger.error(f"会话切换失败: {e}")
            return False

    def cleanup_connection(self, client_uid: str):
        """
        清理客户端连接（彻底清理所有相关数据）

        Args:
            client_uid: 客户端ID
        """
        try:
            # 获取复合键
            composite_key = self._client_to_composite.get(client_uid)

            if composite_key:
                # 解析用户ID
                user_id, _, _ = self._parse_composite_key(composite_key)

                # 清理会话数据
                self._sessions.pop(composite_key, None)

                # 清理用户会话索引
                if user_id in self._user_sessions:
                    if composite_key in self._user_sessions[user_id]:
                        self._user_sessions[user_id].remove(composite_key)
                    if not self._user_sessions[user_id]:
                        del self._user_sessions[user_id]

                # 清理用户客户端索引
                if user_id in self._user_clients:
                    if client_uid in self._user_clients[user_id]:
                        self._user_clients[user_id].remove(client_uid)
                    if not self._user_clients[user_id]:
                        del self._user_clients[user_id]

            # 清理连接映射
            self._websockets.pop(client_uid, None)
            self._client_to_composite.pop(client_uid, None)

            logger.info(f"🧹 清理连接成功: {client_uid} ({composite_key})")

        except Exception as e:
            logger.error(f"清理连接失败: {e}")

    def validate_message_source(self, client_uid: str, websocket: WebSocket) -> bool:
        """
        验证消息来源（多重验证）

        Args:
            client_uid: 客户端ID
            websocket: WebSocket连接

        Returns:
            是否为合法来源
        """
        # 验证1：WebSocket映射
        stored_websocket = self._websockets.get(client_uid)
        if stored_websocket != websocket:
            logger.warning(f"WebSocket验证失败: {client_uid}")
            return False

        # 验证2：会话存在性
        composite_key = self._client_to_composite.get(client_uid)
        if not composite_key or composite_key not in self._sessions:
            logger.warning(f"会话验证失败: {client_uid}")
            return False

        return True

    def get_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        """
        获取用户的所有会话（按复合键分组）

        Args:
            user_id: 用户ID

        Returns:
            会话列表
        """
        composite_keys = self._user_sessions.get(user_id, [])
        sessions = []

        for composite_key in composite_keys:
            session_data = self._sessions.get(composite_key)
            if session_data:
                sessions.append(session_data)

        return sessions

    def get_plugin_stats(self) -> Dict[str, Any]:
        """
        获取插件统计信息

        Returns:
            详细统计信息
        """
        active_sessions = len(self._sessions)
        active_users = len(self._user_sessions)
        active_connections = len(self._websockets)

        user_details = []
        for user_id, composite_keys in self._user_sessions.items():
            user_details.append({
                "user_id": user_id,
                "session_count": len(composite_keys),
                "client_count": len(self._user_clients.get(user_id, [])),
                "sessions": [
                    {
                        "composite_key": key,
                        "session_id": self._parse_composite_key(key)[2],
                        "client_uid": self._parse_composite_key(key)[1]
                    }
                    for key in composite_keys
                ]
            })

        return {
            "active_sessions": active_sessions,
            "active_users": active_users,
            "active_connections": active_connections,
            "user_details": user_details,
            "session_keys": list(self._sessions.keys())
        }

    def _extract_user_id(self, websocket: WebSocket) -> str:
        """从WebSocket提取用户ID"""
        try:
            query_params = dict(websocket.query_params)
            if "user_id" in query_params:
                return query_params["user_id"]

            cookies = websocket.cookies
            if "user_id" in cookies:
                return cookies["user_id"]

            headers = dict(websocket.headers)
            if "x-user-id" in headers:
                return headers["x-user-id"]

            # 生成基于IP的临时用户ID
            client_ip = websocket.client.host if websocket.client else "unknown"
            user_hash = hashlib.md5(f"{client_ip}_{time.time()}".encode()).hexdigest()[:8]
            return f"temp_{user_hash}"

        except Exception as e:
            logger.error(f"提取用户ID失败: {e}")
            return f"anonymous_{int(time.time())}"

    def _extract_session_id(self, websocket: WebSocket) -> Optional[str]:
        """从WebSocket提取会话ID（用于继续现有会话）"""
        try:
            query_params = dict(websocket.query_params)
            if "session_id" in query_params:
                return query_params["session_id"]

            cookies = websocket.cookies
            if "session_id" in cookies:
                return cookies["session_id"]

            headers = dict(websocket.headers)
            if "x-session-id" in headers:
                return headers["x-session-id"]

            return None

        except Exception as e:
            logger.error(f"提取会话ID失败: {e}")
            return None


# 全局单例实例
_safe_plugin_instance = None

def get_safe_session_plugin() -> SafeUserSessionPlugin:
    """获取安全会话插件实例（单例）"""
    global _safe_plugin_instance
    if _safe_plugin_instance is None:
        _safe_plugin_instance = SafeUserSessionPlugin()
    return _safe_plugin_instance


# 便捷函数
def register_safe_session(
    websocket: WebSocket,
    client_uid: str,
    conf_uid: str,
    user_id: str = None,
    session_id: str = None
) -> Dict[str, str]:
    """便捷函数：注册安全用户会话"""
    return get_safe_session_plugin().register_connection(
        websocket, client_uid, conf_uid, user_id, session_id
    )

def get_safe_session_context(client_uid: str) -> Optional[Dict[str, Any]]:
    """便捷函数：获取安全会话上下文"""
    return get_safe_session_plugin().get_session_by_client(client_uid)

def save_safe_message(client_uid: str, role: str, content: str) -> bool:
    """便捷函数：安全保存用户消息"""
    return get_safe_session_plugin().save_message(client_uid, role, content)

def cleanup_safe_connection(client_uid: str):
    """便捷函数：安全清理用户连接"""
    get_safe_session_plugin().cleanup_connection(client_uid)