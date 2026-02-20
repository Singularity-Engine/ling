"""
灵 Stripe 支付路由

POST /api/stripe/create-checkout  — 创建 Checkout Session（订阅或积分购买）
POST /api/stripe/webhook          — Stripe Webhook 回调
GET  /api/stripe/portal           — Stripe Customer Portal
"""

import os
from decimal import Decimal

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from loguru import logger

from slowapi import Limiter
from slowapi.util import get_remote_address

from ..auth.ling_deps import get_current_user
from ..database.ling_user_repository import LingUserRepository

# ── 配置 ─────────────────────────────────────────────────────────

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3001")

# 订阅方案的 Stripe Price ID
PLAN_PRICES: dict[str, str] = {
    "stardust_monthly": os.getenv("STRIPE_PRICE_STARDUST_MONTHLY", ""),
    "resonance_monthly": os.getenv("STRIPE_PRICE_RESONANCE_MONTHLY", ""),
    "eternal_yearly": os.getenv("STRIPE_PRICE_ETERNAL_YEARLY", ""),
}

# 积分充值包 (积分数 → 价格 cents)
CREDIT_PACKAGES: dict[int, int] = {
    100: 499,     # 100 积分 = $4.99
    500: 1999,    # 500 积分 = $19.99
    2000: 6999,   # 2000 积分 = $69.99
}

# Price ID → (plan_name, credits_per_period)
PRICE_TO_PLAN: dict[str, tuple[str, int]] = {}


def _init_price_map():
    for key, price_id in PLAN_PRICES.items():
        if not price_id:
            continue
        if "stardust" in key:
            PRICE_TO_PLAN[price_id] = ("stardust", 100)
        elif "resonance" in key:
            PRICE_TO_PLAN[price_id] = ("resonance", 500)
        elif "eternal" in key:
            PRICE_TO_PLAN[price_id] = ("eternal", 2000)


_init_price_map()


# ── 请求模型 ─────────────────────────────────────────────────────

class CreateCheckoutRequest(BaseModel):
    type: str  # "subscription" | "credits"
    plan: str | None = None  # 订阅时: stardust_monthly, resonance_monthly, eternal_yearly
    credits: int | None = None  # 积分购买时: 100, 500, 2000


# ── 工具函数 ─────────────────────────────────────────────────────

def _get_or_create_customer(user: dict, repo: LingUserRepository) -> str:
    """获取或创建 Stripe Customer。"""
    if user.get("stripe_customer_id"):
        return user["stripe_customer_id"]

    customer = stripe.Customer.create(
        email=user.get("email"),
        metadata={"ling_user_id": str(user["id"]), "username": user["username"]},
    )

    repo.update_user(str(user["id"]), stripe_customer_id=customer.id)
    return customer.id


# ── 路由 ─────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)


