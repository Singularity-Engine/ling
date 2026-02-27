"""
灵功能门控

根据用户角色和订阅方案控制功能访问。
owner/admin 跳过所有限制。

支持:
- 每日消息限额
- per-tool 配额 (web_search, image_gen, long_write, voice_minutes)
- 积分系统 (高消耗操作用积分)
- 记忆深度分层
"""

import datetime
import os
import time
from decimal import Decimal
from typing import Optional

from loguru import logger

# ── 方案配置 ─────────────────────────────────────────────────────

PLAN_FEATURES: dict[str, dict] = {
    "free": {
        "daily_messages": 50,
        "voice": True,
        "voice_minutes_daily": 10,
        "mcp_basic": True,
        "mcp_full": False,
        "custom_character": False,
        "desktop_pet": False,
        "api_access": False,
        "memory_days": 7,
        "ai_model": "sonnet",
        "monthly_credits": 10,
    },
    "stardust": {
        "daily_messages": 500,
        "voice": True,
        "voice_minutes_daily": 120,
        "mcp_basic": True,
        "mcp_full": False,
        "custom_character": True,  # basic
        "desktop_pet": False,
        "api_access": False,
        "memory_days": 90,
        "ai_model": "sonnet",
        "monthly_credits": 100,
    },
    "resonance": {
        "daily_messages": -1,  # unlimited
        "voice": True,
        "voice_minutes_daily": -1,  # unlimited
        "mcp_basic": True,
        "mcp_full": True,
        "custom_character": True,
        "desktop_pet": True,
        "api_access": False,
        "memory_days": -1,  # permanent
        "ai_model": "opus",
        "monthly_credits": 500,
    },
    "eternal": {
        "daily_messages": -1,
        "voice": True,
        "voice_minutes_daily": -1,
        "mcp_basic": True,
        "mcp_full": True,
        "custom_character": True,
        "desktop_pet": True,
        "api_access": True,
        "memory_days": -1,
        "ai_model": "opus",
        "monthly_credits": 500,
    },
}

# ── per-tool 每日配额 ───────────────────────────────────────────

TOOL_QUOTAS: dict[str, dict[str, int]] = {
    "free": {
        "web_search": 10,
        "image_gen": 3,
        "long_write": 2,
    },
    "stardust": {
        "web_search": -1,  # unlimited
        "image_gen": 30,
        "long_write": 20,
    },
    "resonance": {
        "web_search": -1,
        "image_gen": -1,
        "long_write": -1,
    },
    "eternal": {
        "web_search": -1,
        "image_gen": -1,
        "long_write": -1,
    },
}

# ── 积分消耗表 ──────────────────────────────────────────────────

CREDIT_COSTS: dict[str, int] = {
    "image_gen": 5,       # DALL-E image generation
    "long_write": 3,      # >500 character writing
    "voice_minute": 1,    # per minute of TTS
    "code_exec": 2,       # claude_code execution
}

# ── Redis-backed counters with in-memory fallback ────────────────

_daily_counters: dict[str, tuple[str, int]] = {}  # fallback: user_id -> (date_str, count)
_tool_counters: dict[str, dict[str, tuple[str, int]]] = {}  # fallback: user_id -> {tool -> (date_str, count)}

_DAY_SECONDS = 86400


def _today() -> str:
    return datetime.date.today().isoformat()


def _get_redis():
    """Try to get RedisManager; return None if unavailable."""
    try:
        from ...database.pgsql.database_manager import get_redis_manager
        rds = get_redis_manager()
        rds.client.ping()
        return rds
    except Exception:
        return None


def _get_daily_count(user_id: str) -> int:
    rds = _get_redis()
    if rds:
        try:
            key = f"ling:gates:daily:{user_id}:{_today()}"
            val = rds.client.get(key)
            return int(val) if val else 0
        except Exception:
            pass
    # fallback
    entry = _daily_counters.get(user_id)
    if not entry or entry[0] != _today():
        return 0
    return entry[1]


