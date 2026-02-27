#!/usr/bin/env python3
"""
基于 PGSQL 的会话/消息管理，但带有 Redis 写穿/读穿缓存。
缓存策略：
  - 读取：优先读缓存，缓存 miss 则查询 PG 并回填缓存
  - 写入：先写 PG 成功后，回填/追加缓存
  - 删除：先软删 PG 成功后，失效缓存
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import logging

from .database_manager import ChatSessionManager, ChatMessageManager, DatabaseManager
from ..redis.redis_manager import RedisManager
from ..redis.cache_layer import ChatCache


logger = logging.getLogger(__name__)


class CacheBackedChatSessionManager:
    def __init__(self, db_manager: DatabaseManager, redis_manager: RedisManager) -> None:
        self.db = db_manager
        self.cache = ChatCache(redis_manager)
        self.pg = ChatSessionManager(db_manager)
        logger.info("🔥 CACHE DEBUG: CacheBackedChatSessionManager 初始化完成（包含置顶和重命名功能）")

    def create_session(
        self,
        session_id: str,
        user_id: str,
        character_name: str,
        session_name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        created = self.pg.create_session(session_id, user_id, character_name, session_name)
        if created:
            self.cache.cache_session(session_id, created)
        return created

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        cached = self.cache.get_cached_session(session_id)
        if cached:
            return cached
        sess = self.pg.get_session(session_id)
        if sess:
            self.cache.cache_session(session_id, sess)
        return sess

    def get_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        # 此处仍直接查 PG（避免复杂缓存一致性），也可按需扩展
        return self.pg.get_user_sessions(user_id)

    def update_session(self, session_id: str, **kwargs) -> bool:
        ok = self.pg.update_session(session_id, **kwargs)
        if ok:
            # 失效或重建缓存
            fresh = self.pg.get_session(session_id)
            if fresh:
                self.cache.cache_session(session_id, fresh)
            else:
                self.cache.invalidate_session(session_id)
        return ok

    def delete_session(self, session_id: str) -> bool:
        ok = self.pg.delete_session(session_id)
        if ok:
            self.cache.invalidate_session(session_id)
            self.cache.invalidate_messages(session_id)
        return ok

    def pin_session(self, session_id: str, is_pinned: bool) -> bool:
        """置顶或取消置顶会话"""
        logger.info(f"🔥 CACHE DEBUG: pin_session 开始 - session_id={session_id}, is_pinned={is_pinned}")
        ok = self.pg.pin_session(session_id, is_pinned)
        logger.info(f"🔥 CACHE DEBUG: pin_session PG 结果 - ok={ok}")
        if ok:
            # 失效或重建缓存
            fresh = self.pg.get_session(session_id)
            logger.info(f"🔥 CACHE DEBUG: 重新获取会话数据 - fresh={fresh}")
            if fresh:
                self.cache.cache_session(session_id, fresh)
                logger.info("🔥 CACHE DEBUG: 缓存已更新")
            else:
                self.cache.invalidate_session(session_id)
                logger.info("🔥 CACHE DEBUG: 缓存已失效")
        return ok

    def rename_session(self, session_id: str, custom_title: str) -> bool:
        """重命名会话（设置自定义标题）"""
        logger.info(f"🔥 CACHE DEBUG: rename_session 开始 - session_id={session_id}, custom_title={custom_title}")
        ok = self.pg.rename_session(session_id, custom_title)
        logger.info(f"🔥 CACHE DEBUG: rename_session PG 结果 - ok={ok}")
        if ok:
            # 失效或重建缓存
            fresh = self.pg.get_session(session_id)
            logger.info(f"🔥 CACHE DEBUG: 重新获取会话数据 - fresh={fresh}")
            if fresh:
                self.cache.cache_session(session_id, fresh)
                logger.info("🔥 CACHE DEBUG: 缓存已更新")
            else:
                self.cache.invalidate_session(session_id)
                logger.info("🔥 CACHE DEBUG: 缓存已失效")
        return ok


class CacheBackedChatMessageManager:
    def __init__(self, db_manager: DatabaseManager, redis_manager: RedisManager) -> None:
        self.db = db_manager
        self.cache = ChatCache(redis_manager)
        self.pg = ChatMessageManager(db_manager)

    def add_message(self, session_id: str, role: str, content: str) -> Optional[Dict[str, Any]]:
        created = self.pg.add_message(session_id, role, content)
        if created:
            self.cache.append_messages(session_id, [created])
        return created

    def get_session_messages(self, session_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        cached = self.cache.get_cached_messages(session_id)
        if cached:
            return cached if limit is None else cached[:limit]
        msgs = self.pg.get_session_messages(session_id, limit=limit)
        if msgs:
            self.cache.append_messages(session_id, msgs)
        return msgs

    def delete_message(self, message_id: int, session_id: Optional[str] = None) -> bool:
        ok = self.pg.delete_message(message_id)
        if ok and session_id:
            # 失效该会话的消息缓存
            self.cache.invalidate_messages(session_id)
        return ok


