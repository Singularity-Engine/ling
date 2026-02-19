"""
灵认证依赖注入

提供 FastAPI Depends() 函数用于路由级别认证和权限控制。
"""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .ling_auth import verify_jwt_token

security = HTTPBearer(auto_error=False)

# 全局仓储实例（在 create_ling_auth_router 中注入）
_repo = None


def set_repo(repo):
    global _repo
    _repo = repo


def _get_repo():
    if _repo is None:
        raise RuntimeError("LingUserRepository 尚未初始化")
    return _repo


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """从 Bearer token 提取用户信息并查数据库。"""
    if not credentials:
        raise HTTPException(status_code=401, detail="未提供认证令牌")

    payload = verify_jwt_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="无效或已过期的认证令牌")

    if payload.get("type") == "refresh":
        raise HTTPException(status_code=401, detail="不能使用 refresh token 访问此接口")

    repo = _get_repo()
    user = repo.get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")

    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict | None:
    """可选认证 — 有 token 就验证，无 token 返回 None。"""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


async def require_auth(user: dict = Depends(get_current_user)) -> dict:
    """要求已认证。"""
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """要求 admin 或 owner 角色。"""
    if user.get("role") not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


async def require_owner(user: dict = Depends(get_current_user)) -> dict:
    """要求 owner 角色。"""
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="需要 owner 权限")
    return user
