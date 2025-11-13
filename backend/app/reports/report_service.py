# backend/app/reports/report_service.py

from typing import Dict, Any, Optional
from datetime import datetime, timezone

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Score  # we already have this ORM model

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
        ORDER BY started_at DESC
        LIMIT 1
    """)
    result = await session.execute(sql)
    row = result.mappings().first()
    return dict(row) if row is not None else None

# look at scores created between the run's start and finish and calculate average score
async def compute_run_metrics(run: Dict[str, Any], session: AsyncSession) -> Dict[str, Any]:
    """
    Compute metrics for a run using the Score table.

    Since scores are not directly linked to a run_id, we approximate by using
    Score.created_at between run.started_at and run.finished_at.

    This keeps things consistent with the current design without changing schemas.
    """
    started_at = run.get("started_at")
    finished_at = run.get("finished_at")

    stmt = select(func.avg(Score.score))

    if started_at is not None:
        stmt = stmt.where(Score.created_at >= started_at)
    if finished_at is not None:
        stmt = stmt.where(Score.created_at <= finished_at)

    avg_score = await session.scalar(stmt)
    avg_score = float(avg_score or 0.0)

    return {
        "avg_score": round(avg_score, 2),
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
        "metrics": {
            "flag_rate_percent": flag_rate,
            "avg_score": metrics["avg_score"],
            # Optional fields (confusion matrix, metrics table) can be added later
        },
    }
