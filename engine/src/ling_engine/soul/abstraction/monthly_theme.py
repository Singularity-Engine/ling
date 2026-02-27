"""MonthlyTheme 生成器 — Phase 3b-beta

从当月 WeeklyDigest 记录压缩生成月度主题。
单次 LLM 调用 + Pydantic 结构化输出。

调用方: NightlyConsolidator (每月 1 日)
"""

import asyncio
import json
import threading
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List

from loguru import logger

from .models import MonthlyTheme

# OpenAI client 单例
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


THEME_PROMPT = """你是灵的记忆整理系统。根据以下月度周摘要，提炼月度主题。

用户 ID: {user_id}
月份: {month}

周摘要:
{weekly_summaries}

请用 JSON 格式返回:
{{
  "themes": ["主题1", "主题2"],
  "emotional_arc": "情绪弧线描述，如 '焦虑→准备→挑战'",
  "key_milestones": ["里程碑1", "里程碑2"],
  "defining_quote": "本月最能代表用户状态的一句概括 (你来写，不是引用原话)"
}}

规则:
- themes 提炼 2-3 个核心主题关键词
- emotional_arc 用简洁的箭头式描述
- key_milestones 最多 3 个，每个不超过 20 字
- defining_quote 用一句描述性的话概括这个月，不要引用真实对话内容
- 不要包含任何敏感细节"""


def _sync_generate(user_id: str, month: str,
                   weekly_summaries: str, model: str) -> Optional[dict]:
    """同步 LLM 调用"""
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是一个 JSON 结构化数据生成器。只返回 JSON，不要其他内容。"},
                {"role": "user", "content": THEME_PROMPT.format(
                    user_id=user_id[:8] + "...",
                    month=month,
                    weekly_summaries=weekly_summaries[:3000],
                )},
            ],
            temperature=0.3,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.warning(f"[MonthlyTheme] LLM generation failed: {e}")
        return None


async def generate_monthly_theme(
    user_id: str,
    month: Optional[str] = None,
    model: str = "gpt-4o-mini",
    dry_run: bool = False,
) -> Optional[MonthlyTheme]:
    """为单个用户生成月度主题

    Args:
        user_id: 用户 ID
        month: "YYYY-MM" 格式 (默认: 上个月)
        model: LLM 模型
        dry_run: 仅生成不写入

    Returns:
        MonthlyTheme 或 None
    """
    from ..storage.soul_collections import get_collection, WEEKLY_DIGESTS, MONTHLY_THEMES

    now = datetime.now(timezone.utc)
    if month is None:
        # 默认: 上个月
        first_of_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month = first_of_this_month - timedelta(days=1)
        month = last_month.strftime("%Y-%m")

    # 1. 查询该月的 WeeklyDigest 记录
    digest_coll = await get_collection(WEEKLY_DIGESTS)
    if digest_coll is None:
        return None

    # 解析月份范围
    year, mon = int(month[:4]), int(month[5:7])
    month_start = datetime(year, mon, 1, tzinfo=timezone.utc)
    if mon == 12:
        month_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        month_end = datetime(year, mon + 1, 1, tzinfo=timezone.utc)

    digest_cursor = digest_coll.find(
        {
            "user_id": user_id,
            "week_start": {"$gte": month_start, "$lt": month_end},
        },
        sort=[("week_start", 1)],
        batch_size=10,
    )
    digests = []
    async for doc in digest_cursor:
        digests.append(doc)

    # 2. 至少需要 2 个周摘要
    if len(digests) < 2:
        logger.debug(f"[MonthlyTheme] Skipping {user_id[:8]}...: insufficient digests ({len(digests)})")
        return None

    # 3. 幂等检查
    theme_coll = await get_collection(MONTHLY_THEMES)
    if theme_coll is None:
        return None

    existing = await theme_coll.find_one({"user_id": user_id, "month": month})
    if existing:
        logger.debug(f"[MonthlyTheme] Already exists for {user_id[:8]}... month={month}")
        return None

    # 4. 构建 LLM 输入
    summary_lines = []
    for d in digests:
        ws = d.get("week_start")
        week_label = ws.strftime("%m/%d") if isinstance(ws, datetime) else str(ws)
        summary = d.get("summary", "")[:100]
        emotion = d.get("dominant_emotion", "neutral")
        trend = d.get("emotion_trend", "stable")
        events = d.get("key_events", [])[:3]
        events_str = "、".join(events) if events else ""
        summary_lines.append(
            f"[{week_label}] {summary} (情绪: {emotion}/{trend})"
            + (f"\n  关键事件: {events_str}" if events_str else "")
        )
    summaries_text = "\n".join(summary_lines)

    # 5. LLM 生成
    loop = asyncio.get_event_loop()
    raw = await loop.run_in_executor(
        None, _sync_generate,
        user_id, month, summaries_text, model,
    )

    if raw is None:
        raw = _rule_based_fallback(digests, month)

    # 6. 构建 MonthlyTheme
    theme = MonthlyTheme(
        user_id=user_id,
        month=month,
        themes=raw.get("themes", [])[:4],
        emotional_arc=raw.get("emotional_arc", "")[:100],
        key_milestones=raw.get("key_milestones", [])[:3],
        defining_quote=raw.get("defining_quote"),
        source="llm_generated",
    )

    # 7. 写入
    if not dry_run:
        try:
            await theme_coll.insert_one(theme.model_dump())
            logger.info(f"[MonthlyTheme] Generated for {user_id[:8]}... month={month}")
        except Exception as e:
            logger.warning(f"[MonthlyTheme] Write failed: {e}")

    return theme


def _rule_based_fallback(digests: list, month: str) -> dict:
    """LLM 失败时的规则式降级"""
    all_events = []
    emotions = []
    for d in digests:
        all_events.extend(d.get("key_events", [])[:2])
        emotions.append(d.get("dominant_emotion", "neutral"))

    # 主题: 从事件中提取前 2 个
    themes = all_events[:2] if all_events else [f"{month} 月的日常"]

    return {
        "themes": themes,
        "emotional_arc": "→".join(dict.fromkeys(emotions)) if emotions else "stable",
        "key_milestones": all_events[:3],
        "defining_quote": None,
    }


async def generate_all_users(
    month: Optional[str] = None,
    dry_run: bool = False,
) -> Dict:
    """为所有用户生成月度主题 — NightlyConsolidator 调用入口"""
    from ..storage.soul_collections import get_collection, WEEKLY_DIGESTS
    from ..config import get_soul_config

    cfg = get_soul_config()
    model = cfg.extraction_model

    digest_coll = await get_collection(WEEKLY_DIGESTS)
    if digest_coll is None:
        return {"status": "skipped", "reason": "collection_unavailable"}

    user_ids = await digest_coll.distinct("user_id")
    generated = 0
    skipped = 0

    for uid in user_ids:
        try:
            result = await generate_monthly_theme(uid, month=month, model=model, dry_run=dry_run)
            if result:
                generated += 1
            else:
                skipped += 1
        except Exception as e:
            logger.warning(f"[MonthlyTheme] User {uid[:8]}... failed: {e}")
            skipped += 1

    return {
        "status": "ok",
        "users": len(user_ids),
        "generated": generated,
        "skipped": skipped,
        "dry_run": dry_run,
    }