def _increment_daily_count(user_id: str) -> int:
    rds = _get_redis()
    if rds:
        try:
            key = f"ling:gates:daily:{user_id}:{_today()}"
            new_val = rds.client.incr(key)
            rds.client.expire(key, _DAY_SECONDS)
            return int(new_val)
        except Exception:
            pass
    # fallback
    today = _today()
    entry = _daily_counters.get(user_id)
    if not entry or entry[0] != today:
        _daily_counters[user_id] = (today, 1)
        return 1
    new_count = entry[1] + 1
    _daily_counters[user_id] = (today, new_count)
    return new_count


def _get_tool_count(user_id: str, tool: str) -> int:
    rds = _get_redis()
    if rds:
        try:
            key = f"ling:gates:tool:{user_id}:{tool}:{_today()}"
            val = rds.client.get(key)
            return int(val) if val else 0
        except Exception:
            pass
    # fallback
    user_tools = _tool_counters.get(user_id, {})
    entry = user_tools.get(tool)
    if not entry or entry[0] != _today():
        return 0
    return entry[1]


def _increment_tool_count(user_id: str, tool: str) -> int:
    rds = _get_redis()
    if rds:
        try:
            key = f"ling:gates:tool:{user_id}:{tool}:{_today()}"
            new_val = rds.client.incr(key)
            rds.client.expire(key, _DAY_SECONDS)
            return int(new_val)
        except Exception:
            pass
    # fallback
    today = _today()
    if user_id not in _tool_counters:
        _tool_counters[user_id] = {}
    entry = _tool_counters[user_id].get(tool)
    if not entry or entry[0] != today:
        _tool_counters[user_id][tool] = (today, 1)
        return 1
    new_count = entry[1] + 1
    _tool_counters[user_id][tool] = (today, new_count)
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
    """检查每日消息上限（仅读取，不递增）。

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


def check_and_record_daily_message(user_id: str, user: dict) -> tuple[bool, int, int]:
    """原子性检查并递增每日消息计数，防止并发竞态。

    先 INCR 再判断是否超限。超限时计数器多 1 不影响（当日过期）。

    Returns:
        (allowed, new_count, daily_limit)
    """
    if is_privileged(user):
        return True, 0, -1

    plan = user.get("plan", "free")
    limit = PLAN_FEATURES.get(plan, PLAN_FEATURES["free"])["daily_messages"]
    if limit == -1:
        return True, 0, -1

    new_count = _increment_daily_count(user_id)
    if new_count > limit:
        return False, new_count, limit

    return True, new_count, limit


def record_message_sent(user_id: str) -> int:
    """记录一条消息已发送，返回今日已发送数。"""
    return _increment_daily_count(user_id)


def check_tool_quota(user_id: str, user: dict, tool: str) -> tuple[bool, int, int]:
    """检查特定工具的每日配额。

    Returns:
        (allowed, current_count, daily_limit)
        daily_limit = -1 表示无限制
    """
    if is_privileged(user):
        return True, 0, -1

    plan = user.get("plan", "free")
    quotas = TOOL_QUOTAS.get(plan, TOOL_QUOTAS["free"])
    limit = quotas.get(tool, -1)  # default: unlimited if tool not in quota table

    if limit == -1:
        return True, 0, -1

    current = _get_tool_count(user_id, tool)
    if current >= limit:
        return False, current, limit

    return True, current, limit


def record_tool_usage(user_id: str, tool: str) -> int:
    """记录一次工具使用，返回今日已使用次数。"""
    return _increment_tool_count(user_id, tool)


def get_credit_cost(tool: str) -> int:
    """获取工具的积分消耗量。返回 0 表示不消耗积分。"""
    return CREDIT_COSTS.get(tool, 0)


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
            "voice_minutes_daily": -1,
            "mcp_basic": True,
            "mcp_full": True,
            "custom_character": True,
            "desktop_pet": True,
            "api_access": True,
            "memory_days": -1,
            "ai_model": "opus",
            "monthly_credits": -1,
            "credits_balance": float(user.get("credits_balance", 0)),
            "tool_quotas": {},
        }

    plan = user.get("plan", "free")
    features = PLAN_FEATURES.get(plan, PLAN_FEATURES["free"])
    quotas = TOOL_QUOTAS.get(plan, TOOL_QUOTAS["free"])
    return {
        "plan": plan,
        "role": user.get("role", "user"),
        **features,
        "credits_balance": float(user.get("credits_balance", 0)),
        "tool_quotas": quotas,
    }
