"""
灵认证 API 路由

POST /api/auth/register   — 注册
POST /api/auth/login      — 登录
POST /api/auth/logout     — 登出（客户端清 token 即可）
GET  /api/auth/me         — 获取当前用户
POST /api/auth/refresh    — 刷新 token
GET  /api/auth/export     — 导出用户数据 (GDPR)
DELETE /api/auth/account   — 删除账号 (GDPR)
"""

import re
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, field_validator
from loguru import logger

from ..auth.ling_auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_jwt_token,
)
from ..auth.ling_deps import get_current_user, set_repo
from ..database.ling_user_repository import LingUserRepository


# ── 请求/响应模型 ────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str
    display_name: str | None = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]{3,30}$", v):
            raise ValueError("Username must be 3-30 characters, letters/numbers/underscore only")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    identifier: str  # email 或 username
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class DeleteAccountRequest(BaseModel):
    password: str  # 二次确认


class UserResponse(BaseModel):
    id: str
    email: str | None
    username: str
    display_name: str | None
    role: str
    plan: str
    credits_balance: float
    subscription_status: str

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    token: str
    refresh_token: str
    user: UserResponse


# ── 工厂函数 ─────────────────────────────────────────────────────

def _user_response(user: dict) -> UserResponse:
    return UserResponse(
        id=str(user["id"]),
        email=user.get("email"),
        username=user["username"],
        display_name=user.get("display_name"),
        role=user["role"],
        plan=user["plan"],
        credits_balance=float(user["credits_balance"]),
        subscription_status=user.get("subscription_status", "inactive"),
    )


def _tokens_for_user(user: dict) -> tuple[str, str]:
    uid = str(user["id"])
    access = create_access_token(
        user_id=uid,
        email=user.get("email", ""),
        username=user["username"],
        role=user["role"],
    )
    refresh = create_refresh_token(user_id=uid)
    return access, refresh


# ── 路由 ─────────────────────────────────────────────────────────

from ..auth.rate_limit import limiter


def create_ling_auth_router(db_manager=None) -> APIRouter:
    router = APIRouter(prefix="/api/auth", tags=["auth"])
    repo = LingUserRepository(db_manager)
    set_repo(repo)  # 注入到 ling_deps

    # ── 注册 ─────────────────────────────────────────────────

    @router.post("/register", response_model=AuthResponse)
    @limiter.limit("5/minute")
    async def register(req: RegisterRequest, request: Request):
        # 唯一性检查
        if repo.get_user_by_email(req.email):
            raise HTTPException(status_code=409, detail="This email is already registered")
        if repo.get_user_by_username(req.username):
            raise HTTPException(status_code=409, detail="This username is already taken")

        password_hash = hash_password(req.password)
        user = repo.create_user(
            email=req.email,
            username=req.username,
            password_hash=password_hash,
            display_name=req.display_name,
        )

        access, refresh = _tokens_for_user(user)
        logger.info(f"新用户注册: {req.username} ({user['id']})")
        return AuthResponse(token=access, refresh_token=refresh, user=_user_response(user))

    # ── 登录 ─────────────────────────────────────────────────

    @router.post("/login", response_model=AuthResponse)
    @limiter.limit("10/minute")
    async def login(req: LoginRequest, request: Request):
        user = repo.get_user_by_identifier(req.identifier)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if not verify_password(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        repo.update_last_login(str(user["id"]))

        access, refresh = _tokens_for_user(user)
        logger.info(f"用户登录: {user['username']}")
        return AuthResponse(token=access, refresh_token=refresh, user=_user_response(user))

    # ── 登出 ─────────────────────────────────────────────────

    @router.post("/logout")
    async def logout():
        # JWT 无状态，客户端清除 token 即可
        return {"message": "Logged out"}

    # ── 当前用户 ─────────────────────────────────────────────

    @router.get("/me", response_model=UserResponse)
    async def me(user: dict = Depends(get_current_user)):
        return _user_response(user)

    # ── 刷新 token ───────────────────────────────────────────

    @router.post("/refresh", response_model=AuthResponse)
    @limiter.limit("10/minute")
    async def refresh(req: RefreshRequest, request: Request):
        payload = verify_jwt_token(req.refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        user = repo.get_user_by_id(payload["sub"])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        access, refresh = _tokens_for_user(user)
        return AuthResponse(token=access, refresh_token=refresh, user=_user_response(user))

    # ── GDPR: 导出数据 ──────────────────────────────────────

    @router.get("/export")
    async def export_data(user: dict = Depends(get_current_user)):
        data = repo.export_user_data(str(user["id"]))
        return data

    # ── GDPR: 删除账号 ──────────────────────────────────────

    @router.delete("/account")
    async def delete_account(
        req: DeleteAccountRequest,
        user: dict = Depends(get_current_user),
    ):
        if user.get("role") == "owner":
            raise HTTPException(status_code=403, detail="Owner account cannot be deleted")

        if not verify_password(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect password")

        repo.delete_user(str(user["id"]))
        logger.info(f"用户删除账号: {user['username']} ({user['id']})")
        return {"message": "Account deleted"}

    return router
