#!/usr/bin/env bash
set -e

# Use sync DSN for connectivity check
: "${SYNC_DATABASE_URL:?SYNC_DATABASE_URL is required}"

python - <<'PY'
import os, time
import psycopg
dsn = os.environ["SYNC_DATABASE_URL"]
for _ in range(30):
    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        break
    except Exception as e:
        print("Waiting for database to be ready...", e, flush=True)
        time.sleep(2)
else:
    raise SystemExit("DB never became ready")
PY

# Run migrations (uses SQLALCHEMY_DATABASE_URL -> sync psycopg3)
alembic upgrade head

# Start API (uses DATABASE_URL -> asyncpg)
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
