"""
End-to-end runner:
- Creates an rpa_runs row
- Ingests CSV via API
- Scores transactions via simple rules and POST /scores
- Writes a Markdown report and updates rpa_runs
"""
import os, time, uuid, requests, csv
from datetime import datetime, timezone
from pathlib import Path
import psycopg  # sync driver for convenience (uses SYNC_DATABASE_URL)

API = os.environ.get("ORCH_API_BASE", "http://localhost:8000")
SYNC_DB = os.environ.get("SYNC_DATABASE_URL")  # from backend/.env
ART_DIR = Path("run-artifacts")
ART_DIR.mkdir(exist_ok=True)

def wait_api():
    for _ in range(60):
        try:
            r = requests.get(f"{API}/healthz", timeout=2)
            if r.ok:
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("API did not become healthy")

def db_exec(sql, params=None, fetch=False):
    with psycopg.connect(SYNC_DB) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            if fetch:
                return cur.fetchall()
            conn.commit()

def start_run():
    run_id = str(uuid.uuid4())
    db_exec(
        "INSERT INTO rpa_runs (run_id, status) VALUES (%s, %s)",
        (run_id, "running")
    )
    return run_id

def finish_run(run_id, **fields):
    sets = ", ".join([f"{k} = %s" for k in fields.keys()])
    params = list(fields.values()) + [run_id]
    db_exec(f"UPDATE rpa_runs SET {sets} WHERE run_id = %s", params)

def ingest_csv(csv_path):
    with open(csv_path, "rb") as f:
        files = {"file": (Path(csv_path).name, f, "text/csv")}
        r = requests.post(f"{API}/transactions/ingest-csv", files=files, timeout=60)
        r.raise_for_status()
        return r.json()["inserted"]

def fetch_transactions(limit=1000):
    r = requests.get(f"{API}/transactions?limit={limit}", timeout=30)
    r.raise_for_status()
    return r.json()

def rule_score(tx):
    """Very simple placeholder logic for demo purposes."""
    amt = float(tx.get("amount", 0))
    reason = []
    score = 20.0

    if amt >= 10000: 
        score += 50; reason.append("high_amount")
    if tx.get("country") not in ("US", "CA"):
        score += 15; reason.append("foreign_country")
    if (tx.get("merchant_category") or "").lower() in ("crypto","gambling"):
        score += 15; reason.append("risky_mcc")

    score = min(score, 100.0)
    return score, ", ".join(reason) or "baseline"

def post_score(tx_id, score, reason):
    payload = {
        "transaction_id": tx_id,
        "model_version": "rules-v0",
        "score": score,
        "reason": reason
    }
    r = requests.post(f"{API}/scores", json=payload, timeout=30)
    r.raise_for_status()
    return r.json()

def build_report(run_id, inserted, scored, flagged):
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = ART_DIR / f"report_{ts}_{run_id[:8]}.md"
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# Fraud E2E Run — {ts} (run_id: {run_id})\n\n")
        f.write(f"- Inserted transactions: **{inserted}**\n")
        f.write(f"- Scored transactions: **{scored}**\n")
        f.write(f"- Flagged (>80): **{flagged}**\n\n")
        f.write("## Notes\nThis run used a rule-based scorer (`rules-v0`).\n")
    return str(path)

def main(csv_path):
    wait_api()
    run_id = start_run()
    try:
        inserted = ingest_csv(csv_path)
        txs = fetch_transactions(limit=inserted)
        flagged = 0
        scored = 0
        for tx in txs:
            s, reason = rule_score(tx)
            post_score(tx["transaction_id"], s, reason)
            scored += 1
            if s >= 80:
                flagged += 1
        report = build_report(run_id, inserted, scored, flagged)
        finish_run(
            run_id,
            finished_at=datetime.now(timezone.utc),
            status="success",
            inserted=inserted,
            scored=scored,
            flagged=flagged,
            report_path=report
        )
        print(f"OK — run_id={run_id}\nReport: {report}")
    except Exception as e:
        finish_run(run_id, finished_at=datetime.now(timezone.utc), status="failed")
        raise

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python orchestrate_workflow.py <path/to/transactions.csv>")
        sys.exit(1)
    main(sys.argv[1])
