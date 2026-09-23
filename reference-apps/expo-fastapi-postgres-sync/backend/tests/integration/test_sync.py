import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app
from tests.integration.conftest import login


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def test_health_reports_database_up(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "up"


def test_login_rejects_unknown_email(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "x"})
    assert response.status_code == 401


def test_sync_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/sync/pull").status_code == 401
    assert client.post("/api/sync/push", json={"changes": []}).status_code == 401


def test_login_returns_a_bearer_token(client: TestClient, make_user) -> None:
    make_user("member@example.com", "pw")
    response = client.post("/api/auth/login", json={"email": "member@example.com", "password": "pw"})
    assert response.status_code == 200
    assert isinstance(response.json()["token"], str) and len(response.json()["token"]) > 20


def test_bearer_token_authenticates_without_the_cookie(make_user) -> None:
    # The mobile client (no cookie jar) authenticates purely via the Authorization header —
    # prove that path works with a client that never carries the login response's cookie.
    make_user("member@example.com", "pw")
    anonymous_client = TestClient(app)
    login_response = anonymous_client.post("/api/auth/login", json={"email": "member@example.com", "password": "pw"})
    token = login_response.json()["token"]

    bearer_only_client = TestClient(app)
    response = bearer_only_client.get("/api/sync/pull", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["tasks"] == []


def test_pull_returns_empty_for_a_fresh_account(client: TestClient, make_user) -> None:
    make_user("member@example.com", "pw")
    login(client, "member@example.com", "pw")
    response = client.get("/api/sync/pull")
    assert response.status_code == 200
    assert response.json()["tasks"] == []


def test_push_creates_a_task_with_a_client_generated_id(client: TestClient, make_user) -> None:
    make_user("member@example.com", "pw")
    login(client, "member@example.com", "pw")

    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    response = client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "local-1",
                    "id": task_id,
                    "title": "Buy groceries offline",
                    "status": "todo",
                    "deleted": False,
                    "updatedAt": _iso(now),
                }
            ]
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 1
    result = body["results"][0]
    assert result["clientId"] == "local-1"
    assert result["id"] == task_id
    assert result["outcome"] == "applied"
    assert result["task"]["title"] == "Buy groceries offline"

    pulled = client.get("/api/sync/pull").json()["tasks"]
    assert [t["id"] for t in pulled] == [task_id]


def test_pull_since_only_returns_changes_after_the_cursor(client: TestClient, make_user) -> None:
    make_user("member@example.com", "pw")
    login(client, "member@example.com", "pw")

    first_id = str(uuid.uuid4())
    client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "a",
                    "id": first_id,
                    "title": "First",
                    "status": "todo",
                    "deleted": False,
                    "updatedAt": _iso(datetime.now(timezone.utc)),
                }
            ]
        },
    )
    cursor = client.get("/api/sync/pull").json()["serverTime"]

    second_id = str(uuid.uuid4())
    client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "b",
                    "id": second_id,
                    "title": "Second",
                    "status": "todo",
                    "deleted": False,
                    "updatedAt": _iso(datetime.now(timezone.utc)),
                }
            ]
        },
    )

    since_pull = client.get("/api/sync/pull", params={"since": cursor}).json()["tasks"]
    assert [t["id"] for t in since_pull] == [second_id]


def test_push_update_wins_when_client_edit_is_newer(client: TestClient, make_user) -> None:
    make_user("member@example.com", "pw")
    login(client, "member@example.com", "pw")

    task_id = str(uuid.uuid4())
    client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "a",
                    "id": task_id,
                    "title": "Original",
                    "status": "todo",
                    "deleted": False,
                    "updatedAt": _iso(datetime.now(timezone.utc)),
                }
            ]
        },
    )

    later = datetime.now(timezone.utc) + timedelta(seconds=5)
    response = client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "a",
                    "id": task_id,
                    "title": "Edited later",
                    "status": "in_progress",
                    "deleted": False,
                    "updatedAt": _iso(later),
                }
            ]
        },
    )
    result = response.json()["results"][0]
    assert result["outcome"] == "applied"
    assert result["task"]["title"] == "Edited later"
    assert result["task"]["status"] == "in_progress"


