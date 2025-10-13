from pydantic import BaseModel, ConfigDict
from typing import Optional

# These DTOs define the request/response shapes for the API.
# They are separate from the SQLAlchemy ORM models on purpose:
# - Keep external API contracts stable even if DB changes
# - Validate/parse incoming JSON payloads

class TransactionCreate(BaseModel):
    # Fields we accept when creating a Transaction from API or CSV.
    # using str for timestamp works (ISO 8601) but consider datetime for stronger typing.
    # If you switch to datetime, FastAPI will parse ISO strings automatically.
    transaction_id: str
    timestamp: str                 # e.g., "2025-01-01T12:34:56Z"
    account_id: str
    payer_id: str
    payee_id: str
    amount: float                  # Consider Decimal for money to avoid float rounding
    currency: str                  # 3-letter ISO (e.g., "USD")
    merchant_category: str
    country: str                   # 2-letter ISO (e.g., "US")
    channel: str                   # e.g., "web", "app", "pos"
    device_id: str
    ip_hash: str
    balance_before: float
    balance_after: float
    label: int                     # 0=clean, 1=suspicious, 2=fraud
    notes: Optional[str] = None

class TransactionOut(TransactionCreate):
    # Pydantic v2 equivalent of "orm_mode=True" (v1)
    model_config = ConfigDict(from_attributes=True)