"""health-check control: proves the process is up AND can reach its database, not just
that the HTTP server is listening."""

import time
from datetime import datetime, timezone

from fastapi import APIRouter, Response
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import Depends

from app.db import get_db
from app.log import log
from app.schemas import HealthOut

router = APIRouter()


@router.get("/api/health", response_model=HealthOut)
def health(response: Response, db: Session = Depends(get_db)) -> HealthOut:
    started_at = time.monotonic()
    try:
        db.execute(text("SELECT 1"))
        return HealthOut(
            status="ok",
            database="up",
            latency_ms=int((time.monotonic() - started_at) * 1000),
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as error:  # noqa: BLE001 - health check must never crash the process
        log.error("health.database_unreachable", {"error": str(error)})
        response.status_code = 503
        return HealthOut(status="error", database="down", error=str(error), timestamp=datetime.now(timezone.utc).isoformat())
