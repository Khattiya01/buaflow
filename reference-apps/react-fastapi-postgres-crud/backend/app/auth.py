"""Password hashing and signed session cookies.

Mirrors reference-apps/nextjs-postgres-crud/lib/auth.ts's contract (HMAC-signed,
httpOnly, sameSite=lax cookie carrying {sub, role}, 8h TTL) so the two golden stacks are
directly comparable on the same security controls, using itsdangerous instead of hand-rolled
HMAC since it is the standard, audited library for this in the Python ecosystem.
"""

from typing import TypedDict

import bcrypt
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import settings

SESSION_COOKIE_NAME = "session"
SESSION_TTL_SECONDS = 60 * 60 * 8  # 8 hours


class SessionPayload(TypedDict):
    sub: str
    role: str


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, stored: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), stored.encode("utf-8"))
    except ValueError:
        return False


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.require_session_secret(), salt="session")


def encode_session(sub: str, role: str) -> str:
    return _serializer().dumps({"sub": sub, "role": role})


def decode_session(token: str | None) -> SessionPayload | None:
    if not token:
        return None
    try:
        payload = _serializer().loads(token, max_age=SESSION_TTL_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(payload, dict) or "sub" not in payload or "role" not in payload:
        return None
    return SessionPayload(sub=payload["sub"], role=payload["role"])
