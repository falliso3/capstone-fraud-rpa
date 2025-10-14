from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

class TransactionCreate(BaseModel):
    transaction_id: str
    timestamp: datetime          # <— typed, FastAPI will parse ISO and validate
    account_id: str
    payer_id: str
    payee_id: str
    amount: float
    currency: str
    merchant_category: str
    country: str
    channel: str
    device_id: str
    ip_hash: str
    balance_before: float
    balance_after: float
    label: int
    notes: Optional[str] = None

class TransactionOut(TransactionCreate):
    model_config = ConfigDict(from_attributes=True)
