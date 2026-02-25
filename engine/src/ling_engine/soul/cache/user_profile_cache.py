"""
用户画像热缓存 — LRU + TTL + maxsize
P0: OrderedDict LRU 淘汰策略, 防止无限增长
"""

import time
from collections import OrderedDict
from typing import Optional, List, Dict, Any
from loguru import logger

from ..utils.async_tasks import create_logged_task

_cache: OrderedDict = OrderedDict()  # LRU: 最近使用的在末尾
_TTL = 3600  # 1 hour
_MAX_CACHE_SIZE = 1000  # 最多缓存 1000 个用户画像
_last_refresh: Dict[str, float] = {}


def _cache_set(user_id: str, data: str):
    """LRU 写入: 超限时淘汰最久未使用的"""
    if user_id in _cache:
        _cache.move_to_end(user_id)
    _cache[user_id] = {"data": data, "ts": time.monotonic()}
    _last_refresh[user_id] = time.monotonic()
    while len(_cache) > _MAX_CACHE_SIZE:
        evicted_uid, _ = _cache.popitem(last=False)  # 淘汰最旧
        _last_refresh.pop(evicted_uid, None)


def _cache_get(user_id: str) -> Optional[str]:
    """LRU 读取: 命中则移到末尾"""
    entry = _cache.get(user_id)
    if entry and (time.monotonic() - entry["ts"]) < _TTL:
        _cache.move_to_end(user_id)
        return entry["data"]
    return None


async def get_user_profile(user_id: str, timeout: float = 2.0) -> Optional[str]:
    """获取用户画像 (先查缓存, miss 则从 EverMemOS 拉取)"""
    # 查缓存
    cached = _cache_get(user_id)
    if cached is not None:
        return cached

    # 从 EverMemOS 拉取
    try:
        from ...tools.evermemos_client import fetch_user_profile
        profile = await fetch_user_profile(user_id=user_id, timeout=timeout)
        if profile:
            content = profile.get("content", "") if isinstance(profile, dict) else str(profile)
            _cache_set(user_id, content)
            return content
    except Exception as e:
        logger.debug(f"[Soul] Profile cache miss for {user_id}: {e}")

    # 过期缓存兜底
    entry = _cache.get(user_id)
    return entry["data"] if entry else None


async def warmup(recent_user_ids: List[str]):
    """服务启动时预加载最近活跃用户的画像"""
    for uid in recent_user_ids[:20]:
        create_logged_task(get_user_profile(uid), "profile_cache_warmup")
    logger.info(f"[Soul] Profile cache warming up for {len(recent_user_ids[:20])} users")


def reset_user_profile_cache_for_testing():
    """测试辅助: 清空画像缓存。"""
    _cache.clear()
    _last_refresh.clear()


def invalidate(user_id: str):
    """手动失效缓存"""
    _cache.pop(user_id, None)


async def refresh_all_profiles() -> Dict[str, Any]:
    """v3: 夜间整理时刷新所有活跃用户的画像缓存

    遍历 soul_relationships 中所有用户, 重新从 EverMemOS 拉取画像。
    Returns:
        {"refreshed": int, "failed": int}
    """
    from ..storage.soul_collections import get_collection, RELATIONSHIPS

    coll = await get_collection(RELATIONSHIPS)
    if coll is None:
        return {"status": "skipped", "reason": "collection_unavailable"}

    user_ids = await coll.distinct("user_id")
    refreshed = 0
    failed = 0

    for uid in user_ids:
        try:
            invalidate(uid)
            profile = await get_user_profile(uid, timeout=3.0)
            if profile:
                refreshed += 1
            else:
                failed += 1
        except Exception:
            failed += 1

    logger.info(f"[Soul] Profile refresh: {refreshed} ok, {failed} failed")
    return {"status": "ok", "refreshed": refreshed, "failed": failed}