def create_ling_stripe_router(repo: LingUserRepository) -> APIRouter:
    router = APIRouter(prefix="/api/stripe", tags=["stripe"])

    # ── 创建 Checkout Session ────────────────────────────────

    @router.post("/create-checkout")
    @limiter.limit("10/minute")
    async def create_checkout(
        request: Request,
        req: CreateCheckoutRequest,
        user: dict = Depends(get_current_user),
    ):
        if not stripe.api_key:
            raise HTTPException(500, "Stripe not configured")

        customer_id = _get_or_create_customer(user, repo)

        if req.type == "subscription":
            price_id = PLAN_PRICES.get(req.plan or "")
            if not price_id:
                raise HTTPException(400, f"Invalid plan: {req.plan}")

            session = stripe.checkout.Session.create(
                customer=customer_id,
                mode="subscription",
                line_items=[{"price": price_id, "quantity": 1}],
                success_url=f"{FRONTEND_URL}/?checkout=success",
                cancel_url=f"{FRONTEND_URL}/?checkout=canceled",
                metadata={"ling_user_id": str(user["id"]), "plan": req.plan},
            )

        elif req.type == "credits":
            if req.credits not in CREDIT_PACKAGES:
                raise HTTPException(400, f"Invalid credit pack: {req.credits}")

            amount_cents = CREDIT_PACKAGES[req.credits]

            session = stripe.checkout.Session.create(
                customer=customer_id,
                mode="payment",
                line_items=[{
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": amount_cents,
                        "product_data": {"name": f"Ling Credits x{req.credits}"},
                    },
                    "quantity": 1,
                }],
                success_url=f"{FRONTEND_URL}/?checkout=success&credits={req.credits}",
                cancel_url=f"{FRONTEND_URL}/?checkout=canceled",
                metadata={
                    "ling_user_id": str(user["id"]),
                    "credits": str(req.credits),
                    "type": "credit_purchase",
                },
            )
        else:
            raise HTTPException(400, "type must be 'subscription' or 'credits'")

        return {"checkout_url": session.url}

    # ── Stripe Webhook ───────────────────────────────────────

    @router.post("/webhook")
    async def stripe_webhook(request: Request):
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature", "")

        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, STRIPE_WEBHOOK_SECRET
            )
        except (ValueError, stripe.error.SignatureVerificationError):
            raise HTTPException(400, "Invalid webhook signature")

        event_type = event["type"]
        data = event["data"]["object"]

        logger.info(f"Stripe Webhook: {event_type}")

        try:
            if event_type == "checkout.session.completed":
                _handle_checkout_completed(data, repo)

            elif event_type == "invoice.payment_succeeded":
                _handle_invoice_paid(data, repo)

            elif event_type == "invoice.payment_failed":
                _handle_invoice_failed(data, repo)

            elif event_type == "customer.subscription.updated":
                _handle_subscription_updated(data, repo)

            elif event_type == "customer.subscription.deleted":
                _handle_subscription_deleted(data, repo)

            elif event_type == "charge.refunded":
                _handle_refund(data, repo)

            elif event_type == "charge.dispute.created":
                _handle_dispute(data, repo)

        except Exception as e:
            logger.error(f"处理 Webhook {event_type} 失败: {e}")
            # 返回 200 避免 Stripe 重试
            return {"status": "error", "message": str(e)}

        return {"status": "ok"}

    # ── Customer Portal ──────────────────────────────────────

    @router.get("/portal")
    @limiter.limit("5/minute")
    async def customer_portal(request: Request, user: dict = Depends(get_current_user)):
        if not user.get("stripe_customer_id"):
            raise HTTPException(400, "No Stripe account linked")

        session = stripe.billing_portal.Session.create(
            customer=user["stripe_customer_id"],
            return_url=f"{FRONTEND_URL}/",
        )
        return {"portal_url": session.url}

    return router


# ── Webhook 处理函数 ─────────────────────────────────────────────

def _handle_checkout_completed(session: dict, repo: LingUserRepository):
    metadata = session.get("metadata", {})
    user_id = metadata.get("ling_user_id")
    if not user_id:
        logger.warning("checkout.session.completed: 无 ling_user_id")
        return

    session_id = session.get("id", "")

    # 积分购买
    if metadata.get("type") == "credit_purchase":
        credits = int(metadata.get("credits", 0))
        if credits > 0:
            repo.add_credits(
                user_id, Decimal(str(credits)),
                f"购买 {credits} 积分",
                tx_type="purchase_credit",
                stripe_session_id=session_id,
            )
            logger.info(f"积分到账: {user_id} +{credits}")
        return

    # 订阅激活
    plan_key = metadata.get("plan", "")
    plan_info = {
        "stardust_monthly": ("stardust", 100),
        "resonance_monthly": ("resonance", 500),
        "eternal_yearly": ("eternal", 2000),
    }

    if plan_key in plan_info:
        plan_name, initial_credits = plan_info[plan_key]
        repo.update_user(
            user_id,
            plan=plan_name,
            subscription_status="active",
        )
        repo.add_credits(
            user_id, Decimal(str(initial_credits)),
            f"订阅 {plan_name} 首月积分",
            tx_type="subscription_credit",
            stripe_session_id=session_id,
        )
        logger.info(f"订阅激活: {user_id} → {plan_name}, +{initial_credits} 积分")


