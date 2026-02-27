"""
灵公开 API 路由（无需认证）

GET /api/public/dashboard — 公开 Dashboard 数据
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Request
from loguru import logger

from ..auth.rate_limit import limiter
from ..database.ling_user_repository import LingUserRepository


def create_ling_public_router(repo: LingUserRepository) -> APIRouter:
    router = APIRouter(prefix="/api/public", tags=["public"])

    @router.get("/dashboard")
    @limiter.limit("60/minute")
    async def get_dashboard(request: Request):
        """公开 Dashboard — 任何人都能查看灵的运营状态。"""
        try:
            stats = repo.get_stats()
            return {
                "experiment": {
                    "total_users": stats.get("total_users", 0),
                    "active_today": stats.get("active_today", 0),
                    "new_today": stats.get("new_today", 0),
                    "paid_users": stats.get("paid_users", 0),
                },
                "health": {
                    "uptime_hours": _uptime_hours(),
                    "status": "running",
                },
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.error(f"Dashboard 数据获取失败: {e}")
            return {
                "experiment": {
                    "total_users": 0,
                    "active_today": 0,
                    "new_today": 0,
                    "paid_users": 0,
                },
                "health": {
                    "uptime_hours": _uptime_hours(),
                    "status": "degraded",
                },
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

    return router


# ── 启动时间记录 ────────────────────────────────────────────────
_start_time = datetime.now(timezone.utc)


def _uptime_hours() -> int:
    delta = datetime.now(timezone.utc) - _start_time
    return int(delta.total_seconds() // 3600)
