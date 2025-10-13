from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.deps import get_session
from app.db.models import Case, CaseStatus

router = APIRouter(prefix="/cases", tags=["cases"])

@router.get("/")
async def list_cases(limit: int = 50, session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(Case).limit(limit))
    return list(res.scalars().all())
