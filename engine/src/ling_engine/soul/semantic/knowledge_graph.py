"""
知识图谱 — MongoDB 节点+边+$graphLookup 查询

设计:
- 边文档反规范化: source_label/target_label 直接存在边上，避免 $graphLookup 跨集合 join
- 节点唯一键: (user_id, label) — 同一用户同名概念去重
- upsert 语义: 重复节点 → mention_count++, last_confirmed 更新
- confidence 读时计算 (不存储) — 基于 mention_count + 时间衰减
"""

import asyncio
import math
import re
from datetime import datetime, timezone
from hashlib import md5
from typing import Dict, List, Optional

from loguru import logger

# 🧬: confidence 时间衰减常量
CONFIDENCE_HALF_LIFE_DAYS = 180  # 6 个月未提及 → confidence 减半

_kg_instance: Optional["KnowledgeGraph"] = None


def get_knowledge_graph() -> "KnowledgeGraph":
    """单例工厂"""
    global _kg_instance
    if _kg_instance is None:
        _kg_instance = KnowledgeGraph()
    return _kg_instance


def _calc_confidence(mention_count: int, last_confirmed: datetime) -> float:
    """动态计算节点置信度 — 基于提及次数 + 时间衰减

    读时计算，不存储到文档。
    """
    days = (datetime.now(timezone.utc) - last_confirmed).days
    time_factor = 0.5 ** (days / CONFIDENCE_HALF_LIFE_DAYS)
    return min(1.0, 0.3 + 0.1 * math.log(max(mention_count, 1))) * time_factor


