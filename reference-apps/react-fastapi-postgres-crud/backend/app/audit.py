"""Satisfies the internal-crud profile's audit-trail decision
(claude-setup/tests/fixtures/profiles/internal-crud.json): who changed which task, when,
and what changed."""

import json
from typing import Any, Literal, cast

from sqlalchemy.orm import Session

from app.models import AuditLog


def _to_json(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    # datetime fields are not JSON-serializable by default — round-trip through a
    # str-default json.dumps to get a plain, JSON-safe snapshot, same approach as
    # reference-apps/nextjs-postgres-crud/lib/audit.ts's toJson().
    return cast(dict[str, Any], json.loads(json.dumps(value, default=str)))


def record_audit(
    db: Session,
    *,
    task_id: str,
    user_id: str,
    action: Literal["create", "update", "delete"],
    before: Any = None,
    after: Any = None,
) -> None:
    entry = AuditLog(
        task_id=task_id,
        user_id=user_id,
        action=action,
        before=_to_json(before),
        after=_to_json(after),
    )
    db.add(entry)
