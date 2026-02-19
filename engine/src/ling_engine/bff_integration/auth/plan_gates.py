"""
灵功能门控

根据用户角色和订阅方案控制功能访问。
owner/admin 跳过所有限制。
"""

import os
import time
from typing import Optional

from loguru import logger

# ── 方案配置 ─────────────────────────────────────────────────────

PLAN_FEATURES: dict[str, dict] = {
    "free": {
        "daily_messages": 20,
        "voice": False,
        "mcp_basic": False,
        "mcp_full": False,
        "custom_character": False,
        "api_access": False,
    },
    "stardust": {
        "daily_messages": 100,
        "voice": True,
        "mcp_basic": True,
        "mcp_full": False,
        "custom_character": False,
        "api_access": False,
    },
    "resonance": {
        "daily_messages": -1,  # 无限
        "voice": True,
        "mcp_basic": True,
        "mcp_full": True,
        "custom_character": False,
        "api_access": False,
    },
    "eternal": {
        "daily_messages": -1,
        "voice": True,
        "mcp_basic": True,
        "mcp_full": True,
        "custom_character": True,
        "api_access": True,
    },
}

# ── 内存计数器（后续可迁移到 Redis） ────────────────────────────

_daily_counters: dict[str, tuple[str, int]] = {}  # user_id -> (date_str, count)


def _today() -> str:
    import datetime
    return datetime.date.today().isoformat()


def _get_daily_count(user_id: str) -> int:
    entry = _daily_counters.get(user_id)
    if not entry or entry[0] != _today():
        return 0
    return entry[1]


def _increment_daily_count(user_id: str) -> int:
    today = _today()
    entry = _daily_counters.get(user_id)
    if not entry or entry[0] != today:
        _daily_counters[user_id] = (today, 1)
        return 1
    new_count = entry[1] + 1
    _daily_counters[user_id] = (today, new_count)
    return new_count


# ── 核心检查函数 ─────────────────────────────────────────────────

def is_privileged(user: dict) -> bool:
    """owner 和 admin 角色跳过所有限制。"""
    return user.get("role") in ("owner", "admin")


def check_feature(user: dict, feature: str) -> bool:
    """检查用户是否有权使用某功能。"""
    if is_privileged(user):
        return True
    plan = user.get("plan", "free")
    return PLAN_FEATURES.get(plan, PLAN_FEATURES["free"]).get(feature, False)


def check_daily_messages(user_id: str, user: dict) -> tuple[bool, int, int]:
    """检查每日消息上限。

    Returns:
        (allowed, current_count, daily_limit)
        daily_limit = -1 表示无限制
    """
    if is_privileged(user):
        return True, 0, -1

    plan = user.get("plan", "free")
    limit = PLAN_FEATURES.get(plan, PLAN_FEATURES["free"])["daily_messages"]
    if limit == -1:
        return True, 0, -1

    current = _get_daily_count(user_id)
    if current >= limit:
        return False, current, limit

    return True, current, limit


def record_message_sent(user_id: str) -> int:
    """记录一条消息已发送，返回今日已发送数。"""
    return _increment_daily_count(user_id)


def should_deduct_credits(user: dict) -> bool:
    """判断是否应该扣减积分。

    owner/admin 和 free 用户不扣积分。
    """
    if is_privileged(user):
        return False
    if user.get("plan", "free") == "free":
        return False
    return True


def get_plan_limits(user: dict) -> dict:
    """获取用户的方案限制信息（发送给前端用于 UI 控制）。"""
    if is_privileged(user):
        return {
            "plan": user.get("plan", "eternal"),
            "role": user.get("role"),
            "daily_messages": -1,
            "voice": True,
            "mcp_basic": True,
            "mcp_full": True,
            "custom_character": True,
            "api_access": True,
            "credits_balance": float(user.get("credits_balance", 0)),
        }

    plan = user.get("plan", "free")
    features = PLAN_FEATURES.get(plan, PLAN_FEATURES["free"])
    return {
        "plan": plan,
        "role": user.get("role", "user"),
        **features,
        "credits_balance": float(user.get("credits_balance", 0)),
    }
