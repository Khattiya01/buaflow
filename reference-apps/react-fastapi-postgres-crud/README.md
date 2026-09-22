# react-fastapi-postgres-crud

Buaflow's PP-004 reference app: a small internal task tracker (React/Vite SPA + FastAPI +
SQLAlchemy/Alembic + PostgreSQL), the second web golden stack proving the pack/readiness
contracts generalize beyond PP-003's Next.js + PostgreSQL app
(`reference-apps/nextjs-postgres-crud`). See `docs/runbook.md`, `docs/security-notes.md`
and `docs/requirements-traceability.md` for the full R3 picture, and
`docs/evidence/readiness.json` for the current control status.

## Local development

```bash
docker compose up -d                       # local Postgres on localhost:5433
cp backend/.env.example backend/.env        # then edit SESSION_SECRET for real use

cd backend
python -m venv .venv && .venv/Scripts/activate   # or .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"
python -m alembic upgrade head
python scripts/seed.py
python -m uvicorn app.main:app --reload --port 8000

# in another terminal
cd frontend
npm install
npm run dev   # proxies /api to localhost:8000, see vite.config.ts
```

## Tests

```bash
cd backend && pytest              # unit + integration (needs the compose Postgres running)
cd frontend && npm run typecheck && npm run lint && npm run build
cd tests/e2e && npm test          # builds the frontend, resets the DB, runs Playwright
```

## Rehearsals (what R3's clean-environment and rollback controls are proven with)

```bash
node scripts/rehearse-clean-environment.mjs
node scripts/rehearse-migration-rollback.mjs
```

Both are destructive to whatever is in the local compose Postgres — never point them at a
real database.
