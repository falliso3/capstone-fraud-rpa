from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.deps import get_session
from app.db.models import AuditLog

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])

@router.get("/")
async def list_audit_logs(limit: int = 100, session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(AuditLog).limit(limit))
    return list(res.scalars().all())
