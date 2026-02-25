"""
灵魂后处理器 — 异步处理对话后的记忆写入
修复: NEVER_STORE 检查, 情感关键词跳过逻辑, 并发控制, gather 异常检查
SOTA: +Graphiti 图谱写入, +Mem0 对话记忆写入
"""

import asyncio
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from loguru import logger

from ..utils.validation import is_valid_user_id

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

    @staticmethod
    def _is_flashbulb(extracted, intensity_threshold: float) -> bool:
        """统一 flashbulb 判定，确保 emotion/importance 使用同一规则。"""
        return bool(
            extracted.emotion
            and extracted.importance
            and extracted.emotion.is_emotional_peak
            and extracted.emotion.emotion_intensity >= intensity_threshold
            and extracted.importance.score >= 0.7
        )

    async def process(
        self,
        user_input: str,
        ai_response: str,
        user_id: str,
        client_uid: str = "",
        conversation_id: str = "",
    ):
        """处理一轮对话的后处理"""
        if not is_valid_user_id(user_id):
            logger.warning("[Soul] Invalid user_id format, skipping post-process")
            return
        async with _semaphore:
            await self._process_inner(
                user_input=user_input,
                ai_response=ai_response,
                user_id=user_id,
                client_uid=client_uid,
                conversation_id=conversation_id,
            )

    async def _process_inner(
        self,
        user_input: str,
        ai_response: str,
        user_id: str,
        client_uid: str = "",
        conversation_id: str = "",
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
                    self._ingest_memory_atom(
                        extracted=extracted,
                        user_input=user_input,
                        ai_response=ai_response,
                        user_id=user_id,
                        client_uid=client_uid,
                        conversation_id=conversation_id,
                        is_caution=is_caution,
                    ),
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
                    "memory_atom", "emotion", "importance", "relationship", "breakthrough",
                    "story", "graph", "graphiti", "mem0",
                ]
                for i, r in enumerate(results):
                    if isinstance(r, Exception):
                        logger.warning(f"[Soul] PostProcessor {task_names[i]} write failed: {r}")
            except Exception as e:
                logger.warning(f"[Soul] PostProcessor gather failed: {e}")

        except Exception as e:
            logger.warning(f"[Soul] PostProcessor failed (non-fatal): {e}")

    async def _ingest_memory_atom(
        self,
        extracted,
        user_input: str,
        ai_response: str,
        user_id: str,
        client_uid: str = "",
        conversation_id: str = "",
        is_caution: bool = False,
    ):
        """将对话轮次写入 Memory Fabric 的统一 MemoryAtom 主链路。"""
        try:
            from ..config import get_soul_config

            cfg = get_soul_config()
            if not (cfg.enabled and cfg.fabric_enabled):
                return

            from soul_fabric import MemoryEventRequest, get_memory_fabric

            flashbulb = self._is_flashbulb(extracted, cfg.decay_flashbulb_intensity)
            memory_type = "flashbulb_episode" if flashbulb else "episode"
            event_time = datetime.now(timezone.utc)
            idempotency_key = self._build_event_idempotency_key(
                user_id=user_id,
                client_uid=client_uid,
                conversation_id=conversation_id,
                user_input=user_input,
                ai_response=ai_response,
                event_time=event_time,
            )
            entities = []
            relations = []
            if extracted.semantic_graph:
                entities = [
                    str(n.get("label", "")).strip()
                    for n in extracted.semantic_graph.get("nodes", [])[:12]
                    if str(n.get("label", "")).strip()
                ]
                relations = [
                    {
                        "source": str(e.get("source", "")),
                        "target": str(e.get("target", "")),
                        "relation": str(e.get("relation", "context")),
                    }
                    for e in extracted.semantic_graph.get("edges", [])[:12]
                    if e.get("source") and e.get("target")
                ]

            affect = {}
            if extracted.emotion:
                affect = {
                    "user_emotion": extracted.emotion.user_emotion,
                    "emotion_intensity": extracted.emotion.emotion_intensity,
                    "is_emotional_peak": extracted.emotion.is_emotional_peak,
                    "trajectory": extracted.emotion.emotional_trajectory,
                }

            salience = extracted.importance.score if extracted.importance else 0.0
            trust_score = 0.45 if is_caution else 0.75
            confidence = 0.75 if extracted.importance else 0.6
            content = f"用户: {user_input.strip()}\nAI: {ai_response.strip()}"

            req = MemoryEventRequest(
                idempotency_key=idempotency_key,
                tenant_id="default",
                user_id=user_id,
                session_id=client_uid or None,
                agent_id="ling",
                event_time=event_time,
                source="conversation_post_processor",
                modality="text",
                memory_type=memory_type,
                content_raw=content[:8000],
                content_norm=content[:8000],
                entities=entities,
                relations=relations,
                affect=affect,
                salience=max(0.0, min(1.0, float(salience))),
                confidence=max(0.0, min(1.0, float(confidence))),
                trust_score=max(0.0, min(1.0, float(trust_score))),
                provenance={
                    "pipeline": "soul_post_processor",
                    "conversation_id": conversation_id,
                    "client_uid": client_uid,
                },
                retention_policy="flashbulb" if flashbulb else "default",
                pii_tags=["sensitive"] if is_caution else [],
                legal_basis="service_operation",
            )
            await get_memory_fabric().ingest_event(req=req, actor_id=user_id)
        except Exception as e:
            logger.warning(f"[Soul] MemoryAtom ingest failed (non-fatal): {e}")

    @staticmethod
    def _build_event_idempotency_key(
        user_id: str,
        client_uid: str,
        conversation_id: str,
        user_input: str,
        ai_response: str,
        event_time: datetime,
    ) -> str:
        """构造对话轮次幂等键，尽量吸收重试请求。"""
        raw = (
            f"{user_id}|{client_uid}|{conversation_id}|"
            f"{event_time.replace(microsecond=0).isoformat()}|"
            f"{user_input.strip()}|{ai_response.strip()}"
        )
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        return f"turn_{digest}"

    async def _write_emotion(self, extracted, user_id: str):
        """写入情感标注到 MongoDB"""
        if not extracted.emotion:
            return
        try:
            from ..storage.soul_collections import get_collection, EMOTIONS
            from ..config import get_soul_config
            coll = await get_collection(EMOTIONS)
            if coll is None:
                return

            doc = extracted.emotion.model_dump()
            doc["user_id"] = user_id
            created_at = doc.get("created_at")
            if not isinstance(created_at, datetime):
                created_at = datetime.now(timezone.utc)
                doc["created_at"] = created_at
            if self._is_flashbulb(extracted, get_soul_config().decay_flashbulb_intensity):
                doc["no_expire"] = True
            else:
                doc["expires_at"] = created_at + timedelta(days=180)
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
            if self._is_flashbulb(extracted, cfg.decay_flashbulb_intensity):
                extracted.importance.is_flashbulb = True

            doc = extracted.importance.model_dump()
            doc["user_id"] = user_id
            created_at = doc.get("created_at")
            if not isinstance(created_at, datetime):
                created_at = datetime.now(timezone.utc)
                doc["created_at"] = created_at
            if doc.get("is_flashbulb"):
                doc["no_expire"] = True
            else:
                doc["expires_at"] = created_at + timedelta(days=180)
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
            from pymongo import ReturnDocument
            coll = await get_collection(RELATIONSHIPS)
            if coll is None:
                return

            now = datetime.now(timezone.utc)
            today_str = now.strftime("%Y-%m-%d")

            # 计算本轮信号总权重
            base_weight = sum(
                s.get("weight", 1.0) for s in extracted.relationship_signals
            )
            total_weight = base_weight
            existing = await coll.find_one(
                {"user_id": user_id},
                {
                    "cooling_warned": 1,
                    "cooled_at": 1,
                    "last_interaction_date": 1,
                },
            )

            # Phase 3b: 回归温暖 — 冷却后首次互动给予 1.5x 权重加成
            if existing and existing.get("cooling_warned"):
                total_weight *= 1.5

            # P1: 关系弹性 — 降级后 7 天内回来, 额外 2x 加速 (与 1.5x 取 max)
            cooled_at = existing.get("cooled_at") if existing else None
            if cooled_at:
                if isinstance(cooled_at, str):
                    cooled_at = datetime.fromisoformat(cooled_at)
                days_since_cool = (now - cooled_at).days
                if days_since_cool <= 7:
                    total_weight = max(total_weight, base_weight * 2.0)

            # 原子更新基础字段，并返回更新后的文档用于阶段计算。
            update_ops = {
                "$inc": {
                    "accumulated_score": total_weight,
                    "total_conversations": 1,
                },
                "$set": {
                    "last_interaction": now,
                    "cooling_warned": False,
                    "cooled_from_stage": None,
                    "cooled_at": None,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "user_id": user_id,
                    "stage": "stranger",
                    "stage_entered_at": now,
                    "total_days_active": 1,
                    "last_interaction_date": today_str,
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

            updated = await coll.find_one_and_update(
                {"user_id": user_id},
                update_ops,
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
            if not updated:
                return

            # 并发安全: 同一自然日仅允许一次 +1。
            if existing and existing.get("last_interaction_date") != today_str:
                await coll.update_one(
                    {
                        "_id": updated["_id"],
                        "last_interaction_date": {"$ne": today_str},
                    },
                    {
                        "$inc": {"total_days_active": 1},
                        "$set": {"last_interaction_date": today_str},
                    },
                )

            refreshed = await coll.find_one(
                {"_id": updated["_id"]},
                {"accumulated_score": 1, "total_days_active": 1, "stage": 1},
            )
            if refreshed:
                updated = refreshed

            from ..recall.soul_recall import _calculate_stage

            stage_order = {
                "stranger": 0,
                "acquaintance": 1,
                "familiar": 2,
                "close": 3,
                "soulmate": 4,
            }
            old_stage = updated.get("stage", "stranger")
            new_stage = _calculate_stage(
                updated.get("accumulated_score", 0),
                updated.get("total_days_active", 0),
                user_id,
            )

            # CAS: 仅当 stage 仍是旧值时升级，避免并发重复里程碑。
            if (
                new_stage != old_stage
                and stage_order.get(new_stage, 0) > stage_order.get(old_stage, 0)
            ):
                await coll.update_one(
                    {"_id": updated["_id"], "stage": old_stage},
                    {
                        "$set": {
                            "stage": new_stage,
                            "stage_entered_at": now,
                            "recent_milestone": f"升级到{new_stage}",
                        }
                    },
                )

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


def reset_soul_post_processor_for_testing():
    """测试辅助: 重置后处理器单例。"""
    global _post_processor
    _post_processor = None
