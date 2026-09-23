"""The sync contract itself — see docs/sync-contract.md for the prose version of what this
module implements.

Pull: the client sends the timestamp of its last successful sync (`since`); the server
returns every task the caller can see whose updated_at is newer than that, including
soft-deleted ones (deleted_at set) so the client can remove them from its local SQLite
store instead of them lingering forever.

Push: the client sends its queue of locally-made changes, each stamped with the local
wall-clock time it was made (updatedAt). Conflict resolution is last-write-wins by
comparing that client timestamp against the server row's own updated_at: if the server
row is the same age or newer, the server's version already reflects an equal-or-later
write (from this client on a previous sync, another device, or the plain API) and wins —
the client's change is rejected and the server's row is returned so the client can
overwrite its local copy. Otherwise the client's change is applied and updated_at is
stamped with the server's own clock (never the client's), so client clock skew can never
make a stale write look newer on a future pull.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.auth import SessionPayload
from app.db import get_db
from app.guard import can_access_task, require_session
from app.models import Task
from app.schemas import SyncChange, SyncPullResponse, SyncPushRequest, SyncPushResponse, SyncPushResult, TaskOut

router = APIRouter()


@router.get("/api/sync/pull", response_model=SyncPullResponse)
def pull(
    since: datetime | None = None,
    db: Session = Depends(get_db),
    session: SessionPayload = Depends(require_session),
) -> SyncPullResponse:
    stmt = select(Task).order_by(Task.updated_at.asc())
    if session["role"] != "admin":
        stmt = stmt.where(Task.owner_id == session["sub"])
    if since is not None:
        stmt = stmt.where(Task.updated_at > since)
    tasks = list(db.execute(stmt).scalars())
    return SyncPullResponse(tasks=[TaskOut.model_validate(t) for t in tasks], serverTime=datetime.now(timezone.utc))


def _apply_change(db: Session, session: SessionPayload, change: SyncChange) -> SyncPushResult:
    existing = db.get(Task, change.id)
    now = datetime.now(timezone.utc)

    if existing is None:
        title = change.title.strip()
        if not title and not change.deleted:
            raise HTTPException(status_code=400, detail=f"title is required for new task {change.id}")
        task = Task(
            id=change.id,
            title=title or "(untitled)",
            description=change.description,
            status=change.status,
            owner_id=session["sub"],
            updated_at=now,
            deleted_at=now if change.deleted else None,
        )
        db.add(task)
        db.flush()
        record_audit(
            db,
            task_id=task.id,
            user_id=session["sub"],
            action="delete" if change.deleted else "create",
            after=TaskOut.model_validate(task).model_dump(mode="json"),
            via="sync",
        )
        return SyncPushResult(clientId=change.clientId, id=task.id, outcome="applied", task=TaskOut.model_validate(task))

    if not can_access_task(session, existing):
        raise HTTPException(status_code=403, detail=f"forbidden: {change.id}")

    # Last-write-wins: a server row that is already the same age or newer than the
    # client's local edit reflects a later write, so the client's change is rejected and
    # must be reconciled against the returned server row instead of silently applied.
    if existing.updated_at >= change.updatedAt:
        return SyncPushResult(
            clientId=change.clientId, id=existing.id, outcome="conflict", task=TaskOut.model_validate(existing)
        )

    before = TaskOut.model_validate(existing).model_dump(mode="json")
    if change.title.strip():
        existing.title = change.title.strip()
    existing.description = change.description
    existing.status = change.status
    existing.deleted_at = now if change.deleted else None
    existing.updated_at = now
    db.flush()
    record_audit(
        db,
        task_id=existing.id,
        user_id=session["sub"],
        action="delete" if change.deleted else "update",
        before=before,
        after=TaskOut.model_validate(existing).model_dump(mode="json"),
        via="sync",
    )
    return SyncPushResult(clientId=change.clientId, id=existing.id, outcome="applied", task=TaskOut.model_validate(existing))


@router.post("/api/sync/push", response_model=SyncPushResponse)
def push(
    body: SyncPushRequest,
    db: Session = Depends(get_db),
    session: SessionPayload = Depends(require_session),
) -> SyncPushResponse:
    results = [_apply_change(db, session, change) for change in body.changes]
    db.commit()
    return SyncPushResponse(results=results, serverTime=datetime.now(timezone.utc))
