# backend/app/api/reports.py

#API enterance for the report. When someone goes to reports/latest, FastAPI opens a DB session, calls build_latest_run_paylaod, and returns that JSON. If there are no runs yet, then 404.

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.deps import get_session
from app.reports.report_service import build_latest_run_payload

from app.reports.render import render_markdown, render_html

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

@router.post("/latest/generate")
async def generate_latest_report_files(session: AsyncSession = Depends(get_session)):
    """
    Generate Markdown and HTML report files for the latest run,
    and return the file paths.

    Note: the files are written inside the backend container's filesystem
    (under ./run-artifacts). For now this endpoint is mainly for demo.
    """
    payload = await build_latest_run_payload(session)
    if not payload:
        raise HTTPException(status_code=404, detail="No runs found")

    md_path = render_markdown(payload)
    html_path = render_html(payload)

    return {"markdown": md_path, "html": html_path}
