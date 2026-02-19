"""
多用户会话插件 - 与现有history_uid系统集成
充分利用现有的chat_sessions和chat_messages表结构
"""

import hashlib
import time
import uuid
from typing import Dict, Optional, Any, List
from fastapi import WebSocket
from loguru import logger

# 导入现有的历史记录管理功能
from ..chat_history_manager import (
    create_new_history,
    store_message,
    get_history,
    get_history_list,
    delete_history,
    get_metadata,
    update_metadate
)


class UserSessionPlugin:
    """
    多用户会话插件 - 与现有history_uid系统完美集成

    这个插件利用现有的：
    - user_id: 用户身份标识
    - history_uid: 对话会话ID
    - conf_uid: 角色配置ID
    - chat_sessions表: 会话管理
    - chat_messages表: 消息存储

    使用示例:
    ```python
    # 1. 创建插件实例
    plugin = UserSessionPlugin()

    # 2. WebSocket连接时注册
    session_info = plugin.register_connection(websocket, client_uid, conf_uid)

    # 3. 获取会话信息
    session_context = plugin.get_session_context(client_uid)

    # 4. 保存消息
    plugin.save_message(client_uid, "human", "Hello")
    plugin.save_message(client_uid, "ai", "Hi there!")

    # 5. 断开时清理
    plugin.cleanup_connection(client_uid)
    ```
    """

    def __init__(self):
        # WebSocket连接管理
        self._websocket_map: Dict[str, WebSocket] = {}  # client_uid -> websocket

        # 会话信息存储
        self._session_info: Dict[str, Dict[str, str]] = {}  # client_uid -> session_info

        # 用户映射
        self._user_clients: Dict[str, List[str]] = {}  # user_id -> [client_uids]
        self._user_sessions: Dict[str, List[str]] = {}  # user_id -> [history_uids]

        logger.info("🚀 用户会话插件已初始化（集成现有history_uid系统）")

    def register_connection(
        self,
        websocket: WebSocket,
        client_uid: str,
        conf_uid: str,
        user_id: str = None,
        history_uid: str = None
    ) -> Dict[str, str]:
        """
        注册WebSocket连接

        Args:
            websocket: WebSocket连接
            client_uid: 客户端唯一标识
            conf_uid: 角色配置ID
            user_id: 用户ID（可选，自动提取）
            history_uid: 会话ID（可选，自动创建新会话）

        Returns:
            Dict包含: user_id, history_uid, conf_uid
        """
        try:
            # 提取用户ID
            if not user_id:
                user_id = self._extract_user_id(websocket)

            # 获取或创建会话ID
            if not history_uid:
                # 检查是否要继续现有会话
                existing_history_uid = self._extract_history_uid(websocket)
                if existing_history_uid:
                    history_uid = existing_history_uid
                    logger.info(f"继续现有会话: {history_uid}")
                else:
                    # 创建新的会话
                    history_uid = create_new_history(conf_uid, user_id)
                    logger.info(f"创建新会话: {history_uid}")

            # 存储连接信息
            self._websocket_map[client_uid] = websocket

            session_info = {
                "user_id": user_id,
                "history_uid": history_uid,
                "conf_uid": conf_uid,
                "client_uid": client_uid
            }
            self._session_info[client_uid] = session_info

            # 更新用户映射
            if user_id not in self._user_clients:
                self._user_clients[user_id] = []
            if client_uid not in self._user_clients[user_id]:
                self._user_clients[user_id].append(client_uid)

            if user_id not in self._user_sessions:
                self._user_sessions[user_id] = []
            if history_uid not in self._user_sessions[user_id]:
                self._user_sessions[user_id].append(history_uid)

            logger.info(f"✅ 注册会话: 用户{user_id} -> 会话{history_uid} -> 客户端{client_uid}")
            return session_info

        except Exception as e:
            logger.error(f"❌ 注册连接失败: {e}")
            raise

    def get_session_context(self, client_uid: str) -> Optional[Dict[str, Any]]:
        """
        获取会话上下文

        Args:
            client_uid: 客户端ID

        Returns:
            包含会话信息和历史记录的字典
        """
        session_info = self._session_info.get(client_uid)
        if not session_info:
            return None

        try:
            # 获取历史记录
            user_id = session_info.get("user_id", "default_user")
            history = get_history(session_info["conf_uid"], session_info["history_uid"], user_id)

            # 获取元数据
            metadata = get_metadata(
                session_info["conf_uid"],
                session_info["history_uid"],
                session_info["user_id"]
            )

            return {
                "user_id": session_info["user_id"],
                "history_uid": session_info["history_uid"],
                "conf_uid": session_info["conf_uid"],
                "client_uid": session_info["client_uid"],
                "websocket": self._websocket_map.get(client_uid),
                "history": history,
                "metadata": metadata,
                "message_count": len(history)
            }

        except Exception as e:
            logger.error(f"获取会话上下文失败: {e}")
            return None

    def save_message(
        self,
        client_uid: str,
        role: str,
        content: str,
        name: str = None,
        avatar: str = None
    ) -> bool:
        """
        保存消息到数据库

        Args:
            client_uid: 客户端ID
            role: 消息角色 ("human" 或 "ai")
            content: 消息内容
            name: 发送者名称（可选）
            avatar: 头像URL（可选）

        Returns:
            是否保存成功
        """
        session_info = self._session_info.get(client_uid)
        if not session_info:
            logger.error(f"找不到客户端 {client_uid} 的会话信息")
            return False

        try:
            store_message(
                conf_uid=session_info["conf_uid"],
                history_uid=session_info["history_uid"],
                role=role,
                content=content,
                name=name,
                avatar=avatar,
                user_id=session_info["user_id"]
            )
            logger.debug(f"保存消息: {role} -> {content[:50]}...")
            return True

        except Exception as e:
            logger.error(f"保存消息失败: {e}")
            return False

    def get_user_sessions(self, user_id: str, conf_uid: str) -> List[Dict]:
        """
        获取用户的所有会话列表

        Args:
            user_id: 用户ID
            conf_uid: 角色配置ID

        Returns:
            会话列表
        """
        try:
            return get_history_list(conf_uid, user_id)
        except Exception as e:
            logger.error(f"获取用户会话列表失败: {e}")
            return []

    def delete_session(self, client_uid: str) -> bool:
        """
        删除当前会话

        Args:
            client_uid: 客户端ID

        Returns:
            是否删除成功
        """
        session_info = self._session_info.get(client_uid)
        if not session_info:
            return False

        try:
            return delete_history(
                session_info["conf_uid"],
                session_info["history_uid"],
                session_info["user_id"]
            )
        except Exception as e:
            logger.error(f"删除会话失败: {e}")
            return False

    def switch_session(self, client_uid: str, history_uid: str) -> bool:
        """
        切换到指定会话

        Args:
            client_uid: 客户端ID
            history_uid: 目标会话ID

        Returns:
            是否切换成功
        """
        session_info = self._session_info.get(client_uid)
        if not session_info:
            return False

        # 更新会话ID
        session_info["history_uid"] = history_uid
        self._session_info[client_uid] = session_info

        logger.info(f"切换会话: 客户端{client_uid} -> 会话{history_uid}")
        return True

    def create_new_session(self, client_uid: str) -> Optional[str]:
        """
        为当前用户创建新会话

        Args:
            client_uid: 客户端ID

        Returns:
            新会话ID，失败返回None
        """
        session_info = self._session_info.get(client_uid)
        if not session_info:
            return None

        try:
            new_history_uid = create_new_history(
                session_info["conf_uid"],
                session_info["user_id"]
            )

            if new_history_uid:
                # 自动切换到新会话
                self.switch_session(client_uid, new_history_uid)

                # 更新用户会话映射
                user_id = session_info["user_id"]
                if user_id not in self._user_sessions:
                    self._user_sessions[user_id] = []
                self._user_sessions[user_id].append(new_history_uid)

                logger.info(f"创建新会话: {new_history_uid}")

            return new_history_uid

        except Exception as e:
            logger.error(f"创建新会话失败: {e}")
            return None

    def update_session_metadata(self, client_uid: str, metadata: Dict) -> bool:
        """
        更新会话元数据

        Args:
            client_uid: 客户端ID
            metadata: 元数据字典

        Returns:
            是否更新成功
        """
        session_info = self._session_info.get(client_uid)
        if not session_info:
            return False

        try:
            return update_metadate(
                session_info["conf_uid"],
                session_info["history_uid"],
                metadata,
                session_info["user_id"]
            )
        except Exception as e:
            logger.error(f"更新会话元数据失败: {e}")
            return False

    def cleanup_connection(self, client_uid: str):
        """
        清理客户端连接

        Args:
            client_uid: 客户端ID
        """
        try:
            # 获取会话信息
            session_info = self._session_info.get(client_uid)

            # 清理映射
            self._websocket_map.pop(client_uid, None)
            self._session_info.pop(client_uid, None)

            # 清理用户映射
            if session_info:
                user_id = session_info["user_id"]
                if user_id in self._user_clients:
                    if client_uid in self._user_clients[user_id]:
                        self._user_clients[user_id].remove(client_uid)
                    if not self._user_clients[user_id]:
                        del self._user_clients[user_id]

            logger.info(f"🔌 清理连接: {client_uid}")

        except Exception as e:
            logger.error(f"清理连接失败: {e}")

    def validate_message_source(self, client_uid: str, websocket: WebSocket) -> bool:
        """
        验证消息来源

        Args:
            client_uid: 客户端ID
            websocket: WebSocket连接

        Returns:
            是否为合法来源
        """
        stored_websocket = self._websocket_map.get(client_uid)
        return stored_websocket is websocket

    def get_plugin_stats(self) -> Dict[str, Any]:
        """
        获取插件统计信息

        Returns:
            统计信息字典
        """
        return {
            "active_connections": len(self._websocket_map),
            "active_sessions": len(self._session_info),
            "active_users": len(self._user_clients),
            "user_details": [
                {
                    "user_id": user_id,
                    "client_count": len(clients),
                    "session_count": len(self._user_sessions.get(user_id, []))
                }
                for user_id, clients in self._user_clients.items()
            ]
        }

    def _extract_user_id(self, websocket: WebSocket) -> str:
        """从WebSocket提取用户ID"""
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

    def _extract_history_uid(self, websocket: WebSocket) -> Optional[str]:
        """从WebSocket提取会话ID（用于继续现有会话）"""
        try:
            # 查询参数
            query_params = dict(websocket.query_params)
            if "history_uid" in query_params:
                return query_params["history_uid"]

            # Cookie
            cookies = websocket.cookies
            if "history_uid" in cookies:
                return cookies["history_uid"]

            # Header
            headers = dict(websocket.headers)
            if "x-history-uid" in headers:
                return headers["x-history-uid"]

            return None

        except Exception as e:
            logger.error(f"提取会话ID失败: {e}")
            return None


# 全局单例实例
_plugin_instance = None

def get_user_session_plugin() -> UserSessionPlugin:
    """获取用户会话插件实例（单例）"""
    global _plugin_instance
    if _plugin_instance is None:
        _plugin_instance = UserSessionPlugin()
    return _plugin_instance


# 便捷函数
def register_user_session(
    websocket: WebSocket,
    client_uid: str,
    conf_uid: str,
    user_id: str = None,
    history_uid: str = None
) -> Dict[str, str]:
    """便捷函数：注册用户会话"""
    return get_user_session_plugin().register_connection(
        websocket, client_uid, conf_uid, user_id, history_uid
    )

def get_session_context(client_uid: str) -> Optional[Dict[str, Any]]:
    """便捷函数：获取会话上下文"""
    return get_user_session_plugin().get_session_context(client_uid)

def save_user_message(client_uid: str, role: str, content: str) -> bool:
    """便捷函数：保存用户消息"""
    return get_user_session_plugin().save_message(client_uid, role, content)

def cleanup_user_connection(client_uid: str):
    """便捷函数：清理用户连接"""
    get_user_session_plugin().cleanup_connection(client_uid)