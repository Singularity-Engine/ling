#!/usr/bin/env python3
"""
基于 Redis 的亲密度缓存层。

Key 设计：
- 亲密度值: vtuber:affinity:<character_name>:<user_id>
"""

from __future__ import annotations

from typing import Optional
import logging

from .redis_manager import RedisManager


logger = logging.getLogger(__name__)


class AffinityCache:
    def __init__(self, redis_manager: RedisManager, ttl_seconds: int = 24 * 3600) -> None:
        self.redis = redis_manager
        self.ttl_seconds = ttl_seconds

    def _key(self, character_name: str, user_id: str) -> str:
        return self.redis._k("affinity", character_name, user_id)

    def get_affinity(self, character_name: str, user_id: str) -> Optional[int]:
        key = self._key(character_name, user_id)
        try:
            val = self.redis.client.get(key)
            if val is None:
                return None
            return int(val)
        except Exception as e:
            logger.debug(f"Redis 读取亲密度失败: {e}")
            return None

    def set_affinity(self, character_name: str, user_id: str, value: int) -> None:
        key = self._key(character_name, user_id)
        try:
            self.redis.client.set(key, int(value), ex=self.ttl_seconds)
        except Exception as e:
            logger.debug(f"Redis 写入亲密度失败: {e}")

    def invalidate_affinity(self, character_name: str, user_id: str) -> None:
        key = self._key(character_name, user_id)
        try:
            self.redis.delete(key)
        except Exception:
            pass


