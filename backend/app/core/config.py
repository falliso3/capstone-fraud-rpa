import os
from pydantic import BaseModel

# Centralized application settings.
# In a larger app, might switch BaseModel -> BaseSettings for auto env loading.

class Settings(BaseModel):
    # Async SQLAlchemy URL (used by the app at runtime)
    # like postgresql+asyncpg://fraud:fraudpw@db:5432/fraud
    DATABASE_URL: str = os.getenv("DATABASE_URL")

    # Sync SQLAlchemy URL (handy for Alembic migrations)
    # like postgresql+psycopg://fraud:fraudpw@db:5432/fraud
    SYNC_DATABASE_URL: str = os.getenv("SYNC_DATABASE_URL")

# Singleton-style settings object imported elsewhere (avoid re-parsing env repeatedly)
settings = Settings()
