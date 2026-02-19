#!/usr/bin/env python3
"""
基于 Redis 的简易缓存层，和 PGSQL 管理器协同实现写穿/读穿缓存。
会话缓存 key:
  vtuber:session:<session_id>
会话消息列表 key:
  vtuber:session_msgs:<session_id>
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from .redis_manager import RedisManager


logger = logging.getLogger(__name__)


class ChatCache:
    def __init__(self, redis_manager: RedisManager, session_ttl_seconds: int = 3600) -> None:
        self.redis = redis_manager
        self.session_ttl_seconds = session_ttl_seconds

    def _session_key(self, session_id: str) -> str:
        return self.redis._k("session", session_id)

    def _messages_key(self, session_id: str) -> str:
        return self.redis._k("session_msgs", session_id)

    # -------- session cache --------
    def cache_session(self, session_id: str, session_obj: Dict[str, Any]) -> None:
        key = self._session_key(session_id)
        self.redis.set_json(key, session_obj, ex=self.session_ttl_seconds)

    def get_cached_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        key = self._session_key(session_id)
        data = self.redis.get_json(key)
        return data if isinstance(data, dict) else None

    def invalidate_session(self, session_id: str) -> None:
        self.redis.delete(self._session_key(session_id))

    # -------- messages cache --------
    def append_messages(self, session_id: str, messages: List[Dict[str, Any]]) -> None:
        key = self._messages_key(session_id)
        self.redis.rpush_json(key, messages)
        self.redis.expire(key, self.session_ttl_seconds)

    def get_cached_messages(self, session_id: str) -> List[Dict[str, Any]]:
        key = self._messages_key(session_id)
        data = self.redis.lrange_json(key, 0, -1)
        # 只返回字典类型的（过滤掉 parse 失败）
        return [d for d in data if isinstance(d, dict)]

    def invalidate_messages(self, session_id: str) -> None:
        self.redis.delete(self._messages_key(session_id))


