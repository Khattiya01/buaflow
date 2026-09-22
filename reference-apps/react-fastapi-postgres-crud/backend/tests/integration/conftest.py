import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth import hash_password
from app.db import SessionLocal
from app.main import app
from app.models import User


@pytest.fixture(autouse=True)
def _clean_database():
    # Integration tests run against the real docker-compose Postgres (same DB the
    # clean-environment rehearsal and CI use) — truncate between tests instead of mocking
    # the database, so a passing suite is actually proof the persistence control works.
    db = SessionLocal()
    try:
        db.execute(text("TRUNCATE TABLE audit_logs, tasks, users RESTART IDENTITY CASCADE"))
        db.commit()
    finally:
        db.close()
    yield


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def make_user():
    def _make(email: str, password: str, *, role: str = "member", name: str = "Test User") -> User:
        db = SessionLocal()
        try:
            user = User(email=email, name=name, role=role, password_hash=hash_password(password))
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
        finally:
            db.close()

    return _make


def login(client: TestClient, email: str, password: str) -> TestClient:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return client
