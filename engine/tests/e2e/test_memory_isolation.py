"""E2E tests for Soul Memory Fabric user isolation.

Run with:
    E2E_BASE_URL=https://ling.sngxai.com pytest engine/tests/e2e/test_memory_isolation.py -v

These tests verify:
1. JWT auth auto-fill of user_id
2. Cross-user memory isolation (Alice can't see Bob's data and vice versa)
3. Unauthorized access rejection (401, 403)
4. Anonymous user_id rejection
"""

import time
import uuid

import pytest

from .conftest import _auth_header


class TestMemoryWrite:
    """Tests for /api/v1/memory/events (ingest)."""

    def test_jwt_auto_fill_write(self, http_client, alice_auth):
        """JWT user can write without specifying user_id in body."""
        token, user_id = alice_auth
        resp = http_client.post(
            "/api/v1/memory/events",
            headers=_auth_header(token),
            json={
                "idempotency_key": f"e2e-{uuid.uuid4().hex[:16]}",
                "content_raw": "Alice的秘密: 我最喜欢巧克力冰淇淋",
                "source": "e2e_test",
                "memory_type": "episode",
            },
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_explicit_user_id_write(self, http_client, alice_auth):
        """JWT user can write with their own user_id explicitly."""
        token, user_id = alice_auth
        resp = http_client.post(
            "/api/v1/memory/events",
            headers=_auth_header(token),
            json={
                "idempotency_key": f"e2e-{uuid.uuid4().hex[:16]}",
                "user_id": user_id,
                "content_raw": "Alice的第二条记忆: 我住在东京",
                "source": "e2e_test",
                "memory_type": "episode",
            },
        )
        assert resp.status_code == 200

    def test_bob_writes_own_memory(self, http_client, bob_auth):
        """Bob can write to his own space."""
        token, user_id = bob_auth
        resp = http_client.post(
            "/api/v1/memory/events",
            headers=_auth_header(token),
            json={
                "idempotency_key": f"e2e-{uuid.uuid4().hex[:16]}",
                "content_raw": "Bob的记忆: 我喜欢打篮球",
                "source": "e2e_test",
                "memory_type": "episode",
            },
        )
        assert resp.status_code == 200


class TestMemoryIsolation:
    """Tests for cross-user isolation."""

    def test_alice_recalls_own_memories(self, http_client, alice_auth):
        """Alice should be able to recall her own memories."""
        token, user_id = alice_auth
        resp = http_client.post(
            "/api/v1/memory/recall",
            headers=_auth_header(token),
            json={"query": "巧克力冰淇淋"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("user_id") == user_id or data.get("memory_sources"), (
            f"Recall should target Alice's user_id {user_id}"
        )

    def test_bob_cannot_see_alice_memories(self, http_client, bob_auth):
        """Bob should NOT see Alice's '巧克力' memory."""
        token, user_id = bob_auth
        resp = http_client.post(
            "/api/v1/memory/recall",
            headers=_auth_header(token),
            json={"query": "巧克力冰淇淋"},
        )
        assert resp.status_code == 200
        data = resp.json()
        # Check that Bob's recall doesn't contain Alice's content
        context = data.get("context_pack", data)
        episodes = context.get("episodes", [])
        event_memories = context.get("event_sourced_memories", [])
        evermemos = context.get("evermemos_memories", [])

        all_content = " ".join(
            str(m) for m in (episodes + event_memories + evermemos)
        )
        assert "Alice" not in all_content, (
            f"Bob should NOT see Alice's memories, but found: {all_content[:200]}"
        )

    def test_cross_user_write_rejected(self, http_client, bob_auth, alice_auth):
        """Bob cannot write to Alice's memory space."""
        bob_token, _ = bob_auth
        _, alice_id = alice_auth
        resp = http_client.post(
            "/api/v1/memory/events",
            headers=_auth_header(bob_token),
            json={
                "idempotency_key": f"e2e-{uuid.uuid4().hex[:16]}",
                "user_id": alice_id,
                "content_raw": "恶意注入到Alice的记忆",
                "source": "e2e_test",
            },
        )
        assert resp.status_code == 403, (
            f"Cross-user write should be 403, got {resp.status_code}: {resp.text}"
        )


class TestAuthEnforcement:
    """Tests for authentication and authorization."""

    def test_no_auth_rejected(self, http_client):
        """Requests without auth should be rejected with 401."""
        resp = http_client.post(
            "/api/v1/memory/events",
            json={
                "idempotency_key": f"e2e-{uuid.uuid4().hex[:16]}",
                "content_raw": "unauthorized test",
                "source": "e2e_test",
            },
        )
        assert resp.status_code == 401, (
            f"No-auth request should be 401, got {resp.status_code}"
        )

    def test_anonymous_user_id_rejected(self, http_client, alice_auth):
        """Writing with anonymous user_id like 'default_user' should be rejected."""
        token, _ = alice_auth
        resp = http_client.post(
            "/api/v1/memory/events",
            headers=_auth_header(token),
            json={
                "idempotency_key": f"e2e-{uuid.uuid4().hex[:16]}",
                "user_id": "default_user",
                "content_raw": "anonymous test",
                "source": "e2e_test",
            },
        )
        assert resp.status_code == 403, (
            f"Anonymous user_id should be 403, got {resp.status_code}: {resp.text}"
        )

    def test_invalid_token_rejected(self, http_client):
        """Invalid JWT should be rejected."""
        resp = http_client.post(
            "/api/v1/memory/recall",
            headers={"Authorization": "Bearer invalid.jwt.token"},
            json={"query": "test"},
        )
        assert resp.status_code == 401
