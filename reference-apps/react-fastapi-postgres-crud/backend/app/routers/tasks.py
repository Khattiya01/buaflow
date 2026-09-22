from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.auth import SessionPayload
from app.db import get_db
from app.guard import can_access_task, forbidden, require_session
from app.models import Task
from app.schemas import TaskCreate, TaskOut, TaskUpdate

router = APIRouter()

STATUSES = {"todo", "in_progress", "done"}


def _load_task(db: Session, task_id: str) -> Task | None:
    return db.execute(
        select(Task).where(Task.id == task_id, Task.deleted_at.is_(None))
    ).scalar_one_or_none()


@router.get("/api/tasks", response_model=list[TaskOut])
def list_tasks(db: Session = Depends(get_db), session: SessionPayload = Depends(require_session)) -> list[Task]:
    # Ownership boundary: members see only their own tasks, admins see every task.
    stmt = select(Task).where(Task.deleted_at.is_(None)).order_by(Task.created_at.desc())
    if session["role"] != "admin":
        stmt = stmt.where(Task.owner_id == session["sub"])
    return list(db.execute(stmt).scalars())


@router.post("/api/tasks", response_model=TaskOut, status_code=201)
def create_task(
    body: TaskCreate, db: Session = Depends(get_db), session: SessionPayload = Depends(require_session)
) -> Task:
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    task = Task(title=title, description=body.description, status=body.status, owner_id=session["sub"])
    db.add(task)
    db.flush()
    record_audit(
        db,
        task_id=task.id,
        user_id=session["sub"],
        action="create",
        after=TaskOut.model_validate(task).model_dump(mode="json"),
    )
    db.commit()
    db.refresh(task)
    return task


@router.get("/api/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: str, db: Session = Depends(get_db), session: SessionPayload = Depends(require_session)) -> Task:
    task = _load_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="not found")
    if not can_access_task(session, task):
        raise forbidden(session, task_id)
    return task


@router.patch("/api/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: str,
    body: TaskUpdate,
    db: Session = Depends(get_db),
    session: SessionPayload = Depends(require_session),
) -> Task:
    task = _load_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="not found")
    if not can_access_task(session, task):
        raise forbidden(session, task_id)

    before = TaskOut.model_validate(task).model_dump(mode="json")
    if body.title is not None and body.title.strip():
        task.title = body.title.strip()
    if body.description is not None or "description" in body.model_fields_set:
        task.description = body.description
    if body.status is not None and body.status in STATUSES:
        task.status = body.status

    db.flush()
    record_audit(
        db,
        task_id=task.id,
        user_id=session["sub"],
        action="update",
        before=before,
        after=TaskOut.model_validate(task).model_dump(mode="json"),
    )
    db.commit()
    db.refresh(task)
    return task


@router.delete("/api/tasks/{task_id}")
def delete_task(
    task_id: str, db: Session = Depends(get_db), session: SessionPayload = Depends(require_session)
) -> dict[str, bool]:
    task = _load_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="not found")
    if not can_access_task(session, task):
        raise forbidden(session, task_id)

    before = TaskOut.model_validate(task).model_dump(mode="json")
    # Soft delete: keep the row (and its audit history) for recovery/inspection instead of
    # hard-deleting it.
    task.deleted_at = datetime.now(timezone.utc)
    db.flush()
    record_audit(
        db,
        task_id=task.id,
        user_id=session["sub"],
        action="delete",
        before=before,
        after=TaskOut.model_validate(task).model_dump(mode="json"),
    )
    db.commit()
    return {"ok": True}
