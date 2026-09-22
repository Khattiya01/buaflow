from app.guard import can_access_task
from app.models import Task


def _task(owner_id: str) -> Task:
    return Task(id="t1", title="x", status="todo", owner_id=owner_id)


def test_admin_can_access_any_task() -> None:
    session = {"sub": "admin-1", "role": "admin"}
    assert can_access_task(session, _task(owner_id="someone-else")) is True


def test_owner_can_access_own_task() -> None:
    session = {"sub": "member-1", "role": "member"}
    assert can_access_task(session, _task(owner_id="member-1")) is True


def test_member_cannot_access_others_task() -> None:
    session = {"sub": "member-1", "role": "member"}
    assert can_access_task(session, _task(owner_id="someone-else")) is False
