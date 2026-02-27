"""OAuth social login endpoints (Google, GitHub) for Ling platform.

Redirect base URL is determined dynamically from the request Origin header,
so OAuth works regardless of which port/domain the frontend is accessed from.
Fallback order: Origin header -> Referer header -> LING_FRONTEND_URL env -> localhost:3000.

Security:
- State parameter is HMAC-SHA256 signed to prevent CSRF and open redirect attacks.
- State includes a random nonce and timestamp (10-minute expiry).
- User upsert handles concurrent requests via try/except on unique constraint.
"""

import hashlib
import hmac
import json
import os
import random
import secrets
import string
import time
import base64
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request, status, Query
from fastapi.responses import RedirectResponse
from loguru import logger

from ..auth.ling_auth import (
    JWT_SECRET_KEY,
    create_access_token,
    create_refresh_token,
    hash_password,
)

# ── OAuth provider URLs ──────────────────────────────────────────

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_USER_EMAILS_URL = "https://api.github.com/user/emails"

STATE_MAX_AGE_SECONDS = 600  # 10 minutes


# ── Shared helpers ────────────────────────────────────────────────

def _get_frontend_base_url(request: Request) -> str:
    """Derive the frontend base URL from the request.

    Priority: Origin header -> Referer -> LING_FRONTEND_URL env -> fallback.
    """
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")

    referer = request.headers.get("referer", "")
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    frontend_url = os.getenv("LING_FRONTEND_URL", "")
    if frontend_url:
        return frontend_url.rstrip("/")

    return "http://localhost:3000"


def _sign(payload_b64: str) -> str:
    """HMAC-SHA256 sign a base64 payload using JWT_SECRET_KEY."""
    return hmac.new(
        JWT_SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256
    ).hexdigest()


def _encode_state(base_url: str) -> str:
    """Encode base_url into a signed OAuth state parameter.

    Format: <base64-payload>.<hmac-signature>
    Payload includes random nonce + timestamp for CSRF protection.
    """
    payload = json.dumps({
        "base_url": base_url,
        "nonce": secrets.token_urlsafe(16),
        "ts": int(time.time()),
    })
    payload_b64 = base64.urlsafe_b64encode(payload.encode()).decode()
    signature = _sign(payload_b64)
    return f"{payload_b64}.{signature}"


def _decode_state(state: str) -> str | None:
    """Decode and verify a signed OAuth state parameter.

    Returns base_url on success, None on tampered/expired/invalid state.
    """
    try:
        payload_b64, signature = state.rsplit(".", 1)
    except ValueError:
        logger.warning("OAuth state: invalid format (no signature)")
        return None

    expected = _sign(payload_b64)
    if not hmac.compare_digest(signature, expected):
        logger.warning("OAuth state: HMAC signature mismatch — possible tampering")
        return None

    try:
        data = json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception:
        logger.warning("OAuth state: failed to decode payload")
        return None

    ts = data.get("ts", 0)
    if time.time() - ts > STATE_MAX_AGE_SECONDS:
        logger.warning("OAuth state: expired (> 10 minutes)")
        return None

    return data.get("base_url")


def _generate_unique_username(repo, email: str, display_name: str) -> str:
    """Generate a unique username from email/display_name, retrying up to 10 times."""
    base = email.split("@")[0] if email else (display_name or "user")
    # Sanitize: only keep alphanumeric and underscore
    base = "".join(c if c.isalnum() or c == "_" else "" for c in base)
    if not base or len(base) < 3:
        base = "user"

    for _ in range(10):
        suffix = "".join(random.choices(string.digits, k=4))
        candidate = f"{base}_{suffix}"
        if len(candidate) > 30:
            candidate = candidate[:30]
        existing = repo.get_user_by_username(candidate)
        if not existing:
            return candidate

    # Last resort: fully random
    return f"user_{''.join(random.choices(string.ascii_lowercase + string.digits, k=8))}"


def _upsert_oauth_user(repo, email: str, display_name: str, provider: str) -> dict:
    """Find user by email or create a new one. Returns the user dict.

    Handles race conditions: if two concurrent requests try to create the same
    user, the second one catches the unique constraint error and retries the lookup.
    """
    existing = repo.get_user_by_email(email)
    if existing:
        logger.info(f"OAuth login ({provider}): existing user {existing['id']}")
        repo.update_last_login(str(existing["id"]))
        return existing

    # Create new user with random password (OAuth users don't use password login)
    username = _generate_unique_username(repo, email, display_name)
    password_hash = hash_password(secrets.token_urlsafe(32))

    try:
        user = repo.create_user(
            username=username,
            password_hash=password_hash,
            email=email,
            display_name=display_name or email.split("@")[0],
            role="user",
            plan="free",
        )
        logger.info(f"OAuth login ({provider}): new user created {user['id']} ({username})")
        return user
    except Exception as exc:
        # Likely unique constraint violation from concurrent request
        logger.warning(f"OAuth user creation race condition ({provider}): {exc}")
        existing = repo.get_user_by_email(email)
        if existing:
            repo.update_last_login(str(existing["id"]))
            return existing
        raise  # Re-raise if it's a genuinely unexpected error


def _build_callback_redirect(base_url: str, user: dict) -> RedirectResponse:
    """Build redirect response with access + refresh tokens."""
    user_id = str(user["id"])
    access_token = create_access_token(
        user_id=user_id,
        email=user.get("email", ""),
        username=user.get("username", ""),
        role=user.get("role", "user"),
    )
    refresh_token = create_refresh_token(user_id=user_id)
    return RedirectResponse(
        f"{base_url}/oauth/callback?token={access_token}&refresh_token={refresh_token}"
    )


