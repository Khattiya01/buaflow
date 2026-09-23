"""access-control guard: every API route that touches a task calls require_session first.

Ownership/role checks live here so router functions stay declarative — same pattern as
reference-apps/react-fastapi-postgres-crud/backend/app/guard.py, extended to accept an
`Authorization: Bearer <token>` header ahead of the cookie. React Native's fetch has no
browser-style cookie jar shared across requests, so the mobile client authenticates with an
explicit bearer token (returned alongside the cookie by POST /api/auth/login and stored in
expo-secure-store) instead — see mobile/src/api/client.ts. The cookie is kept for the web
export target, where it works exactly like reference-apps/react-fastapi-postgres-crud's.
"""

from fastapi import Cookie, Header, HTTPException, Request

from app.auth import SESSION_COOKIE_NAME, SessionPayload, decode_session
from app.log import log
from app.models import Task


def require_session(
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: str | None = Header(default=None),
) -> SessionPayload:
    token = session
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[len("bearer "):]
    payload = decode_session(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="unauthenticated")
    return payload


def can_access_task(session: SessionPayload, task: Task) -> bool:
    return session["role"] == "admin" or task.owner_id == session["sub"]


def forbidden(session: SessionPayload, task_id: str, request: Request | None = None) -> HTTPException:
    log.warn("access.forbidden", {"userId": session["sub"], "role": session["role"], "taskId": task_id})
    return HTTPException(status_code=403, detail="forbidden")
