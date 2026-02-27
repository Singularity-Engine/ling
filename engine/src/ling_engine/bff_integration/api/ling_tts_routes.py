"""
灵 TTS 后端代理

将 Fish Audio API Key 保留在后端，前端通过此代理生成语音。
"""

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from loguru import logger

from ..auth.ling_deps import get_optional_user
from ..auth.plan_gates import check_feature

FISH_TTS_API = "https://api.fish.audio/v1/tts"
FISH_TTS_API_KEY = os.getenv("FISH_TTS_API_KEY", "")
FISH_TTS_REFERENCE_ID = os.getenv("FISH_TTS_REFERENCE_ID", "9dec9671824543b4a4f9f382dbf15748")


class TTSRequest(BaseModel):
    text: str
    reference_id: str | None = None
    format: str = "mp3"
    latency: str = "normal"


def create_ling_tts_router() -> APIRouter:
    router = APIRouter(prefix="/api/tts", tags=["tts"])

    @router.post("/generate")
    async def generate_tts(req: TTSRequest, user: dict | None = Depends(get_optional_user)):
        if not FISH_TTS_API_KEY:
            raise HTTPException(500, "TTS service not configured")

        # 功能门控：voice 功能检查
        if user and not check_feature(user, "voice"):
            raise HTTPException(403, "Voice is not available on your plan. Please upgrade.")

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    FISH_TTS_API,
                    headers={
                        "Authorization": f"Bearer {FISH_TTS_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": req.text,
                        "reference_id": req.reference_id or FISH_TTS_REFERENCE_ID,
                        "format": req.format,
                        "latency": req.latency,
                    },
                )

                if resp.status_code != 200:
                    logger.error(f"Fish Audio API 错误: {resp.status_code} {resp.text[:200]}")
                    raise HTTPException(502, "TTS service unavailable")

                content_type = resp.headers.get("content-type", "audio/mpeg")
                return Response(
                    content=resp.content,
                    media_type=content_type,
                    headers={"Cache-Control": "no-cache"},
                )

        except httpx.TimeoutException:
            raise HTTPException(504, "TTS service timeout")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"TTS 代理错误: {e}")
            raise HTTPException(500, "TTS 服务内部错误")

    return router
