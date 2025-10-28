"""add rpa_runs table

Revision ID: 168b37c35b71
Revises: 0e3bfe71a6b3
Create Date: 2025-10-27 15:55:38.362540
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "168b37c35b71"
down_revision = "0e3bfe71a6b3"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "rpa_runs",
        sa.Column("run_id", sa.String(), primary_key=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), index=True),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(), index=True),  # "success" | "failed"
        sa.Column("inserted", sa.Integer(), server_default="0"),
        sa.Column("scored", sa.Integer(), server_default="0"),
        sa.Column("flagged", sa.Integer(), server_default="0"),
        sa.Column("report_path", sa.Text()),
    )

def downgrade():
    op.drop_table("rpa_runs")
