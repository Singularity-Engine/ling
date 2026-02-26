"""E2E integration test fixtures for Soul Memory Fabric."""

import os
import uuid

import httpx
import pytest


BASE_URL = os.environ.get("E2E_BASE_URL", "https://ling.sngxai.com")
TIMEOUT = 30.0


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def http_client(base_url):
    with httpx.Client(base_url=base_url, timeout=TIMEOUT) as client:
        yield client


@pytest.fixture(scope="session")
def alice_auth(http_client):
    """Register + login Alice, return (token, user_id)."""
    suffix = uuid.uuid4().hex[:6]
    username = f"alice_e2e_{suffix}"
    email = f"alice_{suffix}@e2etest.dev"
    password = "Passw0rd2026"

    # Register (may 409 if exists)
    http_client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": password},
    )

    # Login
    resp = http_client.post(
        "/api/auth/login",
        json={"identifier": username, "password": password},
    )
    assert resp.status_code == 200, f"Alice login failed: {resp.text}"
    data = resp.json()
    return data["token"], data["user"]["id"]


@pytest.fixture(scope="session")
def bob_auth(http_client):
    """Register + login Bob, return (token, user_id)."""
    suffix = uuid.uuid4().hex[:6]
    username = f"bob_e2e_{suffix}"
    email = f"bob_{suffix}@e2etest.dev"
    password = "Passw0rd2026"

    http_client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": password},
    )

    resp = http_client.post(
        "/api/auth/login",
        json={"identifier": username, "password": password},
    )
    assert resp.status_code == 200, f"Bob login failed: {resp.text}"
    data = resp.json()
    return data["token"], data["user"]["id"]


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
