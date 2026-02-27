"""数据生命周期管理 — Phase 4: 热/温/冷三层存储

热数据 (HOT):  近 30 天 episode + 活跃故事线 + 知识图谱 → 全索引
温数据 (WARM): 30-180 天 → 正常访问
冷数据 (COLD): >180 天 episode → 仅通过 L1/L2/L3 抽象层级访问

当前 MongoDB TTL 索引基于 expires_at:
- 普通记录: expires_at=created_at+180d
- no_expire/flashbulb: 不写 expires_at
本模块补充: 回填 expires_at、统计各层数据量、清理孤立数据。

调用方: NightlyConsolidator (每日)
"""

from datetime import datetime, timezone, timedelta
from typing import Dict

from loguru import logger


# 分层阈值
HOT_DAYS = 30
WARM_DAYS = 180  # 180 天后为冷数据 (TTL 索引自动删除 emotions/importance)


async def lifecycle_maintenance(dry_run: bool = False) -> Dict:
    """数据生命周期维护

    1. 统计各层数据量
    2. 清理孤立的知识图谱边 (source/target 节点已不存在)
    3. 标记温数据 (为将来的分层索引做准备)
    """
    from ..storage.soul_collections import (
        get_collection, EMOTIONS, IMPORTANCE, STORIES,
        SEMANTIC_NODES, SEMANTIC_EDGES,
    )

    now = datetime.now(timezone.utc)
    hot_cutoff = now - timedelta(days=HOT_DAYS)
    warm_cutoff = now - timedelta(days=WARM_DAYS)

    stats: Dict = {
        "hot": {},
        "warm": {},
        "expiry_backfilled": 0,
        "no_expire_sanitized": 0,
        "orphan_edges_cleaned": 0,
        "dormant_stories_archived": 0,
    }

    # 0. 回填 expires_at 并清理 no_expire 记录上的 expires_at（避免 flashbulb 被 TTL 误删）
    try:
        backfill = await _backfill_expiry_fields(dry_run=dry_run, now=now)
        stats["expiry_backfilled"] = backfill.get("backfilled", 0)
        stats["no_expire_sanitized"] = backfill.get("no_expire_sanitized", 0)
    except Exception as e:
        logger.debug(f"[Lifecycle] Expiry backfill failed: {e}")

    # 1. 统计各层数据量
    for name, coll_name in [("emotions", EMOTIONS), ("importance", IMPORTANCE)]:
        coll = await get_collection(coll_name)
        if coll is None:
            continue
        try:
            hot = await coll.count_documents({
                "created_at": {"$gte": hot_cutoff},
            })
            warm = await coll.count_documents({
                "created_at": {"$gte": warm_cutoff, "$lt": hot_cutoff},
            })
            stats["hot"][name] = hot
            stats["warm"][name] = warm
        except Exception as e:
            logger.debug(f"[Lifecycle] Stats for {name} failed: {e}")

    # 2. 清理孤立边 (source 或 target 节点已不存在)
    try:
        edges_coll = await get_collection(SEMANTIC_EDGES)
        nodes_coll = await get_collection(SEMANTIC_NODES)
        if edges_coll is not None and nodes_coll is not None:
            orphan_count = await _clean_orphan_edges(edges_coll, nodes_coll, dry_run)
            stats["orphan_edges_cleaned"] = orphan_count
    except Exception as e:
        logger.debug(f"[Lifecycle] Orphan edge cleanup failed: {e}")

    # 3. 归档长期 dormant 的故事线 (>90 天 dormant → resolved)
    try:
        stories_coll = await get_collection(STORIES)
        if stories_coll is not None and not dry_run:
            archive_cutoff = now - timedelta(days=90)
            result = await stories_coll.update_many(
                {
                    "status": "dormant",
                    "last_updated": {"$lt": archive_cutoff},
                },
                {"$set": {"status": "resolved", "resolution_reason": "auto_archived"}},
            )
            stats["dormant_stories_archived"] = result.modified_count
    except Exception as e:
        logger.debug(f"[Lifecycle] Story archival failed: {e}")

    stats["status"] = "ok"
    stats["dry_run"] = dry_run
    return stats


async def _backfill_expiry_fields(dry_run: bool, now: datetime) -> Dict[str, int]:
    """给普通记录补 expires_at，并移除 no_expire 文档上的 expires_at。"""
    from pymongo import UpdateOne

    from ..storage.soul_collections import get_collection, EMOTIONS, IMPORTANCE

    ttl_delta = timedelta(days=WARM_DAYS)
    total_backfilled = 0
    total_sanitized = 0

    for coll_name in (EMOTIONS, IMPORTANCE):
        coll = await get_collection(coll_name)
        if coll is None:
            continue

        # no_expire 文档不应带 expires_at，避免被 TTL 删除。
        try:
            if dry_run:
                total_sanitized += await coll.count_documents(
                    {"no_expire": True, "expires_at": {"$exists": True}}
                )
            else:
                sanitized = await coll.update_many(
                    {"no_expire": True, "expires_at": {"$exists": True}},
                    {"$unset": {"expires_at": ""}},
                )
                total_sanitized += int(sanitized.modified_count)
        except Exception as e:
            logger.debug(f"[Lifecycle] sanitize no_expire failed for {coll_name}: {e}")

        # 普通记录补齐 expires_at。
        query = {
            "$and": [
                {"expires_at": {"$exists": False}},
                {"$or": [{"no_expire": {"$exists": False}}, {"no_expire": False}]},
            ]
        }
        if dry_run:
            total_backfilled += await coll.count_documents(query)
            continue

        ops = []
        cursor = coll.find(query, projection={"_id": 1, "created_at": 1}, batch_size=500)
        async for doc in cursor:
            created_at = doc.get("created_at")
            if not isinstance(created_at, datetime):
                created_at = now
            ops.append(
                UpdateOne(
                    {"_id": doc["_id"]},
                    {"$set": {"expires_at": created_at + ttl_delta}},
                )
            )
            if len(ops) >= 500:
                result = await coll.bulk_write(ops, ordered=False)
                total_backfilled += int(result.modified_count)
                ops = []
        if ops:
            result = await coll.bulk_write(ops, ordered=False)
            total_backfilled += int(result.modified_count)

    return {
        "backfilled": int(total_backfilled),
        "no_expire_sanitized": int(total_sanitized),
    }


async def _clean_orphan_edges(edges_coll, nodes_coll, dry_run: bool) -> int:
    """清理孤立边: source_id 或 target_id 对应的节点已删除"""
    # 获取所有节点 ID
    node_ids = set()
    cursor = nodes_coll.find(
        {},
        projection={"node_id": 1, "_id": 0},
        batch_size=500,
    )
    async for doc in cursor:
        nid = doc.get("node_id")
        if nid:
            node_ids.add(nid)

    if not node_ids:
        return 0

    # 查找引用了不存在节点的边
    orphan_ids = []
    edge_cursor = edges_coll.find(
        {},
        projection={"_id": 1, "source_id": 1, "target_id": 1},
        batch_size=200,
    )
    async for doc in edge_cursor:
        src = doc.get("source_id", "")
        tgt = doc.get("target_id", "")
        if (src and src not in node_ids) or (tgt and tgt not in node_ids):
            orphan_ids.append(doc["_id"])

    if orphan_ids and not dry_run:
        # 批量删除
        for i in range(0, len(orphan_ids), 100):
            batch = orphan_ids[i:i + 100]
            await edges_coll.delete_many({"_id": {"$in": batch}})

    return len(orphan_ids)
