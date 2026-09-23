"""Who changed which task, when, and what changed — same pattern as
reference-apps/react-fastapi-postgres-crud/backend/app/audit.py. For synced tasks the
audit trail also records which side (server or a specific client) originated each change,
via the `via` field, so a reviewer can tell a sync-applied change from a direct API call.
"""

import json
from typing import Any, Literal, cast

from sqlalchemy.orm import Session

from app.models import AuditLog


def _to_json(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    return cast(dict[str, Any], json.loads(json.dumps(value, default=str)))


def record_audit(
    db: Session,
    *,
    task_id: str,
    user_id: str,
    action: Literal["create", "update", "delete"],
    before: Any = None,
    after: Any = None,
    via: Literal["api", "sync"] = "api",
) -> None:
    entry = AuditLog(
        task_id=task_id,
        user_id=user_id,
        action=action,
        before=_to_json(before),
        after=_to_json(after),
        via=via,
    )
    db.add(entry)
