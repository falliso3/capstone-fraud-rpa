from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.deps import get_session
from app.db.models import Score

router = APIRouter(prefix="/scores", tags=["scores"])

@router.get("/")
async def list_scores(limit: int = 50, session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(Score).limit(limit))
    return list(res.scalars().all())