def test_push_update_conflicts_when_client_edit_is_stale(client: TestClient, make_user) -> None:
    # Simulates two devices: device A's edit reaches the server first (and the server's
    # own clock stamps updated_at at "now"); device B was offline and queued an edit
    # stamped with an OLDER local timestamp than what the server now has recorded. When B
    # finally syncs, its change must lose — the server tells it so via outcome="conflict"
    # and returns the authoritative row for B to overwrite its local copy with.
    make_user("member@example.com", "pw")
    login(client, "member@example.com", "pw")

    task_id = str(uuid.uuid4())
    stale_edit_time = datetime.now(timezone.utc)
    client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "a",
                    "id": task_id,
                    "title": "From device A",
                    "status": "todo",
                    "deleted": False,
                    "updatedAt": _iso(stale_edit_time),
                }
            ]
        },
    )

    # Device B's queued edit is stamped BEFORE device A's create landed on the server.
    response = client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "b",
                    "id": task_id,
                    "title": "From device B (stale)",
                    "status": "done",
                    "deleted": False,
                    "updatedAt": _iso(stale_edit_time - timedelta(seconds=30)),
                }
            ]
        },
    )
    result = response.json()["results"][0]
    assert result["outcome"] == "conflict"
    assert result["task"]["title"] == "From device A"


def test_push_delete_is_a_soft_tombstone_visible_on_pull(client: TestClient, make_user) -> None:
    make_user("member@example.com", "pw")
    login(client, "member@example.com", "pw")

    task_id = str(uuid.uuid4())
    client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "a",
                    "id": task_id,
                    "title": "Temp",
                    "status": "todo",
                    "deleted": False,
                    "updatedAt": _iso(datetime.now(timezone.utc)),
                }
            ]
        },
    )
    later = datetime.now(timezone.utc) + timedelta(seconds=5)
    client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "a",
                    "id": task_id,
                    "title": "Temp",
                    "status": "todo",
                    "deleted": True,
                    "updatedAt": _iso(later),
                }
            ]
        },
    )

    pulled = client.get("/api/sync/pull").json()["tasks"]
    assert len(pulled) == 1
    assert pulled[0]["deleted_at"] is not None


def test_member_cannot_push_a_change_to_another_members_task(client: TestClient, make_user) -> None:
    make_user("owner@example.com", "pw")
    make_user("other@example.com", "pw")

    owner_client = TestClient(client.app)
    login(owner_client, "owner@example.com", "pw")
    task_id = str(uuid.uuid4())
    owner_client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "a",
                    "id": task_id,
                    "title": "Owner's task",
                    "status": "todo",
                    "deleted": False,
                    "updatedAt": _iso(datetime.now(timezone.utc)),
                }
            ]
        },
    )

    other_client = TestClient(client.app)
    login(other_client, "other@example.com", "pw")
    response = other_client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "b",
                    "id": task_id,
                    "title": "hijacked",
                    "status": "todo",
                    "deleted": False,
                    "updatedAt": _iso(datetime.now(timezone.utc) + timedelta(seconds=5)),
                }
            ]
        },
    )
    assert response.status_code == 403

    # Ownership boundary also applies on pull: the other member never sees the owner's task.
    assert other_client.get("/api/sync/pull").json()["tasks"] == []


def test_admin_pull_sees_every_users_tasks(client: TestClient, make_user) -> None:
    make_user("owner@example.com", "pw")
    make_user("admin@example.com", "pw", role="admin")

    owner_client = TestClient(client.app)
    login(owner_client, "owner@example.com", "pw")
    task_id = str(uuid.uuid4())
    owner_client.post(
        "/api/sync/push",
        json={
            "changes": [
                {
                    "clientId": "a",
                    "id": task_id,
                    "title": "Owner's task",
                    "status": "todo",
                    "deleted": False,
                    "updatedAt": _iso(datetime.now(timezone.utc)),
                }
            ]
        },
    )

    admin_client = TestClient(client.app)
    login(admin_client, "admin@example.com", "pw")
    assert [t["id"] for t in admin_client.get("/api/sync/pull").json()["tasks"]] == [task_id]


def test_logout_clears_session(client: TestClient, make_user) -> None:
    make_user("member@example.com", "pw")
    login(client, "member@example.com", "pw")
    assert client.get("/api/sync/pull").status_code == 200

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    assert client.get("/api/sync/pull").status_code == 401
