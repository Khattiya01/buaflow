from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.routers import auth, health, sync

app = FastAPI(title="Buaflow PP-005 reference app (sync backend)", version="0.1.0")

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(sync.router)

# Expo's web export (`npx expo export -p web`) is a static SPA bundle, exactly like
# nextjs-postgres-crud/react-fastapi-postgres-crud's frontend builds — serving it from the
# same backend container keeps this a single deployable image. The web build is a real
# build of the SAME mobile/ source tree (React Native Web), not a separate app, and is what
# the primary-flow/accessibility/performance E2E controls exercise (native iOS/Android
# builds are proven separately by the Android debug APK build — see docs/runbook.md).
_STATIC_DIR = Path(__file__).resolve().parents[1] / "static"
if _STATIC_DIR.is_dir():
    _assets_dir = _STATIC_DIR / "_expo"
    if _assets_dir.is_dir():
        app.mount("/_expo", StaticFiles(directory=_assets_dir), name="expo-assets")
    assets_dir = _STATIC_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str) -> FileResponse:
        candidate = _STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC_DIR / "index.html")
