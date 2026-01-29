# backend/app/reports/report_service.py

from typing import Dict, Any, Optional
from datetime import datetime, timezone

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Score  # already have this ORM model

from app.db.models import Transaction
from app.reports.eval_metrics import (
    predicted_label_from_score,
    build_confusion_matrix,
    compute_metrics_from_cm,
    empty_confusion_matrix,
)

# get the newest row from rpa_runs
async def fetch_latest_run(session: AsyncSession) -> Optional[Dict[str, Any]]:
    """
    Fetch the most recent row from rpa_runs.
    We use raw SQL because rpa_runs is created via Alembic and doesn't have an ORM model.
    """
    sql = text("""
        SELECT
            run_id,
            started_at,
            finished_at,
            status,
            inserted,
            scored,
            flagged,
            report_path
        FROM rpa_runs
        WHERE status = 'success'
        AND (inserted > 0 OR scored > 0)
        ORDER BY started_at DESC
        LIMIT 1
    """)

    result = await session.execute(sql)
    row = result.mappings().first()
    return dict(row) if row is not None else None

async def compute_run_metrics(run: Dict[str, Any], session: AsyncSession) -> Dict[str, Any]:
    """
    Compute run metrics:
    - avg_score (existing)
    - evaluation metrics (accuracy/precision/recall/f1 + confusion matrix)
      using Transaction.label as ground truth and Score.score -> predicted class.
    """
    started_at = run.get("started_at")
    finished_at = run.get("finished_at")

    # If finished_at isn't set yet (run still "running"), treat "now" as end.
    if finished_at is None:
        finished_at = datetime.now(timezone.utc)

    # -------------------------
    # Avg score (existing logic)
    # -------------------------
    stmt_avg = select(func.avg(Score.score))
    if started_at is not None:
        stmt_avg = stmt_avg.where(Score.created_at >= started_at)
    if finished_at is not None:
        stmt_avg = stmt_avg.where(Score.created_at <= finished_at)

    avg_score = await session.scalar(stmt_avg)
    avg_score = float(avg_score or 0.0)

    # -------------------------------------------------------
    # Evaluation metrics: join latest score per tx in window
    # -------------------------------------------------------
    # Use raw SQL for a clean "latest score per transaction" query.
    sql = text("""
        WITH latest_scores AS (
            SELECT
                s.transaction_id,
                MAX(s.created_at) AS max_created_at
            FROM scores s
            WHERE
                s.created_at >= COALESCE(CAST(:started_at AS timestamptz), '-infinity'::timestamptz)
                AND s.created_at <= CAST(:finished_at AS timestamptz)
            GROUP BY s.transaction_id
        )
        SELECT
            t.label AS actual_label,
            s.score AS score_value
        FROM latest_scores ls
        JOIN scores s
            ON s.transaction_id = ls.transaction_id
            AND s.created_at = ls.max_created_at
        JOIN transactions t
            ON t.transaction_id = s.transaction_id
        WHERE t.label IS NOT NULL
    """)

    result = await session.execute(
        sql,
        {"started_at": started_at, "finished_at": finished_at}
    )
    rows = result.mappings().all()

    y_true = []
    y_pred = []

    for r in rows:
        actual = int(r["actual_label"])
        score_value = float(r["score_value"])
        pred = predicted_label_from_score(score_value)

        y_true.append(actual)
        y_pred.append(pred)

    if len(y_true) == 0:
        cm = empty_confusion_matrix()
        eval_metrics = {"accuracy": None, "precision": None, "recall": None, "f1-score": None}
    else:
        cm = build_confusion_matrix(y_true, y_pred)
        eval_metrics = compute_metrics_from_cm(cm)

    return {
        "avg_score": round(avg_score, 2),
        "eval_metrics": eval_metrics,
        "confusion_matrix": cm,
    }

# combine rpa_runs numbers and computed metrics into JSON that matches the schema
async def build_latest_run_payload(session: AsyncSession) -> Optional[Dict[str, Any]]:
    """
    Build the JSON payload for /reports/latest, matching the schema from US-114.
    """
    run = await fetch_latest_run(session)
    if not run:
        return None

    metrics = await compute_run_metrics(run, session)

    scored = run.get("scored") or 0
    flagged = run.get("flagged") or 0

    flag_rate = 0.0
    if scored > 0:
        flag_rate = round((flagged / scored) * 100.0, 2)

    # Right now, each run tracks only how many it inserted.
    # So total_transactions for this run == inserted.
    total_transactions = run.get("inserted") or 0

    return {
        "run_id": run["run_id"],
        "started_at": run["started_at"],
        "finished_at": run["finished_at"],
        "status": run["status"],
        "inserted": run["inserted"],
        "scored": run["scored"],
        "flagged": run["flagged"],
        "total_transactions": total_transactions,
        "report_path": run["report_path"],

        # NEW: confusion matrix at top-level (matches frontend expectation)
        "confusion_matrix": metrics["confusion_matrix"],

        "metrics": {
            "flag_rate_percent": flag_rate,
            "avg_score": metrics["avg_score"],

            # NEW: evaluation metrics (keys match AdminPage.jsx)
            "accuracy": metrics["eval_metrics"]["accuracy"],
            "precision": metrics["eval_metrics"]["precision"],
            "recall": metrics["eval_metrics"]["recall"],
            "f1-score": metrics["eval_metrics"]["f1-score"],
        },
    }

