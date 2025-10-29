from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class ScoreCreate(BaseModel):
    transaction_id: str
    model_version: str = "rules-v0"
    score: float
    reason: Optional[str] = None

class ScoreOut(ScoreCreate):
    id: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
