from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal
from app.models import AuditLog
from tests.integration.conftest import login


def test_health_reports_database_up(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "up"


def test_login_rejects_unknown_email(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "x"})
    assert response.status_code == 401
    assert response.json()["detail"] == "invalid email or password"


def test_login_rejects_wrong_password(client: TestClient, make_user) -> None:
    make_user("member@example.com", "correct-password")
    response = client.post("/api/auth/login", json={"email": "member@example.com", "password": "wrong"})
    assert response.status_code == 401
    assert response.json()["detail"] == "invalid email or password"


def test_login_succeeds_and_sets_session_cookie(client: TestClient, make_user) -> None:
    make_user("member@example.com", "correct-password", name="Mem Ber")
    response = client.post("/api/auth/login", json={"email": "member@example.com", "password": "correct-password"})
    assert response.status_code == 200
    assert response.json()["email"] == "member@example.com"
    assert "session" in response.cookies


def test_tasks_require_authentication(client: TestClient) -> None:
    response = client.get("/api/tasks")
    assert response.status_code == 401


def test_member_can_create_and_list_own_tasks(client: TestClient, make_user) -> None:
    make_user("member@example.com", "pw", name="Member")
    login(client, "member@example.com", "pw")

    created = client.post("/api/tasks", json={"title": "Write the runbook"})
    assert created.status_code == 201
    task = created.json()
    assert task["title"] == "Write the runbook"
    assert task["status"] == "todo"

    listed = client.get("/api/tasks")
    assert listed.status_code == 200
    assert [t["id"] for t in listed.json()] == [task["id"]]


def test_create_task_rejects_blank_title(client: TestClient, make_user) -> None:
    make_user("member@example.com", "pw")
    login(client, "member@example.com", "pw")
    response = client.post("/api/tasks", json={"title": "   "})
    assert response.status_code == 400


def test_member_cannot_see_or_modify_another_members_task(client: TestClient, make_user) -> None:
    make_user("owner@example.com", "pw", name="Owner")
    make_user("other@example.com", "pw", name="Other")

    owner_client = TestClient(client.app)
    login(owner_client, "owner@example.com", "pw")
    created = owner_client.post("/api/tasks", json={"title": "Owner's task"})
    task_id = created.json()["id"]

    other_client = TestClient(client.app)
    login(other_client, "other@example.com", "pw")

    assert other_client.get(f"/api/tasks/{task_id}").status_code == 403
    assert other_client.patch(f"/api/tasks/{task_id}", json={"title": "hijacked"}).status_code == 403
    assert other_client.delete(f"/api/tasks/{task_id}").status_code == 403
    assert other_client.get("/api/tasks").json() == []


def test_admin_can_see_and_modify_every_task(client: TestClient, make_user) -> None:
    make_user("owner@example.com", "pw", name="Owner")
    make_user("admin@example.com", "pw", role="admin", name="Admin")

    owner_client = TestClient(client.app)
    login(owner_client, "owner@example.com", "pw")
    task_id = owner_client.post("/api/tasks", json={"title": "Owner's task"}).json()["id"]

    admin_client = TestClient(client.app)
    login(admin_client, "admin@example.com", "pw")

    assert admin_client.get("/api/tasks").json()[0]["id"] == task_id
    updated = admin_client.patch(f"/api/tasks/{task_id}", json={"status": "done"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "done"


def test_delete_is_soft_and_recorded_in_audit_log(client: TestClient, make_user) -> None:
    user = make_user("member@example.com", "pw")
    login(client, "member@example.com", "pw")
    task_id = client.post("/api/tasks", json={"title": "Temp task"}).json()["id"]

    deleted = client.delete(f"/api/tasks/{task_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}

    # Soft delete: gone from the list, but the row (and its audit trail) still exists.
    assert client.get("/api/tasks").json() == []

    db = SessionLocal()
    try:
        logs = list(db.execute(select(AuditLog).where(AuditLog.task_id == task_id)).scalars())
    finally:
        db.close()
    actions = sorted(log.action for log in logs)
    assert actions == ["create", "delete"]
    assert all(log.user_id == user.id for log in logs)


def test_task_not_found_returns_404(client: TestClient, make_user) -> None:
    make_user("member@example.com", "pw")
    login(client, "member@example.com", "pw")
    response = client.get("/api/tasks/does-not-exist")
    assert response.status_code == 404


def test_logout_clears_session(client: TestClient, make_user) -> None:
    make_user("member@example.com", "pw")
    login(client, "member@example.com", "pw")
    assert client.get("/api/tasks").status_code == 200

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    assert client.get("/api/tasks").status_code == 401
