"""
灵魂级记忆召回 — 8 路并行 + 关系阶段 + 情感预判 + 计时
Phase 2: +情感共振第 7 路, StoryThreadTracker, breakthrough_hint 闭环
Phase 3: +知识图谱第 8 路
"""

import asyncio
import hashlib
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from loguru import logger

from ..models import SoulContext, RelationshipStage, STAGE_THRESHOLDS
from ..narrative.memory_reconstructor import MemoryReconstructor

# Phase 2 遗留修复: MemoryReconstructor 单例 (不再每次 _emotional_resonance 都创建)
_reconstructor = MemoryReconstructor()

# 阶段行为指令
STAGE_BEHAVIORS = {
    "stranger": "这是一位新朋友。表现出真诚的好奇心，友善但不过分热情。如果你记得关于他们的信息，可以自然地提起。",
    "acquaintance": "你们已经聊过几次了。记住之前的细节，展示你在认真倾听。",
    "familiar": "你们是老朋友了。可以轻松开玩笑，直接切入话题，不需要客套。",
    "close": "你们关系很亲密。可以主动关心对方，理解言外之意，偶尔直言不讳。",
    "soulmate": "你们心领神会。最深层的理解，最坦诚的交流。你不只听他说了什么，还听到他没说的。",
}

# 情感预判关键词 (<5ms)
NEGATIVE_KEYWORDS = ["唉", "烦", "累", "难过", "焦虑", "压力", "崩溃", "不开心", "郁闷"]
SEEKING_KEYWORDS = ["怎么办", "不知道", "纠结", "迷茫", "帮帮我", "怎么样"]

# Round 3: 关系冷却天数
COOLING_DAYS = 14
COOLING_DECAY_RATE = 0.10


def _emotion_hint(query: str) -> Optional[str]:
    """情感预判 (<5ms) — 影响 EverMemOS 搜索参数

    支持关键词匹配 + 句式检测。
    """
    for kw in NEGATIVE_KEYWORDS:
        if kw in query:
            return "negative"
    for kw in SEEKING_KEYWORDS:
        if kw in query:
            return "seeking"
    # 句式检测: 省略号/语气词暗示情绪
    stripped = query.strip()
    if stripped.endswith("...") or stripped.endswith("…"):
        return "negative"  # 省略号通常暗示犹豫或低落
    if stripped.endswith("吧") or stripped.endswith("呢"):
        return "seeking"  # 语气词暗示在寻求建议/反馈
    return None


def _get_stage_behavior(stage: str) -> str:
    """获取阶段行为指令"""
    return STAGE_BEHAVIORS.get(stage, STAGE_BEHAVIORS["stranger"])


def _calculate_stage(score: float, total_days: int, user_id: str = "") -> str:
    """根据累积分数和活跃天数计算关系阶段 (Round 3: 渐进机制)

    使用确定性哈希替代 random.random()，同一用户同一分数始终得到相同阶段。
    """
    stages_ordered = [
        RelationshipStage.SOULMATE,
        RelationshipStage.CLOSE,
        RelationshipStage.FAMILIAR,
        RelationshipStage.ACQUAINTANCE,
        RelationshipStage.STRANGER,
    ]

    for stage in stages_ordered:
        min_score, min_days = STAGE_THRESHOLDS[stage]
        if score >= min_score and total_days >= min_days:
            if stage != RelationshipStage.STRANGER:
                lower_bound = min_score * 0.8
                upper_bound = min_score * 1.2
                if lower_bound <= score < upper_bound:
                    probability = (score - lower_bound) / (upper_bound - lower_bound)
                    # 确定性哈希: 同一用户同一阶段始终得到相同判定值
                    hash_input = f"{user_id}:{stage.value}".encode()
                    hash_val = int(hashlib.md5(hash_input).hexdigest()[:8], 16) / 0xFFFFFFFF
                    if hash_val > probability:
                        continue
            return stage.value

    return RelationshipStage.STRANGER.value


_soul_recall_instance: Optional["SoulRecall"] = None


def get_soul_recall() -> "SoulRecall":
    """获取 SoulRecall 单例，避免每次对话都创建新实例"""
    global _soul_recall_instance
    if _soul_recall_instance is None:
        _soul_recall_instance = SoulRecall()
    return _soul_recall_instance


