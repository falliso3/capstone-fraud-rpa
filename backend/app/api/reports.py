# backend/app/api/reports.py

#API enterance for the report. When someone goes to reports/latest, FastAPI opens a DB session, calls build_latest_run_paylaod, and returns that JSON. If there are no runs yet, then 404.

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.deps import get_session
from app.reports.report_service import build_latest_run_payload

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/latest")
async def latest_report_json(session: AsyncSession = Depends(get_session)):
    """
    Returns JSON summary for the most recent run (from rpa_runs) plus derived metrics.
    """
    payload = await build_latest_run_payload(session)
    if not payload:
        raise HTTPException(status_code=404, detail="No runs found")
    return payload
