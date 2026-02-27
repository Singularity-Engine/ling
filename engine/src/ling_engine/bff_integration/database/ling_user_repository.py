"""
灵用户仓储层

操作 ling_users / ling_credit_transactions 表。
复用现有 psycopg2 连接模式（与 user_repository.py 保持一致）。
"""

import os
from decimal import Decimal
from typing import Optional, List

import psycopg2
from psycopg2.extras import RealDictCursor
from loguru import logger

from .init_auth_tables import init_auth_tables, ensure_owner_account


class LingUserRepository:
    """灵用户数据访问层"""

    def __init__(self, db_manager=None):
        self.db_manager = db_manager
        self._init_tables()

    # ── 连接 ─────────────────────────────────────────────────────

    def _get_connection(self):
        if self.db_manager:
            return self.db_manager.get_connection()

        host = os.getenv("POSTGRES_HOST") or os.getenv("DB_HOST", "localhost")
        port = int(os.getenv("POSTGRES_PORT") or os.getenv("DB_PORT", "5432"))
        database = os.getenv("POSTGRES_DB") or os.getenv("DB_NAME", "qidian")
        user = os.getenv("POSTGRES_USER") or os.getenv("DB_USER", "postgres")
        password = os.getenv("POSTGRES_PASSWORD") or os.getenv("DB_PASSWORD", "")

        return psycopg2.connect(
            host=host, port=port, database=database, user=user, password=password,
        )

    def _release(self, conn):
        if not self.db_manager:
            conn.close()

    def _init_tables(self):
        """建表 + owner 初始化（幂等）。"""
        try:
            conn = self._get_connection()
            try:
                init_auth_tables(conn)
                ensure_owner_account(conn)
            finally:
                self._release(conn)
        except Exception as e:
            logger.error(f"初始化 ling 认证表失败: {e}")

    # ── 用户 CRUD ────────────────────────────────────────────────

    def create_user(
        self,
        username: str,
        password_hash: str,
        email: Optional[str] = None,
        display_name: Optional[str] = None,
        role: str = "user",
        plan: str = "free",
        credits_balance: Decimal = Decimal("0"),
    ) -> dict:
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO ling_users
                        (email, username, password_hash, display_name, role, plan, credits_balance)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (email, username, password_hash, display_name, role, plan, credits_balance),
                )
                user = dict(cur.fetchone())
            conn.commit()
            logger.info(f"创建用户: {username} ({user['id']})")
            return user
        except Exception:
            conn.rollback()
            raise
        finally:
            self._release(conn)

    def get_user_by_id(self, user_id: str) -> Optional[dict]:
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM ling_users WHERE id = %s", (user_id,))
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            self._release(conn)

    def get_user_by_email(self, email: str) -> Optional[dict]:
        if not email:
            return None
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM ling_users WHERE email = %s", (email,))
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            self._release(conn)

    def get_user_by_username(self, username: str) -> Optional[dict]:
        if not username:
            return None
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM ling_users WHERE username = %s", (username,))
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            self._release(conn)

    def get_user_by_identifier(self, identifier: str) -> Optional[dict]:
        """通过 email 或 username 查找用户。"""
        if not identifier:
            return None
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM ling_users WHERE email = %s OR username = %s",
                    (identifier, identifier),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            self._release(conn)

    def update_last_login(self, user_id: str) -> None:
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE ling_users SET last_login_at = NOW() WHERE id = %s",
                    (user_id,),
                )
            conn.commit()
        finally:
            self._release(conn)

    def update_user(self, user_id: str, **fields) -> Optional[dict]:
        """更新用户任意字段。"""
        if not fields:
            return self.get_user_by_id(user_id)

        allowed = {
            "email", "username", "display_name", "role", "plan",
            "credits_balance", "stripe_customer_id", "subscription_status",
            "password_hash",
        }
        fields = {k: v for k, v in fields.items() if k in allowed}
        if not fields:
            return self.get_user_by_id(user_id)

        set_clause = ", ".join(f"{k} = %s" for k in fields)
        values = list(fields.values()) + [user_id]

        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"UPDATE ling_users SET {set_clause} WHERE id = %s RETURNING *",
                    values,
                )
                row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None
        except Exception:
            conn.rollback()
            raise
        finally:
            self._release(conn)

    # ── 积分操作 ─────────────────────────────────────────────────

    def deduct_credits(
        self,
        user_id: str,
        amount: Decimal,
        description: str,
        tx_type: str = "message_debit",
    ) -> tuple[bool, Decimal]:
        """原子扣减积分。

        Returns:
            (success, balance_after) — 余额不足时 success=False，balance_after=-1
        """
        amount = Decimal(str(amount))
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 原子 UPDATE + 余额检查
                cur.execute(
                    """
                    UPDATE ling_users
                       SET credits_balance = credits_balance - %s
                     WHERE id = %s AND credits_balance >= %s
                    RETURNING credits_balance
                    """,
                    (amount, user_id, amount),
                )
                row = cur.fetchone()
                if not row:
                    conn.rollback()
                    return False, Decimal("-1")

                balance_after = row["credits_balance"]

                # 记录交易
                cur.execute(
                    """
                    INSERT INTO ling_credit_transactions
                        (user_id, amount, balance_after, type, description)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (user_id, -amount, balance_after, tx_type, description),
                )
            conn.commit()
            return True, balance_after
        except Exception:
            conn.rollback()
            raise
        finally:
            self._release(conn)

    def add_credits(
        self,
        user_id: str,
        amount: Decimal,
        description: str,
        tx_type: str = "purchase_credit",
        stripe_session_id: Optional[str] = None,
    ) -> Decimal:
        """增加积分并记录交易。"""
        amount = Decimal(str(amount))
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 幂等检查：同一 stripe_session_id 不重复到账
                if stripe_session_id:
                    cur.execute(
                        "SELECT id FROM ling_credit_transactions WHERE stripe_session_id = %s",
                        (stripe_session_id,),
                    )
                    if cur.fetchone():
                        logger.warning(f"重复的 stripe_session_id，跳过: {stripe_session_id}")
                        cur.execute(
                            "SELECT credits_balance FROM ling_users WHERE id = %s",
                            (user_id,),
                        )
                        return cur.fetchone()["credits_balance"]

                cur.execute(
                    """
                    UPDATE ling_users
                       SET credits_balance = credits_balance + %s
                     WHERE id = %s
                    RETURNING credits_balance
                    """,
                    (amount, user_id),
                )
                row = cur.fetchone()
                if not row:
                    raise ValueError(f"用户不存在: {user_id}")
                balance_after = row["credits_balance"]

                cur.execute(
                    """
                    INSERT INTO ling_credit_transactions
                        (user_id, amount, balance_after, type, description, stripe_session_id)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (user_id, amount, balance_after, tx_type, description, stripe_session_id),
                )
            conn.commit()
            return balance_after
        except Exception:
            conn.rollback()
            raise
        finally:
            self._release(conn)

    def get_credit_history(
        self, user_id: str, limit: int = 50, offset: int = 0
    ) -> list[dict]:
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT * FROM ling_credit_transactions
                     WHERE user_id = %s
                     ORDER BY created_at DESC
                     LIMIT %s OFFSET %s
                    """,
                    (user_id, limit, offset),
                )
                return [dict(r) for r in cur.fetchall()]
        finally:
            self._release(conn)

    # ── 用户管理（admin） ────────────────────────────────────────

    def list_users(self, limit: int = 50, offset: int = 0) -> list[dict]:
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM ling_users ORDER BY created_at DESC LIMIT %s OFFSET %s",
                    (limit, offset),
                )
                return [dict(r) for r in cur.fetchall()]
        finally:
            self._release(conn)

    def count_users(self) -> int:
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM ling_users")
                return cur.fetchone()[0]
        finally:
            self._release(conn)

    def delete_user(self, user_id: str) -> bool:
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM ling_users WHERE id = %s", (user_id,))
                deleted = cur.rowcount > 0
            conn.commit()
            return deleted
        except Exception:
            conn.rollback()
            raise
        finally:
            self._release(conn)

    def export_user_data(self, user_id: str) -> dict:
        """导出用户全部数据（GDPR）。"""
        user = self.get_user_by_id(user_id)
        if not user:
            return {}
        transactions = self.get_credit_history(user_id, limit=10000)
        # 移除敏感字段
        user.pop("password_hash", None)
        return {"user": user, "credit_transactions": transactions}

    # ── 统计 ─────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT
                        COUNT(*) AS total_users,
                        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS new_today,
                        COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '24 hours') AS active_today,
                        COUNT(*) FILTER (WHERE plan != 'free') AS paid_users
                    FROM ling_users
                """)
                return dict(cur.fetchone())
        finally:
            self._release(conn)
