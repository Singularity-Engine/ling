"""
灵魂后处理器 — 异步处理对话后的记忆写入
修复: NEVER_STORE 检查, 情感关键词跳过逻辑, 并发控制, gather 异常检查
SOTA: +Graphiti 图谱写入, +Mem0 对话记忆写入
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional
from loguru import logger

# 情感关键词 (来自 v3 设计的 InConversationTracker)
EMOTION_KEYWORDS = {
    "negative": ["唉", "烦", "累", "难过", "焦虑", "压力", "崩溃", "想死", "绝望"],
    "seeking_comfort": ["怎么办", "不知道", "纠结", "迷茫", "帮帮我"],
    "positive_peak": ["太好了", "终于", "成功了", "我做到了"],
}

# Round 4: 并发控制
_semaphore = asyncio.Semaphore(10)


def _has_emotion_signal(text: str) -> bool:
    """检测文本是否包含情感信号"""
    return any(kw in text for group in EMOTION_KEYWORDS.values() for kw in group)


class SoulPostProcessor:
    """灵魂后处理器 — 异步写入情感、重要度、关系信号到 MongoDB"""

    async def process(
        self,
        user_input: str,
        ai_response: str,
        user_id: str,
        client_uid: str = "",
    ):
        """处理一轮对话的后处理"""
        async with _semaphore:
            await self._process_inner(user_input, ai_response, user_id, client_uid)

    async def _process_inner(
        self,
        user_input: str,
        ai_response: str,
        user_id: str,
        client_uid: str = "",
    ):
        """内部处理逻辑"""
        # 1. 敏感内容检查 (NEVER_STORE 阻止, CAUTION 先提取后脱敏)
        from ..ethics.sensitive_filter import check_sensitivity
        sensitivity = check_sensitivity(user_input)
        if sensitivity == "block":
            logger.info("[Soul] Skipping extraction: sensitive content blocked")
            return

        # P1: caution 级先用原文提取, 再脱敏存储
        is_caution = sensitivity == "caution"

        # 2. 跳过逻辑: 短 + 无情感信号才跳过
        if len(user_input.strip()) < 5 and not _has_emotion_signal(user_input):
            return

        try:
            # 3. LLM 提取 (用原文, 保留情感信号)
            from ..extractors.merged_extractor import extract_all
            from ..config import get_soul_config

            extracted = await extract_all(
                user_input, ai_response,
                model=get_soul_config().extraction_model,
            )
            if not extracted:
                return

            # P1: 写入前脱敏 — caution 级清空 summary 中的敏感内容
            if is_caution and extracted.importance:
                extracted.importance.summary = "[用户分享了健康相关信息]"

            # 3.5 Phase 3c: 依赖检测 (在写入前, 利用提取结果)
            try:
                from ..ethics.dependency_detector import check_dependency_signals
                from datetime import datetime, timezone
                emotion_intensity = extracted.emotion.emotion_intensity if extracted.emotion else 0.0
                is_negative = (
                    extracted.emotion
                    and extracted.emotion.user_emotion in ("sadness", "anxiety", "anger")
                )
                today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                check_dependency_signals(
                    user_input, user_id,
                    emotion_intensity=emotion_intensity,
                    is_negative=bool(is_negative),
                    today_str=today,
                )
            except Exception as e:
                logger.debug(f"[Soul] Dependency check failed (non-fatal): {e}")

            # 4. 并行写入 (try/finally 防泄漏) — SOTA: +Graphiti +Mem0
            try:
                results = await asyncio.gather(
                    self._write_emotion(extracted, user_id),
                    self._write_importance(extracted, user_id),
                    self._update_relationship(extracted, user_id),
                    self._detect_breakthrough(extracted, user_id),
                    self._write_story(extracted, user_id),
                    self._write_graph(extracted, user_id),
                    self._write_graphiti(extracted, user_id),          # SOTA: Graphiti 时序图谱
                    self._write_mem0(user_input, ai_response, user_id),  # SOTA: Mem0 对话记忆
                    return_exceptions=True,
                )
                task_names = [
                    "emotion", "importance", "relationship", "breakthrough",
                    "story", "graph", "graphiti", "mem0",
                ]
                for i, r in enumerate(results):
                    if isinstance(r, Exception):
                        logger.warning(f"[Soul] PostProcessor {task_names[i]} write failed: {r}")
            except Exception as e:
                logger.warning(f"[Soul] PostProcessor gather failed: {e}")

        except Exception as e:
            logger.warning(f"[Soul] PostProcessor failed (non-fatal): {e}")

    async def _write_emotion(self, extracted, user_id: str):
        """写入情感标注到 MongoDB"""
        if not extracted.emotion:
            return
        try:
            from ..storage.soul_collections import get_collection, EMOTIONS
            coll = await get_collection(EMOTIONS)
            if coll is None:
                return

            doc = extracted.emotion.model_dump()
            doc["user_id"] = user_id
            await coll.insert_one(doc)
        except Exception as e:
            logger.debug(f"[Soul] Emotion write failed: {e}")

    async def _write_importance(self, extracted, user_id: str):
        """写入重要度到 MongoDB — v3: 包含 is_flashbulb 标记"""
        if not extracted.importance or extracted.importance.score < 0.2:
            return
        try:
            from ..storage.soul_collections import get_collection, IMPORTANCE
            from ..config import get_soul_config
            coll = await get_collection(IMPORTANCE)
            if coll is None:
                return

            # v3: flashbulb 三重条件: peak + intensity >= threshold + importance >= 0.7
            cfg = get_soul_config()
            if (extracted.emotion
                    and extracted.emotion.is_emotional_peak
                    and extracted.emotion.emotion_intensity >= cfg.decay_flashbulb_intensity
                    and extracted.importance.score >= 0.7):
                extracted.importance.is_flashbulb = True

            doc = extracted.importance.model_dump()
            doc["user_id"] = user_id
            await coll.insert_one(doc)
        except Exception as e:
            logger.debug(f"[Soul] Importance write failed: {e}")

    async def _write_story(self, extracted, user_id: str):
        """Phase 2: 写入故事线更新 — Phase 3: StoryUpdate.model_dump() 适配"""
        if not extracted.story_update:
            return
        try:
            from ..narrative.story_thread_tracker import get_story_tracker
            # Phase 3: StoryUpdate 是 Pydantic model, 需要转为 dict
            story_dict = extracted.story_update.model_dump()
            await get_story_tracker().update_from_extraction(story_dict, user_id)
        except Exception as e:
            logger.debug(f"[Soul] Story write failed: {e}")

    async def _write_graph(self, extracted, user_id: str):
        """Phase 3: 写入知识图谱节点和边"""
        if not extracted.semantic_graph:
            return
        try:
            from ..semantic.knowledge_graph import get_knowledge_graph
            kg = get_knowledge_graph()
            graph = extracted.semantic_graph
            nodes = graph.get("nodes", [])[:3]
            edges = graph.get("edges", [])[:2]

            # 先并行写节点 (边依赖节点存在)
            node_tasks = [
                kg.upsert_node(user_id, n.get("label", ""), n.get("category", "other"))
                for n in nodes if n.get("label")
            ]
            if node_tasks:
                await asyncio.gather(*node_tasks, return_exceptions=True)

            # 再并行写边
            edge_tasks = [
                kg.upsert_edge(
                    user_id, e.get("source", ""), e.get("target", ""),
                    e.get("relation", "context"),
                )
                for e in edges if e.get("source") and e.get("target")
            ]
            if edge_tasks:
                await asyncio.gather(*edge_tasks, return_exceptions=True)
        except Exception as e:
            logger.debug(f"[Soul] Graph write failed: {e}")

    async def _write_graphiti(self, extracted, user_id: str):
        """SOTA: 写入 Graphiti 时序知识图谱

        通过 GraphitiAdapter 写入, 不可用时静默跳过 (MongoDB fallback 在 _write_graph 中)。
        """
        if not extracted.semantic_graph:
            return
        try:
            from ..config import get_soul_config
            cfg = get_soul_config()
            if not cfg.graphiti_enabled:
                return

            from ..adapters.graphiti_adapter import get_graphiti_adapter
            adapter = get_graphiti_adapter()
            graph = extracted.semantic_graph
            nodes = graph.get("nodes", [])[:3]
            edges = graph.get("edges", [])[:2]
            await adapter.write_graph_extraction(user_id, nodes, edges)
        except Exception as e:
            logger.debug(f"[Soul] Graphiti write failed (non-fatal): {e}")

    async def _write_mem0(self, user_input: str, ai_response: str, user_id: str):
        """SOTA: 写入 Mem0 对话记忆

        Mem0 内部自动提取实体和事实, 无需手动处理。
        敏感内容过滤在 Mem0Adapter 内部执行。
        """
        try:
            from ..config import get_soul_config
            cfg = get_soul_config()
            if not cfg.mem0_enabled:
                return

            from ..adapters.mem0_adapter import get_mem0_adapter
            adapter = get_mem0_adapter()
            await adapter.write_conversation(user_input, ai_response, user_id)
        except Exception as e:
            logger.debug(f"[Soul] Mem0 write failed (non-fatal): {e}")

    async def _detect_breakthrough(self, extracted, user_id: str):
        """检测突破性事件 — 高情感强度 + 高重要度 = 关系里程碑"""
        try:
            is_breakthrough = (
                extracted.emotion
                and extracted.importance
                and extracted.emotion.emotion_intensity >= 0.7
                and extracted.importance.score >= 0.7
            )
            if not is_breakthrough:
                return

            from ..storage.soul_collections import get_collection, RELATIONSHIPS
            coll = await get_collection(RELATIONSHIPS)
            if coll is None:
                return

            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            event = {
                "type": "breakthrough",
                "emotion": extracted.emotion.user_emotion,
                "intensity": extracted.emotion.emotion_intensity,
                "importance": extracted.importance.score,
                "summary": extracted.importance.summary[:100] if extracted.importance.summary else "",
                "timestamp": now.isoformat(),
            }
            await coll.update_one(
                {"user_id": user_id},
                {"$push": {"breakthrough_events": {"$each": [event], "$slice": -20}}},
            )
            logger.info(f"[Soul] Breakthrough event detected for {user_id[:8]}...: {extracted.emotion.user_emotion} ({extracted.emotion.emotion_intensity:.1f})")
        except Exception as e:
            logger.debug(f"[Soul] Breakthrough detection failed: {e}")

    async def _update_relationship(self, extracted, user_id: str):
        """更新关系信号和阶段"""
        if not extracted.relationship_signals:
            return
        try:
            from ..storage.soul_collections import get_collection, RELATIONSHIPS
            coll = await get_collection(RELATIONSHIPS)
            if coll is None:
                return

            now = datetime.now(timezone.utc)
            today_str = now.strftime("%Y-%m-%d")

            # 计算本轮信号总权重
            total_weight = sum(
                s.get("weight", 1.0) for s in extracted.relationship_signals
            )

            # 使用 upsert 更新
            existing = await coll.find_one({"user_id": user_id})

            if existing:
                # Phase 3b: 回归温暖 — 冷却后首次互动给予 1.5x 权重加成
                if existing.get("cooling_warned"):
                    total_weight *= 1.5

                # P1: 关系弹性 — 降级后 7 天内回来, 额外 2x 加速 (与 1.5x 取 max)
                cooled_at = existing.get("cooled_at")
                if cooled_at:
                    if isinstance(cooled_at, str):
                        cooled_at = datetime.fromisoformat(cooled_at)
                    days_since_cool = (now - cooled_at).days
                    if days_since_cool <= 7:
                        total_weight = max(total_weight, sum(
                            s.get("weight", 1.0) for s in extracted.relationship_signals
                        ) * 2.0)

                # P2: 关系里程碑检测 — 阶段升级时写入 milestone
                old_stage = existing.get("stage", "stranger")
                old_date = existing.get("last_interaction_date")
                new_score = existing.get("accumulated_score", 0) + total_weight
                new_days = existing.get("total_days_active", 0) + (1 if old_date != today_str else 0)

                from ..recall.soul_recall import _calculate_stage
                new_stage = _calculate_stage(new_score, new_days, user_id)
                stage_order = {"stranger": 0, "acquaintance": 1, "familiar": 2, "close": 3, "soulmate": 4}

                # 更新
                update_ops = {
                    "$inc": {
                        "accumulated_score": total_weight,
                        "total_conversations": 1,
                    },
                    "$set": {
                        "last_interaction": now,
                        "last_interaction_date": today_str,
                        "cooling_warned": False,
                        "cooled_from_stage": None,
                        "cooled_at": None,
                        "updated_at": now,
                    },
                    "$push": {
                        "signal_history": {
                            "$each": [
                                {**s, "timestamp": now.isoformat()}
                                for s in extracted.relationship_signals[:5]
                            ],
                            "$slice": -50,  # 只保留最近 50 条
                        }
                    },
                }

                # P2: 阶段升级里程碑
                if (new_stage != old_stage
                        and stage_order.get(new_stage, 0) > stage_order.get(old_stage, 0)):
                    update_ops["$set"]["stage"] = new_stage
                    update_ops["$set"]["stage_entered_at"] = now
                    update_ops["$set"]["recent_milestone"] = f"升级到{new_stage}"

                # Round 3: total_days_active 更新 — 检测日期变化
                if old_date != today_str:
                    update_ops["$inc"]["total_days_active"] = 1

                await coll.update_one({"user_id": user_id}, update_ops)
            else:
                # 新建
                doc = {
                    "user_id": user_id,
                    "stage": "stranger",
                    "stage_entered_at": now,
                    "total_conversations": 1,
                    "total_days_active": 1,
                    "accumulated_score": total_weight,
                    "signal_history": [
                        {**s, "timestamp": now.isoformat()}
                        for s in extracted.relationship_signals[:5]
                    ],
                    "last_interaction": now,
                    "last_interaction_date": today_str,
                    "cooling_warned": False,
                    "updated_at": now,
                }
                await coll.insert_one(doc)

        except Exception as e:
            logger.debug(f"[Soul] Relationship update failed: {e}")


# 单例
_post_processor: Optional[SoulPostProcessor] = None


def get_soul_post_processor() -> SoulPostProcessor:
    """获取灵魂后处理器单例"""
    global _post_processor
    if _post_processor is None:
        _post_processor = SoulPostProcessor()
    return _post_processor
