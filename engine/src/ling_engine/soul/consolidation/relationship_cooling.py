"""关系冷却 — 分阶段冷却规则 (v3 设计文档 §3.3)

v3 冷却规则:
  soulmate: 60天不互动 → 降级到 close
  close:    30天不互动 → 降级到 familiar
  familiar: 14天不互动 → 降级到 acquaintance

每个阶段有独立的不活跃天数阈值和降级目标。
批处理: NightlyConsolidator 每日调用, 检查所有用户。
实时路径: soul_recall._fetch_relationship() 也调用 check_stage_cooling()。
幂等: last_cooling_date 防止同一天重复处理。
"""

import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Tuple

from loguru import logger


# 分阶段冷却规则: {stage: (inactive_days, cooldown_to)}
COOLING_RULES = {
    "soulmate": (60, "close"),
    "close": (30, "familiar"),
    "familiar": (14, "acquaintance"),
}

# 兼容旧导入 (soul_recall.py 引用)
COOLING_DAYS = 14
COOLING_DECAY_RATE = 0.10


def check_stage_cooling(
    stage: str,
    days_since_interaction: int,
) -> Optional[Tuple[str, int]]:
    """检查是否需要阶段降级

    Args:
        stage: 当前关系阶段
        days_since_interaction: 距离上次互动的天数

    Returns:
        (new_stage, inactive_days_threshold) 如需降级, 否则 None
    """
    rule = COOLING_RULES.get(stage)
    if not rule:
        return None
    inactive_days, cooldown_to = rule
    if days_since_interaction >= inactive_days:
        return cooldown_to, inactive_days
    return None


async def batch_cooling_check(dry_run: bool = False) -> Dict:
    """批量关系冷却检查 — 分阶段降级

    遍历所有关系记录, 根据阶段和不活跃天数执行降级。
    同时执行 10% 分数衰减 (平滑过渡, 避免降级后立刻回升)。

    避免与 soul_recall 实时冷却竞态:
    - 处理后设 last_cooling_date 为今天, 同一天不重复处理
    """
    from ..storage.soul_collections import get_collection, RELATIONSHIPS
    from ..config import get_soul_config

    coll = await get_collection(RELATIONSHIPS)
    if coll is None:
        return {"status": "skipped", "reason": "collection_unavailable"}

    start = time.monotonic()
    batch_size = get_soul_config().consolidation_batch_size
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")

    # 最短冷却阈值 (familiar: 14天), 只查超过此阈值的
    min_cutoff = now - timedelta(days=COOLING_DAYS)

    query = {
        "last_interaction": {"$lt": min_cutoff},
        "last_cooling_date": {"$ne": today_str},
    }

    processed = 0
    demoted = 0
    cursor = coll.find(query, batch_size=batch_size)
    async for doc in cursor:
        last_interaction = doc.get("last_interaction")
        if not last_interaction:
            continue
        if isinstance(last_interaction, str):
            last_interaction = datetime.fromisoformat(last_interaction)

        days_since = (now - last_interaction).days
        old_score = doc.get("accumulated_score", 0)
        stage = doc.get("stage", "stranger")

        # 检查是否需要阶段降级
        cooling_result = check_stage_cooling(stage, days_since)
        update_fields = {"last_cooling_date": today_str}

        if cooling_result:
            new_stage, _ = cooling_result
            update_fields["stage"] = new_stage
            update_fields["stage_entered_at"] = now
            demoted += 1

        # 分数衰减 (无论是否降级, 长期不互动都衰减)
        if old_score > 0:
            decay = old_score * COOLING_DECAY_RATE
            update_fields["accumulated_score"] = max(0, old_score - decay)

        if not dry_run:
            await coll.update_one(
                {"_id": doc["_id"]},
                {"$set": update_fields},
            )
        processed += 1

    elapsed_ms = int((time.monotonic() - start) * 1000)
    return {
        "status": "ok",
        "processed": processed,
        "demoted": demoted,
        "elapsed_ms": elapsed_ms,
        "dry_run": dry_run,
    }
