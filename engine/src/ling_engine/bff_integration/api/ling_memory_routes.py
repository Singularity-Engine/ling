"""
Ling Memory API routes

GET /api/memory/list — read user memories from Qdrant directly
"""

from fastapi import APIRouter, Depends, Request
from loguru import logger

from ..auth.ling_deps import get_current_user
from ..auth.rate_limit import limiter


def create_ling_memory_router() -> APIRouter:
    router = APIRouter(prefix="/api/memory", tags=["memory"])

    @router.get("/list")
    @limiter.limit("30/minute")
    async def list_memories(request: Request, user: dict = Depends(get_current_user)):
        """List user memories from Qdrant."""
        user_id = str(user["id"])

        try:
            from ...important.memories import list_all_memories_simple
            raw_memories = list_all_memories_simple(user_id=user_id, limit=20)

            memories = []
            for m in raw_memories:
                memories.append({
                    "id": m.get("id", ""),
                    "content": m.get("summary", m.get("content", "")),
                    "created_at": m.get("created_at", ""),
                    "weight": m.get("weight", 5),
                })

            return {"memories": memories}

        except Exception as e:
            logger.error(f"Qdrant memory list error: {e}")
            return {"memories": []}

    return router
