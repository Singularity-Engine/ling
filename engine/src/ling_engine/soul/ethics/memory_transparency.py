"""
记忆透明度 — Phase 4 实现

让用户了解灵记住了什么、如何使用记忆、以及如何删除记忆。
覆盖 11 个 MongoDB 集合: emotions, stories, importance, relationships,
semantic_nodes, semantic_edges, weekly_digests, monthly_themes, life_chapters,
collective_patterns, self_narrative
"""

from typing import List, Dict, Any, Optional
from loguru import logger


async def get_user_memory_summary(user_id: str) -> Optional[Dict[str, Any]]:
    """查询全部 11 个集合返回分类统计"""
    try:
        from ..storage.soul_collections import (
            get_collection, EMOTIONS, STORIES, IMPORTANCE,
            RELATIONSHIPS, SEMANTIC_NODES, SEMANTIC_EDGES,
            WEEKLY_DIGESTS, MONTHLY_THEMES, LIFE_CHAPTERS,
            COLLECTIVE_PATTERNS, SELF_NARRATIVE,
        )

        collections = {
            "emotions": EMOTIONS,
            "stories": STORIES,
            "importance": IMPORTANCE,
            "relationships": RELATIONSHIPS,
            "knowledge_nodes": SEMANTIC_NODES,
            "knowledge_edges": SEMANTIC_EDGES,
            "weekly_digests": WEEKLY_DIGESTS,
            "monthly_themes": MONTHLY_THEMES,
            "life_chapters": LIFE_CHAPTERS,
            "collective_patterns": COLLECTIVE_PATTERNS,
            "self_narrative": SELF_NARRATIVE,
        }

        summary = {}
        for key, coll_name in collections.items():
            coll = await get_collection(coll_name)
            if coll is None:
                summary[key] = 0
                continue
            try:
                count = await coll.count_documents({"user_id": user_id})
                summary[key] = count
            except Exception:
                summary[key] = 0

        summary["total"] = sum(summary.values())
        return summary
    except Exception as e:
        logger.warning(f"[Transparency] Memory summary failed: {e}")
        return None


