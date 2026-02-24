"""
故事线追踪器 — 管理用户生活中的故事线

设计:
- 不使用独立 LLM 调用，故事信息来自 merged_extractor 的 story_update 字段
- 标题匹配用 SequenceMatcher (ratio > 0.6)
- 单例工厂模式
"""

from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher
from typing import Optional, List

from loguru import logger

# 📖: 故事线生命周期常量
DORMANT_AFTER_DAYS = 30      # 超过 30 天未更新自动休眠
MAX_ACTIVE_PER_USER = 7      # 单用户 active 故事线上限


_story_tracker: Optional["StoryThreadTracker"] = None


def get_story_tracker() -> "StoryThreadTracker":
    """单例工厂"""
    global _story_tracker
    if _story_tracker is None:
        _story_tracker = StoryThreadTracker()
    return _story_tracker


class StoryThreadTracker:
    """故事线追踪器 — 管理用户生活中的故事线"""

    async def update_from_extraction(self, story_update: dict, user_id: str):
        """从 LLM 提取结果更新故事线"""
        if not story_update or not story_update.get("title"):
            return
        update_type = story_update.get("update_type", "continue")
        if update_type == "new":
            await self._create_thread(story_update, user_id)
        elif update_type == "resolve":
            await self._resolve_thread(story_update, user_id)
        else:
            await self._continue_thread(story_update, user_id)

    async def get_active_stories(self, user_id: str, limit: int = 3) -> List[str]:
        """获取活跃故事线的延续提示

        📖 大师建议: 自动将超过 DORMANT_AFTER_DAYS 天未更新的故事线降级为 dormant
        """
        try:
            from ..storage.soul_collections import get_collection, STORIES
            coll = await get_collection(STORIES)
            if coll is None:
                return []

            # 📖: 自动休眠过期故事线 (fire-and-forget, 不阻塞召回)
            dormant_cutoff = datetime.now(timezone.utc) - timedelta(days=DORMANT_AFTER_DAYS)
            try:
                await coll.update_many(
                    {"user_id": user_id, "status": "active", "last_updated": {"$lt": dormant_cutoff}},
                    {"$set": {"status": "dormant"}},
                )
            except Exception:
                pass  # 非关键路径，静默失败

            cursor = coll.find(
                {"user_id": user_id, "status": "active"},
                sort=[("last_updated", -1)],
                limit=limit,
            )
            results = []
            async for doc in cursor:
                title = doc.get("title", "")
                tension = doc.get("tension", "")
                expected = doc.get("expected_next", "")
                hint = title
                if tension:
                    hint += f" — {tension}"
                if expected:
                    hint += f" (下一步: {expected})"
                results.append(hint)
            return results
        except Exception as e:
            logger.debug(f"[Soul] Active stories fetch failed: {e}")
            return []

    async def _create_thread(self, update: dict, user_id: str):
        """创建新故事线

        📖 大师建议: 单用户 active 故事线上限 MAX_ACTIVE_PER_USER，
        超出时自动将最老的 active 故事线 dormant 化。
        """
        from ..storage.soul_collections import get_collection, STORIES
        coll = await get_collection(STORIES)
        if coll is None:
            return

        # 📖: 检查 active 故事线数量，超出上限时 dormant 最老的
        try:
            active_count = await coll.count_documents({"user_id": user_id, "status": "active"})
            if active_count >= MAX_ACTIVE_PER_USER:
                oldest = await coll.find_one(
                    {"user_id": user_id, "status": "active"},
                    sort=[("last_updated", 1)],
                )
                if oldest:
                    await coll.update_one(
                        {"_id": oldest["_id"]},
                        {"$set": {"status": "dormant"}},
                    )
        except Exception:
            pass  # 非关键路径

        now = datetime.now(timezone.utc)
        doc = {
            "user_id": user_id,
            "title": update["title"],
            "status": "active",
            "theme": update.get("theme", ""),
            "tension": update.get("details", ""),
            "arc_position": update.get("arc_position", "setup"),
            "key_moments": [update.get("details", "")] if update.get("details") else [],
            "expected_next": update.get("expected_next"),
            "started_at": now,
            "last_updated": now,
        }
        await coll.insert_one(doc)

    async def _continue_thread(self, update: dict, user_id: str):
        """更新现有故事线 — SequenceMatcher 标题匹配 (ratio > 0.6)"""
        from ..storage.soul_collections import get_collection, STORIES
        coll = await get_collection(STORIES)
        if coll is None:
            return
        title = update["title"]
        cursor = coll.find(
            {"user_id": user_id, "status": "active"},
            sort=[("last_updated", -1)],
            limit=20,
        )
        best_match = None
        best_ratio = 0.0
        async for doc in cursor:
            ratio = SequenceMatcher(None, title[:50], doc.get("title", "")[:50]).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = doc

        if best_match and best_ratio > 0.6:
            update_ops = {
                "$set": {
                    "tension": update.get("details", best_match.get("tension", "")),
                    "arc_position": update.get("arc_position", best_match.get("arc_position", "")),
                    "last_updated": datetime.now(timezone.utc),
                },
            }
            if update.get("expected_next"):
                update_ops["$set"]["expected_next"] = update["expected_next"]
            if update.get("details"):
                update_ops["$push"] = {"key_moments": {"$each": [update["details"]], "$slice": -10}}
            await coll.update_one({"_id": best_match["_id"]}, update_ops)
        else:
            await self._create_thread(update, user_id)

    async def _resolve_thread(self, update: dict, user_id: str):
        """标记故事线结束"""
        from ..storage.soul_collections import get_collection, STORIES
        coll = await get_collection(STORIES)
        if coll is None:
            return
        title = update["title"]
        cursor = coll.find(
            {"user_id": user_id, "status": "active"},
            sort=[("last_updated", -1)],
            limit=20,
        )
        best_match = None
        best_ratio = 0.0
        async for doc in cursor:
            ratio = SequenceMatcher(None, title[:50], doc.get("title", "")[:50]).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = doc

        if best_match and best_ratio > 0.6:
            await coll.update_one(
                {"_id": best_match["_id"]},
                {"$set": {
                    "status": "resolved",
                    "arc_position": "resolution",
                    "last_updated": datetime.now(timezone.utc),
                }},
            )
