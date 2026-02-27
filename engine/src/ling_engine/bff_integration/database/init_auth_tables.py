"""
灵认证系统 — 数据库初始化

创建 ling_users 和 ling_credit_transactions 表，
并在首次启动时自动创建 owner 账户。
"""

import os
from loguru import logger


# ── SQL ────────────────────────────────────────────────────────────

CREATE_LING_USERS = """
CREATE TABLE IF NOT EXISTS ling_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    plan TEXT NOT NULL DEFAULT 'free',
    credits_balance NUMERIC NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
    stripe_customer_id TEXT UNIQUE,
    subscription_status TEXT NOT NULL DEFAULT 'inactive',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);
"""

CREATE_LING_CREDIT_TRANSACTIONS = """
CREATE TABLE IF NOT EXISTS ling_credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES ling_users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    balance_after NUMERIC NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    stripe_session_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

CREATE_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_ling_users_email ON ling_users(email);
CREATE INDEX IF NOT EXISTS idx_ling_users_username ON ling_users(username);
CREATE INDEX IF NOT EXISTS idx_ling_credit_tx_user ON ling_credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ling_credit_tx_created ON ling_credit_transactions(created_at);
"""


# ── 初始化逻辑 ───────────────────────────────────────────────────

def init_auth_tables(conn) -> None:
    """创建认证相关数据表（幂等）。

    Args:
        conn: psycopg2 数据库连接（调用方负责关闭）
    """
    try:
        with conn.cursor() as cur:
            cur.execute(CREATE_LING_USERS)
            cur.execute(CREATE_LING_CREDIT_TRANSACTIONS)
            cur.execute(CREATE_INDEXES)
        conn.commit()
        logger.info("ling_users / ling_credit_transactions 表初始化完成")
    except Exception as e:
        conn.rollback()
        logger.error(f"初始化认证表失败: {e}")
        raise


def ensure_owner_account(conn) -> None:
    """确保 owner 超级管理员账户存在。

    从环境变量读取：
        LING_OWNER_EMAIL    — owner 邮箱（必须）
        LING_OWNER_USERNAME — owner 用户名（默认 owner）
        LING_OWNER_PASSWORD — owner 密码（必须）
    """
    owner_email = os.getenv("LING_OWNER_EMAIL")
    owner_password = os.getenv("LING_OWNER_PASSWORD")
    owner_username = os.getenv("LING_OWNER_USERNAME", "owner")

    if not owner_email or not owner_password:
        logger.info("未设置 LING_OWNER_EMAIL/LING_OWNER_PASSWORD，跳过 owner 账户创建")
        return

    try:
        with conn.cursor() as cur:
            # 检查 owner 是否已存在
            cur.execute(
                "SELECT id FROM ling_users WHERE role = 'owner' LIMIT 1"
            )
            if cur.fetchone():
                logger.debug("owner 账户已存在，跳过创建")
                return

            # 延迟导入避免循环依赖
            from ..auth.ling_auth import hash_password

            password_hash = hash_password(owner_password)
            cur.execute(
                """
                INSERT INTO ling_users (email, username, password_hash, display_name, role, plan, credits_balance)
                VALUES (%s, %s, %s, %s, 'owner', 'eternal', 999999999)
                ON CONFLICT (email) DO UPDATE SET role = 'owner', plan = 'eternal'
                """,
                (owner_email, owner_username, password_hash, "瑞鹏"),
            )
        conn.commit()
        logger.info(f"owner 账户已创建/更新: {owner_email}")
    except Exception as e:
        conn.rollback()
        logger.error(f"创建 owner 账户失败: {e}")
        raise
