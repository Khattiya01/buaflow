"""access-control guard: every API route that touches a task calls require_session first.

Ownership/role checks live here so router functions stay declarative — see
claude-setup/tests/fixtures/profiles/internal-crud.json ("access-control": required).
"""

from fastapi import Cookie, HTTPException, Request

from app.auth import SESSION_COOKIE_NAME, SessionPayload, decode_session
from app.log import log
from app.models import Task


def require_session(session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)) -> SessionPayload:
    payload = decode_session(session)
    if payload is None:
        raise HTTPException(status_code=401, detail="unauthenticated")
    return payload


def can_access_task(session: SessionPayload, task: Task) -> bool:
    return session["role"] == "admin" or task.owner_id == session["sub"]


def forbidden(session: SessionPayload, task_id: str, request: Request | None = None) -> HTTPException:
    # A 403 on an authenticated request is a real ownership-boundary event worth an audit
    # trail of its own, distinct from the per-record AuditLog table (app/audit.py) which
    # only records changes that were actually allowed to happen.
    log.warn("access.forbidden", {"userId": session["sub"], "role": session["role"], "taskId": task_id})
    return HTTPException(status_code=403, detail="forbidden")
