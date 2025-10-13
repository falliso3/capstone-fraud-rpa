from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.deps import get_session
from app.db.models import Transaction

router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.get("/")
async def list_transactions(limit: int = 50, session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(Transaction).limit(limit))
    return list(res.scalars().all())
