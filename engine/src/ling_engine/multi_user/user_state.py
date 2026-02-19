"""
用户状态管理模块
实现多用户独立状态隔离
"""

import json
import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from loguru import logger


@dataclass
class ConversationSession:
    """对话会话状态容器 - 用户ID + 会话ID的双重隔离"""
    user_id: str
    session_id: str
    client_uid: str
    history_uid: str
    conversation_history: List[Dict[str, Any]]
    memory_context: Dict[str, Any]
    emotion_state: Dict[str, Any]
    last_interaction: datetime
    connection_time: datetime
    session_metadata: Dict[str, Any]

    def __init__(self, user_id: str, session_id: str, client_uid: str):
        self.user_id = user_id
        self.session_id = session_id
        self.client_uid = client_uid
        self.history_uid = f"{user_id}_{session_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.conversation_history = []
        self.memory_context = {}
        self.emotion_state = {}
        self.last_interaction = datetime.now()
        self.connection_time = datetime.now()
        self.session_metadata = {}

    @property
    def session_key(self) -> str:
        """获取会话唯一标识：user_id:session_id"""
        return f"{self.user_id}:{self.session_id}"

    def update_interaction_time(self):
        """更新最后交互时间"""
        self.last_interaction = datetime.now()

    def add_conversation(self, role: str, content: str, metadata: Dict = None):
        """添加对话记录"""
        conversation_entry = {
            "timestamp": datetime.now().isoformat(),
            "role": role,  # "user" or "assistant"
            "content": content,
            "metadata": metadata or {}
        }
        self.conversation_history.append(conversation_entry)
        self.update_interaction_time()

    def get_recent_conversations(self, count: int = 10) -> List[Dict]:
        """获取最近的对话记录"""
        return self.conversation_history[-count:] if self.conversation_history else []

    def update_memory(self, key: str, value: Any):
        """更新记忆上下文"""
        self.memory_context[key] = value
        self.update_interaction_time()

    def get_memory(self, key: str, default: Any = None) -> Any:
        """获取记忆上下文"""
        return self.memory_context.get(key, default)

    def update_emotion(self, emotion_key: str, value: Any):
        """更新情感状态"""
        self.emotion_state[emotion_key] = value
        self.update_interaction_time()

    def to_dict(self) -> Dict[str, Any]:
        """序列化会话状态"""
        return {
            "user_id": self.user_id,
            "session_id": self.session_id,
            "client_uid": self.client_uid,
            "history_uid": self.history_uid,
            "conversation_history": self.conversation_history,
            "memory_context": self.memory_context,
            "emotion_state": self.emotion_state,
            "last_interaction": self.last_interaction.isoformat(),
            "connection_time": self.connection_time.isoformat(),
            "session_metadata": self.session_metadata
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ConversationSession":
        """从字典恢复会话状态"""
        state = cls.__new__(cls)
        state.user_id = data["user_id"]
        state.session_id = data["session_id"]
        state.client_uid = data["client_uid"]
        state.history_uid = data["history_uid"]
        state.conversation_history = data.get("conversation_history", [])
        state.memory_context = data.get("memory_context", {})
        state.emotion_state = data.get("emotion_state", {})
        state.last_interaction = datetime.fromisoformat(data["last_interaction"])
        state.connection_time = datetime.fromisoformat(data.get("connection_time", datetime.now().isoformat()))
        state.session_metadata = data.get("session_metadata", {})
        return state


# 为了向后兼容，保留UserState别名
UserState = ConversationSession


class SessionManager:
    """会话管理器 - 支持用户ID + 会话ID的双重隔离"""

    def __init__(self):
        # 核心存储：session_key(user_id:session_id) -> ConversationSession
        self.sessions: Dict[str, ConversationSession] = {}

        # 映射关系
        self.client_to_session: Dict[str, str] = {}        # client_uid -> session_key
        self.user_sessions: Dict[str, List[str]] = {}      # user_id -> [session_keys]
        self.session_clients: Dict[str, List[str]] = {}    # session_key -> [client_uids]

    def create_session(self, user_id: str, session_id: str, client_uid: str) -> ConversationSession:
        """创建新的对话会话"""
        session = ConversationSession(user_id, session_id, client_uid)
        session_key = session.session_key

        # 存储会话
        self.sessions[session_key] = session

        # 建立映射关系
        self.client_to_session[client_uid] = session_key

        # 用户会话列表
        if user_id not in self.user_sessions:
            self.user_sessions[user_id] = []
        if session_key not in self.user_sessions[user_id]:
            self.user_sessions[user_id].append(session_key)

        # 会话客户端列表
        if session_key not in self.session_clients:
            self.session_clients[session_key] = []
        self.session_clients[session_key].append(client_uid)

        logger.info(f"创建对话会话: {user_id}:{session_id} (客户端: {client_uid})")
        return session

    def get_session(self, user_id: str = None, session_id: str = None, client_uid: str = None) -> Optional[ConversationSession]:
        """获取对话会话"""
        if user_id and session_id:
            session_key = f"{user_id}:{session_id}"
            return self.sessions.get(session_key)
        elif client_uid:
            session_key = self.client_to_session.get(client_uid)
            return self.sessions.get(session_key) if session_key else None
        return None

    def get_session_info_by_client(self, client_uid: str) -> Optional[Dict[str, str]]:
        """通过客户端ID获取会话信息"""
        session_key = self.client_to_session.get(client_uid)
        if session_key and ':' in session_key:
            user_id, session_id = session_key.split(':', 1)
            return {
                "user_id": user_id,
                "session_id": session_id,
                "session_key": session_key
            }
        return None

    def get_user_sessions(self, user_id: str) -> List[ConversationSession]:
        """获取用户的所有会话"""
        session_keys = self.user_sessions.get(user_id, [])
        return [self.sessions[key] for key in session_keys if key in self.sessions]

    def remove_client_from_session(self, client_uid: str):
        """从会话中移除客户端"""
        session_key = self.client_to_session.get(client_uid)
        if not session_key:
            return

        # 移除客户端映射
        del self.client_to_session[client_uid]

        # 从会话的客户端列表中移除
        if session_key in self.session_clients:
            if client_uid in self.session_clients[session_key]:
                self.session_clients[session_key].remove(client_uid)

            # 如果会话没有其他客户端，移除会话
            if not self.session_clients[session_key]:
                self._cleanup_session(session_key)

        logger.info(f"从会话中移除客户端 {client_uid}")

    def _cleanup_session(self, session_key: str):
        """清理会话"""
        if session_key not in self.sessions:
            return

        session = self.sessions[session_key]
        user_id = session.user_id

        # 移除会话
        del self.sessions[session_key]
        del self.session_clients[session_key]

        # 从用户的会话列表中移除
        if user_id in self.user_sessions:
            if session_key in self.user_sessions[user_id]:
                self.user_sessions[user_id].remove(session_key)

            # 如果用户没有其他会话，清理用户记录
            if not self.user_sessions[user_id]:
                del self.user_sessions[user_id]
                logger.info(f"用户 {user_id} 的所有会话已结束")

        logger.info(f"清理会话: {session_key}")

    def get_all_users(self) -> List[str]:
        """获取所有活跃用户ID"""
        return list(self.user_sessions.keys())

    def get_user_session_count(self, user_id: str) -> int:
        """获取用户的会话数量"""
        return len(self.user_sessions.get(user_id, []))

    def cleanup_inactive_sessions(self, inactive_minutes: int = 30) -> int:
        """清理不活跃的会话"""
        current_time = datetime.now()
        inactive_sessions = []

        for session_key, session in self.sessions.items():
            if (current_time - session.last_interaction).total_seconds() > (inactive_minutes * 60):
                inactive_sessions.append(session_key)

        for session_key in inactive_sessions:
            # 清理该会话的所有客户端
            client_uids = self.session_clients.get(session_key, []).copy()
            for client_uid in client_uids:
                self.remove_client_from_session(client_uid)

        logger.info(f"清理了 {len(inactive_sessions)} 个不活跃会话")
        return len(inactive_sessions)


# 为了向后兼容，保留UserStateManager别名
UserStateManager = SessionManager