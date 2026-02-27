"""整理日志查询 — Phase 3b

提供 consolidation_log 集合的查询接口:
- get_recent_runs: 最近 N 次运行记录
- get_run_stats: 聚合统计 (成功率、平均耗时)

无 PII: consolidation_log 只包含聚合统计数据。
"""

from typing import List, Dict, Any, Optional

from loguru import logger


async def get_recent_runs(limit: int = 10) -> List[Dict[str, Any]]:
    """查询最近 N 次整理运行记录

    Returns:
        按 run_date 倒序排列的运行记录列表
    """
    try:
        from ..storage.soul_collections import get_collection, CONSOLIDATION_LOG

        coll = await get_collection(CONSOLIDATION_LOG)
        if coll is None:
            return []

        cursor = coll.find(
            {},
            projection={"_id": 0},
            sort=[("run_date", -1)],
            limit=limit,
            batch_size=limit,
        )
        results = []
        async for doc in cursor:
            # datetime → ISO string for JSON serialization
            for k, v in doc.items():
                if hasattr(v, "isoformat"):
                    doc[k] = v.isoformat()
            results.append(doc)
        return results
    except Exception as e:
        logger.debug(f"[ConsolidationQuery] get_recent_runs failed: {e}")
        return []


async def get_run_stats(days: int = 30) -> Optional[Dict[str, Any]]:
    """聚合最近 N 天的整理统计

    Returns:
        {
            "total_runs": int,
            "successful_runs": int,
            "avg_elapsed_ms": float,
            "task_success_rates": {task_name: float},
        }
    """
    try:
        from datetime import datetime, timezone, timedelta
        from ..storage.soul_collections import get_collection, CONSOLIDATION_LOG

        coll = await get_collection(CONSOLIDATION_LOG)
        if coll is None:
            return None

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        cursor = coll.find(
            {"run_date": {"$gte": cutoff}},
            projection={"_id": 0},
            batch_size=100,
        )

        total_runs = 0
        total_elapsed = 0
        task_counts: Dict[str, int] = {}
        task_success: Dict[str, int] = {}

        async for doc in cursor:
            total_runs += 1
            total_elapsed += doc.get("total_elapsed_ms", 0)

            for task_name in ("relationship_cooling", "memory_decay", "graph_maintenance"):
                task_data = doc.get(task_name)
                if isinstance(task_data, dict):
                    task_counts[task_name] = task_counts.get(task_name, 0) + 1
                    if task_data.get("status") == "ok":
                        task_success[task_name] = task_success.get(task_name, 0) + 1

        if total_runs == 0:
            return {"total_runs": 0, "successful_runs": 0, "avg_elapsed_ms": 0}

        task_success_rates = {}
        for name, count in task_counts.items():
            task_success_rates[name] = round(
                task_success.get(name, 0) / count, 2
            ) if count > 0 else 0.0

        return {
            "total_runs": total_runs,
            "avg_elapsed_ms": round(total_elapsed / total_runs, 1),
            "task_success_rates": task_success_rates,
        }
    except Exception as e:
        logger.debug(f"[ConsolidationQuery] get_run_stats failed: {e}")
        return None
