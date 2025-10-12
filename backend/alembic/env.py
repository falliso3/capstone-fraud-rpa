import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import create_engine
from alembic import context

from dotenv import load_dotenv
load_dotenv()  # so SYNC_DATABASE_URL is available

# --- Make sure "app" package is importable when running alembic from backend/ ---
# Add the backend directory (current working dir) to sys.path if needed
# so "from app.db.models import Base" works reliably.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))  # /backend/alembic
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # /backend

# Optional: load .env so SYNC_DATABASE_URL is available when running alembic locally
try:
    from dotenv import load_dotenv
    load_dotenv()  # reads backend/.env
except Exception:
    pass

# Import your models' metadata so Alembic can autogenerate migrations
from app.db.models import Base  # noqa: E402

# Alembic Config object
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Tell Alembic which metadata to scan for changes
TARGET_METADATA = Base.metadata

# Use the **sync** URL for Alembic (psycopg driver, not asyncpg)
DB_URL = os.getenv("SYNC_DATABASE_URL")

def run_migrations_offline():
    """Run migrations without a real DB connection (generates SQL)."""
    context.configure(
        url=DB_URL,
        target_metadata=TARGET_METADATA,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    """Run migrations with an actual DB connection."""
    connectable = create_engine(DB_URL, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=TARGET_METADATA)
        with context.begin_transaction():
            context.run_migrations()

# For simplicity, always run online mode
run_migrations_online()
