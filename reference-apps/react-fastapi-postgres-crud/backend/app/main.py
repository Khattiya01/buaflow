from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.routers import auth, health, tasks

app = FastAPI(title="Buaflow PP-004 reference app", version="0.1.0")

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(tasks.router)

# Single deployable image: this backend serves the built React static assets directly —
# one container, one process, one `docker run` — instead of standing up a second service.
_STATIC_DIR = Path(__file__).resolve().parents[1] / "static"
if _STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str) -> FileResponse:
        # Client-side routing: any non-API, non-asset path resolves to index.html and the
        # React Router in the bundle takes over from there.
        candidate = _STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC_DIR / "index.html")
