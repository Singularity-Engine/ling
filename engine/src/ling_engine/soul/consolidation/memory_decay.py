"""多因子记忆衰减 — Phase 3b-alpha

乘法保护模型 (R2 大师审议修正):
  decay = base_rate * (1 - protection)
  recall_strength = importance * (1 - decay) ^ days

保护因子按比例缩减衰减率, 而非从中减去 → 真正的连续梯度。
flashbulb 记忆 (三重条件) 永不衰减。
"""

import time
from datetime import datetime, timezone
from typing import Dict, Optional

from loguru import logger

# P2: 魔法数字常量化
DECAY_ABSOLUTE_FLOOR = 0.0005  # 极度保护记忆的最小衰减率
DECAY_THRESHOLD = 0.1          # recall_strength 低于此值标记为 decayed
LABEL_MIN_LENGTH = 3           # label 匹配最小长度 (避免 "我" "是" 等误匹配)


def recall_strength(
    importance: float,
    days: float,
    is_flashbulb: bool,
    span_days: float,
    intensity: float,
    links: int,
    base_rate: float = 0.03,
    emotion_weight: float = 0.5,
) -> float:
    """多因子衰减公式 — 乘法保护模型

    Args:
        importance: 原始重要度 (0-1)
        days: 距创建天数
        is_flashbulb: 是否为闪光灯记忆 (永不衰减)
        span_days: 重复提及间隔天数 (3b-alpha: 暂用 0, 3b-beta 从重复提及获取)
        intensity: 情感强度 (0-1)
        links: 知识图谱连接数 (3b-alpha: 暂用 0, 3b-beta 从边数获取)
        base_rate: 基础衰减率 (默认 0.03, 无保护记忆 90d→6.6%)
        emotion_weight: 情感保护占比 (默认 0.5)

    Returns:
        衰减后的 recall_strength (0-1)
    """
    if is_flashbulb:
        return importance

    # 各保护因子 (0→max 范围), 加总后 cap 在 0.95 (flashbulb 才完全保护)
    emotion_protection = intensity * emotion_weight           # 情感锚定: 0→0.5
    spacing_protection = min(span_days / 90, 1.0) * 0.3      # 间隔效应: 0→0.3 (3b-alpha: 0)
    connection_protection = min(links / 4, 1.0) * 0.2        # 连接密度: 0→0.2 (3b-alpha: 0)

    protection = min(emotion_protection + spacing_protection + connection_protection, 0.95)
    decay = base_rate * (1 - protection)
    decay = max(decay, DECAY_ABSOLUTE_FLOOR)  # 绝对地板: 极度保护的记忆仍有微量衰减
    return importance * (1 - decay) ** days


async def query_active_importance(user_id: str, limit: int = 20) -> list:
    """查询未衰减的重要记忆 — 供召回路径使用

    任何需要读取 importance 记录的路径都应使用此函数,
    而非直接查询集合, 以确保 decayed 记忆被正确过滤。

    3b-beta: 将集成到 soul_recall 作为第 9 路召回源。
    """
    from ..storage.soul_collections import get_collection, IMPORTANCE

    coll = await get_collection(IMPORTANCE)
    if coll is None:
        return []

    try:
        cursor = coll.find(
            {"user_id": user_id, "decayed": {"$ne": True}},
            sort=[("created_at", -1)],
            limit=limit,
            batch_size=limit,
        )
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
        return results
    except Exception as e:
        logger.debug(f"[Decay] query_active_importance failed: {e}")
        return []


