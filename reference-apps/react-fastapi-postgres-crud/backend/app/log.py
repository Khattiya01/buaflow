"""observability control: structured, single-line JSON logs to stdout. Deliberately not a
logging framework — a platform's log collector (docker logs, journald, a cloud log sink)
reads stdout either way, and a JSON line is enough to filter/alert on without adding a
dependency. Mirrors reference-apps/nextjs-postgres-crud/lib/log.ts's event-name convention.
"""

import json
import sys
from datetime import datetime, timezone
from typing import Any


def _emit(level: str, event: str, fields: dict[str, Any] | None = None) -> None:
    record = {"level": level, "event": event, "time": datetime.now(timezone.utc).isoformat()}
    record.update(fields or {})
    print(json.dumps(record), file=sys.stdout, flush=True)


class log:
    @staticmethod
    def info(event: str, fields: dict[str, Any] | None = None) -> None:
        _emit("info", event, fields)

    @staticmethod
    def warn(event: str, fields: dict[str, Any] | None = None) -> None:
        _emit("warn", event, fields)

    @staticmethod
    def error(event: str, fields: dict[str, Any] | None = None) -> None:
        _emit("error", event, fields)
