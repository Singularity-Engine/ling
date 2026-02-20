"""
灵计费 API 路由

POST /api/billing/check-and-deduct  — JWT 认证 + 检查额度 + 扣减
GET  /api/billing/balance           — 查询余额和方案信息
POST /api/billing/check-tool        — 检查特定工具配额
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from loguru import logger

from ..auth.ling_deps import get_current_user, get_optional_user
from ..auth.plan_gates import (
    is_privileged,
    check_daily_messages,
    check_and_record_daily_message,
    record_message_sent,
    should_deduct_credits,
    check_tool_quota,
    record_tool_usage,
    get_credit_cost,
    get_plan_limits,
)
from ..database.ling_user_repository import LingUserRepository


from ..auth.rate_limit import limiter

CREDIT_PER_MESSAGE = Decimal("1.0")


class ToolCheckRequest(BaseModel):
    tool: str


def create_ling_billing_router(repo: LingUserRepository) -> APIRouter:
    router = APIRouter(prefix="/api/billing", tags=["billing"])

    @router.post("/check-and-deduct")
    @limiter.limit("60/minute")
    async def check_and_deduct(request: Request, user: dict = Depends(get_current_user)):
        """Check quota and deduct credits (called before each message send)."""
        user_id = str(user["id"])

        # owner/admin bypass all limits
        if is_privileged(user):
            return {
                "allowed": True,
                "credits_balance": float(user.get("credits_balance", 0)),
                "daily_count": 0,
                "daily_limit": -1,
            }

        # Atomic check + increment daily message limit (prevents race condition)
        allowed, new_count, daily_limit = check_and_record_daily_message(user_id, user)
        if not allowed:
            return {
                "allowed": False,
                "reason": "daily_limit_reached",
                "message": f"You've reached today's limit ({daily_limit} messages). Upgrade for more!",
                "credits_balance": float(user.get("credits_balance", 0)),
                "daily_count": new_count,
                "daily_limit": daily_limit,
            }

        # Deduct credits for paid users
        if should_deduct_credits(user):
            success, balance_after = repo.deduct_credits(
                user_id=user_id,
                amount=CREDIT_PER_MESSAGE,
                description="Message sent",
                tx_type="message_debit",
            )
            if not success:
                return {
                    "allowed": False,
                    "reason": "insufficient_credits",
                    "message": "You're running low on credits. Top up to keep chatting!",
                    "credits_balance": float(user.get("credits_balance", 0)),
                    "daily_count": new_count,
                    "daily_limit": daily_limit,
                }
            credits_balance = float(balance_after)
        else:
            credits_balance = float(user.get("credits_balance", 0))

        return {
            "allowed": True,
            "credits_balance": credits_balance,
            "daily_count": new_count,
            "daily_limit": daily_limit,
        }

    @router.get("/balance")
    @limiter.limit("30/minute")
    async def get_balance(request: Request, user: dict = Depends(get_current_user)):
        """Get current user balance and plan information."""
        user_id = str(user["id"])
        limits = get_plan_limits(user)
        allowed, current_count, daily_limit = check_daily_messages(user_id, user)

        return {
            **limits,
            "daily_count": current_count,
        }

    @router.post("/check-tool")
    @limiter.limit("30/minute")
    async def check_tool(
        request: Request,
        body: ToolCheckRequest,
        user: dict = Depends(get_current_user),
    ):
        """Check if user can use a specific tool (quota + credits)."""
        user_id = str(user["id"])
        tool = body.tool

        # owner/admin bypass
        if is_privileged(user):
            return {"allowed": True, "credits_balance": float(user.get("credits_balance", 0))}

        # Check tool quota
        allowed, current_count, limit = check_tool_quota(user_id, user, tool)
        if not allowed:
            return {
                "allowed": False,
                "reason": "tool_quota_reached",
                "message": f"You've used all your {tool.replace('_', ' ')} quota for today. Upgrade for more!",
                "current_count": current_count,
                "daily_limit": limit,
            }

        # Check credit cost
        cost = get_credit_cost(tool)
        if cost > 0 and should_deduct_credits(user):
            success, balance_after = repo.deduct_credits(
                user_id=user_id,
                amount=Decimal(str(cost)),
                description=f"Tool: {tool}",
                tx_type="tool_debit",
            )
            if not success:
                return {
                    "allowed": False,
                    "reason": "insufficient_credits",
                    "message": f"This tool costs {cost} credits. Top up to continue!",
                    "credit_cost": cost,
                    "credits_balance": float(user.get("credits_balance", 0)),
                }
            record_tool_usage(user_id, tool)
            return {
                "allowed": True,
                "credits_balance": float(balance_after),
                "credit_cost": cost,
            }

        # No credit cost, just record usage
        record_tool_usage(user_id, tool)
        return {
            "allowed": True,
            "credits_balance": float(user.get("credits_balance", 0)),
            "credit_cost": 0,
        }

    return router