def _handle_invoice_paid(invoice: dict, repo: LingUserRepository):
    customer_id = invoice.get("customer")
    if not customer_id:
        return

    # 从 Stripe Customer metadata 获取 user_id
    try:
        customer = stripe.Customer.retrieve(customer_id)
        user_id = customer.get("metadata", {}).get("ling_user_id")
    except Exception:
        return

    if not user_id:
        return

    # 查找 price → plan → credits
    lines = invoice.get("lines", {}).get("data", [])
    for line in lines:
        price_id = line.get("price", {}).get("id")
        if price_id and price_id in PRICE_TO_PLAN:
            plan_name, credits = PRICE_TO_PLAN[price_id]
            invoice_id = invoice.get("id", "")
            repo.add_credits(
                user_id, Decimal(str(credits)),
                f"订阅 {plan_name} 续费积分",
                tx_type="subscription_credit",
                stripe_session_id=invoice_id,
            )
            logger.info(f"续费积分到账: {user_id} +{credits}")
            break


def _handle_invoice_failed(invoice: dict, repo: LingUserRepository):
    customer_id = invoice.get("customer")
    if not customer_id:
        return
    try:
        customer = stripe.Customer.retrieve(customer_id)
        user_id = customer.get("metadata", {}).get("ling_user_id")
    except Exception:
        return
    if user_id:
        repo.update_user(user_id, subscription_status="past_due")
        logger.warning(f"付款失败: {user_id} → past_due")


def _handle_subscription_updated(subscription: dict, repo: LingUserRepository):
    customer_id = subscription.get("customer")
    if not customer_id:
        return
    try:
        customer = stripe.Customer.retrieve(customer_id)
        user_id = customer.get("metadata", {}).get("ling_user_id")
    except Exception:
        return
    if not user_id:
        return

    status = subscription.get("status", "")
    repo.update_user(user_id, subscription_status=status)

    # 检查是否变更了方案
    items = subscription.get("items", {}).get("data", [])
    for item in items:
        price_id = item.get("price", {}).get("id")
        if price_id and price_id in PRICE_TO_PLAN:
            plan_name, _ = PRICE_TO_PLAN[price_id]
            repo.update_user(user_id, plan=plan_name)
            logger.info(f"订阅变更: {user_id} → {plan_name} ({status})")
            break


def _handle_subscription_deleted(subscription: dict, repo: LingUserRepository):
    customer_id = subscription.get("customer")
    if not customer_id:
        return
    try:
        customer = stripe.Customer.retrieve(customer_id)
        user_id = customer.get("metadata", {}).get("ling_user_id")
    except Exception:
        return
    if user_id:
        repo.update_user(user_id, plan="free", subscription_status="canceled")
        logger.info(f"订阅取消: {user_id} → free")


def _handle_refund(charge: dict, repo: LingUserRepository):
    customer_id = charge.get("customer")
    if not customer_id:
        return
    try:
        customer = stripe.Customer.retrieve(customer_id)
        user_id = customer.get("metadata", {}).get("ling_user_id")
    except Exception:
        return
    if user_id:
        # 简化处理：退款时扣减等额积分
        refund_amount = charge.get("amount_refunded", 0)
        if refund_amount > 0:
            credits_to_deduct = refund_amount // 5  # 粗略换算
            if credits_to_deduct > 0:
                repo.deduct_credits(
                    user_id, Decimal(str(credits_to_deduct)),
                    "退款扣减积分",
                    tx_type="admin_adjust",
                )
                logger.info(f"退款扣减: {user_id} -{credits_to_deduct}")


def _handle_dispute(charge: dict, repo: LingUserRepository):
    customer_id = charge.get("customer")
    if not customer_id:
        return
    logger.warning(f"争议: customer={customer_id}, charge={charge.get('id')}")
