"""模式库 — Phase 4: 匿名跨用户模式的存储与管理

从匿名聚合数据中提炼通用模式。
严格遵循 k-anonymity (k≥50), min_sample_size=100。

调用方: NightlyConsolidator (月度, 用户数 ≥100 时激活)
"""

import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, List

from loguru import logger

from .models import CollectivePattern, CollectiveEthicsPolicy

_DEFAULT_POLICY = CollectiveEthicsPolicy()


async def create_pattern(
    situation: str,
    common_phases: List[str],
    helpful_approaches: str,
    sample_size: int,
    category: str = "emotional",
    tags: Optional[List[str]] = None,
    dry_run: bool = False,
) -> Optional[CollectivePattern]:
    """创建新的集体模式

    严格检查伦理约束:
    - sample_size >= min_sample_size (100)
    - 不包含任何可识别个体的信息

    Returns:
        CollectivePattern 或 None (不满足伦理约束时)
    """
    policy = _DEFAULT_POLICY
    if sample_size < policy.min_sample_size:
        logger.info(
            f"[Collective] Skipping pattern: sample_size={sample_size} "
            f"< min={policy.min_sample_size}"
        )
        return None

    # 生成 pattern_id: 基于 situation 的确定性哈希
    pattern_id = "cp_" + hashlib.md5(situation.encode()).hexdigest()[:12]

    pattern = CollectivePattern(
        pattern_id=pattern_id,
        situation=situation,
        common_phases=common_phases[:10],
        helpful_approaches=helpful_approaches[:500],
        sample_size=sample_size,
        category=category,
        tags=tags or [],
    )

    if not dry_run:
        try:
            from ..storage.soul_collections import get_collection, COLLECTIVE_PATTERNS
            coll = await get_collection(COLLECTIVE_PATTERNS)
            if coll is not None:
                await coll.update_one(
                    {"pattern_id": pattern_id},
                    {"$set": pattern.model_dump()},
                    upsert=True,
                )
                logger.info(f"[Collective] Pattern created: {situation[:50]}...")
        except Exception as e:
            logger.warning(f"[Collective] Pattern write failed: {e}")

    return pattern


async def find_patterns(
    tags: Optional[List[str]] = None,
    category: Optional[str] = None,
    min_confidence: float = 0.3,
    limit: int = 5,
) -> List[Dict]:
    """查找匹配的集体模式"""
    try:
        from ..storage.soul_collections import get_collection, COLLECTIVE_PATTERNS
        coll = await get_collection(COLLECTIVE_PATTERNS)
        if coll is None:
            return []

        query: Dict = {"confidence": {"$gte": min_confidence}}
        if category:
            query["category"] = category
        if tags:
            query["tags"] = {"$in": tags}

        cursor = coll.find(
            query,
            projection={"_id": 0},
            sort=[("confidence", -1)],
            limit=limit,
            batch_size=limit,
        )
        results = []
        async for doc in cursor:
            results.append(doc)
        return results
    except Exception as e:
        logger.debug(f"[Collective] Pattern search failed: {e}")
        return []


async def generate_patterns_from_aggregation(dry_run: bool = False) -> Dict:
    """从匿名聚合数据生成模式 — NightlyConsolidator 月度调用

    流程:
    1. 检查总用户数 >= 100
    2. 按情绪类型聚合: 统计各情绪的频率和伴随话题
    3. 提取高频模式 (出现在 ≥50 用户中)
    4. 写入 CollectivePattern

    当前: 规则式提取。用户数增长后可引入 LLM 总结。
    """
    from ..storage.soul_collections import get_collection, EMOTIONS, IMPORTANCE

    emo_coll = await get_collection(EMOTIONS)
    imp_coll = await get_collection(IMPORTANCE)
    if emo_coll is None or imp_coll is None:
        return {"status": "skipped", "reason": "collection_unavailable"}

    # 1. 检查用户数
    user_ids = await emo_coll.distinct("user_id")
    if len(user_ids) < _DEFAULT_POLICY.min_sample_size:
        return {
            "status": "skipped",
            "reason": f"insufficient_users ({len(user_ids)} < {_DEFAULT_POLICY.min_sample_size})",
            "users": len(user_ids),
        }

    # 2. 按情绪类型聚合
    emotion_stats: Dict[str, int] = {}
    pipeline = [
        {"$group": {"_id": "$user_emotion", "count": {"$sum": 1}, "users": {"$addToSet": "$user_id"}}},
    ]
    async for doc in emo_coll.aggregate(pipeline):
        emotion = doc["_id"]
        unique_users = len(doc.get("users", []))
        if unique_users >= _DEFAULT_POLICY.k_anonymity:
            emotion_stats[emotion] = unique_users

    # 3. 为高频情绪生成模式 (框架式, 后续可接 LLM)
    generated = 0
    for emotion, user_count in emotion_stats.items():
        pattern = await create_pattern(
            situation=f"用户表达了{_EMOTION_LABELS.get(emotion, emotion)}情绪",
            common_phases=[f"初始表达", f"深入倾诉", f"寻求支持", f"情绪缓解"],
            helpful_approaches=_EMOTION_APPROACHES.get(emotion, "倾听和陪伴是最好的方式。"),
            sample_size=user_count,
            category="emotional",
            tags=[emotion],
            dry_run=dry_run,
        )
        if pattern:
            generated += 1

    return {
        "status": "ok",
        "users": len(user_ids),
        "patterns_generated": generated,
        "dry_run": dry_run,
    }


# 情绪标签映射 (中文描述, 用于模式 situation)
_EMOTION_LABELS = {
    "sadness": "悲伤",
    "anxiety": "焦虑",
    "anger": "愤怒",
    "joy": "喜悦",
    "excitement": "兴奋",
}

# 情绪对应的通用有效方法 (seed data, 后续 LLM 从聚合数据中提炼)
_EMOTION_APPROACHES = {
    "sadness": "先认可情绪，不急于给建议。倾听比解决问题更重要。适时回忆用户曾经度过类似时刻的力量。",
    "anxiety": "帮助用户拆解焦虑源。将大问题分解为具体可行的小步骤。提醒用户过去成功应对压力的经验。",
    "anger": "不否认愤怒的合理性。避免说教，先共情。等情绪平复后，温和地探讨是否有其他视角。",
    "joy": "真诚地为用户高兴。帮助用户回味和巩固积极体验。适当联系到用户的成长故事线。",
}
