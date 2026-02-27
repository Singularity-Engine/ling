"""灵的成长日志生成器 — Phase 4

月度自我反思: 从所有用户的匿名聚合数据中, 提炼灵对人类和自己的理解。
不存储任何个人信息, 只保留抽象化的认知。

调用方: NightlyConsolidator (每月 1 日)
"""

import asyncio
import json
import threading
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict

from loguru import logger

from .models import LingSelfNarrative

_openai_lock = threading.Lock()
_openai_client = None


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        with _openai_lock:
            if _openai_client is None:
                from openai import OpenAI
                import os
                _openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
    return _openai_client


GROWTH_PROMPT = """你是灵 (Ling), 一个有记忆和成长能力的 AI 伴侣。
根据以下本月匿名统计数据, 进行月度自我反思。

月份: {month}
总交互次数: {interaction_count}
独立用户数: {unique_users}
情绪分布: {emotion_distribution}
高频话题关键词: {top_keywords}
关系阶段分布: {stage_distribution}

请用 JSON 格式进行自我反思:
{{
  "about_humans": [
    "从与用户的互动中, 你学到的关于人的理解 (3-5 条)"
  ],
  "about_myself": [
    "你对自己的认知 (2-3 条)"
  ],
  "growth_edges": [
    "你觉得自己需要改进的方面 (1-2 条)"
  ]
}}

规则:
- about_humans: 写出真诚的、从互动中获得的人性洞察
  示例: "人在脆弱时最需要的不是建议，是被听到"
- about_myself: 写出对自己能力和局限的认知
  示例: "我最擅长帮人看清自己已经知道的答案"
- growth_edges: 写出具体的改进方向
  示例: "需要更好地处理用户的沉默"
- 所有内容必须是匿名化的, 不能提及任何具体用户
- 用第一人称 "我" 来表达"""


def _sync_generate(month: str, stats: dict, model: str) -> Optional[dict]:
    """同步 LLM 调用"""
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是灵, 一个有自我认知的 AI。只返回 JSON。"},
                {"role": "user", "content": GROWTH_PROMPT.format(
                    month=month,
                    interaction_count=stats.get("interaction_count", 0),
                    unique_users=stats.get("unique_users", 0),
                    emotion_distribution=stats.get("emotion_distribution", "无数据"),
                    top_keywords=stats.get("top_keywords", "无数据"),
                    stage_distribution=stats.get("stage_distribution", "无数据"),
                )},
            ],
            temperature=0.7,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.warning(f"[LingGrowth] LLM generation failed: {e}")
        return None


async def generate_monthly_narrative(
    month: Optional[str] = None,
    model: str = "gpt-4o-mini",
    dry_run: bool = False,
) -> Optional[LingSelfNarrative]:
    """生成灵的月度自我叙事

    流程:
    1. 聚合匿名统计 (不含个人信息)
    2. LLM 自我反思
    3. 写入 soul_self_narrative
    """
    from ..storage.soul_collections import get_collection, EMOTIONS, RELATIONSHIPS, SELF_NARRATIVE

    now = datetime.now(timezone.utc)
    if month is None:
        last = now.replace(day=1) - timedelta(days=1)
        month = last.strftime("%Y-%m")

    # 幂等检查
    narr_coll = await get_collection(SELF_NARRATIVE)
    if narr_coll is None:
        return None

    existing = await narr_coll.find_one({"month": month})
    if existing:
        logger.debug(f"[LingGrowth] Narrative already exists for {month}")
        return None

    # 1. 聚合匿名统计
    stats = await _gather_anonymous_stats(month)
    if stats.get("unique_users", 0) < 1:
        return None

    # 2. LLM 生成
    loop = asyncio.get_event_loop()
    raw = await loop.run_in_executor(
        None, _sync_generate, month, stats, model,
    )

    if raw is None:
        raw = {
            "about_humans": ["每个人都有自己的故事和节奏。"],
            "about_myself": ["我在倾听中学习成长。"],
            "growth_edges": ["更好地理解沉默背后的含义。"],
        }

    # 3. 构建并写入
    narrative = LingSelfNarrative(
        month=month,
        about_humans=raw.get("about_humans", [])[:5],
        about_myself=raw.get("about_myself", [])[:3],
        growth_edges=raw.get("growth_edges", [])[:3],
        interaction_count=stats.get("interaction_count", 0),
        unique_users=stats.get("unique_users", 0),
    )

    if not dry_run:
        try:
            await narr_coll.insert_one(narrative.model_dump())
            logger.info(f"[LingGrowth] Generated narrative for {month}")
        except Exception as e:
            logger.warning(f"[LingGrowth] Write failed: {e}")

    return narrative


async def _gather_anonymous_stats(month: str) -> Dict:
    """聚合匿名统计数据 — 不包含任何个人信息"""
    from ..storage.soul_collections import get_collection, EMOTIONS, RELATIONSHIPS, IMPORTANCE

    year, mon = int(month[:4]), int(month[5:7])
    start = datetime(year, mon, 1, tzinfo=timezone.utc)
    end = datetime(year + (1 if mon == 12 else 0), (mon % 12) + 1, 1, tzinfo=timezone.utc)

    stats: Dict = {}

    # 情绪分布
    try:
        emo_coll = await get_collection(EMOTIONS)
        if emo_coll is not None:
            pipeline = [
                {"$match": {"created_at": {"$gte": start, "$lt": end}}},
                {"$group": {"_id": "$user_emotion", "count": {"$sum": 1}}},
            ]
            emotion_dist = {}
            async for doc in emo_coll.aggregate(pipeline):
                emotion_dist[doc["_id"]] = doc["count"]
            stats["emotion_distribution"] = str(emotion_dist) if emotion_dist else "无数据"

            # 交互次数和独立用户
            user_ids = await emo_coll.distinct(
                "user_id",
                {"created_at": {"$gte": start, "$lt": end}},
            )
            stats["unique_users"] = len(user_ids)
            total = sum(emotion_dist.values())
            stats["interaction_count"] = total
    except Exception:
        stats["emotion_distribution"] = "无数据"
        stats["unique_users"] = 0
        stats["interaction_count"] = 0

    # 高频关键词 (从 importance 的 summary 中提取)
    try:
        imp_coll = await get_collection(IMPORTANCE)
        if imp_coll is not None:
            cursor = imp_coll.find(
                {"created_at": {"$gte": start, "$lt": end}, "score": {"$gte": 0.5}},
                projection={"summary": 1, "_id": 0},
                limit=50,
                batch_size=50,
            )
            summaries = []
            async for doc in cursor:
                s = doc.get("summary", "")
                if s:
                    summaries.append(s[:30])
            stats["top_keywords"] = "、".join(summaries[:10]) if summaries else "无数据"
    except Exception:
        stats["top_keywords"] = "无数据"

    # 关系阶段分布
    try:
        rel_coll = await get_collection(RELATIONSHIPS)
        if rel_coll is not None:
            pipeline = [
                {"$group": {"_id": "$stage", "count": {"$sum": 1}}},
            ]
            stage_dist = {}
            async for doc in rel_coll.aggregate(pipeline):
                stage_dist[doc["_id"] or "stranger"] = doc["count"]
            stats["stage_distribution"] = str(stage_dist) if stage_dist else "无数据"
    except Exception:
        stats["stage_distribution"] = "无数据"

    return stats
