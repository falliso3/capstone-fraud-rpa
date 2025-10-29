from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.schemas.scores import ScoreCreate, ScoreOut
from app.db.deps import get_session
from app.db.models import Score  # you already have this table
import uuid

from fastapi import APIRouter
router = APIRouter(prefix="/scores", tags=["scores"])

@router.post("", response_model=ScoreOut)
@router.post("/", response_model=ScoreOut)
async def create_score(
    payload: ScoreCreate,
    session: AsyncSession = Depends(get_session),
):
    # Optional: verify the FK target exists to return 409 instead of 500 on bad tx id
    # from app.db.models import Transaction
    # exists = await session.scalar(select(Transaction.transaction_id)
    #                               .where(Transaction.transaction_id == payload.transaction_id))
    # if not exists:
    #     raise HTTPException(status_code=409, detail="Transaction not found")

    obj = Score(
        id=str(uuid.uuid4()),
        transaction_id=payload.transaction_id,
        model_version=payload.model_version,
        score=payload.score,
        reason=payload.reason,
    )
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj
