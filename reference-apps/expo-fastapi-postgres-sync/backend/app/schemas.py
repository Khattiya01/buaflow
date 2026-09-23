from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

Role = Literal["admin", "member"]
TaskStatus = Literal["todo", "in_progress", "done"]


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    role: Role


class LoginResponse(UserOut):
    # The same signed value set as the session cookie, returned in the body too so a
    # native mobile client (no cookie jar) can store and replay it as a bearer token.
    token: str


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str | None
    status: str
    owner_id: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class HealthOut(BaseModel):
    status: str
    database: str
    latency_ms: int | None = None
    error: str | None = None
    timestamp: str


# --- Sync contract (see docs/sync-contract.md) ---------------------------------------


class SyncChange(BaseModel):
    """One locally-queued mutation the mobile client wants to push upstream.

    clientId is the device's local (SQLite rowid-derived) identifier, echoed back
    unchanged in SyncPushResult so the client can match a result to the local row it came
    from even when the server-side task id differs (it never does today — task ids are
    client-generated — but the field is kept independent so that invariant is never load-
    bearing for correctness).
    """

    clientId: str
    id: str
    title: str
    description: str | None = None
    status: TaskStatus = "todo"
    deleted: bool = False
    updatedAt: datetime


class SyncPushRequest(BaseModel):
    changes: list[SyncChange]


class SyncPushResult(BaseModel):
    clientId: str
    id: str
    outcome: Literal["applied", "conflict"]
    task: TaskOut

    model_config = ConfigDict(from_attributes=True)


class SyncPushResponse(BaseModel):
    results: list[SyncPushResult]
    serverTime: datetime


class SyncPullResponse(BaseModel):
    tasks: list[TaskOut]
    serverTime: datetime
