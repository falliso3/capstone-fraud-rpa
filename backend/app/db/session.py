from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

# Create a global async engine.
# pool_pre_ping=True: validates connections; if dead, SQLAlchemy replaces them.
# IMPORTANT: This uses the ASYNC URL (postgresql+asyncpg://...)
engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)

# Factory that creates AsyncSession objects on demand.
# expire_on_commit=False keeps loaded objects usable after commit (common in APIs).
SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Team tip:
# - We do NOT open a session here. We only define how to create sessions.
# - Actual open/close happens in a dependency (see deps.py).
