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

## Sprint 5 - Connecting Database and API to Admin Page

### Scenario 1, Normal Success
**1. Start Backend Stack (FASTAPI + DB)**
```bash
cd backend
docker compose up --build
```
FastAPI will be available at:
```bash
http://localhost:8000
```

**2. Run the Orchestrator to Generate a Fraud Run**
```bash
.\.venv\Scripts\Activate.ps1
python orchestrate_workflow.py ..\financial-fraud\transactions_100.csv
```
This:
- Inserts a new row into rpa_runs
- Ingests all transactions from the CSV
- Scores all transactions
- Generates Markdown + HTML reports
- Updates metrics such as flag_rate_percent and avg_score

**3. Verify /reports/latest is returning data**
Open in a browser:
```bash
http://localhost:8000/reports/latest
```
Expected JSON example:
```bash
{
  "run_id": "...",
  "started_at": "2025-11-23T23:30:44.123456",
  "status": "success",
  "inserted": 100,
  "scored": 100,
  "flagged": 7,
  "metrics": {
    "flag_rate_percent": 7.0,
    "avg_score": 0.42
  }
}
```
**4. start the react frontend**
```bash
cd ..
npm run start:frontend
```
Log in using the built-in dev credentials:
- Email: test@test.com
- Password: test
 <br>
<br>Navigate to the Admin Dashboard

**Expected Behavior**
The Admin Dashboard calls:
```bash
GET http://localhost:8000/reports/latest
```
- A loading message appears briefly
- A report card appears showing:
   - Date (from started_at)
   - Timestamp in UTC
   - N/A for ML metrics (accuracy/F1 not yet implemented)
   - Real backend metrics (flag rate, avg score) mapped into UI
- DevTools → Network should show /reports/latest with 200 OK

### Scenario 2, Empty State
If the database has no rows in rpa_runs:
- GET /reports/latest returns 404
- fetchLatestRun() returns null
- latestRun remains null
Current UI behavior:
- reportsToShow falls back to mock data (MOCK_REPORTS)
- If mock data is removed, the UI displays:
```bash
  No reports available yet.
```
This confirms correct empty-state handling.

### Scenario 3, Error State
1. Keep the React frontend running
2. Stop the backend:
```bash
Ctrl + C
```
3. Refresh admin page
#### Expected Behavior
- /reports/latest fails (connection refused)
- runError shows a friendly message:
```bash
Could not load latest run from the backend.
```
UI falls back to mock reports instead of crashing


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