class MemoryDecayProcessor:
    """遍历 soul_importance, 计算衰减, 标记低价值记忆"""

    def __init__(self):
        from ..config import get_soul_config
        self._cfg = get_soul_config()

    async def process_all_users(self, dry_run: bool = False) -> Dict:
        """遍历所有用户, 执行衰减计算"""
        from ..storage.soul_collections import get_collection, IMPORTANCE

        coll = await get_collection(IMPORTANCE)
        if coll is None:
            return {"status": "skipped", "reason": "collection_unavailable"}

        start = time.monotonic()
        # 获取所有有 importance 记录的用户
        user_ids = await coll.distinct("user_id")
        total_processed = 0
        total_decayed = 0
        total_flashbulb = 0

        for uid in user_ids:
            try:
                result = await self._process_user(uid, dry_run)
                total_processed += result.get("processed", 0)
                total_decayed += result.get("decayed", 0)
                total_flashbulb += result.get("flashbulb", 0)
            except Exception as e:
                logger.warning(f"[Decay] User {uid[:8]}... failed: {e}")

        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "ok",
            "users": len(user_ids),
            "processed": total_processed,
            "decayed": total_decayed,
            "flashbulb": total_flashbulb,
            "elapsed_ms": elapsed_ms,
            "dry_run": dry_run,
        }

    async def _process_user(self, user_id: str, dry_run: bool) -> Dict:
        """单用户衰减处理

        1. 批量查询 importance 记录 (batch_size)
        2. 一次性预加载该用户所有 emotions (避免 N+1)
        3. 预加载 span_days + links (3b-beta: 真实数据)
        4. 计算 recall_strength
        5. recall_strength < 0.1 → 标记 decayed: true
        6. flashbulb 三重条件: is_emotional_peak AND intensity >= threshold AND importance >= 0.7
        """
        from ..storage.soul_collections import get_collection, IMPORTANCE, EMOTIONS

        imp_coll = await get_collection(IMPORTANCE)
        if imp_coll is None:
            return {"processed": 0, "decayed": 0, "flashbulb": 0}

        batch_size = self._cfg.consolidation_batch_size
        base_rate = self._cfg.decay_base_rate
        emotion_weight = self._cfg.decay_emotion_weight
        flashbulb_intensity = self._cfg.decay_flashbulb_intensity
        now = datetime.now(timezone.utc)

        # 一次性预加载该用户的 emotions (避免 N+1 查询)
        emotion_map = await self._preload_emotions(user_id)

        # Phase 3b-beta: 预加载 span_days (重复提及间隔)
        span_days_map = await self._preload_span_days(user_id)

        # Phase 3b-beta: 预加载 links (知识图谱边数)
        links_map = await self._preload_links(user_id)

        processed = 0
        decayed = 0
        flashbulb_count = 0
        bulk_ops = []  # 攒批 bulk_write

        cursor = imp_coll.find(
            {"user_id": user_id},
            batch_size=batch_size,
        )
        async for doc in cursor:
            processed += 1
            importance_score = doc.get("score", 0.0)
            created_at = doc.get("created_at")
            if not created_at or not isinstance(created_at, datetime):
                continue

            days = max((now - created_at).total_seconds() / 86400, 0)

            # 匹配 emotion: 按 created_at ±60s 时间窗口
            intensity = self._match_emotion_intensity(created_at, emotion_map)
            is_peak = self._match_emotion_peak(created_at, emotion_map)

            # v3: 优先使用持久化的 is_flashbulb, 回退到三重条件计算
            is_fb = doc.get("is_flashbulb", False)
            if not is_fb:
                is_fb = (
                    is_peak
                    and intensity >= flashbulb_intensity
                    and importance_score >= 0.7
                )
            if is_fb:
                flashbulb_count += 1

            # Phase 3b-beta: 获取 span_days 和 links
            summary = doc.get("summary", "")
            span = span_days_map.get(summary[:50], 0.0)
            links = self._get_links_for_doc(doc, links_map)

            # 计算 recall_strength
            rs = recall_strength(
                importance=importance_score,
                days=days,
                is_flashbulb=is_fb,
                span_days=span,
                intensity=intensity,
                links=links,
                base_rate=base_rate,
                emotion_weight=emotion_weight,
            )

            # 标记低价值记忆 + v3: 持久化 span/links/flashbulb
            if not dry_run:
                from pymongo import UpdateOne
                base_set = {
                    "recall_strength": rs,
                    "mention_span_days": int(span),
                    "linked_memory_count": links,
                    "is_flashbulb": is_fb,
                }
                if rs < DECAY_THRESHOLD:
                    base_set["decayed"] = True
                    bulk_ops.append(UpdateOne(
                        {"_id": doc["_id"]},
                        {"$set": base_set},
                    ))
                    decayed += 1
                else:
                    update = {"$set": base_set}
                    if doc.get("decayed"):
                        update["$unset"] = {"decayed": ""}
                    bulk_ops.append(UpdateOne({"_id": doc["_id"]}, update))

                # 每 batch_size 条刷一次
                if len(bulk_ops) >= batch_size:
                    await imp_coll.bulk_write(bulk_ops, ordered=False)
                    bulk_ops.clear()

        # 刷出剩余
        if bulk_ops and not dry_run:
            await imp_coll.bulk_write(bulk_ops, ordered=False)

        return {"processed": processed, "decayed": decayed, "flashbulb": flashbulb_count}

    async def _preload_emotions(self, user_id: str) -> Dict[int, Dict]:
        """一次性加载用户所有 emotions, 按 created_at 的 epoch 秒分桶

        Returns:
            dict: {epoch_second: {"intensity": float, "is_peak": bool}}
        """
        from ..storage.soul_collections import get_collection, EMOTIONS

        emo_coll = await get_collection(EMOTIONS)
        if emo_coll is None:
            return {}

        emotion_map: Dict[int, Dict] = {}
        cursor = emo_coll.find(
            {"user_id": user_id},
            projection={
                "created_at": 1, "emotion_intensity": 1,
                "is_emotional_peak": 1, "_id": 0,
            },
            batch_size=self._cfg.consolidation_batch_size,
        )
        async for doc in cursor:
            ca = doc.get("created_at")
            if ca and isinstance(ca, datetime):
                epoch = int(ca.timestamp())
                emotion_map[epoch] = {
                    "intensity": doc.get("emotion_intensity", 0.0),
                    "is_peak": doc.get("is_emotional_peak", False),
                }
        return emotion_map

    async def _preload_span_days(self, user_id: str) -> Dict[str, float]:
        """预加载重复提及间隔 — 同一 summary 前缀出现的最早和最晚时间差

        Phase 3b-beta: 如果某个话题被用户在不同时间段反复提及,
        说明它对用户很重要 (间隔效应), 应受到更多衰减保护。

        Returns:
            dict: {summary_prefix_50: span_days}
        """
        from ..storage.soul_collections import get_collection, IMPORTANCE

        imp_coll = await get_collection(IMPORTANCE)
        if imp_coll is None:
            return {}

        span_map: Dict[str, float] = {}
        # 用 summary 的前 50 字符作为分组 key (近似文本匹配)
        time_ranges: Dict[str, list] = {}  # {prefix: [created_at1, created_at2, ...]}

        try:
            cursor = imp_coll.find(
                {"user_id": user_id, "summary": {"$exists": True}},
                projection={"summary": 1, "created_at": 1, "_id": 0},
                batch_size=self._cfg.consolidation_batch_size,
            )
            async for doc in cursor:
                summary = doc.get("summary", "")
                ca = doc.get("created_at")
                if not summary or not ca or not isinstance(ca, datetime):
                    continue
                prefix = summary[:50]
                if prefix not in time_ranges:
                    time_ranges[prefix] = []
                time_ranges[prefix].append(ca)

            for prefix, times in time_ranges.items():
                if len(times) >= 2:
                    times.sort()
                    span = (times[-1] - times[0]).total_seconds() / 86400
                    span_map[prefix] = span
        except Exception as e:
            logger.debug(f"[Decay] span_days preload failed: {e}")

        return span_map

    async def _preload_links(self, user_id: str) -> Dict[str, int]:
        """预加载知识图谱连接数 — 每个 summary 关键词在图谱中的边数

        Phase 3b-beta: 如果一个概念在知识图谱中有多条边连接,
        说明它是用户知识网络的核心节点, 应受到更多保护。

        Returns:
            dict: {label_lower: link_count}
        """
        from ..storage.soul_collections import get_collection, SEMANTIC_EDGES, SEMANTIC_NODES

        nodes_coll = await get_collection(SEMANTIC_NODES)
        edges_coll = await get_collection(SEMANTIC_EDGES)
        if nodes_coll is None or edges_coll is None:
            return {}

        try:
            # 获取用户所有节点的 label → 边数映射
            node_labels = set()
            node_cursor = nodes_coll.find(
                {"user_id": user_id},
                projection={"label": 1, "_id": 0},
                batch_size=200,
            )
            async for doc in node_cursor:
                label = doc.get("label", "")
                if label:
                    node_labels.add(label.lower())

            if not node_labels:
                return {}

            # 统计每个 label 作为 source 或 target 的边数
            label_link_count: Dict[str, int] = {}
            edge_cursor = edges_coll.find(
                {"user_id": user_id},
                projection={"source_label": 1, "target_label": 1, "_id": 0},
                batch_size=self._cfg.consolidation_batch_size,
            )
            async for doc in edge_cursor:
                src = (doc.get("source_label") or "").lower()
                tgt = (doc.get("target_label") or "").lower()
                if src:
                    label_link_count[src] = label_link_count.get(src, 0) + 1
                if tgt:
                    label_link_count[tgt] = label_link_count.get(tgt, 0) + 1

            return label_link_count

        except Exception as e:
            logger.debug(f"[Decay] links preload failed: {e}")

        return {}

    def _get_links_for_doc(self, doc: dict, label_counts: Dict[str, int]) -> int:
        """根据 importance 文档的 summary 匹配知识图谱连接数"""
        if not label_counts:
            return 0

        summary = (doc.get("summary") or "").lower()
        if not summary:
            return 0

        # 匹配: summary 中包含的 label 的最大边数
        max_links = 0
        for label, count in label_counts.items():
            if len(label) >= LABEL_MIN_LENGTH and label in summary:
                max_links = max(max_links, count)
        return max_links

    @staticmethod
    def _match_emotion_intensity(
        created_at: datetime, emotion_map: Dict[int, Dict],
    ) -> float:
        """按 ±60s 时间窗口匹配 emotion intensity — 取最高值"""
        epoch = int(created_at.timestamp())
        max_intensity = 0.0
        for offset in range(-60, 61):
            entry = emotion_map.get(epoch + offset)
            if entry:
                intensity = entry.get("intensity", 0.0)
                if intensity > max_intensity:
                    max_intensity = intensity
        return max_intensity

    @staticmethod
    def _match_emotion_peak(
        created_at: datetime, emotion_map: Dict[int, Dict],
    ) -> bool:
        """按 ±60s 时间窗口匹配是否为情感高峰"""
        epoch = int(created_at.timestamp())
        for offset in range(-60, 61):
            entry = emotion_map.get(epoch + offset)
            if entry and entry.get("is_peak"):
                return True
        return False