async def list_user_memories(
    user_id: str,
    category: str = "all",
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """列出记忆条目 — category 映射到集合, sort by created_at desc

    knowledge 类别只展示节点标签和类别，不展示边的关系推理。
    """
    try:
        from ..storage.soul_collections import (
            get_collection, EMOTIONS, STORIES, IMPORTANCE,
            RELATIONSHIPS, SEMANTIC_NODES,
        )

        category_map = {
            "emotions": EMOTIONS,
            "stories": STORIES,
            "importance": IMPORTANCE,
            "relationships": RELATIONSHIPS,
            "knowledge": SEMANTIC_NODES,
        }

        results = []

        if category == "all":
            targets = list(category_map.items())
        elif category in category_map:
            targets = [(category, category_map[category])]
        else:
            return []

        for cat_name, coll_name in targets:
            coll = await get_collection(coll_name)
            if coll is None:
                continue

            try:
                if cat_name == "knowledge":
                    # 只展示节点标签和类别，不展示推理关系
                    projection = {
                        "node_id": 1, "label": 1, "category": 1,
                        "mention_count": 1, "first_learned": 1, "_id": 0,
                    }
                    cursor = coll.find(
                        {"user_id": user_id},
                        projection=projection,
                        sort=[("mention_count", -1)],
                        limit=limit,
                    )
                else:
                    cursor = coll.find(
                        {"user_id": user_id},
                        sort=[("created_at", -1)] if cat_name != "relationships" else None,
                        limit=limit,
                    )

                async for doc in cursor:
                    doc_id = str(doc.pop("_id", "")) if "_id" in doc else ""
                    # knowledge 用 node_id 作为 id
                    entry_id = doc.get("node_id", doc_id)
                    entry = {
                        "id": entry_id,
                        "category": cat_name,
                        **{k: v for k, v in doc.items()
                           if k not in ("user_id", "node_id")},
                    }
                    # Phase 3b: importance 类别标记 decayed 条目为"已淡化"
                    if cat_name == "importance" and doc.get("decayed"):
                        entry["status"] = "已淡化"
                    results.append(entry)
            except Exception as e:
                logger.debug(f"[Transparency] List {cat_name} failed: {e}")

        return results[:limit]
    except Exception as e:
        logger.warning(f"[Transparency] Memory list failed: {e}")
        return []


async def delete_user_memory(user_id: str, memory_id: str) -> bool:
    """删除单条记忆

    区分 ID 格式:
    - 如果 memory_id 以 "{user_id}:" 开头 → semantic_node ID → 调用 delete_node_cascade()
    - 否则 → 尝试 ObjectId(memory_id) 遍历其他集合 delete_one
    防越权: 查询条件包含 user_id。
    """
    try:
        # 知识图谱节点 ID 格式: "user_id:md5[:8]"
        if memory_id.startswith(f"{user_id}:"):
            from ..semantic.knowledge_graph import get_knowledge_graph
            kg = get_knowledge_graph()
            deleted = await kg.delete_node_cascade(user_id, memory_id)
            return deleted > 0

        # 其他集合: 尝试 ObjectId
        from bson import ObjectId
        try:
            oid = ObjectId(memory_id)
        except Exception:
            logger.debug(f"[Transparency] Invalid memory_id format: {memory_id}")
            return False

        from ..storage.soul_collections import (
            get_collection, EMOTIONS, STORIES, IMPORTANCE, RELATIONSHIPS,
        )

        for coll_name in [EMOTIONS, STORIES, IMPORTANCE, RELATIONSHIPS]:
            coll = await get_collection(coll_name)
            if coll is None:
                continue
            try:
                result = await coll.delete_one(
                    {"_id": oid, "user_id": user_id},
                )
                if result.deleted_count > 0:
                    return True
            except Exception:
                continue

        return False
    except Exception as e:
        logger.warning(f"[Transparency] Memory delete failed: {e}")
        return False


async def delete_all_user_memories(user_id: str) -> int:
    """GDPR 遗忘权 — 全部 11 个集合 delete_many

    执行后调用 InConversationTracker.reset(user_id) 清除内存状态。
    COLLECTIVE_PATTERNS 和 SELF_NARRATIVE 不含 user_id (匿名/灵自有), 不删除。
    TODO: EverMemOS 原始记忆需单独 API 删除 (待 EverMemOS 提供批量删除接口)。
    """
    total = 0
    try:
        from ..storage.soul_collections import (
            get_collection, EMOTIONS, STORIES, IMPORTANCE,
            RELATIONSHIPS, SEMANTIC_NODES, SEMANTIC_EDGES,
            WEEKLY_DIGESTS, MONTHLY_THEMES, LIFE_CHAPTERS,
        )

        # COLLECTIVE_PATTERNS/SELF_NARRATIVE 不含 user_id, 无需删除
        for coll_name in [EMOTIONS, STORIES, IMPORTANCE, RELATIONSHIPS,
                          SEMANTIC_NODES, SEMANTIC_EDGES,
                          WEEKLY_DIGESTS, MONTHLY_THEMES, LIFE_CHAPTERS]:
            coll = await get_collection(coll_name)
            if coll is None:
                continue
            try:
                result = await coll.delete_many({"user_id": user_id})
                total += result.deleted_count
            except Exception as e:
                logger.debug(f"[Transparency] Delete from {coll_name} failed: {e}")

        # 清除内存状态
        try:
            from ..pipeline.in_conversation_tracker import get_in_conversation_tracker
            get_in_conversation_tracker().reset(user_id)
        except Exception:
            pass

        logger.info(f"[Transparency] Deleted {total} records for {user_id}")
    except Exception as e:
        logger.warning(f"[Transparency] Full memory wipe failed: {e}")

    return total


async def export_user_data(user_id: str) -> Dict[str, Any]:
    """GDPR Article 20 数据可携权

    遍历 11 集合, find({"user_id": user_id}), 投影掉 _id。
    COLLECTIVE_PATTERNS/SELF_NARRATIVE 不含 user_id, 不导出 (匿名/灵自有)。
    返回 JSON-serializable 的完整数据包。
    """
    try:
        from ..storage.soul_collections import (
            get_collection, EMOTIONS, STORIES, IMPORTANCE,
            RELATIONSHIPS, SEMANTIC_NODES, SEMANTIC_EDGES,
            WEEKLY_DIGESTS, MONTHLY_THEMES, LIFE_CHAPTERS,
        )

        # 只导出含 user_id 的集合 (COLLECTIVE_PATTERNS/SELF_NARRATIVE 不含 user_id)
        collections = {
            "emotions": EMOTIONS,
            "stories": STORIES,
            "importance": IMPORTANCE,
            "relationships": RELATIONSHIPS,
            "knowledge_nodes": SEMANTIC_NODES,
            "knowledge_edges": SEMANTIC_EDGES,
            "weekly_digests": WEEKLY_DIGESTS,
            "monthly_themes": MONTHLY_THEMES,
            "life_chapters": LIFE_CHAPTERS,
        }

        export = {"user_id": user_id}
        for key, coll_name in collections.items():
            coll = await get_collection(coll_name)
            if coll is None:
                export[key] = []
                continue
            try:
                cursor = coll.find(
                    {"user_id": user_id},
                    projection={"_id": 0},
                )
                docs = []
                async for doc in cursor:
                    # datetime → ISO string for JSON serialization
                    for k, v in doc.items():
                        if hasattr(v, 'isoformat'):
                            doc[k] = v.isoformat()
                    docs.append(doc)
                export[key] = docs
            except Exception as e:
                logger.debug(f"[Transparency] Export {key} failed: {e}")
                export[key] = []

        logger.info(f"[Transparency] Data exported for {user_id}")
        return export
    except Exception as e:
        logger.warning(f"[Transparency] Data export failed: {e}")
        return {}
