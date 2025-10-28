import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

env_sa_url = (
    os.getenv("SQLALCHEMY_DATABASE_URL")
    or os.getenv("DATABASE_URL")
    or config.get_main_option("sqlalchemy.url")
)

# Normalize plain postgresql:// to psycopg3 driver for Alembic
if env_sa_url and env_sa_url.startswith("postgresql://"):
    sa_url = "postgresql+psycopg" + env_sa_url[len("postgresql"):]
else:
    sa_url = env_sa_url

if not sa_url:
    raise RuntimeError(
        "No database URL found for Alembic. "
        "Set SQLALCHEMY_DATABASE_URL or DATABASE_URL (or sqlalchemy.url in alembic.ini)."
    )

config.set_main_option("sqlalchemy.url", sa_url)

target_metadata = None

def run_migrations_offline():
    context.configure(
        url=sa_url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
