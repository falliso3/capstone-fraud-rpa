# Backend — Fraud Detection RPA (FastAPI + PostgreSQL)

## End-to-End Fraud Pipeline (Local)

### Stack
- **FastAPI (Uvicorn)** — API gateway for ingestion, scoring, cases, audit logs  
- **PostgreSQL 16** — persistent storage for transactions, scores, cases, audit logs, rpa_runs  
- **Orchestrator (Python)** — runs the automated fraud workflow and emits a Markdown report  

---

## Quick Start

### 1. Bring up the stack
```bash
# from backend/
docker compose up -d --build
```

### 2. Sanity check the API
```bash
curl -s http://localhost:8000/healthz
curl -s http://localhost:8000/transactions | jq .
```

Expected:
```bash
{"status": "ok"}
[]
```

### 3. Run the full end-to-end pipeline
```bash
python orchestrate_workflow.py sample_data/transactions_small.csv
```

Expected:
```bash
OK — run_id=<uuid>
Report: run-artifacts/report_YYYYMMDD-HHMMSS_<id>.md
```

## Artifacts
Markdown Reports: backend/run-artifacts/*.md
Run Metadata: stored in table rpa_runs
Scores: stored in table scores

## Test Scenarios (for demo)
### Verify DB connections
```bash
docker compose up -d --build
curl -s http://localhost:8000/healthz      # → {"status":"ok"}
curl -s http://localhost:8000/transactions # → [] or rows
```

## Run automated workflow
```bash
python orchestrate_workflow.py sample_data/transactions_small.csv
```

Expected:
OK — run_id=... Report: .../report_...md

## Generate Report
Open the Markdown file path printed in console.
Confirm counts in DB:
```bash
SELECT COUNT(*) FROM transactions;
SELECT COUNT(*) FROM scores;
SELECT * FROM rpa_runs ORDER BY created_at DESC LIMIT 1;
```

### Dev Quickstart (Local Alembic debugging)
For local migrations without Docker:
```bash
cd ~/Capstone/capstone-fraud-rpa/backend
source .venv/Scripts/activate
export DATABASE_URL="postgresql+psycopg://fraud:fraudpw@localhost:5432/fraud"
docker compose up -d db
alembic upgrade head
```