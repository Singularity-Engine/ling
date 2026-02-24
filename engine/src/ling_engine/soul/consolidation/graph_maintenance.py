"""知识图谱维护 — 节点去重 + 矛盾检测 + 传递推理

Phase 3b-alpha: 离线批处理, 由 NightlyConsolidator 编排调用。
v3 补完: 传递推理 — 发现 A→B, B→C 时记录潜在 A→C 关系。
"""

import time
from typing import Dict

from loguru import logger


class GraphMaintenance:
    """知识图谱离线维护"""

    async def process_all_users(self, dry_run: bool = False) -> Dict:
        """遍历所有有节点的用户"""
        from ..storage.soul_collections import get_collection, SEMANTIC_NODES

        nodes_coll = await get_collection(SEMANTIC_NODES)
        if nodes_coll is None:
            return {"status": "skipped", "reason": "collection_unavailable"}

        start = time.monotonic()
        user_ids = await nodes_coll.distinct("user_id")

        total_merged = 0
        total_contradictions = 0
        total_transitive = 0

        for uid in user_ids:
            try:
                merged = await self._merge_duplicate_nodes(uid, dry_run)
                total_merged += merged
            except Exception as e:
                logger.warning(f"[GraphMaint] Merge failed for user {uid[:8]}...: {e}")

            try:
                contradictions = await self._detect_contradictions(uid)
                total_contradictions += contradictions
            except Exception as e:
                logger.warning(f"[GraphMaint] Contradiction detection failed for user {uid[:8]}...: {e}")

            try:
                transitive = await self._discover_transitive_relations(uid, dry_run)
                total_transitive += transitive
            except Exception as e:
                logger.warning(f"[GraphMaint] Transitive discovery failed for user {uid[:8]}...: {e}")

        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "ok",
            "users": len(user_ids),
            "merged": total_merged,
            "contradictions": total_contradictions,
            "transitive_discovered": total_transitive,
            "elapsed_ms": elapsed_ms,
            "dry_run": dry_run,
        }

    async def _merge_duplicate_nodes(self, user_id: str, dry_run: bool) -> int:
        """合并重复节点

        1. 查询用户所有节点
        2. 按 label.lower() 分组
        3. 同组 >1 个 → 保留 mention_count 最高的
        4. 合并: 累加 mention_count + _cascade_label_update + delete_node_cascade
        5. 前缀匹配: "React" 和 "React.js" → 保留较短的
        """
        from ..storage.soul_collections import get_collection, SEMANTIC_NODES
        from ..semantic.knowledge_graph import get_knowledge_graph
        from ..config import get_soul_config

        nodes_coll = await get_collection(SEMANTIC_NODES)
        if nodes_coll is None:
            return 0

        kg = get_knowledge_graph()
        batch_size = get_soul_config().consolidation_batch_size

        # 加载所有节点
        nodes_by_lower: Dict[str, list] = {}
        cursor = nodes_coll.find(
            {"user_id": user_id},
            batch_size=batch_size,
        )
        async for doc in cursor:
            label = doc.get("label", "")
            key = label.lower().strip()
            if key:
                nodes_by_lower.setdefault(key, []).append(doc)

        merged_count = 0

        # 精确匹配去重: 同 label.lower()
        for key, group in nodes_by_lower.items():
            if len(group) <= 1:
                continue

            if dry_run:
                merged_count += len(group) - 1
                continue

            # 保留 mention_count 最高的节点
            group.sort(key=lambda d: d.get("mention_count", 0), reverse=True)
            primary = group[0]
            primary_label = primary.get("label", "")

            for dup in group[1:]:
                dup_label = dup.get("label", "")
                dup_id = dup.get("node_id", "")
                dup_count = dup.get("mention_count", 0)

                # 累加 mention_count 到 primary
                await nodes_coll.update_one(
                    {"user_id": user_id, "label": primary_label},
                    {"$inc": {"mention_count": dup_count}},
                )

                # 级联更新边中的 label 引用
                if dup_label != primary_label:
                    await kg._cascade_label_update(user_id, dup_label, primary_label)

                # 删除重复节点 + 关联边
                await kg.delete_node_cascade(user_id, dup_id)
                merged_count += 1

        # 前缀匹配: "React" 和 "React.js" → 保留较短的
        # 重新加载 (精确去重可能删了一些, dry_run 也需刷新以准确计数)
        if merged_count > 0:
            nodes_by_lower.clear()
            cursor = nodes_coll.find(
                {"user_id": user_id},
                batch_size=batch_size,
            )
            async for doc in cursor:
                label = doc.get("label", "")
                key = label.lower().strip()
                if key:
                    nodes_by_lower.setdefault(key, []).append(doc)

        # 前缀检测: 按长度排序, 检查短 label 是否为长 label 的前缀
        all_keys = sorted(nodes_by_lower.keys(), key=len)
        merged_keys = set()
        for i, short_key in enumerate(all_keys):
            if short_key in merged_keys:
                continue
            for long_key in all_keys[i + 1:]:
                if long_key in merged_keys:
                    continue
                # 前缀匹配 (如 "react" 和 "react.js")
                if long_key.startswith(short_key) and len(long_key) - len(short_key) <= 4:
                    if dry_run:
                        merged_count += 1
                        merged_keys.add(long_key)
                        continue

                    short_group = nodes_by_lower.get(short_key, [])
                    long_group = nodes_by_lower.get(long_key, [])
                    if not short_group or not long_group:
                        continue

                    # 保留较短的 label
                    primary = short_group[0]
                    primary_label = primary.get("label", "")
                    for dup in long_group:
                        dup_label = dup.get("label", "")
                        dup_id = dup.get("node_id", "")
                        dup_count = dup.get("mention_count", 0)
                        await nodes_coll.update_one(
                            {"user_id": user_id, "label": primary_label},
                            {"$inc": {"mention_count": dup_count}},
                        )
                        if dup_label != primary_label:
                            await kg._cascade_label_update(user_id, dup_label, primary_label)
                        await kg.delete_node_cascade(user_id, dup_id)
                        merged_count += 1
                    merged_keys.add(long_key)

        return merged_count

    async def _detect_contradictions(self, user_id: str) -> int:
        """检测矛盾边

        1. 聚合: group by (source_label, target_label), 找 >1 条不同 relation 的
        2. 特别关注 conflict 类型
        3. 只记录矛盾数量 (不记录具体 label, 避免 PII)
        4. 不自动删除
        """
        from ..storage.soul_collections import get_collection, SEMANTIC_EDGES

        edges_coll = await get_collection(SEMANTIC_EDGES)
        if edges_coll is None:
            return 0

        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {
                "_id": {"src": "$source_label", "tgt": "$target_label"},
                "relations": {"$addToSet": "$relation"},
                "count": {"$sum": 1},
            }},
            {"$match": {"count": {"$gt": 1}}},
        ]

        contradiction_count = 0
        async for doc in edges_coll.aggregate(pipeline):
            relations = doc.get("relations", [])
            if len(relations) > 1:
                contradiction_count += 1
                # 特别标记包含 conflict 类型的
                if "conflict" in relations:
                    logger.info(
                        f"[GraphMaint] Contradiction with conflict type detected "
                        f"(user has {contradiction_count} contradictions so far)"
                    )

        return contradiction_count

    async def _discover_transitive_relations(self, user_id: str, dry_run: bool) -> int:
        """v3: 传递推理 — 发现 A→B, B→C 且无直接 A→C 时创建隐含边

        保守策略:
        - 只处理 cause/goal/leads_to 这类有传递性的关系
        - 新边标记 source="transitive_inference", strength=0.3
        - 每用户最多创建 5 条隐含边 (避免图爆炸)
        """
        from ..storage.soul_collections import get_collection, SEMANTIC_EDGES

        edges_coll = await get_collection(SEMANTIC_EDGES)
        if edges_coll is None:
            return 0

        # 可传递的关系类型
        transitive_relations = {"cause", "goal", "leads_to"}

        # 加载用户所有边
        edge_map: Dict[str, list] = {}  # {source_label: [(target_label, relation)]}
        existing_pairs = set()  # {(source_label, target_label)}
        cursor = edges_coll.find(
            {"user_id": user_id},
            projection={"source_label": 1, "target_label": 1, "relation": 1, "_id": 0},
            batch_size=200,
        )
        async for doc in cursor:
            src = doc.get("source_label", "")
            tgt = doc.get("target_label", "")
            rel = doc.get("relation", "")
            if src and tgt:
                edge_map.setdefault(src, []).append((tgt, rel))
                existing_pairs.add((src, tgt))

        # 发现传递关系: A→B (可传递), B→C (任意) 且 A→C 不存在
        discovered = 0
        max_new = 5

        for a, neighbors in edge_map.items():
            if discovered >= max_new:
                break
            for b, rel_ab in neighbors:
                if rel_ab not in transitive_relations:
                    continue
                for c, _rel_bc in edge_map.get(b, []):
                    if c == a:
                        continue  # 避免环
                    if (a, c) in existing_pairs:
                        continue  # 已存在直接边
                    if discovered >= max_new:
                        break

                    if not dry_run:
                        from ..semantic.knowledge_graph import get_knowledge_graph
                        kg = get_knowledge_graph()
                        await kg.upsert_edge(
                            user_id, a, c,
                            relation=rel_ab,
                            strength=0.3,
                        )
                    existing_pairs.add((a, c))  # 防止重复发现
                    discovered += 1

        if discovered > 0:
            logger.info(
                f"[GraphMaint] Discovered {discovered} transitive relations "
                f"for user {user_id[:8]}..."
            )

        return discovered
