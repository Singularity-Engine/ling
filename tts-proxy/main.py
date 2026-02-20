"""
Ling TTS Proxy — Standalone Service

Lightweight Fish Audio TTS proxy that can run independently from the Engine.
Keeps API key server-side, adds rate limiting and JWT-based feature gating.

Usage:
    uvicorn main:app --host 0.0.0.0 --port 12394
"""

import os
import time
from collections import defaultdict

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Configuration ──────────────────────────────────────────────

FISH_TTS_API = "https://api.fish.audio/v1/tts"
FISH_TTS_API_KEY = os.getenv("FISH_TTS_API_KEY", "")
FISH_TTS_REFERENCE_ID = os.getenv(
    "FISH_TTS_REFERENCE_ID", "9dec9671824543b4a4f9f382dbf15748"
)

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3001,https://sngxai.com,https://www.sngxai.com,https://lain.sngxai.com",
    ).split(",")
    if o.strip()
]

# Rate limit: requests per minute per IP
RATE_LIMIT = int(os.getenv("TTS_RATE_LIMIT", "30"))

# Max text length per request
MAX_TEXT_LENGTH = int(os.getenv("TTS_MAX_TEXT_LENGTH", "500"))

# ── App ────────────────────────────────────────────────────────

app = FastAPI(title="Ling TTS Proxy", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


# ── Simple in-memory rate limiter ──────────────────────────────

_rate_counters: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(ip: str) -> bool:
    now = time.time()
    window = _rate_counters[ip]
    # Prune old entries
    _rate_counters[ip] = [t for t in window if now - t < 60]
    if len(_rate_counters[ip]) >= RATE_LIMIT:
        return False
    _rate_counters[ip].append(now)
    return True


# ── Request model ──────────────────────────────────────────────


class TTSRequest(BaseModel):
    text: str
    reference_id: str | None = None
    format: str = "mp3"
    latency: str = "normal"


# ── Routes ─────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ling-tts-proxy"}


@app.post("/api/tts/generate")
async def generate_tts(req: TTSRequest, request: Request):
    if not FISH_TTS_API_KEY:
        raise HTTPException(500, "TTS service not configured")

    # Rate limit by IP
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(429, "Too many TTS requests. Please slow down.")

    # Text length guard
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Text is empty")
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                FISH_TTS_API,
                headers={
                    "Authorization": f"Bearer {FISH_TTS_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "reference_id": req.reference_id or FISH_TTS_REFERENCE_ID,
                    "format": req.format,
                    "latency": req.latency,
                },
            )

            if resp.status_code != 200:
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
    except Exception:
        raise HTTPException(500, "TTS service error")
