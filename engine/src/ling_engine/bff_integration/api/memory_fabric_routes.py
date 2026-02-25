"""Memory Fabric 控制平面 API 路由。"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger

from soul_fabric import (
    MemoryBenchmarkRequest,
    MemoryConsolidateRequest,
    MemoryDeleteUserRequest,
    MemoryEventRequest,
    MemoryRecallRequest,
    MemoryReflectRequest,
    get_memory_fabric,
)
from ..auth.ling_deps import get_current_user
from ..auth.rate_limit import limiter

_AGENT_KEY = os.environ.get("SOUL_AGENT_KEY", "")

# ── Agent 权限分级 ────────────────────────────────────
# ling-finder: 可读写指定用户记忆 (recall + ingest)
# soul-consolidator: 可全局整理 (consolidate global)
# 其他 agent: 仅写入指定用户
_AGENT_ROLES = {
    "ling-finder": "agent:read-write",
    "soul-consolidator": "agent:consolidator",
}


def _agent_id_to_role(agent_id: str) -> str:
    """Map agent_id to permission role."""
    return _AGENT_ROLES.get(agent_id, "agent:write-only")


def _is_admin(user: dict) -> bool:
    return user.get("role") in {"owner", "admin"}


def _is_consolidator(user: dict) -> bool:
    """Check if user is an agent with consolidation privileges."""
    return user.get("agent_role") == "agent:consolidator" or _is_admin(user)


def _can_read(user: dict) -> bool:
    """Check if user/agent can read memories."""
    if not user.get("agent"):
        return True  # normal users can always read their own
    return user.get("agent_role") in {"agent:read-write", "agent:consolidator"} or _is_admin(user)


def _try_agent_auth(request: Request) -> dict | None:
    """Check X-Agent-Key header. Returns synthetic user with agent role or None."""
    if not _AGENT_KEY:
        return None
    key = request.headers.get("x-agent-key", "")
    if key and key == _AGENT_KEY:
        agent_id = request.headers.get("x-agent-id", "agent")
        agent_role = _agent_id_to_role(agent_id)
        return {
            "id": f"agent:{agent_id}",
            "role": "admin" if agent_role == "agent:consolidator" else "agent",
            "agent": True,
            "agent_id": agent_id,
            "agent_role": agent_role,
        }
    return None


def _resolve_user_scope(user: dict, requested_user_id: str | None) -> str:
    if user.get("agent"):
        return requested_user_id or "unknown-agent"
    current = str(user["id"])
    target = requested_user_id or current
    if target != current and not _is_admin(user):
        raise HTTPException(status_code=403, detail="无权操作其他用户记忆")
    return target


from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_security = HTTPBearer(auto_error=False)


async def _get_user_or_agent(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
) -> dict:
    """Try agent key first, then JWT auth."""
    agent = _try_agent_auth(request)
    if agent is not None:
        return agent
    if not credentials:
        raise HTTPException(status_code=401, detail="未提供认证令牌")
    return await get_current_user(credentials)


def create_memory_fabric_router() -> APIRouter:
    router = APIRouter(prefix="/v1/memory", tags=["memory-fabric"])

    @router.post("/events")
    @limiter.limit("60/minute")
    async def ingest_event(
        request: Request,
        payload: MemoryEventRequest,
        user: dict = Depends(_get_user_or_agent),
    ):
        try:
            target_user_id = _resolve_user_scope(user, payload.user_id)
            patched = payload.model_copy(update={"user_id": target_user_id})
            return await get_memory_fabric().ingest_event(
                req=patched,
                actor_id=str(user["id"]),
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    @router.post("/consolidate")
    @limiter.limit("20/minute")
    async def consolidate(
        request: Request,
        payload: MemoryConsolidateRequest,
        user: dict = Depends(_get_user_or_agent),
    ):
        # 全局整理仅管理员或 consolidator agent 可触发
        if payload.user_id is None and not _is_consolidator(user):
            raise HTTPException(status_code=403, detail="仅管理员或 soul-consolidator 可触发全局整理")

        target_user_id = None
        if payload.user_id is not None:
            target_user_id = _resolve_user_scope(user, payload.user_id)

        try:
            return await get_memory_fabric().consolidate(
                user_id=target_user_id,
                dry_run=payload.dry_run,
                actor_id=str(user["id"]),
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    @router.post("/recall")
    @limiter.limit("60/minute")
    async def recall(
        request: Request,
        payload: MemoryRecallRequest,
        user: dict = Depends(_get_user_or_agent),
    ):
        if not _can_read(user):
            raise HTTPException(status_code=403, detail="该 Agent 无记忆读取权限")
        try:
            target_user_id = _resolve_user_scope(user, payload.user_id)
            return await get_memory_fabric().recall(
                query=payload.query,
                user_id=target_user_id,
                top_k=payload.top_k,
                timeout_ms=payload.timeout_ms,
                include_citations=payload.include_citations,
                include_uncertainty=payload.include_uncertainty,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    @router.post("/reflect")
    @limiter.limit("40/minute")
    async def reflect(
        request: Request,
        payload: MemoryReflectRequest,
        user: dict = Depends(_get_user_or_agent),
    ):
        try:
            target_user_id = _resolve_user_scope(user, payload.user_id)
            return await get_memory_fabric().reflect(
                user_id=target_user_id,
                rule=payload.rule,
                rule_type=payload.rule_type,
                priority=payload.priority,
                active=payload.active,
                metadata=payload.metadata,
                actor_id=str(user["id"]),
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    @router.post("/delete_user")
    @limiter.limit("10/minute")
    async def delete_user(
        request: Request,
        payload: MemoryDeleteUserRequest,
        user: dict = Depends(_get_user_or_agent),
    ):
        try:
            target_user_id = _resolve_user_scope(user, payload.user_id)
            return await get_memory_fabric().delete_user(
                user_id=target_user_id,
                reason=payload.reason,
                actor_id=str(user["id"]),
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    @router.get("/trace/{memory_id}")
    @limiter.limit("120/minute")
    async def get_trace(
        request: Request,
        memory_id: str,
        user: dict = Depends(_get_user_or_agent),
    ):
        try:
            return await get_memory_fabric().trace(
                memory_id=memory_id,
                requester_user_id=str(user["id"]),
                is_admin=_is_admin(user),
            )
        except PermissionError as e:
            raise HTTPException(status_code=403, detail="无权访问该记忆追踪") from e

    @router.get("/coverage")
    @limiter.limit("30/minute")
    async def coverage(
        request: Request,
        user: dict = Depends(_get_user_or_agent),
    ):
        if not _is_admin(user):
            raise HTTPException(status_code=403, detail="仅管理员可查看覆盖率")
        report = get_memory_fabric().coverage_report()
        return report.model_dump(mode="json")

    @router.get("/slo")
    @limiter.limit("30/minute")
    async def slo_status(
        request: Request,
        user: dict = Depends(_get_user_or_agent),
    ):
        if not _is_admin(user):
            raise HTTPException(status_code=403, detail="仅管理员可查看 SLO")
        return await get_memory_fabric().slo_status()

    @router.post("/benchmark")
    @limiter.limit("10/minute")
    async def benchmark(
        request: Request,
        payload: MemoryBenchmarkRequest,
        user: dict = Depends(_get_user_or_agent),
    ):
        if not _is_admin(user):
            raise HTTPException(status_code=403, detail="仅管理员可运行基准")
        try:
            return await get_memory_fabric().benchmark(payload.suites)
        except RuntimeError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        except Exception as e:
            logger.warning(f"[MemoryFabric] benchmark failed: {e}")
            raise HTTPException(status_code=500, detail="benchmark failed") from e

    @router.get("/memos_pilot/status")
    @limiter.limit("30/minute")
    async def memos_pilot_status(
        request: Request,
        user: dict = Depends(_get_user_or_agent),
    ):
        if not _is_admin(user):
            raise HTTPException(status_code=403, detail="仅管理员可查看 MemOS 试点状态")
        return get_memory_fabric().memos_pilot_status()

    return router
