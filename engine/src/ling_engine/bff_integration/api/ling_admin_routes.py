"""
灵管理员 API 路由

GET    /api/admin/users            — 用户列表（分页）
GET    /api/admin/users/:id        — 用户详情
PATCH  /api/admin/users/:id        — 修改用户
POST   /api/admin/users/:id/credits — 手动充值积分
DELETE /api/admin/users/:id        — 删除用户
GET    /api/admin/stats            — 全局统计
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from loguru import logger

from ..auth.ling_deps import require_admin, require_owner
from ..database.ling_user_repository import LingUserRepository


# ── 请求模型 ─────────────────────────────────────────────────────

class UpdateUserRequest(BaseModel):
    role: str | None = None
    plan: str | None = None
    credits_balance: float | None = None
    display_name: str | None = None
    subscription_status: str | None = None


class AddCreditsRequest(BaseModel):
    amount: float
    description: str = "管理员手动充值"


# ── 路由 ─────────────────────────────────────────────────────────

def create_ling_admin_router(repo: LingUserRepository) -> APIRouter:
    router = APIRouter(prefix="/api/admin", tags=["admin"])

    @router.get("/users")
    async def list_users(
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        _admin: dict = Depends(require_admin),
    ):
        users = repo.list_users(limit=limit, offset=offset)
        total = repo.count_users()
        # 移除密码哈希
        for u in users:
            u.pop("password_hash", None)
        return {"users": users, "total": total, "limit": limit, "offset": offset}

    @router.get("/users/{user_id}")
    async def get_user(user_id: str, _admin: dict = Depends(require_admin)):
        user = repo.get_user_by_id(user_id)
        if not user:
            raise HTTPException(404, "用户不存在")
        user.pop("password_hash", None)
        return user

    @router.patch("/users/{user_id}")
    async def update_user(
        user_id: str,
        req: UpdateUserRequest,
        admin: dict = Depends(require_admin),
    ):
        target = repo.get_user_by_id(user_id)
        if not target:
            raise HTTPException(404, "用户不存在")

        # 只有 owner 能修改 role
        if req.role is not None and admin.get("role") != "owner":
            raise HTTPException(403, "只有 owner 可以修改角色")

        # 不能将自己降权
        if user_id == str(admin["id"]) and req.role and req.role != admin["role"]:
            raise HTTPException(400, "不能修改自己的角色")

        fields = req.model_dump(exclude_none=True)
        if "credits_balance" in fields:
            fields["credits_balance"] = Decimal(str(fields["credits_balance"]))

        updated = repo.update_user(user_id, **fields)
        if updated:
            updated.pop("password_hash", None)
        return updated

    @router.post("/users/{user_id}/credits")
    async def add_credits(
        user_id: str,
        req: AddCreditsRequest,
        _admin: dict = Depends(require_admin),
    ):
        if req.amount <= 0:
            raise HTTPException(400, "充值金额必须大于 0")

        user = repo.get_user_by_id(user_id)
        if not user:
            raise HTTPException(404, "用户不存在")

        balance = repo.add_credits(
            user_id,
            Decimal(str(req.amount)),
            req.description,
            tx_type="admin_adjust",
        )
        logger.info(f"管理员充值: {user_id} +{req.amount}, 余额: {balance}")
        return {"credits_balance": float(balance)}

    @router.delete("/users/{user_id}")
    async def delete_user(
        user_id: str,
        admin: dict = Depends(require_owner),
    ):
        target = repo.get_user_by_id(user_id)
        if not target:
            raise HTTPException(404, "用户不存在")

        if target.get("role") == "owner":
            raise HTTPException(400, "不能删除 owner 账户")

        repo.delete_user(user_id)
        logger.info(f"管理员删除用户: {user_id}")
        return {"message": "用户已删除"}

    @router.get("/stats")
    async def get_stats(_admin: dict = Depends(require_admin)):
        return repo.get_stats()

    return router
