"""
灵魂级记忆召回 — 12 路并行 + 关系阶段 + 情感预判 + 计时
Phase 2: +情感共振第 7 路, StoryThreadTracker, breakthrough_hint 闭环
Phase 3: +知识图谱第 8 路
Phase 3b-beta: +抽象记忆第 9 路 (L1 周摘要 / L3 人生章节)
Phase 4: +集体智慧第 10 路, current_life_chapter, emotional_baseline
SOTA: +Graphiti 时序图谱第 8 路(替换), +Mem0 实体记忆第 11 路
"""

import asyncio
import hashlib
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from loguru import logger

from ..models import SoulContext, RelationshipStage, STAGE_THRESHOLDS
from ..narrative.memory_reconstructor import MemoryReconstructor
from ..utils.async_tasks import create_logged_task
from ..utils.validation import is_valid_user_id

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
# P2: 正面情感关键词
POSITIVE_KEYWORDS = ["太好了", "开心", "激动", "兴奋", "终于", "成功"]

# P2: 魔法数字常量化
BREAKTHROUGH_WINDOW_DAYS = 30  # breakthrough_hint 有效窗口

# Round 3: 关系冷却 — v3: 分阶段冷却规则
from ..consolidation.relationship_cooling import (
    COOLING_DAYS, COOLING_DECAY_RATE, check_stage_cooling,
)


def _emotion_hint(query: str) -> Optional[str]:
    """情感预判 (<5ms) — 影响 EverMemOS 搜索参数

    支持关键词匹配 + 句式检测。
    P2: 扩展正面情感检测 (joy/excitement)。
    """
    for kw in NEGATIVE_KEYWORDS:
        if kw in query:
            return "negative"
    for kw in SEEKING_KEYWORDS:
        if kw in query:
            return "seeking"
    # P2: 正面情感检测
    for kw in POSITIVE_KEYWORDS:
        if kw in query:
            return "positive"
    # 句式检测: 省略号/语气词暗示情绪
    stripped = query.strip()
    if stripped.endswith("...") or stripped.endswith("…"):
        return "negative"  # 省略号通常暗示犹豫或低落
    if stripped.endswith("吧") or stripped.endswith("呢"):
        return "seeking"  # 语气词暗示在寻求建议/反馈
    return None


# Phase 3b-beta: 抽象层级选择关键词
_L1_KEYWORDS = {"最近", "上周", "这周", "本周", "这几天", "近期", "lately", "recently", "this week", "last week"}
_L3_KEYWORDS = {"去年", "一直以来", "从那以后", "很久以前", "整体", "总的来说", "回顾", "这段时间",
                "last year", "overall", "in general", "looking back"}


def _detect_recall_layer(query: str) -> str:
    """Phase 3b-beta: 规则化层级选择

    Returns:
        "L1" — 周摘要 (近期概括性问题)
        "L3" — 人生章节 (长期回顾性问题)
        "L0" — 原始记忆 (默认, 具体事件)
    """
    q = query.lower().strip()
    # P2: 短查询排除 — "最近你好吗" 不应触发 L1
    if len(q) < 8:
        return "L0"
    # P2: 排除问候语模式
    _GREETINGS = {"最近好吗", "最近怎么样", "最近还好吗"}
    if q in _GREETINGS or q.rstrip("?？") in _GREETINGS:
        return "L0"
    for kw in _L1_KEYWORDS:
        if kw in q:
            return "L1"
    for kw in _L3_KEYWORDS:
        if kw in q:
            return "L3"
    return "L0"


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


def reset_soul_recall_for_testing():
    """测试辅助: 重置 SoulRecall 单例。"""
    global _soul_recall_instance
    _soul_recall_instance = None


