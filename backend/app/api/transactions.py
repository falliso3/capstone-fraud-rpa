# backend/app/api/transactions.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.db.deps import get_session
from app.db.models import Transaction
from app.schemas.transactions import TransactionCreate, TransactionOut

import csv
from io import StringIO, TextIOWrapper
from datetime import datetime
from typing import Dict, Any

router = APIRouter(prefix="/transactions", tags=["transactions"])

# -----------------------------
# LIST (accept /transactions and /transactions/)
# -----------------------------
@router.get("")
@router.get("/", response_model=list[TransactionOut])
async def list_transactions(
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
):
    res = await session.execute(
        select(Transaction).order_by(Transaction.timestamp.desc()).limit(limit)
    )
    return list(res.scalars().all())

# -----------------------------
# CREATE (accept /transactions and /transactions/)
# -----------------------------
@router.post("", response_model=TransactionOut)
@router.post("/", response_model=TransactionOut)
async def create_txn(
    payload: TransactionCreate,
    session: AsyncSession = Depends(get_session),
):
    data = payload.model_dump()  # timestamp already a datetime
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
# BULK INGEST CSV (robust)
# -----------------------------
@router.post("/ingest-csv")
async def ingest_csv(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    """
    Robust CSV loader that handles:
    - UTF-8 BOM in header (utf-8-sig)
    - Extra values beyond header (DictReader puts them under key None)
    - Whitespace in headers/values
    - Trailing commas / Windows line endings
    - Safe type coercion; empty strings -> None
    """
    # Use utf-8-sig to auto-strip BOM; newline="" for correct CSV parsing
    wrapper = TextIOWrapper(file.file, encoding="utf-8-sig", newline="")
    reader = csv.DictReader(wrapper)

    inserted = 0
    rows: list[Transaction] = []

    for raw in reader:
        if not raw:
            continue

        cleaned = _normalize_csv_row(raw)

        # Require minimum fields
        if "transaction_id" not in cleaned or "amount" not in cleaned or "timestamp" not in cleaned:
            # skip invalid rows silently; you can collect & report if you want
            continue

        try:
            rows.append(Transaction(**cleaned))
        except TypeError:
            # If a non-string key slipped through or unexpected column types
            # skip this row; optionally collect errors
            continue

    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found in CSV")

    # Insert in bulk
    session.add_all(rows)
    try:
        await session.commit()
        inserted = len(rows)
    except IntegrityError:
        await session.rollback()
        # Mixed dupes/new rows: fall back to row-by-row so we insert the good ones
        inserted = await _insert_row_by_row(rows, session)

    return {"inserted": inserted}

# -------- Helpers --------

def _normalize_csv_row(row: Dict[Any, Any]) -> Dict[str, Any]:
    """
    Clean & map incoming CSV -> Transaction columns.
    - Drop non-string keys (e.g., None from extra columns)
    - Strip header/value whitespace; strip BOM if present
    - Coerce numeric and datetime fields
    """
    # 1) Drop non-string keys (DictReader puts overflow under key None)
    for k in list(row.keys()):
        if not isinstance(k, str):
            row.pop(k, None)

    # 2) Normalize header names & values (trim; strip BOM on first header just in case)
    fixed: Dict[str, Any] = {}
    for k, v in row.items():
        k2 = k.strip()
        if k2.startswith("\ufeff"):
            k2 = k2.lstrip("\ufeff")
        if isinstance(v, str):
            v = v.strip()
            if v == "":
                v = None
        fixed[k2] = v

    # 3) Keep only known columns
    cols = [
        "transaction_id","timestamp","account_id","payer_id","payee_id",
        "amount","currency","merchant_category","country","channel",
        "device_id","ip_hash","balance_before","balance_after","label","notes",
    ]
    out: Dict[str, Any] = {c: fixed.get(c) for c in cols if c in fixed}

    # 4) Type coercion (safe)
    out["amount"] = _to_float(out.get("amount"))
    if out.get("balance_before") is not None:
        out["balance_before"] = _to_float(out.get("balance_before"))
    if out.get("balance_after") is not None:
        out["balance_after"] = _to_float(out.get("balance_after"))
    if out.get("label") is not None:
        out["label"] = _to_int(out.get("label"))

    # timestamps like "2025-09-29T08:12:22Z"
    ts = out.get("timestamp")
    if isinstance(ts, str):
        out["timestamp"] = _to_datetime(ts)

    return out

def _to_float(v):
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None

def _to_int(v):
    if v is None:
        return None
    try:
        return int(v)
    except Exception:
        return None

def _to_datetime(s: str):
    try:
        # Convert trailing 'Z' to +00:00
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None

async def _insert_row_by_row(rows: list[Transaction], session: AsyncSession) -> int:
    ok = 0
    for obj in rows:
        session.add(obj)
        try:
            await session.commit()
            ok += 1
        except IntegrityError:
            await session.rollback()
            # duplicate transaction_id; skip
            continue
    return ok
