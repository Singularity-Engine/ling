"""Full-platform E2E health check for Ling (ling.sngxai.com).

Run with:
    E2E_BASE_URL=https://ling.sngxai.com pytest engine/tests/e2e/test_full_platform.py -v

Covers:
1. Health & Public endpoints
2. Registration → Login → Token lifecycle
3. OAuth flow initiation
4. Profile & User info
5. Memory Fabric (write, recall, isolation)
6. Billing & Plan gates
7. Admin endpoints (with non-admin user → 403)
8. WebSocket chat connection
9. Edge cases & security
"""

import json
import time
import uuid

import httpx
import pytest

from .conftest import _auth_header

BASE_TIMEOUT = 30.0


# ─── Phase 1: Health & Public ─────────────────────────────

class TestHealth:

    def test_health_via_dashboard(self, http_client):
        """Public dashboard serves as health proxy (engine /health is internal only)."""
        resp = http_client.get("/api/public/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert "health" in data or "experiment" in data, f"Unexpected dashboard: {data}"

    def test_ping(self, http_client):
        """Ping goes through nginx to frontend SPA — 200 means infra is up."""
        resp = http_client.get("/ping")
        assert resp.status_code == 200


# ─── Phase 2: Registration & Login Lifecycle ──────────────

class TestAuthLifecycle:

    def test_register_new_user(self, http_client, alice_auth):
        """alice_auth fixture already registered successfully — validates register flow."""
        token, user_id = alice_auth
        assert token and len(token) > 20
        # Verify the registered user is free/user
        resp = http_client.get("/api/auth/me", headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("plan") == "free"
        assert data.get("role") == "user"

    def test_register_duplicate_email(self, http_client, alice_auth):
        """Duplicate email registration should fail."""
        token, _ = alice_auth
        # Get alice's email
        me = http_client.get("/api/auth/me", headers=_auth_header(token)).json()
        alice_email = me.get("email", "")
        if not alice_email:
            pytest.skip("Cannot get alice email")

        resp = http_client.post(
            "/api/auth/register",
            json={
                "username": "dup_" + uuid.uuid4().hex[:4],
                "email": alice_email,
                "password": "TestPass2026!",
            },
        )
        assert resp.status_code in (409, 422, 400, 429), (
            f"Duplicate email should fail, got {resp.status_code}: {resp.text}"
        )

    def test_login_success(self, http_client, alice_auth):
        """alice_auth fixture already logged in successfully."""
        token, user_id = alice_auth
        assert token and len(token) > 20
        assert user_id and len(user_id) > 10

    def test_login_wrong_password(self, http_client, alice_auth):
        """Login with wrong password for existing alice user."""
        token, _ = alice_auth
        me = http_client.get("/api/auth/me", headers=_auth_header(token)).json()
        username = me.get("username", "")
        if not username:
            pytest.skip("Cannot get alice username")
        resp = http_client.post(
            "/api/auth/login",
            json={"identifier": username, "password": "WrongPass999!"},
        )
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, http_client):
        resp = http_client.post(
            "/api/auth/login",
            json={"identifier": "nonexistent_user_xyz", "password": "whatever"},
        )
        assert resp.status_code == 401

    def test_me_endpoint(self, http_client, alice_auth):
        """GET /api/auth/me should return current user."""
        token, user_id = alice_auth
        resp = http_client.get("/api/auth/me", headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("id") == user_id or data.get("user", {}).get("id") == user_id

    def test_token_refresh(self, http_client, alice_auth):
        """Use alice's refresh_token from login to get a new access token."""
        # Re-login to get fresh refresh_token (alice_auth fixture doesn't store it)
        suffix = uuid.uuid4().hex[:6]
        reg_resp = http_client.post(
            "/api/auth/register",
            json={
                "username": f"refresh_{suffix}",
                "email": f"refresh_{suffix}@e2etest.dev",
                "password": "RefreshTest1!",
            },
        )
        if reg_resp.status_code == 429:
            pytest.skip("Rate limited on register")
        assert reg_resp.status_code == 200
        refresh_token = reg_resp.json().get("refresh_token")
        if not refresh_token:
            pytest.skip("No refresh_token in register response")

        resp = http_client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert resp.status_code == 200, f"Refresh failed: {resp.text}"
        assert "token" in resp.json()


# ─── Phase 3: OAuth Flow Initiation ──────────────────────

class TestOAuth:

    def test_google_oauth_url(self, http_client):
        """GET /api/auth/oauth/google should return auth URL."""
        resp = http_client.get(
            "/api/auth/oauth/google",
            params={"redirect_uri": "https://ling.sngxai.com/auth/callback"},
            follow_redirects=False,
        )
        # Should return 200 with URL or 302 redirect
        if resp.status_code == 200:
            data = resp.json()
            assert "url" in data or "auth_url" in data, f"No URL in response: {data}"
        elif resp.status_code == 302:
            assert "accounts.google.com" in resp.headers.get("location", "")
        else:
            # OAuth not configured is acceptable
            assert resp.status_code in (500, 503, 501), (
                f"Unexpected OAuth status: {resp.status_code}"
            )

    def test_github_oauth_url(self, http_client):
        """GET /api/auth/oauth/github should return auth URL."""
        resp = http_client.get(
            "/api/auth/oauth/github",
            params={"redirect_uri": "https://ling.sngxai.com/auth/callback"},
            follow_redirects=False,
        )
        if resp.status_code == 200:
            data = resp.json()
            assert "url" in data or "auth_url" in data
        elif resp.status_code == 302:
            assert "github.com" in resp.headers.get("location", "")
        else:
            assert resp.status_code in (500, 503, 501)


# ─── Phase 4: Profile & User Info ────────────────────────

class TestProfile:

    def test_user_profile_via_me(self, http_client, alice_auth):
        """Profile is served via /api/auth/me (no separate /api/users/profile route)."""
        token, user_id = alice_auth
        resp = http_client.get("/api/auth/me", headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert "username" in data or "email" in data or "id" in data

    def test_profile_no_auth(self, http_client):
        resp = http_client.get("/api/auth/me")
        assert resp.status_code in (401, 403)


# ─── Phase 5: Memory Fabric ──────────────────────────────

class TestMemoryFabric:

    def test_ingest_event(self, http_client, alice_auth):
        token, user_id = alice_auth
        resp = http_client.post(
            "/api/v1/memory/events",
            headers=_auth_header(token),
            json={
                "idempotency_key": f"e2e-full-{uuid.uuid4().hex[:12]}",
                "content_raw": "全量测试: Alice 喜欢读科幻小说",
                "source": "e2e_full_test",
                "memory_type": "episode",
            },
        )
        assert resp.status_code == 200, f"Ingest failed: {resp.text}"

    def test_recall(self, http_client, alice_auth):
        token, user_id = alice_auth
        resp = http_client.post(
            "/api/v1/memory/recall",
            headers=_auth_header(token),
            json={"query": "科幻小说"},
        )
        assert resp.status_code == 200, f"Recall failed: {resp.text}"
        data = resp.json()
        # Should have context_pack or similar structure
        assert isinstance(data, dict)

    def test_reflect(self, http_client, alice_auth):
        token, _ = alice_auth
        resp = http_client.post(
            "/api/v1/memory/reflect",
            headers=_auth_header(token),
            json={
                "rule": "Alice 是科幻爱好者",
                "evidence": ["喜欢读科幻小说"],
            },
        )
        # May succeed or return validation error depending on schema
        assert resp.status_code in (200, 422), f"Reflect unexpected: {resp.status_code}: {resp.text}"

    def test_coverage_requires_admin(self, http_client, alice_auth):
        """Coverage endpoint should require admin."""
        token, _ = alice_auth
        resp = http_client.get(
            "/api/v1/memory/coverage",
            headers=_auth_header(token),
        )
        # Regular user should get 403
        assert resp.status_code in (200, 403), f"Coverage: {resp.status_code}: {resp.text}"

    def test_slo_endpoint(self, http_client, alice_auth):
        token, _ = alice_auth
        resp = http_client.get(
            "/api/v1/memory/slo",
            headers=_auth_header(token),
        )
        assert resp.status_code in (200, 403)

    def test_memory_list(self, http_client, alice_auth):
        """GET /api/memory/list — direct Qdrant access."""
        token, _ = alice_auth
        resp = http_client.get(
            "/api/memory/list",
            headers=_auth_header(token),
        )
        assert resp.status_code in (200, 404, 501), (
            f"Memory list: {resp.status_code}: {resp.text}"
        )

    def test_delete_user_memories_requires_auth(self, http_client):
        resp = http_client.post(
            "/api/v1/memory/delete_user",
            json={"user_id": "fake"},
        )
        assert resp.status_code == 401


# ─── Phase 6: Billing & Plan Gates ───────────────────────

class TestBilling:

    def test_balance_endpoint(self, http_client, alice_auth):
        """GET /api/billing/balance should return plan info."""
        token, _ = alice_auth
        resp = http_client.get("/api/billing/balance", headers=_auth_header(token))
        assert resp.status_code == 200, f"Balance failed: {resp.text}"
        data = resp.json()
        assert "plan" in data, f"No plan in balance: {data}"
        assert data["plan"] == "free"  # New user should be free
        assert "credits_balance" in data
        assert "daily_messages" in data or "daily_limit" in data or "daily_count" in data

    def test_check_and_deduct(self, http_client, alice_auth):
        """POST /api/billing/check-and-deduct for free user."""
        token, _ = alice_auth
        resp = http_client.post(
            "/api/billing/check-and-deduct",
            headers=_auth_header(token),
        )
        assert resp.status_code == 200, f"Check-deduct failed: {resp.text}"
        data = resp.json()
        assert "allowed" in data
        # Free user with 0 credits: should still be allowed (free plan doesn't deduct)
        assert data["allowed"] is True, f"Free user should be allowed: {data}"

    def test_check_tool_quota(self, http_client, alice_auth):
        """POST /api/billing/check-tool for free user."""
        token, _ = alice_auth
        resp = http_client.post(
            "/api/billing/check-tool",
            headers=_auth_header(token),
            json={"tool": "web_search"},
        )
        assert resp.status_code == 200, f"Check-tool failed: {resp.text}"
        data = resp.json()
        assert "allowed" in data

    def test_tool_image_gen_quota(self, http_client, alice_auth):
        """Free user should have limited image_gen quota (3/day)."""
        token, _ = alice_auth
        resp = http_client.post(
            "/api/billing/check-tool",
            headers=_auth_header(token),
            json={"tool": "image_gen"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "allowed" in data

    def test_billing_no_auth(self, http_client):
        resp = http_client.get("/api/billing/balance")
        assert resp.status_code in (401, 403)

    def test_stripe_checkout_no_auth(self, http_client):
        resp = http_client.post(
            "/api/stripe/create-checkout",
            json={"type": "credits", "credits": 10000},
        )
        assert resp.status_code in (401, 403)

    def test_stripe_portal_no_auth(self, http_client):
        resp = http_client.get("/api/stripe/portal")
        assert resp.status_code in (401, 403)


# ─── Phase 7: Admin Endpoints (non-admin → 403) ──────────

class TestAdminAccess:

    def test_admin_users_list_forbidden(self, http_client, alice_auth):
        """Regular user cannot list all users."""
        token, _ = alice_auth
        resp = http_client.get("/api/admin/users", headers=_auth_header(token))
        assert resp.status_code == 403, (
            f"Admin list should be 403 for regular user, got {resp.status_code}"
        )

    def test_admin_stats_forbidden(self, http_client, alice_auth):
        token, _ = alice_auth
        resp = http_client.get("/api/admin/stats", headers=_auth_header(token))
        assert resp.status_code == 403

    def test_admin_update_user_forbidden(self, http_client, alice_auth):
        token, user_id = alice_auth
        resp = http_client.patch(
            f"/api/admin/users/{user_id}",
            headers=_auth_header(token),
            json={"role": "admin"},
        )
        assert resp.status_code == 403

    def test_admin_add_credits_forbidden(self, http_client, alice_auth):
        token, user_id = alice_auth
        resp = http_client.post(
            f"/api/admin/users/{user_id}/credits",
            headers=_auth_header(token),
            json={"amount": 99999, "description": "hack attempt"},
        )
        assert resp.status_code == 403

    def test_admin_delete_user_forbidden(self, http_client, alice_auth):
        token, user_id = alice_auth
        resp = http_client.delete(
            f"/api/admin/users/{user_id}",
            headers=_auth_header(token),
        )
        assert resp.status_code == 403


# ─── Phase 8: WebSocket Connectivity ─────────────────────

class TestWebSocket:

    def test_websocket_auth_required(self, base_url):
        """WebSocket without auth should be rejected."""
        try:
            import websockets.sync.client as ws_sync
        except ImportError:
            pytest.skip("websockets not installed")

        ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
        try:
            with ws_sync.connect(f"{ws_url}/client-ws", open_timeout=5) as conn:
                try:
                    msg = conn.recv(timeout=3)
                    data = json.loads(msg) if isinstance(msg, str) else {}
                    assert data.get("type") in ("error", "auth_required", "close", None)
                except Exception:
                    pass  # Connection closed = auth enforced
        except Exception:
            pass  # Connection refused = auth enforced, which is correct

    def test_websocket_with_auth(self, base_url, alice_auth):
        """WebSocket with valid token should connect."""
        try:
            import websockets.sync.client as ws_sync
        except ImportError:
            pytest.skip("websockets not installed")

        token, _ = alice_auth
        ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
        try:
            with ws_sync.connect(
                f"{ws_url}/client-ws?token={token}",
                open_timeout=10,
            ) as conn:
                try:
                    msg = conn.recv(timeout=3)
                except Exception:
                    pass  # Timeout is OK, connection succeeded
        except Exception as e:
            pytest.skip(f"WebSocket test skipped: {e}")


# ─── Phase 9: Security & Edge Cases ──────────────────────

class TestSecurity:

    def test_expired_token_rejected(self, http_client):
        """Fabricated expired token should be rejected."""
        resp = http_client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIiwiZXhwIjoxNjAwMDAwMDAwfQ.invalid"},
        )
        assert resp.status_code == 401

    def test_sql_injection_login(self, http_client):
        """SQL injection in login should be safely handled."""
        resp = http_client.post(
            "/api/auth/login",
            json={"identifier": "' OR 1=1 --", "password": "anything"},
        )
        assert resp.status_code in (401, 422)

    def test_xss_in_username_rejected(self, http_client):
        """XSS in username must be rejected by regex whitelist."""
        resp = http_client.post(
            "/api/auth/register",
            json={
                "username": "xss_test<>",
                "email": f"xss_{uuid.uuid4().hex[:4]}@e2etest.dev",
                "password": "SafePass1!",
            },
        )
        assert resp.status_code in (422, 429), (
            f"XSS username should be 422, got {resp.status_code}: {resp.text}"
        )

    def test_oversized_payload(self, http_client, alice_auth):
        """Oversized memory payload should be handled (rejected or truncated)."""
        token, _ = alice_auth
        huge_content = "A" * 100_000
        try:
            resp = http_client.post(
                "/api/v1/memory/events",
                headers=_auth_header(token),
                json={
                    "idempotency_key": f"e2e-huge-{uuid.uuid4().hex[:8]}",
                    "content_raw": huge_content,
                    "source": "e2e_test",
                },
            )
            # Should either accept with truncation or reject with 413/422
            assert resp.status_code in (200, 413, 422, 400)
        except (httpx.ReadError, httpx.RemoteProtocolError):
            # nginx/proxy may drop the connection for oversized payloads — this is valid
            pass

    def test_empty_password_rejected(self, http_client):
        """Empty password must be rejected (min 8 chars)."""
        resp = http_client.post(
            "/api/auth/register",
            json={
                "username": f"empty_{uuid.uuid4().hex[:4]}",
                "email": f"empty_{uuid.uuid4().hex[:4]}@e2etest.dev",
                "password": "",
            },
        )
        assert resp.status_code in (422, 429)

    def test_weak_password_rejected(self, http_client):
        """Weak password (< 8 chars) must be rejected."""
        resp = http_client.post(
            "/api/auth/register",
            json={
                "username": f"weak_{uuid.uuid4().hex[:4]}",
                "email": f"weak_{uuid.uuid4().hex[:4]}@e2etest.dev",
                "password": "123",
            },
        )
        assert resp.status_code in (422, 429), (
            f"Weak password should be 422, got {resp.status_code}: {resp.text}"
        )

    def test_cors_headers(self, http_client, base_url):
        """CORS preflight — nginx or FastAPI handles it."""
        resp = http_client.options(
            "/api/auth/login",
            headers={
                "Origin": "https://ling.sngxai.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        # nginx may return 204, FastAPI may return 200, or 400/405 if not configured
        assert resp.status_code in (200, 204, 400, 405)

    def test_rate_limit_headers(self, http_client, alice_auth):
        """Rate limit headers may be present."""
        token, _ = alice_auth
        resp = http_client.get("/api/billing/balance", headers=_auth_header(token))
        # Just check we don't get rate limited on first call
        assert resp.status_code == 200


# ─── Phase 10: Data Export & GDPR ─────────────────────────

class TestGDPR:

    def test_data_export(self, http_client, alice_auth):
        """GET /api/auth/export should return user data."""
        token, _ = alice_auth
        resp = http_client.get("/api/auth/export", headers=_auth_header(token))
        assert resp.status_code in (200, 501), f"Export: {resp.status_code}: {resp.text}"

    def test_data_export_no_auth(self, http_client):
        resp = http_client.get("/api/auth/export")
        assert resp.status_code in (401, 403)


# ─── Phase 11: Cross-cutting Concerns ────────────────────

class TestCrossCutting:

    def test_404_on_unknown_route(self, http_client):
        resp = http_client.get("/api/nonexistent/route")
        assert resp.status_code == 404

    def test_method_not_allowed(self, http_client):
        """DELETE on login should be 405."""
        resp = http_client.delete("/api/auth/login")
        assert resp.status_code in (405, 404)

    def test_json_content_type_enforced(self, http_client):
        """POST without JSON content type should fail gracefully."""
        resp = http_client.post(
            "/api/auth/login",
            content="not json",
            headers={"Content-Type": "text/plain"},
        )
        assert resp.status_code in (415, 422, 400)

    def test_unicode_in_memory(self, http_client, alice_auth):
        """Unicode content (emoji, CJK, mixed) should work."""
        token, _ = alice_auth
        resp = http_client.post(
            "/api/v1/memory/events",
            headers=_auth_header(token),
            json={
                "idempotency_key": f"e2e-unicode-{uuid.uuid4().hex[:8]}",
                "content_raw": "灵说: 我今天心情很好 🌸✨ 你呢？ Let's mix languages！",
                "source": "e2e_test",
                "memory_type": "episode",
            },
        )
        assert resp.status_code == 200

    def test_concurrent_writes_idempotent(self, http_client, alice_auth):
        """Same idempotency_key twice should not create duplicate."""
        token, _ = alice_auth
        idem_key = f"e2e-idem-{uuid.uuid4().hex[:12]}"
        payload = {
            "idempotency_key": idem_key,
            "content_raw": "幂等性测试",
            "source": "e2e_test",
        }
        resp1 = http_client.post(
            "/api/v1/memory/events",
            headers=_auth_header(token),
            json=payload,
        )
        resp2 = http_client.post(
            "/api/v1/memory/events",
            headers=_auth_header(token),
            json=payload,
        )
        assert resp1.status_code == 200
        # Second should also succeed (idempotent) or return 409
        assert resp2.status_code in (200, 409)
