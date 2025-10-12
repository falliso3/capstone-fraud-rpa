from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import (
    Column, String, Numeric, DateTime, JSON, ForeignKey, SmallInteger,
    Text, func, Enum, Index
)
import enum

# Base class for all ORM models
Base = declarative_base()

# Enum for case lifecycle; stored as strings in DB for readability
class CaseStatus(str, enum.Enum):
    open = "open"
    in_review = "in_review"
    closed = "closed"

class Transaction(Base):
    __tablename__ = "transactions"

    # Natural key from the CSV (e.g., "tx0001"); use String PK to match source IDs
    transaction_id    = Column(String, primary_key=True)

    # When the tx happened; timezone-aware for cross-region correctness
    timestamp         = Column(DateTime(timezone=True), index=True)

    # Entity linkage + faceting for analytics
    account_id        = Column(String, index=True)
    payer_id          = Column(String, index=True)
    payee_id          = Column(String, index=True)

    # Money values with fixed precision: up to 12 digits + 2 decimals
    amount            = Column(Numeric(14, 2), nullable=False)
    currency          = Column(String(3), nullable=False)    # ISO-4217 like "USD"

    # Contextual attributes often used for rules/features
    merchant_category = Column(String, index=True)
    country           = Column(String(2), index=True)        # ISO-3166 alpha-2
    channel           = Column(String, index=True)           # e.g., web/app/pos
    device_id         = Column(String, index=True)
    ip_hash           = Column(String, index=True)

    # Optional balances from source system
    balance_before    = Column(Numeric(14, 2))
    balance_after     = Column(Numeric(14, 2))

    # Labeling for ML/ops: 0=clean, 1=suspicious, 2=fraud (smallint for compactness)
    label             = Column(SmallInteger, index=True)

    # Freeform notes/comments from analysts or ingestion
    notes             = Column(Text)

    # One-to-many: a transaction can have many scores and/or cases
    # cascade delete-orphan => dropping a tx removes its child rows
    scores = relationship("Score", back_populates="transaction", cascade="all, delete-orphan")
    cases  = relationship("Case",  back_populates="transaction", cascade="all, delete-orphan")

# Composite index to speed queries like:
#   "give me recent tx for account X" (ORDER BY timestamp DESC)
Index("ix_tx_core", Transaction.account_id, Transaction.timestamp.desc())

class Score(Base):
    __tablename__ = "scores"

    # External-friendly ID (string so we can use UUIDs or hashes)
    id              = Column(String, primary_key=True)

    # Tie score to a transaction; delete tx => cascade delete scores
    transaction_id  = Column(
        String,
        ForeignKey("transactions.transaction_id", ondelete="CASCADE"),
        index=True,
        nullable=False
    )

    model_version   = Column(String, nullable=False)         # e.g., "v1.2.0"
    score           = Column(Numeric(5, 2), nullable=False)  # 0.00–100.00
    reason          = Column(Text)                           # optional explanation

    # Server-side default timestamp (DB fills this in)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # ORM backref
    transaction     = relationship("Transaction", back_populates="scores")

class Case(Base):
    __tablename__ = "cases"

    id              = Column(String, primary_key=True)

    # If a tx is deleted, keep the case (SET NULL) for audit history
    transaction_id  = Column(
        String,
        ForeignKey("transactions.transaction_id", ondelete="SET NULL"),
        index=True,
        nullable=True
    )

    status          = Column(Enum(CaseStatus), nullable=False, default=CaseStatus.open)
    assigned_to     = Column(String)      # analyst username / id
    notes           = Column(Text)

    created_at      = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at      = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        index=True
    )

    transaction     = relationship("Transaction", back_populates="cases")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id          = Column(String, primary_key=True)  # string to allow UUIDs
    entity_type = Column(String, index=True, nullable=False)  # "transaction" | "score" | "case"
    entity_id   = Column(String, index=True, nullable=False)  # matches the entity's PK
    action      = Column(String, nullable=False)              # "create" | "update" | "delete"
    actor       = Column(String)                              # who performed the action
    meta        = Column(JSON)                                # arbitrary context (old/new values, etc.)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), index=True)