class KnowledgeGraph:
    """MongoDB 知识图谱 — 节点+边+$graphLookup 查询"""

    async def _get_nodes_coll(self):
        from ..storage.soul_collections import get_collection, SEMANTIC_NODES
        return await get_collection(SEMANTIC_NODES)

    async def _get_edges_coll(self):
        from ..storage.soul_collections import get_collection, SEMANTIC_EDGES
        return await get_collection(SEMANTIC_EDGES)

    async def upsert_node(
        self, user_id: str, label: str, category: str,
        properties: Dict = None,
    ) -> Optional[str]:
        """upsert 节点 — 原子操作, 无竞态

        使用 update_one(upsert=True) 替代 find+insert。
        label 截断到 50 字符 + 控制字符过滤。
        不存储 confidence (读时计算)。
        """
        # 🔐: 标签清理
        label = re.sub(r'[\x00-\x1f\x7f]', '', label.strip())[:50]
        if not label:
            return None

        coll = await self._get_nodes_coll()
        if coll is None:
            return None

        node_id = f"{user_id}:{md5(label.encode()).hexdigest()[:8]}"
        now = datetime.now(timezone.utc)

        try:
            update_doc = {
                "$inc": {"mention_count": 1},
                "$set": {
                    "last_confirmed": now,
                    "category": category,
                },
                "$setOnInsert": {
                    "node_id": node_id,
                    "first_learned": now,
                    "user_confirmed": False,
                },
            }
            if properties:
                update_doc["$set"]["properties"] = properties

            await coll.update_one(
                {"user_id": user_id, "label": label},
                update_doc,
                upsert=True,
            )
            return node_id
        except Exception as e:
            logger.debug(f"[Soul] KG upsert_node failed: {e}")
            return None

    async def _cascade_label_update(
        self, user_id: str, old_label: str, new_label: str,
    ):
        """label 变更时级联更新 edges 中的 source_label/target_label"""
        coll = await self._get_edges_coll()
        if coll is None:
            return
        try:
            await coll.update_many(
                {"user_id": user_id, "source_label": old_label},
                {"$set": {"source_label": new_label}},
            )
            await coll.update_many(
                {"user_id": user_id, "target_label": old_label},
                {"$set": {"target_label": new_label}},
            )
        except Exception as e:
            logger.debug(f"[Soul] KG cascade label update failed: {e}")

    async def upsert_edge(
        self, user_id: str, source_label: str, target_label: str,
        relation: str, strength: float = 0.5,
    ) -> Optional[str]:
        """upsert 边 — 原子操作, $max 保留最高 strength

        边文档同时存 4 字段: source_id, target_id, source_label, target_label。
        source_label/target_label 用于 $graphLookup; source_id/target_id 用于级联删除。
        """
        coll = await self._get_edges_coll()
        if coll is None:
            return None

        source_id = f"{user_id}:{md5(source_label.encode()).hexdigest()[:8]}"
        target_id = f"{user_id}:{md5(target_label.encode()).hexdigest()[:8]}"
        now = datetime.now(timezone.utc)

        try:
            await coll.update_one(
                {
                    "user_id": user_id,
                    "source_label": source_label,
                    "target_label": target_label,
                    "relation": relation,
                },
                {
                    "$max": {"strength": strength},
                    "$set": {"last_updated": now},
                    "$setOnInsert": {
                        "source_id": source_id,
                        "target_id": target_id,
                        "created_at": now,
                    },
                },
                upsert=True,
            )
            return f"{source_id}->{target_id}"
        except Exception as e:
            logger.debug(f"[Soul] KG upsert_edge failed: {e}")
            return None

    async def trace_context(
        self, user_id: str, start_label: str,
        max_depth: int = 2, limit: int = 5,
    ) -> List[str]:
        """$graphLookup 从起始节点追踪关系链

        只返回 strength > 0.6 的边链路 (置信度门槛)。
        对涉及的节点做 confidence 过滤 (低 confidence 节点的链路不输出)。
        输出加不确定措辞。远期链路 (>90天) 描述更模糊。
        timeout: 200ms
        """
        coll = await self._get_edges_coll()
        if coll is None:
            return []

        try:
            from ..storage.soul_collections import SEMANTIC_EDGES
            pipeline = [
                {"$match": {"user_id": user_id, "source_label": start_label}},
                {"$graphLookup": {
                    "from": SEMANTIC_EDGES,
                    "startWith": "$target_label",
                    "connectFromField": "target_label",
                    "connectToField": "source_label",
                    "as": "chain",
                    "maxDepth": max_depth - 1,
                    "depthField": "depth",
                    "restrictSearchWithMatch": {
                        "user_id": user_id,
                        "strength": {"$gt": 0.6},
                    },
                }},
                {"$project": {
                    "source_label": 1, "target_label": 1, "relation": 1,
                    "strength": 1, "last_updated": 1,
                    "chain.source_label": 1, "chain.target_label": 1,
                    "chain.relation": 1, "chain.depth": 1,
                    "chain.last_updated": 1,
                }},
                {"$limit": limit},
            ]

            # 预加载涉及节点的 confidence (批量查询，不逐个)
            node_confidence = await self._batch_node_confidence(user_id, start_label)

            results = []
            async for doc in coll.aggregate(pipeline):
                # 直接边
                src = doc.get("source_label", "")
                tgt = doc.get("target_label", "")
                rel = doc.get("relation", "related")
                last_upd = doc.get("last_updated")

                # confidence 过滤: 涉及的节点 confidence < 0.3 则跳过
                if self._low_confidence(src, node_confidence) or \
                   self._low_confidence(tgt, node_confidence):
                    continue

                desc = self._format_trace(src, tgt, rel, last_upd)
                if desc:
                    results.append(desc)

                # 链路边
                for chain_item in doc.get("chain", []):
                    c_src = chain_item.get("source_label", "")
                    c_tgt = chain_item.get("target_label", "")
                    c_rel = chain_item.get("relation", "related")
                    c_upd = chain_item.get("last_updated")
                    if self._low_confidence(c_src, node_confidence) or \
                       self._low_confidence(c_tgt, node_confidence):
                        continue
                    desc = self._format_trace(c_src, c_tgt, c_rel, c_upd)
                    if desc:
                        results.append(desc)

            return results[:limit]
        except Exception as e:
            logger.debug(f"[Soul] KG trace_context failed: {e}")
            return []

    async def _batch_node_confidence(
        self, user_id: str, start_label: str,
    ) -> Dict[str, float]:
        """批量查询起始标签相关节点的 confidence (读时计算)"""
        nodes_coll = await self._get_nodes_coll()
        if nodes_coll is None:
            return {}
        try:
            cursor = nodes_coll.find(
                {"user_id": user_id},
                projection={"label": 1, "mention_count": 1, "last_confirmed": 1, "_id": 0},
                limit=50,
            )
            conf_map = {}
            async for doc in cursor:
                label = doc.get("label", "")
                mc = doc.get("mention_count", 1)
                lc = doc.get("last_confirmed")
                if label and lc:
                    conf_map[label] = _calc_confidence(mc, lc)
            return conf_map
        except Exception:
            return {}

    @staticmethod
    def _low_confidence(label: str, conf_map: Dict[str, float]) -> bool:
        """检查节点是否 confidence 过低 (< 0.3 视为不可靠)"""
        if not label or label not in conf_map:
            return False  # 未知节点不过滤 (可能是边上的 label 未收录为节点)
        return conf_map[label] < 0.3

    @staticmethod
    def _format_trace(
        source: str, target: str, relation: str,
        last_updated: Optional[datetime] = None,
    ) -> Optional[str]:
        """格式化追踪结果 — 加不确定措辞, 远期更模糊"""
        if not source or not target:
            return None

        # 🧬: 远期链路 (>90天) 描述更模糊
        days_ago = 0
        if last_updated:
            try:
                if isinstance(last_updated, datetime):
                    days_ago = (datetime.now(timezone.utc) - last_updated).days
            except Exception:
                pass

        rel_map = {
            "cause": "可能导致了",
            "goal": "的目标可能是",
            "method": "可能通过",
            "context": "可能与…有关联",
            "part_of": "可能是…的一部分",
            "conflict": "可能与…存在矛盾",
            "leads_to": "可能会引向",
        }
        rel_text = rel_map.get(relation, "可能与…有关")

        if days_ago > 90:
            return f"好像提到过{source}和{target}之间有某种联系"
        else:
            return f"{source}{rel_text}{target}"

    async def find_matching_labels(
        self, user_id: str, query: str, limit: int = 2,
    ) -> List[str]:
        """从用户消息中提取概念词，用 $or + $regex 匹配知识图谱节点

        分词策略: 提取英文单词(含 C++/.NET 等) + 中文 2-4 字词组。
        按 mention_count 降序排序，频繁提及的概念优先匹配。
        用 re.escape() 转义特殊字符。
        """
        coll = await self._get_nodes_coll()
        if coll is None:
            return []

        try:
            query_clean = query.strip()[:100]
            if not query_clean:
                return []

            # 分词: 英文单词(含特殊字符如 C++, .NET) + 中文 2-4 字词组
            tokens = re.findall(r'[a-zA-Z][a-zA-Z0-9+#.]*|[\u4e00-\u9fff]{2,4}', query_clean)
            if not tokens:
                return []

            # 去重 + 取前 5 个 token
            seen = set()
            unique_tokens = []
            for t in tokens:
                t_lower = t.lower()
                if t_lower not in seen:
                    seen.add(t_lower)
                    unique_tokens.append(t)
            unique_tokens = unique_tokens[:5]

            # $or 查询: 任一 token 匹配即命中
            regex_filters = [
                {"label": {"$regex": re.escape(t), "$options": "i"}}
                for t in unique_tokens
            ]
            cursor = coll.find(
                {"user_id": user_id, "$or": regex_filters},
                sort=[("mention_count", -1)],
                limit=limit,
            )
            results = []
            async for doc in cursor:
                label = doc.get("label", "")
                if label:
                    results.append(label)
            return results
        except Exception as e:
            logger.debug(f"[Soul] KG find_matching_labels failed: {e}")
            return []

    async def delete_node_cascade(self, user_id: str, node_id: str) -> int:
        """删除节点 + 级联删除所有关联边

        返回总删除数 (节点 + 边)。
        """
        nodes_coll = await self._get_nodes_coll()
        edges_coll = await self._get_edges_coll()
        if nodes_coll is None:
            return 0

        total = 0
        try:
            # 删除节点
            result = await nodes_coll.delete_one(
                {"user_id": user_id, "node_id": node_id},
            )
            total += result.deleted_count

            # 级联删除关联边
            if edges_coll is not None:
                result = await edges_coll.delete_many(
                    {"user_id": user_id, "$or": [
                        {"source_id": node_id},
                        {"target_id": node_id},
                    ]},
                )
                total += result.deleted_count
        except Exception as e:
            logger.debug(f"[Soul] KG delete_node_cascade failed: {e}")

        return total