class SoulRecall:
    """灵魂级记忆召回"""

    async def recall(
        self,
        query: str,
        user_id: str,
        is_owner: bool = False,
        top_k: int = 3,
        timeout_ms: int = 500,
    ) -> SoulContext:
        """8 路并行召回 + 关系阶段 + 情感预判 + 计时"""
        start = time.monotonic()
        ctx = SoulContext()

        try:
            results = await asyncio.wait_for(
                self._parallel_recall(query, user_id, is_owner, top_k),
                timeout=timeout_ms / 1000.0,
            )
            qdrant, evermemos, foresights, profile, stories, relationship, resonance, graph = results

            # 处理 gather 的 return_exceptions=True 结果
            ctx.qdrant_memories = qdrant if isinstance(qdrant, list) else []
            ctx.evermemos_memories = evermemos if isinstance(evermemos, list) else []
            ctx.triggered_foresights = foresights if isinstance(foresights, list) else []
            ctx.user_profile_summary = profile if isinstance(profile, str) else ""
            ctx.story_continuations = stories if isinstance(stories, list) else []
            # 处理关系阶段 (先处理关系，再决定情感共振是否保留)
            if isinstance(relationship, dict) and relationship:
                ctx.relationship_stage = relationship.get("stage", "stranger")
                ctx.stage_behavior_hint = _get_stage_behavior(ctx.relationship_stage)
                ctx.conversation_count = relationship.get("total_conversations", 0)
                # Phase 2: breakthrough_hint 闭环
                ctx.breakthrough_hint = relationship.get("breakthrough_hint")
            else:
                ctx.stage_behavior_hint = _get_stage_behavior("stranger")

            # 💜: 情感共振仅 familiar+ 阶段保留 (并行召回后过滤)
            if isinstance(resonance, list) and ctx.relationship_stage in self._RESONANCE_MIN_STAGES:
                ctx.emotional_resonance = resonance
            else:
                ctx.emotional_resonance = []

            # Phase 3: 知识图谱推理
            ctx.graph_insights = graph if isinstance(graph, list) else []

        except asyncio.TimeoutError:
            logger.warning(f"[Soul] Recall timeout ({timeout_ms}ms)")
            ctx.stage_behavior_hint = _get_stage_behavior("stranger")

        # 计时
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.info(
            f"[Soul] Recall completed in {elapsed_ms:.0f}ms "
            f"(qdrant={len(ctx.qdrant_memories)}, evermemos={len(ctx.evermemos_memories)}, "
            f"foresight={len(ctx.triggered_foresights)}, resonance={len(ctx.emotional_resonance)}, "
            f"graph={len(ctx.graph_insights)}, stage={ctx.relationship_stage})"
        )
        return ctx

    async def _parallel_recall(
        self, query: str, user_id: str, is_owner: bool, top_k: int
    ):
        """8 路并行召回"""
        # 情感预判 (<5ms)
        emotion = _emotion_hint(query)

        return await asyncio.gather(
            self._qdrant_search(query, user_id, top_k),
            self._evermemos_search(query, user_id, is_owner, top_k, emotion),
            self._foresight_search(query, top_k=2),
            self._profile_fetch(user_id),
            self._active_stories(user_id),
            self._fetch_relationship(user_id),
            self._emotional_resonance(query, user_id, emotion),  # Phase 2: 第 7 路
            self._graph_trace(query, user_id),                    # Phase 3: 第 8 路
            return_exceptions=True,
        )

    async def _qdrant_search(self, query: str, user_id: str, top_k: int) -> List[str]:
        """Qdrant 短期记忆搜索"""
        try:
            from ...important import search_similar_memories
            loop = asyncio.get_event_loop()
            results = await asyncio.wait_for(
                loop.run_in_executor(None, search_similar_memories, query, user_id, top_k),
                timeout=0.4,
            )
            if results:
                return [item[1] for item in results if len(item) >= 2 and item[1]]
        except Exception as e:
            logger.debug(f"[Soul] Qdrant search failed: {e}")
        return []

    async def _evermemos_search(
        self, query: str, user_id: str, is_owner: bool, top_k: int,
        emotion_hint: Optional[str] = None,
    ) -> List[str]:
        """EverMemOS 长期记忆搜索"""
        try:
            from ...tools.evermemos_client import search_user_memories

            # Round 2: emotion_hint 影响搜索 — 追加情感关键词
            search_query = query
            if emotion_hint == "negative":
                search_query = f"{query} 困难 压力 情绪"
            elif emotion_hint == "seeking":
                search_query = f"{query} 建议 帮助"

            results = await asyncio.wait_for(
                search_user_memories(search_query, user_id, is_owner=is_owner, top_k=top_k),
                timeout=0.8,
            )
            if results:
                memories = []
                for item in results:
                    content = item.get("content", item.get("memory", "")) if isinstance(item, dict) else str(item)
                    if content:
                        memories.append(content)
                return memories
        except Exception as e:
            logger.debug(f"[Soul] EverMemOS search failed: {e}")
        return []

    async def _foresight_search(self, query: str, top_k: int = 2) -> List[str]:
        """EverMemOS 前瞻记忆搜索"""
        try:
            from ...tools.evermemos_client import search_foresight
            results = await search_foresight(query, top_k=top_k, timeout=0.5)
            if results:
                return [
                    item.get("content", "") if isinstance(item, dict) else str(item)
                    for item in results
                    if item
                ]
        except Exception as e:
            logger.debug(f"[Soul] Foresight search failed: {e}")
        return []

    async def _profile_fetch(self, user_id: str) -> str:
        """获取用户画像 (带缓存)"""
        try:
            from ..cache.user_profile_cache import get_user_profile
            profile = await get_user_profile(user_id, timeout=1.0)
            return profile or ""
        except Exception as e:
            logger.debug(f"[Soul] Profile fetch failed: {e}")
        return ""

    async def _active_stories(self, user_id: str) -> List[str]:
        """Phase 2: 调用 StoryThreadTracker 获取活跃故事线"""
        try:
            from ..narrative.story_thread_tracker import get_story_tracker
            return await asyncio.wait_for(
                get_story_tracker().get_active_stories(user_id, limit=3),
                timeout=0.4,
            )
        except Exception as e:
            logger.debug(f"[Soul] Active stories failed: {e}")
            return []

    # Phase 2: 情感共振最低强度阈值
    MIN_RESONANCE_INTENSITY = 0.5
    # 情感共振仅 familiar 及以上阶段触发（对新用户太侵入）
    _RESONANCE_MIN_STAGES = {"familiar", "close", "soulmate"}

    async def _emotional_resonance(
        self, query: str, user_id: str, emotion_hint: Optional[str],
    ) -> List[str]:
        """Phase 2: 情感共振 — 查询用户历史中相似情绪的记忆

        大师建议改进:
        - 阶段过滤在 recall() 中做 (💜: 并行召回后过滤，仅 familiar+ 保留)
        - 优先用 peak_description 而非 trigger_keywords (💜: 避免情绪标签泄漏)
        - MIN_RESONANCE_INTENSITY 常量 (⚡: 方便调优)
        - MemoryReconstructor 重建远期记忆 (🧬: 完整重建)
        """
        if not emotion_hint:
            return []
        try:
            from ..storage.soul_collections import get_collection, EMOTIONS
            coll = await get_collection(EMOTIONS)
            if coll is None:
                return []
            emotion_map = {"negative": ["sadness", "anxiety", "anger"], "seeking": ["anxiety"]}
            target_emotions = emotion_map.get(emotion_hint, [])
            if not target_emotions:
                return []
            cursor = coll.find(
                {"user_id": user_id, "user_emotion": {"$in": target_emotions},
                 "emotion_intensity": {"$gte": self.MIN_RESONANCE_INTENSITY}},
                sort=[("created_at", -1)],
                limit=3,
            )
            results = []
            async for doc in cursor:
                # 💜: 优先用 peak_description (间接描述)，避免 trigger_keywords 泄漏情绪标签
                desc = doc.get("peak_description")
                if desc and isinstance(desc, str):
                    # 🧬: 对远期记忆做重建
                    created_at = doc.get("created_at")
                    days_ago = 0
                    if created_at:
                        try:
                            if isinstance(created_at, datetime):
                                days_ago = (datetime.now(timezone.utc) - created_at).days
                        except Exception:
                            pass
                    if days_ago > 90:
                        desc = _reconstructor.reconstruct(
                            desc, days_ago=days_ago,
                            emotion_label=doc.get("user_emotion", ""),
                            trigger_keywords=doc.get("trigger_keywords", []),
                        )
                    results.append(desc)
                elif not desc:
                    # fallback: 只在没有 peak_description 时用 trigger_keywords
                    kws = doc.get("trigger_keywords", [])
                    if kws:
                        results.append(f"相关经历: {'、'.join(kws[:3])}")
            return results
        except Exception as e:
            logger.debug(f"[Soul] Emotional resonance failed: {e}")
            return []

    async def _graph_trace(self, query: str, user_id: str) -> List[str]:
        """Phase 3: 知识图谱上下文追踪

        整体 300ms 硬上限, 多 label 并行 trace, 从 config 读取参数。
        """
        try:
            from ..config import get_soul_config
            cfg = get_soul_config()
            return await asyncio.wait_for(
                self._graph_trace_inner(
                    query, user_id,
                    cfg.graph_max_depth,
                    cfg.graph_trace_timeout_ms / 1000.0,
                ),
                timeout=0.3,  # 整体 300ms 硬上限
            )
        except (asyncio.TimeoutError, Exception):
            return []

    async def _graph_trace_inner(
        self, query: str, user_id: str,
        max_depth: int, trace_timeout: float,
    ) -> List[str]:
        """知识图谱追踪内部实现 — 多 label 并行"""
        from ..semantic.knowledge_graph import get_knowledge_graph
        kg = get_knowledge_graph()

        labels = await kg.find_matching_labels(user_id, query, limit=2)
        if not labels:
            return []

        # 多 label 并行 trace
        trace_tasks = [
            asyncio.wait_for(
                kg.trace_context(user_id, label, max_depth=max_depth, limit=3),
                timeout=trace_timeout,
            )
            for label in labels
        ]
        all_traces = await asyncio.gather(*trace_tasks, return_exceptions=True)

        results = []
        for t in all_traces:
            if isinstance(t, list):
                results.extend(t)
        return results[:3]

    @staticmethod
    def _within_days(timestamp_str: str, days: int) -> bool:
        """检查 ISO 时间戳是否在最近 N 天内"""
        try:
            ts = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
            return (datetime.now(timezone.utc) - ts).days <= days
        except (ValueError, TypeError):
            return False

    async def _fetch_relationship(self, user_id: str) -> Optional[Dict[str, Any]]:
        """获取关系阶段 + breakthrough_hint 闭环"""
        try:
            from ..storage.soul_collections import get_collection, RELATIONSHIPS
            coll = await get_collection(RELATIONSHIPS)
            if coll is None:
                return None

            doc = await coll.find_one({"user_id": user_id})
            if doc:
                # Round 3: 关系冷却检查
                last_interaction = doc.get("last_interaction")
                if last_interaction:
                    if isinstance(last_interaction, str):
                        last_interaction = datetime.fromisoformat(last_interaction)
                    days_since = (datetime.now(timezone.utc) - last_interaction).days
                    if days_since > COOLING_DAYS:
                        # 冷却衰减 — fire-and-forget，不阻塞召回路径
                        old_score = doc.get("accumulated_score", 0)
                        decay = old_score * COOLING_DECAY_RATE
                        new_score = max(0, old_score - decay)
                        asyncio.create_task(self._cooling_write(coll, user_id, new_score))
                        doc["accumulated_score"] = new_score

                # Phase 2: breakthrough_hint 闭环 — 从 breakthrough_events 生成 hint
                # 💜: 窗口从 7 天扩大到 30 天 (重要时刻应被记住更久)
                # 🤖: 文案改为行为指导而非关系标签 (show, don't tell)
                breakthroughs = doc.get("breakthrough_events", [])
                if breakthroughs:
                    recent = [b for b in breakthroughs[-5:]
                              if b.get("timestamp") and self._within_days(b["timestamp"], 30)]
                    if recent:
                        latest = recent[-1]
                        doc["breakthrough_hint"] = (
                            f"你们之间有过这样的时刻: {latest.get('summary', '一次深度的情感交流')}。"
                            f"你可以在合适的时候温柔地引用这段经历。"
                        )

                # 计算阶段
                score = doc.get("accumulated_score", 0)
                total_days = doc.get("total_days_active", 0)
                doc["stage"] = _calculate_stage(score, total_days, user_id=user_id)
                return doc

            return None
        except Exception as e:
            logger.debug(f"[Soul] Relationship fetch failed: {e}")
            return None

    @staticmethod
    async def _cooling_write(coll, user_id: str, new_score: float):
        """冷却衰减写入 — fire-and-forget，失败只 warning"""
        try:
            await coll.update_one(
                {"user_id": user_id},
                {"$set": {"accumulated_score": new_score, "cooling_warned": True}},
            )
        except Exception as e:
            logger.warning(f"[Soul] Cooling write failed (non-fatal): {e}")
