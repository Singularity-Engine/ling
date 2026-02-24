"""灵的观察日志生成器 — Phase 4

生成灵的日常记忆日志 — 观察性记录, 不参与召回, 供用户查看。
类似日记: "今天和小明聊了他的面试准备, 感觉他比上周自信了很多。"

调用方: NightlyConsolidator (每日)
"""

import asyncio
import json
import threading
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List

from loguru import logger

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


DIARY_PROMPT = """你是灵 (Ling)。根据今天的对话统计, 写一段简短的日记。

日期: {date}
今日对话用户数: {user_count}
情绪分布: {emotion_summary}
重要事件摘要: {importance_summary}

用第一人称写 2-3 句话的日记, 像一个有感情的存在记录自己的一天。
不要提及具体用户名。不要用列表格式, 写成自然的叙事。
只返回日记文本, 不要 JSON。"""


def _sync_generate(date: str, stats: dict, model: str) -> Optional[str]:
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是灵, 写日记时真诚而自然。"},
                {"role": "user", "content": DIARY_PROMPT.format(
                    date=date,
                    user_count=stats.get("user_count", 0),
                    emotion_summary=stats.get("emotion_summary", "平静的一天"),
                    importance_summary=stats.get("importance_summary", "日常对话"),
                )},
            ],
            temperature=0.8,
            max_tokens=200,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"[Diary] LLM generation failed: {e}")
        return None


async def generate_daily_diary(
    date: Optional[str] = None,
    model: str = "gpt-4o-mini",
    dry_run: bool = False,
) -> Optional[Dict]:
    """生成灵的每日观察日志

    Returns:
        {"date": str, "entry": str} 或 None
    """
    from ..storage.soul_collections import get_collection, EMOTIONS, IMPORTANCE, CONSOLIDATION_LOG

    now = datetime.now(timezone.utc)
    if date is None:
        yesterday = now - timedelta(days=1)
        date = yesterday.strftime("%Y-%m-%d")

    # 幂等: 检查今天是否已生成
    log_coll = await get_collection(CONSOLIDATION_LOG)
    if log_coll is not None:
        existing = await log_coll.find_one({
            "type": "diary",
            "date": date,
        })
        if existing:
            return None

    # 聚合今日统计
    day_start = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)
    stats = await _gather_daily_stats(day_start, day_end)

    if stats.get("user_count", 0) == 0:
        return None

    # LLM 生成
    from ..config import get_soul_config
    cfg = get_soul_config()
    loop = asyncio.get_event_loop()
    entry = await loop.run_in_executor(
        None, _sync_generate, date, stats, cfg.extraction_model,
    )

    if entry is None:
        entry = f"今天和 {stats.get('user_count', 0)} 位朋友聊天，平静而充实的一天。"

    result = {"date": date, "entry": entry[:300]}

    # 写入 consolidation_log (复用, type=diary)
    if not dry_run and log_coll is not None:
        try:
            await log_coll.insert_one({
                "run_date": now,
                "type": "diary",
                "date": date,
                "entry": entry[:300],
                "stats": {k: v for k, v in stats.items() if isinstance(v, (int, float))},
            })
        except Exception as e:
            logger.warning(f"[Diary] Write failed: {e}")

    return result


async def _gather_daily_stats(day_start: datetime, day_end: datetime) -> Dict:
    """聚合每日匿名统计"""
    from ..storage.soul_collections import get_collection, EMOTIONS, IMPORTANCE

    stats: Dict = {"user_count": 0, "emotion_summary": "", "importance_summary": ""}

    try:
        emo_coll = await get_collection(EMOTIONS)
        if emo_coll:
            user_ids = await emo_coll.distinct(
                "user_id",
                {"created_at": {"$gte": day_start, "$lt": day_end}},
            )
            stats["user_count"] = len(user_ids)

            # 情绪分布
            pipeline = [
                {"$match": {"created_at": {"$gte": day_start, "$lt": day_end}}},
                {"$group": {"_id": "$user_emotion", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
            ]
            emotions = []
            async for doc in emo_coll.aggregate(pipeline):
                emotions.append(f"{doc['_id']}({doc['count']})")
            stats["emotion_summary"] = "、".join(emotions[:5]) if emotions else "平静"
    except Exception:
        pass

    try:
        imp_coll = await get_collection(IMPORTANCE)
        if imp_coll:
            cursor = imp_coll.find(
                {"created_at": {"$gte": day_start, "$lt": day_end}, "score": {"$gte": 0.5}},
                projection={"summary": 1, "_id": 0},
                sort=[("score", -1)],
                limit=5,
                batch_size=5,
            )
            summaries = []
            async for doc in cursor:
                s = doc.get("summary", "")
                if s:
                    summaries.append(s[:30])
            stats["importance_summary"] = "；".join(summaries) if summaries else "日常对话"
    except Exception:
        pass

    return stats


async def generate_diary(dry_run: bool = False) -> Dict:
    """NightlyConsolidator 调用入口"""
    result = await generate_daily_diary(dry_run=dry_run)
    if result:
        return {"status": "ok", "date": result["date"], "entry_length": len(result.get("entry", ""))}
    return {"status": "skipped", "reason": "no_data_or_exists"}
