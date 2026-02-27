"""
灵认证核心 — JWT (HS256) + bcrypt

从 ai-creative-studio 移植并精简。
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt
from loguru import logger

# ── 配置 ─────────────────────────────────────────────────────────

JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRATION_HOURS: int = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))
JWT_REFRESH_EXPIRATION_HOURS: int = int(os.getenv("JWT_REFRESH_EXPIRATION_HOURS", "168"))  # 7 天


def _check_secret() -> None:
    if not JWT_SECRET_KEY:
        raise RuntimeError(
            "JWT_SECRET_KEY 环境变量未设置。"
            "请在 .env 或部署配置中设置一个强随机字符串（>= 32 字符）。"
        )


# ── 密码 ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """bcrypt 哈希密码。"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证明文密码与 bcrypt 哈希是否匹配。"""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


# ── JWT ──────────────────────────────────────────────────────────

def create_access_token(
    user_id: str,
    email: str = "",
    username: str = "",
    role: str = "user",
    expires_hours: Optional[int] = None,
) -> str:
    """签发 HS256 JWT access token。"""
    _check_secret()
    exp = datetime.now(timezone.utc) + timedelta(
        hours=expires_hours or JWT_EXPIRATION_HOURS
    )
    payload = {
        "sub": user_id,
        "email": email,
        "username": username,
        "role": role,
        "exp": exp,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """签发 refresh token（有效期更长）。"""
    _check_secret()
    exp = datetime.now(timezone.utc) + timedelta(hours=JWT_REFRESH_EXPIRATION_HOURS)
    payload = {
        "sub": user_id,
        "exp": exp,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_jwt_token(token: str) -> Optional[dict]:
    """验证并解码 JWT token。

    Returns:
        解码后的 payload dict，验证失败返回 None。
    """
    _check_secret()
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError as e:
        logger.debug(f"JWT 验证失败: {e}")
        return None
