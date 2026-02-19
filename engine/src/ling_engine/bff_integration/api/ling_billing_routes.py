"""
灵计费 API 路由

POST /api/billing/check-and-deduct  — JWT 认证 + 检查额度 + 扣减
GET  /api/billing/balance           — 查询余额
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger

from ..auth.ling_deps import get_current_user, get_optional_user
from ..auth.plan_gates import (
    is_privileged,
    check_daily_messages,
    record_message_sent,
    should_deduct_credits,
)
from ..database.ling_user_repository import LingUserRepository


CREDIT_PER_MESSAGE = Decimal("1.0")


def create_ling_billing_router(repo: LingUserRepository) -> APIRouter:
    router = APIRouter(prefix="/api/billing", tags=["billing"])

    @router.post("/check-and-deduct")
    async def check_and_deduct(user: dict = Depends(get_current_user)):
        """检查额度并扣减积分（每次发消息前调用）。"""
        user_id = str(user["id"])

        # owner/admin 直接放行
        if is_privileged(user):
            return {
                "allowed": True,
                "credits_balance": float(user.get("credits_balance", 0)),
                "daily_count": 0,
                "daily_limit": -1,
            }

        # 检查每日消息上限
        allowed, current_count, daily_limit = check_daily_messages(user_id, user)
        if not allowed:
            return {
                "allowed": False,
                "reason": "daily_limit_reached",
                "message": f"今日已达上限 ({daily_limit} 条)",
                "credits_balance": float(user.get("credits_balance", 0)),
                "daily_count": current_count,
                "daily_limit": daily_limit,
            }

        # 检查并扣减积分（付费用户）
        if should_deduct_credits(user):
            success, balance_after = repo.deduct_credits(
                user_id=user_id,
                amount=CREDIT_PER_MESSAGE,
                description="消息发送",
                tx_type="message_debit",
            )
            if not success:
                return {
                    "allowed": False,
                    "reason": "insufficient_credits",
                    "message": "积分不足",
                    "credits_balance": float(user.get("credits_balance", 0)),
                    "daily_count": current_count,
                    "daily_limit": daily_limit,
                }
            credits_balance = float(balance_after)
        else:
            credits_balance = float(user.get("credits_balance", 0))

        # 记录消息发送
        new_count = record_message_sent(user_id)

        return {
            "allowed": True,
            "credits_balance": credits_balance,
            "daily_count": new_count,
            "daily_limit": daily_limit,
        }

    @router.get("/balance")
    async def get_balance(user: dict = Depends(get_current_user)):
        """查询当前用户余额和方案信息。"""
        user_id = str(user["id"])
        allowed, current_count, daily_limit = check_daily_messages(user_id, user)

        return {
            "credits_balance": float(user.get("credits_balance", 0)),
            "plan": user.get("plan", "free"),
            "role": user.get("role", "user"),
            "daily_count": current_count,
            "daily_limit": daily_limit,
        }

    return router
