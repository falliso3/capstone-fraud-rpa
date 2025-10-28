"""create core tables for fraud detection workflow

Revision ID: e3394681e22d
Revises: 168b37c35b71
Create Date: 2025-10-27 17:12:16.591073

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3394681e22d'
down_revision: Union[str, Sequence[str], None] = '168b37c35b71'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
