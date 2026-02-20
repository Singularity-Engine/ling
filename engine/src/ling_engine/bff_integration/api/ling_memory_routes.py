"""
Ling Memory API routes

GET /api/memory/list — proxy EverMemOS to list user memories
"""

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger

from ..auth.ling_deps import get_current_user
from ..auth.rate_limit import limiter

EVERMEMOS_BASE_URL = os.getenv("EVERMEMOS_BASE_URL", "http://localhost:8001")


def create_ling_memory_router() -> APIRouter:
    router = APIRouter(prefix="/api/memory", tags=["memory"])

    @router.get("/list")
    @limiter.limit("30/minute")
    async def list_memories(request: Request, user: dict = Depends(get_current_user)):
        """List user memories via EverMemOS proxy."""
        user_id = str(user["id"])

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{EVERMEMOS_BASE_URL}/api/v1/memories",
                    params={"user_id": user_id, "limit": 20},
                )

                if resp.status_code != 200:
                    logger.warning(f"EverMemOS returned {resp.status_code}: {resp.text[:200]}")
                    return {"memories": []}

                data = resp.json()
                raw_memories = data if isinstance(data, list) else data.get("memories", [])

                memories = []
                for m in raw_memories:
                    memories.append({
                        "id": m.get("id", ""),
                        "content": m.get("summary", m.get("content", "")),
                        "created_at": m.get("created_at", ""),
                        "group_id": m.get("group_id", ""),
                    })

                return {"memories": memories}

        except httpx.TimeoutException:
            logger.warning("EverMemOS timeout")
            return {"memories": []}
        except Exception as e:
            logger.error(f"EverMemOS proxy error: {e}")
            return {"memories": []}

    return router