def _error_redirect(base_url: str | None, error: str) -> RedirectResponse:
    """Redirect to login with error, using fallback URL if base_url is None."""
    fallback = base_url or os.getenv("LING_FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return RedirectResponse(f"{fallback}/login?error={error}")


# ── Router factory ────────────────────────────────────────────────

def create_ling_oauth_router(repo) -> APIRouter:
    """Create OAuth router with injected LingUserRepository."""
    router = APIRouter(prefix="/api/auth/oauth", tags=["oauth"])

    # ── Google ────────────────────────────────────────────────

    @router.get("/google")
    def google_oauth_start(request: Request):
        client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Google OAuth is not configured",
            )

        base_url = _get_frontend_base_url(request)
        redirect_uri = f"{base_url}/api/auth/oauth/google/callback"
        state = _encode_state(base_url)

        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "prompt": "select_account",
            "state": state,
        }
        url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
        return {"url": url}

    @router.get("/google/callback")
    async def google_oauth_callback(
        request: Request,
        code: str = Query(...),
        state: str = Query(""),
    ):
        client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
        client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Google OAuth is not configured",
            )

        base_url = _decode_state(state)
        if base_url is None:
            logger.error("Google OAuth: invalid or expired state parameter")
            return _error_redirect(None, "oauth_failed")

        redirect_uri = f"{base_url}/api/auth/oauth/google/callback"

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                token_resp = await client.post(
                    GOOGLE_TOKEN_URL,
                    data={
                        "code": code,
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code",
                    },
                )

                if token_resp.status_code != 200:
                    logger.error(f"Google token exchange failed: {token_resp.status_code} {token_resp.text}")
                    return _error_redirect(base_url, "oauth_failed")

                tokens = token_resp.json()
                access_token = tokens.get("access_token")
                if not access_token:
                    logger.error("Google token response missing access_token")
                    return _error_redirect(base_url, "oauth_failed")

                userinfo_resp = await client.get(
                    GOOGLE_USERINFO_URL,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if userinfo_resp.status_code != 200:
                    logger.error(f"Google userinfo failed: {userinfo_resp.status_code}")
                    return _error_redirect(base_url, "oauth_failed")

                userinfo = userinfo_resp.json()

        except httpx.HTTPError as exc:
            logger.error(f"Google OAuth HTTP error: {exc}")
            return _error_redirect(base_url, "oauth_failed")

        email = userinfo.get("email")
        if not email:
            return _error_redirect(base_url, "no_email")

        display_name = userinfo.get("name") or email.split("@")[0]
        user = _upsert_oauth_user(repo, email, display_name, "google")
        return _build_callback_redirect(base_url, user)

    # ── GitHub ────────────────────────────────────────────────

    @router.get("/github")
    def github_oauth_start(request: Request):
        client_id = os.getenv("GITHUB_OAUTH_CLIENT_ID", "")
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="GitHub OAuth is not configured",
            )

        base_url = _get_frontend_base_url(request)
        redirect_uri = f"{base_url}/api/auth/oauth/github/callback"
        state = _encode_state(base_url)

        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": "user:email",
            "state": state,
        }
        url = f"{GITHUB_AUTH_URL}?{urlencode(params)}"
        return {"url": url}

    @router.get("/github/callback")
    async def github_oauth_callback(
        request: Request,
        code: str = Query(...),
        state: str = Query(""),
    ):
        client_id = os.getenv("GITHUB_OAUTH_CLIENT_ID", "")
        client_secret = os.getenv("GITHUB_OAUTH_CLIENT_SECRET", "")
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="GitHub OAuth is not configured",
            )

        base_url = _decode_state(state)
        if base_url is None:
            logger.error("GitHub OAuth: invalid or expired state parameter")
            return _error_redirect(None, "oauth_failed")

        redirect_uri = f"{base_url}/api/auth/oauth/github/callback"

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                token_resp = await client.post(
                    GITHUB_TOKEN_URL,
                    data={
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "code": code,
                        "redirect_uri": redirect_uri,
                    },
                    headers={"Accept": "application/json"},
                )

                if token_resp.status_code != 200:
                    logger.error(f"GitHub token exchange failed: {token_resp.status_code} {token_resp.text}")
                    return _error_redirect(base_url, "oauth_failed")

                token_data = token_resp.json()
                access_token = token_data.get("access_token")
                if not access_token:
                    error = token_data.get("error_description", token_data.get("error", "unknown"))
                    logger.error(f"GitHub token response error: {error}")
                    return _error_redirect(base_url, "oauth_failed")

                gh_headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                }

                user_resp = await client.get(GITHUB_USER_URL, headers=gh_headers)
                if user_resp.status_code != 200:
                    logger.error(f"GitHub user API failed: {user_resp.status_code}")
                    return _error_redirect(base_url, "oauth_failed")

                gh_user = user_resp.json()

                # Get email (may not be in profile if private)
                email = gh_user.get("email")
                if not email:
                    emails_resp = await client.get(GITHUB_USER_EMAILS_URL, headers=gh_headers)
                    if emails_resp.status_code == 200:
                        emails = emails_resp.json()
                        for e in emails:
                            if e.get("primary") and e.get("verified"):
                                email = e["email"]
                                break
                        if not email:
                            for e in emails:
                                if e.get("verified"):
                                    email = e["email"]
                                    break

        except httpx.HTTPError as exc:
            logger.error(f"GitHub OAuth HTTP error: {exc}")
            return _error_redirect(base_url, "oauth_failed")

        if not email:
            return _error_redirect(base_url, "no_email")

        display_name = gh_user.get("name") or gh_user.get("login") or email.split("@")[0]
        user = _upsert_oauth_user(repo, email, display_name, "github")
        return _build_callback_redirect(base_url, user)

    return router
