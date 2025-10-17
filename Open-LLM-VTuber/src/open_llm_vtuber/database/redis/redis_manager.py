#!/usr/bin/env python3
"""
Redis 连接与简易 JSON 缓存工具
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import redis
from datetime import datetime, date


logger = logging.getLogger(__name__)


class RedisManager:
    """Redis 连接管理器与 JSON 缓存便捷方法"""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: Optional[str] = None,
        namespace: str = "vtuber",
        decode_responses: bool = True,
        socket_timeout: int = 5,
    ) -> None:
        self.host = host
        self.port = port
        self.db = db
        self.password = password
        self.namespace = namespace.strip(":") if namespace else "vtuber"
        self.decode_responses = decode_responses
        self.socket_timeout = socket_timeout

        self._client: Optional[redis.Redis] = None

    def connect(self) -> bool:
        try:
            self._client = redis.Redis(
                host=self.host,
                port=self.port,
                db=self.db,
                password=self.password,
                decode_responses=self.decode_responses,
                socket_timeout=self.socket_timeout,
            )
            # 简单探活
            self._client.ping()
            logger.info("Redis 连接成功")
            return True
        except Exception as e:
            logger.error(f"Redis 连接失败: {e}")
            self._client = None
            return False

    @property
    def client(self) -> redis.Redis:
        if self._client is None:
            ok = self.connect()
            if not ok:
                raise RuntimeError("Redis 未连接且自动连接失败")
        return self._client  # type: ignore[return-value]

    def close(self) -> None:
        try:
            if self._client is not None:
                self._client.close()
                logger.info("Redis 连接已关闭")
        finally:
            self._client = None

    # ---------- key helpers ----------
    def _k(self, *parts: str) -> str:
        safe_parts = [self.namespace, *[p.replace(" ", "_") for p in parts if p]]
        return ":".join(safe_parts)

    # ---------- JSON helpers ----------
    def set_json(self, key: str, value: Any, ex: Optional[int] = None) -> None:
        def _json_default(o: Any):
            if isinstance(o, (datetime, date)):
                return o.isoformat()
            # 兜底：转字符串，避免缓存失败
            return str(o)

        self.client.set(key, json.dumps(value, ensure_ascii=False, default=_json_default), ex=ex)

    def get_json(self, key: str) -> Optional[Any]:
        data = self.client.get(key)
        if data is None:
            return None
        try:
            return json.loads(data)
        except Exception:
            return None

    # ---------- List helpers ----------
    def rpush_json(self, key: str, values: List[Any]) -> None:
        if not values:
            return
        pipe = self.client.pipeline(transaction=False)
        for v in values:
            def _json_default(o: Any):
                if isinstance(o, (datetime, date)):
                    return o.isoformat()
                return str(o)

            pipe.rpush(key, json.dumps(v, ensure_ascii=False, default=_json_default))
        pipe.execute()

    def lrange_json(self, key: str, start: int = 0, end: int = -1) -> List[Any]:
        raw = self.client.lrange(key, start, end)
        result: List[Any] = []
        for r in raw:
            try:
                result.append(json.loads(r))
            except Exception:
                pass
        return result

    def delete(self, *keys: str) -> None:
        if keys:
            self.client.delete(*keys)

    def expire(self, key: str, ttl_seconds: int) -> None:
        self.client.expire(key, ttl_seconds)


