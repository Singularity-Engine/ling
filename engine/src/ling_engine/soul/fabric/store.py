"""Memory Fabric 持久化与审计存储。"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from loguru import logger

from ..storage.soul_collections import (
    BENCHMARK_RUNS,
    CORE_BLOCKS,
    MEMORY_ATOMS,
    MEMORY_TRACES,
    PROCEDURAL_RULES,
    SAFETY_SHADOW,
    SLO_METRICS,
    get_collection,
)
from .atom import MemoryAtom, MemoryState


class MemoryFabricStore:
    """控制平面数据库读写封装。"""

    async def upsert_atom(self, atom: MemoryAtom) -> Tuple[MemoryAtom, bool]:
        """按 idempotency_key 幂等写入 MemoryAtom。"""
        coll = await get_collection(MEMORY_ATOMS)
        if coll is None:
            raise RuntimeError("memory atom collection unavailable")

        if atom.idempotency_key:
            existing = await coll.find_one(
                {
                    "tenant_id": atom.tenant_id,
                    "user_id": atom.user_id,
                    "idempotency_key": atom.idempotency_key,
                }
            )
            if existing:
                existing.pop("_id", None)
                return MemoryAtom.model_validate(existing), False

        doc = atom.model_dump(mode="python")
        if isinstance(doc.get("state"), MemoryState):
            doc["state"] = doc["state"].value

        try:
            await coll.insert_one(doc)
            return atom, True
        except Exception as e:
            logger.warning(f"[MemoryFabric] upsert_atom insert failed: {e}")
            if atom.idempotency_key:
                existing = await coll.find_one(
                    {
                        "tenant_id": atom.tenant_id,
                        "user_id": atom.user_id,
                        "idempotency_key": atom.idempotency_key,
                    }
                )
                if existing:
                    existing.pop("_id", None)
                    return MemoryAtom.model_validate(existing), False
            raise

    async def load_atom(self, memory_id: str) -> Optional[Dict[str, Any]]:
        coll = await get_collection(MEMORY_ATOMS)
        if coll is None:
            return None
        doc = await coll.find_one({"memory_id": memory_id})
        if doc:
            doc.pop("_id", None)
        return doc

    async def list_recent_atoms(
        self,
        user_id: str,
        tenant_id: str = "default",
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        coll = await get_collection(MEMORY_ATOMS)
        if coll is None:
            return []
        cursor = coll.find(
            {"tenant_id": tenant_id, "user_id": user_id},
            sort=[("event_time", -1)],
            limit=max(1, min(limit, 200)),
        )
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
        return results

    async def set_atom_state(
        self,
        memory_id: str,
        state: MemoryState,
        reason: str = "",
    ) -> bool:
        coll = await get_collection(MEMORY_ATOMS)
        if coll is None:
            return False
        update = {
            "$set": {
                "state": state.value,
                "updated_at": datetime.now(timezone.utc),
            }
        }
        if reason:
            update["$set"]["state_reason"] = reason
        res = await coll.update_one({"memory_id": memory_id}, update)
        return bool(res.modified_count)

    async def update_atom_fields(self, memory_id: str, fields: Dict[str, Any]) -> bool:
        """更新 MemoryAtom 的补充字段（如 vector_ref/graph_ref/block_ref）。"""
        if not fields:
            return False
        coll = await get_collection(MEMORY_ATOMS)
        if coll is None:
            return False
        payload = dict(fields)
        payload["updated_at"] = datetime.now(timezone.utc)
        res = await coll.update_one(
            {"memory_id": memory_id},
            {"$set": payload},
        )
        return bool(res.matched_count)

    async def append_trace(
        self,
        memory_id: str,
        user_id: str,
        event_type: str,
        payload: Dict[str, Any],
        actor_id: str = "system",
        status: str = "ok",
    ) -> str:
        coll = await get_collection(MEMORY_TRACES)
        if coll is None:
            raise RuntimeError("memory trace collection unavailable")

        trace_id = f"trace_{uuid4().hex}"
        await coll.insert_one(
            {
                "trace_id": trace_id,
                "memory_id": memory_id,
                "user_id": user_id,
                "event_type": event_type,
                "status": status,
                "actor_id": actor_id,
                "payload": payload,
                "created_at": datetime.now(timezone.utc),
            }
        )
        return trace_id

    async def load_traces(
        self,
        memory_id: str,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        coll = await get_collection(MEMORY_TRACES)
        if coll is None:
            return []

        cursor = coll.find(
            {"memory_id": memory_id},
            sort=[("created_at", 1)],
            limit=max(1, min(limit, 1000)),
        )
        traces = []
        async for doc in cursor:
            doc.pop("_id", None)
            traces.append(doc)
        return traces

    async def upsert_core_block(
        self,
        tenant_id: str,
        user_id: str,
        block_type: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        coll = await get_collection(CORE_BLOCKS)
        if coll is None:
            return False
        now = datetime.now(timezone.utc)
        await coll.update_one(
            {
                "tenant_id": tenant_id,
                "user_id": user_id,
                "block_type": block_type,
            },
            {
                "$set": {
                    "content": content,
                    "metadata": metadata or {},
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "created_at": now,
                },
            },
            upsert=True,
        )
        return True

    async def list_core_blocks(
        self,
        tenant_id: str,
        user_id: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        coll = await get_collection(CORE_BLOCKS)
        if coll is None:
            return []

        cursor = coll.find(
            {"tenant_id": tenant_id, "user_id": user_id},
            sort=[("updated_at", -1)],
            limit=max(1, min(limit, 50)),
        )
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
        return results

    async def add_procedural_rule(
        self,
        tenant_id: str,
        user_id: str,
        rule: str,
        rule_type: str,
        priority: int,
        active: bool,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        coll = await get_collection(PROCEDURAL_RULES)
        if coll is None:
            raise RuntimeError("procedural rules collection unavailable")

        rule_id = f"rule_{uuid4().hex}"
        now = datetime.now(timezone.utc)
        await coll.insert_one(
            {
                "rule_id": rule_id,
                "tenant_id": tenant_id,
                "user_id": user_id,
                "rule": rule,
                "rule_type": rule_type,
                "priority": int(priority),
                "active": bool(active),
                "metadata": metadata or {},
                "created_at": now,
                "updated_at": now,
            }
        )
        return rule_id

    async def list_procedural_rules(
        self,
        tenant_id: str,
        user_id: str,
        active_only: bool = True,
        limit: int = 30,
    ) -> List[Dict[str, Any]]:
        coll = await get_collection(PROCEDURAL_RULES)
        if coll is None:
            return []

        query: Dict[str, Any] = {"tenant_id": tenant_id, "user_id": user_id}
        if active_only:
            query["active"] = True

        cursor = coll.find(
            query,
            sort=[("priority", -1), ("updated_at", -1)],
            limit=max(1, min(limit, 100)),
        )
        rules = []
        async for doc in cursor:
            doc.pop("_id", None)
            rules.append(doc)
        return rules

    async def add_shadow_entry(
        self,
        tenant_id: str,
        user_id: str,
        related_memory_id: Optional[str],
        reason: str,
        risk_score: float,
        payload: Dict[str, Any],
        state: str = "quarantined",
    ) -> str:
        coll = await get_collection(SAFETY_SHADOW)
        if coll is None:
            raise RuntimeError("safety shadow collection unavailable")

        shadow_id = f"shadow_{uuid4().hex}"
        await coll.insert_one(
            {
                "shadow_id": shadow_id,
                "tenant_id": tenant_id,
                "user_id": user_id,
                "related_memory_id": related_memory_id,
                "reason": reason,
                "risk_score": risk_score,
                "state": state,
                "payload": payload,
                "created_at": datetime.now(timezone.utc),
            }
        )
        return shadow_id

    async def list_shadow_entries(
        self,
        tenant_id: str,
        user_id: str,
        state: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        coll = await get_collection(SAFETY_SHADOW)
        if coll is None:
            return []

        query: Dict[str, Any] = {"tenant_id": tenant_id, "user_id": user_id}
        if state:
            query["state"] = state

        cursor = coll.find(
            query,
            sort=[("created_at", -1)],
            limit=max(1, min(limit, 100)),
        )
        rows = []
        async for doc in cursor:
            doc.pop("_id", None)
            rows.append(doc)
        return rows

    async def record_benchmark_run(
        self,
        suite: str,
        score: float,
        status: str,
        details: Dict[str, Any],
        baseline_delta: Optional[float] = None,
    ):
        coll = await get_collection(BENCHMARK_RUNS)
        if coll is None:
            return
        await coll.insert_one(
            {
                "suite": suite,
                "score": score,
                "status": status,
                "details": details,
                "baseline_delta": baseline_delta,
                "created_at": datetime.now(timezone.utc),
            }
        )

    async def recent_benchmark_runs(self, limit: int = 20) -> List[Dict[str, Any]]:
        coll = await get_collection(BENCHMARK_RUNS)
        if coll is None:
            return []
        cursor = coll.find({}, sort=[("created_at", -1)], limit=max(1, min(limit, 100)))
        rows = []
        async for doc in cursor:
            doc.pop("_id", None)
            rows.append(doc)
        return rows

    async def record_slo_metric(
        self,
        metric_name: str,
        metric_value: float,
        stage: str,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        coll = await get_collection(SLO_METRICS)
        if coll is None:
            return
        await coll.insert_one(
            {
                "metric_name": metric_name,
                "metric_value": float(metric_value),
                "stage": stage,
                "metadata": metadata or {},
                "created_at": datetime.now(timezone.utc),
            }
        )

    async def recent_slo_metrics(
        self,
        metric_name: str,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        coll = await get_collection(SLO_METRICS)
        if coll is None:
            return []

        cursor = coll.find(
            {"metric_name": metric_name},
            sort=[("created_at", -1)],
            limit=max(1, min(limit, 2000)),
        )
        rows = []
        async for doc in cursor:
            doc.pop("_id", None)
            rows.append(doc)
        return rows

    async def delete_expired_atoms(self, retention_days: int) -> int:
        """按 ingest_time 删除超期 MemoryAtom（隔离态默认保留）。"""
        coll = await get_collection(MEMORY_ATOMS)
        if coll is None:
            return 0

        cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, int(retention_days)))
        result = await coll.delete_many(
            {
                "ingest_time": {"$lt": cutoff},
                "state": {"$ne": MemoryState.QUARANTINED.value},
            }
        )
        return int(result.deleted_count)
