# Single deployable image: the FastAPI backend serves the mobile app's web export directly
# (see backend/app/main.py) — one container, one process, matching the pattern the two web
# golden stacks (nextjs-postgres-crud, react-fastapi-postgres-crud) already use. This is the
# WEB distribution channel; the native iOS/Android channel is a separate build (an Android
# debug APK, produced by scripts/build-android-debug.sh, and documented in mobile/eas.json
# for a real app-store release build) that does not go through this Dockerfile at all — a
# mobile binary is not something a container image runs. See docs/sync-contract.md.

FROM node:24-alpine AS mobile-web-build
WORKDIR /mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci
COPY mobile/ ./
RUN npx expo export -p web

FROM python:3.12-slim AS runtime
WORKDIR /app

# Reproducible install from the pinned lockfile (generated from backend/pyproject.toml's
# production dependencies only — see backend/requirements-lock.txt).
COPY backend/requirements-lock.txt ./requirements-lock.txt
RUN pip install --no-cache-dir -r requirements-lock.txt

COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini
COPY --from=mobile-web-build /mobile/dist ./static

RUN useradd --create-home --uid 1001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
