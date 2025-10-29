"""merge heads

Revision ID: 80266c2150f7
Revises: 112905df90a3, e3394681e22d
Create Date: 2025-10-28 13:54:27.989850

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '80266c2150f7'
down_revision: Union[str, Sequence[str], None] = ('112905df90a3', 'e3394681e22d')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
