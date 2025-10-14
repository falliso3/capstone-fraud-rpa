# backend/app/api/transactions.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.db.deps import get_session
from app.db.models import Transaction
from app.schemas.transactions import TransactionCreate, TransactionOut
import csv, io
from datetime import datetime

router = APIRouter(prefix="/transactions", tags=["transactions"])

# -----------------------------
# LIST (accept /transactions and /transactions/)
# -----------------------------
@router.get("")
@router.get("/")
async def list_transactions(limit: int = 50, session: AsyncSession = Depends(get_session)):
    res = await session.execute(
        select(Transaction).order_by(Transaction.timestamp.desc()).limit(limit)
    )
    return list(res.scalars().all())

# -----------------------------
# CREATE (accept /transactions and /transactions/)
# -----------------------------
@router.post("", response_model=TransactionOut)
@router.post("/", response_model=TransactionOut)
async def create_txn(payload: TransactionCreate, session: AsyncSession = Depends(get_session)):
    data = payload.model_dump()    # timestamp is already a datetime here
    obj = Transaction(**data)
    session.add(obj)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="transaction_id already exists")
    await session.refresh(obj)
    return obj

# -----------------------------
# GET ONE
# -----------------------------
@router.get("/{transaction_id}", response_model=TransactionOut)
async def get_txn(transaction_id: str, session: AsyncSession = Depends(get_session)):
    res = await session.execute(
        select(Transaction).where(Transaction.transaction_id == transaction_id)
    )
    obj = res.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Not found")
    return obj

# -----------------------------
# BULK INGEST CSV
# -----------------------------
@router.post("/ingest-csv")
async def ingest_csv(file: UploadFile = File(...), session: AsyncSession = Depends(get_session)):
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode()))
    rows = [Transaction(**_normalize_csv_row(r)) for r in reader]
    session.add_all(rows)
    await session.commit()
    return {"inserted": len(rows)}

# Helpers
def _normalize_csv_row(r: dict):
    r["amount"] = float(r["amount"])
    r["balance_before"] = float(r["balance_before"])
    r["balance_after"]  = float(r["balance_after"])
    r["label"] = int(r["label"])
    # parse "2025-09-29T08:12:22Z" to tz-aware datetime
    r["timestamp"] = datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00"))
    return r
