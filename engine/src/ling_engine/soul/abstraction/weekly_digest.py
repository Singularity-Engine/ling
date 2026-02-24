"""WeeklyDigest 生成器 — Phase 3b-beta

从当周 soul_importance + soul_emotions 记录压缩生成周摘要。
单次 LLM 调用 + Pydantic 结构化输出。

调用方: NightlyConsolidator (周日夜间)
"""

import asyncio
import json
import threading
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List

from loguru import logger

from .models import WeeklyDigest

# OpenAI client 单例 — 复用 merged_extractor 的模式
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


DIGEST_PROMPT = """你是灵的记忆整理系统。根据以下本周对话记录，生成一份周摘要。

用户 ID: {user_id}
周期: {week_start} 至 {week_end}

本周重要事件 (按重要度排序):
{importance_items}

本周情绪记录:
{emotion_items}

请用 JSON 格式返回:
{{
  "summary": "一两句话概括本周的主要话题和经历",
  "dominant_emotion": "joy|sadness|anxiety|excitement|anger|neutral",
  "emotion_trend": "rising|falling|stable",
  "key_events": ["事件1", "事件2", "事件3"],
  "emotional_peak": "本周情感最高峰的描述 (如果有)",
  "story_thread_updates": ["故事线进展1", "故事线进展2"]
}}

规则:
- summary 用第三人称描述 ("用户本周...")
- key_events 最多 5 个，每个不超过 20 字
- emotional_peak 如果本周没有明显情感高峰可以为 null
- story_thread_updates 只包含有实际进展的故事线
- 不要包含任何敏感的健康/财务细节，只用概括性描述"""


def _sync_generate(user_id: str, week_start: str, week_end: str,
                   importance_items: str, emotion_items: str,
                   model: str) -> Optional[dict]:
    """同步 LLM 调用 — 在线程池中执行"""
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是一个 JSON 结构化数据生成器。只返回 JSON，不要其他内容。"},
                {"role": "user", "content": DIGEST_PROMPT.format(
                    user_id=user_id[:8] + "...",
                    week_start=week_start,
                    week_end=week_end,
                    importance_items=importance_items[:2000],
                    emotion_items=emotion_items[:1000],
                )},
            ],
            temperature=0.3,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.warning(f"[WeeklyDigest] LLM generation failed: {e}")
        return None


async def generate_weekly_digest(
    user_id: str,
    week_start: Optional[datetime] = None,
    model: str = "gpt-4o-mini",
    dry_run: bool = False,
) -> Optional[WeeklyDigest]:
    """为单个用户生成本周摘要

    Args:
        user_id: 用户 ID
        week_start: 周一日期 (默认: 上周一)
        model: LLM 模型
        dry_run: 仅生成不写入

    Returns:
        WeeklyDigest 或 None (数据不足时)
    """
    from ..storage.soul_collections import get_collection, IMPORTANCE, EMOTIONS, WEEKLY_DIGESTS

    now = datetime.now(timezone.utc)
    if week_start is None:
        # 默认: 上周一 (0:00 UTC)
        days_since_monday = now.weekday()  # 0=Mon
        this_monday = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_since_monday)
        week_start = this_monday - timedelta(days=7)

    week_end = week_start + timedelta(days=7)

    # 1. 查询本周 importance 记录
    imp_coll = await get_collection(IMPORTANCE)
    if imp_coll is None:
        return None

    imp_cursor = imp_coll.find(
        {
            "user_id": user_id,
            "created_at": {"$gte": week_start, "$lt": week_end},
            "decayed": {"$ne": True},
        },
        sort=[("score", -1)],
        limit=15,
        batch_size=15,
    )
    importance_docs = []
    async for doc in imp_cursor:
        importance_docs.append(doc)

    # 2. 查询本周 emotions 记录
    emo_coll = await get_collection(EMOTIONS)
    emotion_docs = []
    if emo_coll is not None:
        emo_cursor = emo_coll.find(
            {
                "user_id": user_id,
                "created_at": {"$gte": week_start, "$lt": week_end},
            },
            sort=[("emotion_intensity", -1)],
            limit=20,
            batch_size=20,
        )
        async for doc in emo_cursor:
            emotion_docs.append(doc)

    # 3. 数据不足 → 跳过 (至少需要 2 条 importance 记录)
    if len(importance_docs) < 2:
        logger.debug(f"[WeeklyDigest] Skipping {user_id[:8]}...: insufficient data ({len(importance_docs)} records)")
        return None

    # 4. 检查是否已存在 (幂等)
    digest_coll = await get_collection(WEEKLY_DIGESTS)
    if digest_coll is None:
        return None

    existing = await digest_coll.find_one({
        "user_id": user_id,
        "week_start": week_start,
    })
    if existing:
        logger.debug(f"[WeeklyDigest] Already exists for {user_id[:8]}... week={week_start.date()}")
        return None

    # 5. 构建 LLM 输入
    importance_lines = []
    for doc in importance_docs[:10]:
        summary = doc.get("summary", "")[:80]
        score = doc.get("score", 0)
        importance_lines.append(f"- [{score:.1f}] {summary}")
    importance_text = "\n".join(importance_lines) if importance_lines else "(无重要事件)"

    emotion_lines = []
    for doc in emotion_docs[:10]:
        emo = doc.get("user_emotion", "neutral")
        intensity = doc.get("emotion_intensity", 0)
        is_peak = doc.get("is_emotional_peak", False)
        peak_tag = " ⭐" if is_peak else ""
        emotion_lines.append(f"- {emo} ({intensity:.1f}){peak_tag}")
    emotion_text = "\n".join(emotion_lines) if emotion_lines else "(无明显情绪波动)"

    # 6. LLM 生成
    loop = asyncio.get_event_loop()
    raw = await loop.run_in_executor(
        None, _sync_generate,
        user_id, str(week_start.date()), str(week_end.date()),
        importance_text, emotion_text, model,
    )

    if raw is None:
        # 降级: 规则式摘要
        raw = _rule_based_fallback(importance_docs, emotion_docs)

    # 7. 构建 WeeklyDigest
    digest = WeeklyDigest(
        user_id=user_id,
        week_start=week_start,
        summary=raw.get("summary", "")[:200],
        dominant_emotion=raw.get("dominant_emotion", "neutral"),
        emotion_trend=raw.get("emotion_trend", "stable"),
        key_events=raw.get("key_events", [])[:5],
        emotional_peak=raw.get("emotional_peak"),
        story_thread_updates=raw.get("story_thread_updates", [])[:3],
        source="llm_generated",
    )

    # 8. 写入
    if not dry_run:
        try:
            await digest_coll.insert_one(digest.model_dump())
            logger.info(f"[WeeklyDigest] Generated for {user_id[:8]}... week={week_start.date()}")
        except Exception as e:
            logger.warning(f"[WeeklyDigest] Write failed: {e}")

    return digest


def _rule_based_fallback(importance_docs: list, emotion_docs: list) -> dict:
    """LLM 失败时的规则式降级"""
    # 取 top-3 事件作为 key_events
    key_events = []
    for doc in importance_docs[:3]:
        summary = doc.get("summary", "")
        if summary:
            key_events.append(summary[:40])

    # 主要情绪: 按 intensity 最高的
    dominant = "neutral"
    if emotion_docs:
        dominant = emotion_docs[0].get("user_emotion", "neutral")

    return {
        "summary": f"本周共有 {len(importance_docs)} 条值得记住的对话。",
        "dominant_emotion": dominant,
        "emotion_trend": "stable",
        "key_events": key_events,
        "emotional_peak": None,
        "story_thread_updates": [],
    }


async def generate_all_users(
    week_start: Optional[datetime] = None,
    dry_run: bool = False,
) -> Dict:
    """为所有用户生成周摘要 — NightlyConsolidator 调用入口"""
    from ..storage.soul_collections import get_collection, IMPORTANCE
    from ..config import get_soul_config

    cfg = get_soul_config()
    model = cfg.extraction_model

    imp_coll = await get_collection(IMPORTANCE)
    if imp_coll is None:
        return {"status": "skipped", "reason": "collection_unavailable"}

    user_ids = await imp_coll.distinct("user_id")
    generated = 0
    skipped = 0

    for uid in user_ids:
        try:
            result = await generate_weekly_digest(uid, week_start=week_start, model=model, dry_run=dry_run)
            if result:
                generated += 1
            else:
                skipped += 1
        except Exception as e:
            logger.warning(f"[WeeklyDigest] User {uid[:8]}... failed: {e}")
            skipped += 1

    return {
        "status": "ok",
        "users": len(user_ids),
        "generated": generated,
        "skipped": skipped,
        "dry_run": dry_run,
    }
