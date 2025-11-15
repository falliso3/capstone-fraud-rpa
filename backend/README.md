# Backend — Fraud Detection RPA (FastAPI + PostgreSQL)

## End-to-End Fraud Pipeline (Local)

### What the System Does (Summary)

When you run our end-to-end pipeline (```orchestrate_workflow.py```):

1. A new run is inserted into ```rpa_runs``` with status ```"running"```.

2. A CSV is ingested → transactions saved.

3. Every transaction is scored → scores saved.

4. A Markdown report is generated (old behavior).

5. A new HTML report is generated using our Sprint-4 template (```app/templates/report_template.html```).

6. The run is updated with:
   - ```inserted```
   - ```scored```
   - ```flagged```
   - ```status="success"```
   - ```report_path="<the HTML report file>"```
7. You can view or regenerate reports at any time via API.

### Stack
- **FastAPI (Uvicorn)** — API gateway for ingestion, scoring, cases, audit logs  
- **PostgreSQL 16** — persistent storage for transactions, scores, cases, audit logs, rpa_runs  
- **Orchestrator (Python)** — runs the automated fraud workflow and emits a Markdown report  

---

## Quick Start

### 1. Bring up the stack
```bash
cd backend
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
### 3. Prepare Local Python Environment (required for orchestrator)
```bash
.\.venv\Scripts\Activate.ps1
$env:SYNC_DATABASE_URL = "postgresql://fraud:fraudpw@localhost:5432/fraud"
pip install -r requirements.txt
```

### 4. Run the Full Fraud-Detection Workflow
```bash
python orchestrate_workflow.py bryson.csv
```

Expected:
```bash
OK — run_id=<uuid>
Markdown report: run-artifacts/report_2025....md
HTML report: run-artifacts/report_2025....html
```
### 5. Verify the Run Was Recorded in the Database
```bash
docker compose exec db psql -U fraud -d fraud \
  -c "SELECT run_id, status, inserted, scored, flagged, report_path
      FROM rpa_runs
      ORDER BY started_at DESC LIMIT 1;"
```
You should see:
- ```status = 'success'```
- ```report_path``` ends with ```.html```
- inserted / scored / flagged match your CSV

## API Endpoints Added in Sprint 4
### GET ```/reports/latest``` - Fetch Report Summary
Open in browser or Swagger Docs:
http://localhost:8000/reports/latest

This returns the latest run summary as JSON:
```bash
{
  "run_id": "...",
  "status": "success",
  "inserted": 9827,
  "scored": 9827,
  "flagged": 162,
  "total_transactions": 9827,
  "report_path": "run-artifacts/report_2025....html",
  "metrics": {
    "flag_rate_percent": 1.65,
    "avg_score": 0.0
  }
}
```

### POST ```/reports/latest/generate``` – Create New Markdown + HTML Reports
From Swagger: http://localhost:8000/docs
Response example:
```bash
{
  "markdown": "run-artifacts/report_2025....md",
  "html": "run-artifacts/report_2025....html"
}
```
This uses:

- ```app/reports/report_service.py```
- ```app/reports/render.py```
- ```app/templates/report_template.html```

## Test Scenarios
### 1. Workflow generates both Markdown + HTML
Run:
```bash
python orchestrate_workflow.py bryson.csv
```
Check:
```bash
backend/run-artifacts/
```
Both .md and .html files should be present.

### 2. ```/reports/latest``` matches ```rpa_runs```
Compare JSON output with:
```bash
SELECT * FROM rpa_runs ORDER BY started_at DESC LIMIT 1;
```
Fields should match exactly.
### 3. ```/reports/latest/generate``` creates new files
Swagger Docs → POST ```/reports/latest/generate```
Response shows the new file paths.

### 4. Local Alembic migration testing (without orchestrator)
```bash
cd backend
.\.venv\Scripts\Activate.ps1
$env:DATABASE_URL = "postgresql+psycopg://fraud:fraudpw@localhost:5432/fraud"
docker compose up -d db
alembic upgrade head
```
