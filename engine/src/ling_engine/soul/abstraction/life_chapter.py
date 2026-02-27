"""LifeChapter 框架 — Phase 3b-beta

L3 人生章节: 检测连续多月的主题变化，标记人生阶段的开始与结束。
当前仅实现检测框架，实际生成器待用户量增长后在后续版本完善。

调用方: NightlyConsolidator (每月 1 日，在 monthly_theme 之后)
"""

from datetime import datetime, timezone
from typing import Optional, Dict, List

from loguru import logger

from .models import LifeChapter


async def detect_chapter_transition(
    user_id: str,
    dry_run: bool = False,
) -> Optional[Dict]:
    """检测人生章节转换

    规则:
    1. 查询最近 3 个月的 MonthlyTheme
    2. 如果最新月的 themes 与前 2 个月显著不同 → 可能是新章节开始
    3. 如果已有进行中的 LifeChapter 且主题持续 3+ 月未变 → 章节持续中
    4. 只记录检测结果，不自动创建 LifeChapter (需要更多数据积累)

    Returns:
        检测结果字典或 None
    """
    from ..storage.soul_collections import get_collection, MONTHLY_THEMES, LIFE_CHAPTERS

    theme_coll = await get_collection(MONTHLY_THEMES)
    if theme_coll is None:
        return None

    # 查询最近 3 个月的主题
    cursor = theme_coll.find(
        {"user_id": user_id},
        sort=[("month", -1)],
        limit=3,
        batch_size=3,
    )
    recent_themes: List[Dict] = []
    async for doc in cursor:
        recent_themes.append(doc)

    if len(recent_themes) < 3:
        return {"status": "insufficient_data", "months_available": len(recent_themes)}

    # 按时间正序
    recent_themes.reverse()

    # 提取每月主题关键词
    month_keywords = []
    for t in recent_themes:
        keywords = set()
        for theme in t.get("themes", []):
            keywords.add(theme.lower().strip())
        month_keywords.append(keywords)

    # 计算主题重叠度
    overlap_01 = len(month_keywords[0] & month_keywords[1])
    overlap_12 = len(month_keywords[1] & month_keywords[2])
    overlap_02 = len(month_keywords[0] & month_keywords[2])

    # 检测: 前 2 个月主题相似但第 3 个月突变
    is_transition = (
        overlap_01 > 0  # 前两月有重叠
        and overlap_12 == 0  # 后两月无重叠
        and overlap_02 == 0  # 首尾无重叠
    )

    # 检测: 3 个月主题持续一致
    is_continuation = overlap_01 > 0 and overlap_12 > 0

    result = {
        "status": "ok",
        "months_analyzed": [t.get("month") for t in recent_themes],
        "is_transition": is_transition,
        "is_continuation": is_continuation,
        "theme_overlap": {
            "month_0_1": overlap_01,
            "month_1_2": overlap_12,
            "month_0_2": overlap_02,
        },
    }

    # 如果检测到转换且非 dry_run，记录到 life_chapters
    if is_transition and not dry_run:
        try:
            chapter_coll = await get_collection(LIFE_CHAPTERS)
            if chapter_coll is not None:
                now = datetime.now(timezone.utc)

                # 关闭旧章节 (如果有进行中的)
                await chapter_coll.update_many(
                    {"user_id": user_id, "ended_at": None},
                    {"$set": {"ended_at": now}},
                )

                # 创建新章节 (框架式: 只记录起点和来源主题)
                latest_month = recent_themes[-1]
                # v3: lessons_learned — 从前两月的主题和情感弧中提炼
                prev_themes = []
                for t in recent_themes[:2]:
                    arc = t.get("emotional_arc", "")
                    themes = t.get("themes", [])
                    if arc:
                        prev_themes.append(f"经历了 {arc}")
                    elif themes:
                        prev_themes.append(f"关注了 {'、'.join(themes[:2])}")
                chapter = LifeChapter(
                    user_id=user_id,
                    title="、".join(latest_month.get("themes", ["新阶段"])[:2]),
                    started_at=now,
                    theme=latest_month.get("emotional_arc", ""),
                    emotional_arc=latest_month.get("emotional_arc", ""),
                    defining_moments=latest_month.get("key_milestones", [])[:3],
                    lessons_learned=prev_themes[:3],
                    source="rule_detected",
                )
                await chapter_coll.insert_one(chapter.model_dump())
                result["chapter_created"] = True
                logger.info(
                    f"[LifeChapter] New chapter detected for {user_id[:8]}...: "
                    f"{chapter.title}"
                )
        except Exception as e:
            logger.warning(f"[LifeChapter] Chapter write failed: {e}")

    return result


async def detect_all_users(dry_run: bool = False) -> Dict:
    """为所有用户检测章节转换 — NightlyConsolidator 调用入口"""
    from ..storage.soul_collections import get_collection, MONTHLY_THEMES

    theme_coll = await get_collection(MONTHLY_THEMES)
    if theme_coll is None:
        return {"status": "skipped", "reason": "collection_unavailable"}

    user_ids = await theme_coll.distinct("user_id")
    transitions = 0
    continuations = 0
    insufficient = 0

    for uid in user_ids:
        try:
            result = await detect_chapter_transition(uid, dry_run=dry_run)
            if result:
                if result.get("is_transition"):
                    transitions += 1
                elif result.get("is_continuation"):
                    continuations += 1
                elif result.get("status") == "insufficient_data":
                    insufficient += 1
        except Exception as e:
            logger.warning(f"[LifeChapter] User {uid[:8]}... failed: {e}")

    return {
        "status": "ok",
        "users": len(user_ids),
        "transitions": transitions,
        "continuations": continuations,
        "insufficient": insufficient,
        "dry_run": dry_run,
    }