class SoulRecall:
    """灵魂级记忆召回"""

    async def recall(
        self,
        query: str,
        user_id: str,
        is_owner: bool = False,
        top_k: int = 3,
        timeout_ms: int = 600,
    ) -> SoulContext:
        """12 路并行召回 + 关系阶段 + 情感预判 + 计时

        SOTA 升级:
        - tuple → Dict 返回 (💎: 可维护性)
        - +Graphiti 时序图谱 (替换旧 graph_trace)
        - +Mem0 实体记忆 (第 11 路)
        - 超时 500→600ms (⚡: 新组件需要时间)
        - memory_sources 统计 (🤖: 来源标注)
        """
        # P0: user_id 格式校验 — 纵深防御
        if not is_valid_user_id(user_id):
            logger.warning("[Soul] Invalid user_id format, skipping recall")
            return SoulContext()

        start = time.monotonic()
        ctx = SoulContext()

        try:
            results = await asyncio.wait_for(
                self._parallel_recall(query, user_id, is_owner, top_k),
                timeout=timeout_ms / 1000.0,
            )

            # SOTA: Dict 解包 — 增加新路不需要改这里的顺序
            ctx.qdrant_memories = self._safe_list(results.get("qdrant"))
            ctx.evermemos_memories = self._safe_list(results.get("evermemos"))
            ctx.event_sourced_memories = self._safe_list(results.get("fabric_events"))
            if ctx.event_sourced_memories:
                merged_memories = list(dict.fromkeys(ctx.evermemos_memories + ctx.event_sourced_memories))
                ctx.evermemos_memories = merged_memories[: max(top_k * 3, len(ctx.evermemos_memories))]
            ctx.triggered_foresights = self._safe_list(results.get("foresight"))
            ctx.user_profile_summary = results.get("profile", "") if isinstance(results.get("profile"), str) else ""
            ctx.story_continuations = self._safe_list(results.get("stories"))

            # 处理关系阶段 (先处理关系，再决定情感共振是否保留)
            relationship = results.get("relationship")
            if isinstance(relationship, dict) and relationship:
                ctx.relationship_stage = relationship.get("stage", "stranger")
                ctx.stage_behavior_hint = _get_stage_behavior(ctx.relationship_stage)
                ctx.conversation_count = relationship.get("total_conversations", 0)
                ctx.breakthrough_hint = relationship.get("breakthrough_hint")
                ctx.returning_from_absence = relationship.get("returning_from_absence", False)
                milestone = relationship.get("recent_milestone")
                if milestone:
                    ctx.recent_milestone = milestone
                    create_logged_task(
                        self._clear_milestone(coll=None, user_id=user_id),
                        "clear_milestone",
                    )
            else:
                ctx.stage_behavior_hint = _get_stage_behavior("stranger")

            # Phase 3c: 依赖检测
            try:
                from ..ethics.dependency_detector import check_dependency_signals
                hint = check_dependency_signals(query, user_id)
                if hint:
                    ctx.dependency_hint = hint
            except Exception:
                pass

            # 情感共振仅 familiar+ 阶段保留
            resonance = results.get("resonance")
            if isinstance(resonance, list) and ctx.relationship_stage in self._RESONANCE_MIN_STAGES:
                ctx.emotional_resonance = resonance
            else:
                ctx.emotional_resonance = []

            # SOTA: Graphiti 时序图谱 (替换旧 graph_insights)
            graphiti_results = self._safe_list(results.get("graphiti"))
            legacy_graph = self._safe_list(results.get("graph"))
            # Graphiti 优先, 空则降级到 MongoDB 旧结果
            ctx.graph_insights = graphiti_results if graphiti_results else legacy_graph
            ctx.graphiti_insights = graphiti_results

            # Phase 3b-beta: 抽象记忆
            ctx.abstract_memories = self._safe_list(results.get("abstract"))

            # Phase 4: 集体智慧
            ctx.collective_wisdom = self._safe_list(results.get("collective"))

            # SOTA: Mem0 实体记忆 (第 11 路)
            ctx.entity_memories = self._safe_list(results.get("mem0"))
            ctx.core_memory_blocks = self._safe_list(results.get("core_blocks"))
            ctx.procedural_memories = self._safe_list(results.get("procedural"))
            ctx.safety_alerts = self._safe_list(results.get("safety_shadow"))

            # 阶段行为护栏
            try:
                from ..ethics.stage_guardrails import get_stage_guardrail
                guardrail = get_stage_guardrail(ctx.relationship_stage, ctx.conversation_count)
                if guardrail:
                    ctx.ethical_guardrails = guardrail
            except Exception:
                pass

            # 当前人生章节 + 情感基线
            try:
                chapter, baseline = await self._life_context(user_id)
                ctx.current_life_chapter = chapter
                ctx.emotional_baseline = baseline
            except Exception:
                pass

            # SOTA: 记忆源统计 (🤖对话: 来源标注供 context_builder 使用)
            ctx.memory_sources = {
                k: len(v) for k, v in results.items()
                if isinstance(v, list) and v
            }

        except asyncio.TimeoutError:
            logger.warning(f"[Soul] Recall timeout ({timeout_ms}ms)")
            ctx.stage_behavior_hint = _get_stage_behavior("stranger")

        # 异步更新 recall_count
        if ctx.qdrant_memories or ctx.evermemos_memories:
            create_logged_task(
                self._bump_recall_count(user_id),
                "bump_recall_count",
            )

        # 计时
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.info(
            f"[Soul] Recall completed in {elapsed_ms:.0f}ms "
            f"(qdrant={len(ctx.qdrant_memories)}, evermemos={len(ctx.evermemos_memories)}, "
            f"fabric_events={len(ctx.event_sourced_memories)}, "
            f"foresight={len(ctx.triggered_foresights)}, resonance={len(ctx.emotional_resonance)}, "
            f"graph={len(ctx.graph_insights)}, graphiti={len(ctx.graphiti_insights)}, "
            f"mem0={len(ctx.entity_memories)}, core={len(ctx.core_memory_blocks)}, "
            f"procedural={len(ctx.procedural_memories)}, safety={len(ctx.safety_alerts)}, "
            f"abstract={len(ctx.abstract_memories)}, "
            f"collective={len(ctx.collective_wisdom)}, stage={ctx.relationship_stage})"
        )

        # Phase 3: SLO 观测与自动调参输入
        try:
            from soul_fabric import get_memory_fabric

            create_logged_task(
                get_memory_fabric().record_recall_observation(
                    latency_ms=elapsed_ms,
                    relationship_stage=ctx.relationship_stage,
                    source_counts=ctx.memory_sources,
                ),
                "fabric_record_recall_observation",
            )
        except Exception:
            pass
        return ctx

    @staticmethod
    def _safe_list(val) -> list:
        """安全提取 list 结果 (处理 gather 的 return_exceptions=True)"""
        return val if isinstance(val, list) else []

    async def _parallel_recall(
        self, query: str, user_id: str, is_owner: bool, top_k: int
    ) -> Dict[str, Any]:
        """12 路并行召回 — 返回 Dict (SOTA: 替代 tuple)"""
        from ..config import get_soul_config
        from soul_fabric import get_memory_fabric
        from ..ports.initializer import ensure_ports_initialized

        emotion = _emotion_hint(query)
        recall_layer = _detect_recall_layer(query)
        cfg = get_soul_config()
        use_port_registry = cfg.enable_port_registry
        # 先并发启动核心 4 路，再根据 relationship stage 决定是否扩展重路径。
        tasks = {
            "qdrant": asyncio.create_task(self._qdrant_search(query, user_id, top_k)),
            "foresight": asyncio.create_task(self._foresight_search(query, top_k=2)),
            "profile": asyncio.create_task(self._profile_fetch(user_id)),
            "relationship": asyncio.create_task(self._fetch_relationship(user_id)),
        }
        if cfg.fabric_enabled:
            tasks["fabric_events"] = asyncio.create_task(
                self._fabric_event_memories(query, user_id, top_k),
            )

        try:
            relationship = await tasks["relationship"]
        except Exception:
            relationship = None
        relationship_stage = (
            relationship.get("stage", "stranger")
            if isinstance(relationship, dict) and relationship
            else "stranger"
        )
        route_plan = get_memory_fabric().plan_recall(
            relationship_stage=relationship_stage,
            latency_budget_ms=cfg.recall_timeout_ms_extended,
            query=query,
        )
        routes = route_plan.routes

        if routes.get("core_blocks"):
            tasks["core_blocks"] = self._core_blocks_fetch(user_id)
        if routes.get("procedural"):
            tasks["procedural"] = self._procedural_fetch(user_id)
        if routes.get("safety_shadow"):
            tasks["safety_shadow"] = self._safety_shadow_fetch(user_id)

        if any(
            routes.get(k)
            for k in (
                "evermemos",
                "stories",
                "resonance",
                "abstract",
                "collective",
                "graphiti",
                "mem0",
                "graph",
            )
        ):
            if use_port_registry and (cfg.graphiti_enabled or cfg.mem0_enabled):
                ensure_ports_initialized()

            if routes.get("evermemos"):
                tasks["evermemos"] = self._evermemos_search(query, user_id, is_owner, top_k, emotion)
            if routes.get("stories"):
                tasks["stories"] = self._active_stories(user_id)
            if routes.get("resonance"):
                tasks["resonance"] = self._emotional_resonance(query, user_id, emotion)
            if routes.get("abstract"):
                tasks["abstract"] = self._abstract_recall(user_id, recall_layer)
            if routes.get("collective"):
                tasks["collective"] = self._collective_wisdom(query, emotion)
            if routes.get("graphiti"):
                tasks["graphiti"] = (
                    self._port_registry_search("graphiti", query, user_id, top_k)
                    if use_port_registry
                    else self._graphiti_search(query, user_id, top_k)
                )
            if routes.get("mem0"):
                tasks["mem0"] = (
                    self._port_registry_search("mem0", query, user_id, top_k)
                    if use_port_registry
                    else self._mem0_entity_search(query, user_id, top_k)
                )
            if routes.get("graph"):
                tasks["graph"] = self._graph_trace(query, user_id)
        else:
            logger.debug("[Soul] Stranger recall fast-path: running 4 core routes only")
        logger.debug(
            "[MemoryFabric] recall complexity={} budget_tier={} routes={} providers={}",
            route_plan.query_complexity,
            route_plan.budget_tier,
            sorted([k for k, enabled in routes.items() if enabled]),
            route_plan.selected_providers,
        )

        keys = list(tasks.keys())
        coros = list(tasks.values())
        results = await asyncio.gather(*coros, return_exceptions=True)
        return dict(zip(keys, results))

    async def _port_registry_search(
        self,
        port_name: str,
        query: str,
        user_id: str,
        top_k: int,
    ) -> List[str]:
        """通过 PortRegistry 调用指定 Port 搜索（启用时替代直连 adapter）。"""
        try:
            from ..ports.registry import get_port_registry

            port = get_port_registry().get_port(port_name)
            if port is None:
                return []
            results = await asyncio.wait_for(
                port.search(query, user_id, top_k=top_k),
                timeout=port.timeout_seconds,
            )
            return [r.content for r in results if r.content]
        except Exception as e:
            logger.debug(f"[Soul] PortRegistry search failed ({port_name}): {e}")
            return []

    async def _qdrant_search(self, query: str, user_id: str, top_k: int) -> List[str]:
        """Qdrant 短期记忆搜索"""
        try:
            from ...important import search_similar_memories
            loop = asyncio.get_event_loop()
            results = await asyncio.wait_for(
                loop.run_in_executor(None, search_similar_memories, query, user_id, top_k),
                timeout=0.2,
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

    async def _fabric_event_memories(self, query: str, user_id: str, top_k: int) -> List[str]:
        """从 MemoryFabric 事件源补充回忆，确保 /v1/memory/events 可被主召回消费。"""
        try:
            from soul_fabric import get_memory_fabric
            return await asyncio.wait_for(
                get_memory_fabric().fetch_event_memories_for_recall(
                    user_id=user_id,
                    query=query,
                    tenant_id="default",
                    limit=max(1, top_k),
                ),
                timeout=0.18,
            )
        except Exception as e:
            logger.debug(f"[Soul] MemoryFabric event recall failed: {e}")
            return []

    async def _foresight_search(self, query: str, top_k: int = 2) -> List[str]:
        """EverMemOS 前瞻记忆搜索"""
        try:
            from ...tools.evermemos_client import search_foresight
            results = await search_foresight(query, top_k=top_k, timeout=0.2)
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
            emotion_map = {
                "negative": ["sadness", "anxiety", "anger"],
                "seeking": ["anxiety"],
                "positive": ["joy", "excitement"],  # P2: 正面情感共振
            }
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

    async def _abstract_recall(self, user_id: str, layer: str) -> List[str]:
        """Phase 3b-beta: 抽象记忆召回 — 根据层级查询周摘要或人生章节

        L0: 不查询抽象层 (默认使用原始记忆)
        L1: 查询最近 2 个 WeeklyDigest
        L3: 查询进行中的 LifeChapter
        """
        if layer == "L0":
            return []

        try:
            from ..storage.soul_collections import get_collection, WEEKLY_DIGESTS, LIFE_CHAPTERS

            if layer == "L1":
                coll = await get_collection(WEEKLY_DIGESTS)
                if coll is None:
                    return []
                cursor = coll.find(
                    {"user_id": user_id},
                    sort=[("week_start", -1)],
                    limit=2,
                    batch_size=2,
                )
                results = []
                async for doc in cursor:
                    summary = doc.get("summary", "")
                    events = doc.get("key_events", [])
                    if summary:
                        week = doc.get("week_start")
                        week_str = week.strftime("%m/%d") if isinstance(week, datetime) else ""
                        entry = f"[{week_str}周] {summary}"
                        if events:
                            entry += f" (关键: {'、'.join(events[:3])})"
                        results.append(entry)
                return results

            elif layer == "L3":
                coll = await get_collection(LIFE_CHAPTERS)
                if coll is None:
                    return []
                cursor = coll.find(
                    {"user_id": user_id, "ended_at": None},  # 进行中的章节
                    sort=[("started_at", -1)],
                    limit=1,
                    batch_size=1,
                )
                results = []
                async for doc in cursor:
                    title = doc.get("title", "")
                    arc = doc.get("emotional_arc", "")
                    moments = doc.get("defining_moments", [])
                    lessons = doc.get("lessons_learned", [])
                    if title:
                        entry = f"[人生阶段] {title}"
                        if arc:
                            entry += f" — 情绪弧线: {arc}"
                        if moments:
                            entry += f" (关键时刻: {'、'.join(moments[:2])})"
                        if lessons:
                            entry += f" (灵的感悟: {'、'.join(lessons[:2])})"
                        results.append(entry)
                return results

        except Exception as e:
            logger.debug(f"[Soul] Abstract recall failed: {e}")

        return []

    async def _collective_wisdom(
        self, query: str, emotion_hint: Optional[str],
    ) -> List[str]:
        """Phase 4: 集体智慧 — 从匿名模式库中匹配当前情境"""
        try:
            from ..collective.wisdom_retriever import retrieve_wisdom
            return await asyncio.wait_for(
                retrieve_wisdom(emotion_hint=emotion_hint, query=query, limit=2),
                timeout=0.3,
            )
        except Exception as e:
            logger.debug(f"[Soul] Collective wisdom failed: {e}")
            return []

    async def _graphiti_search(
        self, query: str, user_id: str, top_k: int,
    ) -> List[str]:
        """SOTA: Graphiti 时序知识图谱搜索 (第 8 路替换)

        通过 GraphitiAdapter 搜索, 返回带时序上下文的关系链。
        Graphiti 不可用时返回空 (旧 graph_trace 作为 fallback)。
        """
        try:
            from ..config import get_soul_config
            cfg = get_soul_config()
            if not cfg.graphiti_enabled:
                return []

            from ..adapters.graphiti_adapter import get_graphiti_adapter
            adapter = get_graphiti_adapter()
            results = await asyncio.wait_for(
                adapter.search(query, user_id, top_k=top_k),
                timeout=cfg.graphiti_timeout_ms / 1000.0,
            )
            return [r.content for r in results if r.content]
        except Exception as e:
            logger.debug(f"[Soul] Graphiti search failed: {e}")
            return []

    async def _mem0_entity_search(
        self, query: str, user_id: str, top_k: int,
    ) -> List[str]:
        """SOTA: Mem0 实体级记忆搜索 (第 11 路)

        提供 Soul System 缺少的实体记忆:
        - "小明是用户的大学同学" (🤖对话)
        - "用户去年换了工作到 Google" (💜情感安全)
        """
        try:
            from ..config import get_soul_config
            cfg = get_soul_config()
            if not cfg.mem0_enabled:
                return []

            from ..adapters.mem0_adapter import get_mem0_adapter
            adapter = get_mem0_adapter()
            results = await asyncio.wait_for(
                adapter.search(query, user_id, top_k=top_k),
                timeout=cfg.mem0_timeout_ms / 1000.0,
            )
            return [r.content for r in results if r.content]
        except Exception as e:
            logger.debug(f"[Soul] Mem0 search failed: {e}")
            return []

    async def _core_blocks_fetch(self, user_id: str) -> List[str]:
        """Phase 1: Letta Core Blocks 获取。"""
        try:
            from soul_fabric import get_memory_fabric

            return await get_memory_fabric().fetch_core_blocks(user_id=user_id)
        except Exception as e:
            logger.debug(f"[Soul] Core blocks fetch failed: {e}")
            return []

    async def _procedural_fetch(self, user_id: str) -> List[str]:
        """Phase 1: LangMem 程序性记忆获取。"""
        try:
            from soul_fabric import get_memory_fabric

            return await get_memory_fabric().fetch_procedural_rules(user_id=user_id)
        except Exception as e:
            logger.debug(f"[Soul] Procedural memory fetch failed: {e}")
            return []

    async def _safety_shadow_fetch(self, user_id: str) -> List[str]:
        """Phase 2: 安全影子记忆提醒。"""
        try:
            from soul_fabric import get_memory_fabric

            return await get_memory_fabric().fetch_safety_alerts(user_id=user_id)
        except Exception as e:
            logger.debug(f"[Soul] Safety shadow fetch failed: {e}")
            return []

    async def _life_context(self, user_id: str) -> tuple:
        """Phase 4: 获取当前人生章节 + 情感基线

        Returns:
            (current_life_chapter: Optional[str], emotional_baseline: str)
        """
        chapter = None
        baseline = "neutral"
        try:
            from ..storage.soul_collections import get_collection, LIFE_CHAPTERS, EMOTIONS
            # 当前人生章节
            lc_coll = await get_collection(LIFE_CHAPTERS)
            if lc_coll is not None:
                doc = await lc_coll.find_one(
                    {"user_id": user_id, "ended_at": None},
                    sort=[("started_at", -1)],
                )
                if doc:
                    title = doc.get("title", "")
                    theme = doc.get("theme", "")
                    chapter = f"{title}" + (f" — {theme}" if theme else "")

            # 情感基线: 近 30 天最常见情绪
            em_coll = await get_collection(EMOTIONS)
            if em_coll is not None:
                from datetime import timedelta
                cutoff = datetime.now(timezone.utc) - timedelta(days=30)
                pipeline = [
                    {"$match": {"user_id": user_id, "created_at": {"$gte": cutoff}}},
                    {"$group": {"_id": "$user_emotion", "count": {"$sum": 1}}},
                    {"$sort": {"count": -1}},
                    {"$limit": 1},
                ]
                async for doc in em_coll.aggregate(pipeline):
                    baseline = doc.get("_id", "neutral") or "neutral"
        except Exception as e:
            logger.debug(f"[Soul] Life context failed: {e}")
        return chapter, baseline

    @staticmethod
    async def _clear_milestone(coll, user_id: str):
        """P2: 里程碑一次性消费 — 读后清除"""
        try:
            from ..storage.soul_collections import get_collection, RELATIONSHIPS
            if coll is None:
                coll = await get_collection(RELATIONSHIPS)
            if coll is None:
                return
            await coll.update_one(
                {"user_id": user_id},
                {"$set": {"recent_milestone": None}},
            )
        except Exception:
            pass  # fire-and-forget

    @staticmethod
    async def _bump_recall_count(user_id: str):
        """v3: 异步更新最近一条 importance 的 recall_count + last_recalled_at"""
        try:
            from ..storage.soul_collections import get_collection, IMPORTANCE
            coll = await get_collection(IMPORTANCE)
            if coll is None:
                return
            await coll.find_one_and_update(
                {"user_id": user_id},
                {
                    "$inc": {"recall_count": 1},
                    "$set": {"last_recalled_at": datetime.now(timezone.utc)},
                },
                sort=[("created_at", -1)],
            )
        except Exception:
            pass  # fire-and-forget

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
                # v3: 分阶段关系冷却
                last_interaction = doc.get("last_interaction")
                stage_locked_by_cooling = False
                if last_interaction:
                    if isinstance(last_interaction, str):
                        last_interaction = datetime.fromisoformat(last_interaction)
                    days_since = (datetime.now(timezone.utc) - last_interaction).days
                    stage = doc.get("stage", "stranger")
                    cooling_result = check_stage_cooling(stage, days_since)
                    if cooling_result:
                        new_stage, _ = cooling_result
                        # 阶段降级 + 分数衰减 — fire-and-forget
                        old_score = doc.get("accumulated_score", 0)
                        decay = old_score * COOLING_DECAY_RATE
                        new_score = max(0, old_score - decay)
                        create_logged_task(
                            self._cooling_write(
                                coll,
                                user_id,
                                new_score,
                                new_stage,
                                cooled_from_stage=stage,
                            ),
                            "relationship_cooling_downgrade",
                        )
                        doc["accumulated_score"] = new_score
                        doc["stage"] = new_stage
                        stage_locked_by_cooling = True
                        # Phase 3b: 标记回归状态供 context_builder 注入温暖叙事
                        doc["returning_from_absence"] = True
                    elif days_since > COOLING_DAYS:
                        # 未达降级阈值但超过最低冷却天数 → 仅分数衰减
                        old_score = doc.get("accumulated_score", 0)
                        decay = old_score * COOLING_DECAY_RATE
                        new_score = max(0, old_score - decay)
                        create_logged_task(
                            self._cooling_write(coll, user_id, new_score),
                            "relationship_cooling_decay",
                        )
                        doc["accumulated_score"] = new_score
                        doc["returning_from_absence"] = True

                # Phase 2: breakthrough_hint 闭环 — 从 breakthrough_events 生成 hint
                # 💜: 窗口从 7 天扩大到 30 天 (重要时刻应被记住更久)
                # 🤖: 文案改为行为指导而非关系标签 (show, don't tell)
                breakthroughs = doc.get("breakthrough_events", [])
                if breakthroughs:
                    recent = [b for b in breakthroughs[-5:]
                              if b.get("timestamp") and self._within_days(b["timestamp"], BREAKTHROUGH_WINDOW_DAYS)]
                    if recent:
                        latest = recent[-1]
                        doc["breakthrough_hint"] = (
                            f"你们之间有过这样的时刻: {latest.get('summary', '一次深度的情感交流')}。"
                            f"你可以在合适的时候温柔地引用这段经历。"
                        )

                # 计算阶段
                score = doc.get("accumulated_score", 0)
                total_days = doc.get("total_days_active", 0)
                if not stage_locked_by_cooling:
                    doc["stage"] = _calculate_stage(score, total_days, user_id=user_id)
                return doc

            return None
        except Exception as e:
            logger.debug(f"[Soul] Relationship fetch failed: {e}")
            return None

    @staticmethod
    async def _cooling_write(
        coll, user_id: str, new_score: float, new_stage: Optional[str] = None,
        cooled_from_stage: Optional[str] = None,
    ):
        """冷却衰减写入 — fire-and-forget，失败只 warning"""
        try:
            update = {"accumulated_score": new_score, "cooling_warned": True}
            if new_stage:
                update["stage"] = new_stage
                update["stage_entered_at"] = datetime.now(timezone.utc)
                # P1: 关系弹性 — 标记降级来源
                if cooled_from_stage:
                    update["cooled_from_stage"] = cooled_from_stage
                    update["cooled_at"] = datetime.now(timezone.utc)
            await coll.update_one(
                {"user_id": user_id},
                {"$set": update},
            )
        except Exception as e:
            logger.warning(f"[Soul] Cooling write failed (non-fatal): {e}")
