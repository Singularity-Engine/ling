#!/usr/bin/env python3
"""
亲密度（affinity）管理：PGSQL + Redis 缓存（写穿/读穿）

- 主表: character_affinity
  唯一键 (character_name, user_id)
- 历史表: affinity_history
  外键 character_affinity(id)
"""

from __future__ import annotations

from typing import Optional, Dict, Any
import logging

from .database_manager import DatabaseManager
from ..redis.redis_manager import RedisManager
from ..redis.affinity_cache import AffinityCache


logger = logging.getLogger(__name__)


class AffinityManager:
    def __init__(self, db_manager: DatabaseManager, redis_manager: RedisManager) -> None:
        self.db = db_manager
        self.cache = AffinityCache(redis_manager)

    def get_affinity(self, character_name: str, user_id: str, default: int = 50) -> int:
        """读取当前亲密度（优先缓存，回源 PG 并回填缓存）"""
        cached = self.cache.get_affinity(character_name, user_id)
        if cached is not None:
            return cached

        conn = self.db.get_connection()
        if not conn:
            return default
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT affinity FROM character_affinity
                WHERE character_name = %s AND user_id = %s AND is_deleted = FALSE
                """,
                (character_name, user_id),
            )
            row = cur.fetchone()
            cur.close()
            self.db.return_connection(conn)

            if row and "affinity" in row:
                val = int(row["affinity"])  # RealDictCursor
                self.cache.set_affinity(character_name, user_id, val)
                return val
            return default
        except Exception as e:
            logger.error(f"查询亲密度失败: {e}")
            try:
                self.db.return_connection(conn)
            except Exception:
                pass
            return default

    def upsert_affinity(self, character_name: str, user_id: str, value: int, conn=None) -> bool:
        """插入或更新亲密度（不写历史），并刷新缓存
        
        Args:
            character_name: 角色名
            user_id: 用户ID
            value: 亲密度值
            conn: 可选的数据库连接，如果提供则使用该连接而不是从连接池获取新连接
        """
        conn_provided = conn is not None
        if not conn_provided:
            conn = self.db.get_connection()
            if not conn:
                return False
        try:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO character_affinity (character_name, user_id, affinity)
                VALUES (%s, %s, %s)
                ON CONFLICT (character_name, user_id)
                DO UPDATE SET affinity = EXCLUDED.affinity, updated_at = CURRENT_TIMESTAMP, is_deleted = FALSE
                RETURNING id
                """,
                (character_name, user_id, int(value)),
            )
            cur.fetchone()

            conn.commit()
            cur.close()
            if not conn_provided:
                self.db.return_connection(conn)

            self.cache.set_affinity(character_name, user_id, int(value))
            return True
        except Exception as e:
            logger.error(f"写入亲密度失败: {e}")
            try:
                conn.rollback()
                if not conn_provided:
                    self.db.return_connection(conn)
            except Exception:
                pass
            return False

    def apply_change(self, character_name: str, user_id: str, delta: int, reason: str, conn=None) -> int:
        """原子更新亲密度并写历史，返回新值（落数据库后刷新缓存）
        
        Args:
            character_name: 角色名
            user_id: 用户ID
            delta: 亲密度变化值
            reason: 变化原因
            conn: 可选的数据库连接，如果提供则使用该连接而不是从连接池获取新连接
        """
        conn_provided = conn is not None
        if not conn_provided:
            conn = self.db.get_connection()
            if not conn:
                return self.get_affinity(character_name, user_id)
        try:
            cur = conn.cursor()

            # 1) 取当前值（FOR UPDATE 锁行，避免并发竞态）
            cur.execute(
                """
                SELECT id, affinity FROM character_affinity
                WHERE character_name = %s AND user_id = %s AND is_deleted = FALSE
                FOR UPDATE
                """,
                (character_name, user_id),
            )
            row = cur.fetchone()

            if row:
                ca_id = row["id"]
                current = int(row["affinity"])
                new_val = max(0, min(100, current + int(delta)))
                cur.execute(
                    """
                    UPDATE character_affinity
                    SET affinity = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    """,
                    (new_val, ca_id),
                )
            else:
                # 不存在则插入默认 50 再应用 delta
                base = 50
                new_val = max(0, min(100, base + int(delta)))
                cur.execute(
                    """
                    INSERT INTO character_affinity (character_name, user_id, affinity)
                    VALUES (%s, %s, %s)
                    RETURNING id
                    """,
                    (character_name, user_id, new_val),
                )
                ca_id = cur.fetchone()["id"]

            # 2) 写历史
            cur.execute(
                """
                INSERT INTO affinity_history (character_affinity_id, value, change_amount, reason)
                VALUES (%s, %s, %s, %s)
                """,
                (ca_id, new_val, int(delta), reason),
            )

            conn.commit()
            cur.close()
            if not conn_provided:
                self.db.return_connection(conn)

            # 3) 刷新缓存
            self.cache.set_affinity(character_name, user_id, new_val)
            return new_val
        except Exception as e:
            logger.error(f"亲密度原子更新失败: {e}")
            try:
                conn.rollback()
                if not conn_provided:
                    self.db.return_connection(conn)
            except Exception:
                pass
            return self.get_affinity(character_name, user_id)


