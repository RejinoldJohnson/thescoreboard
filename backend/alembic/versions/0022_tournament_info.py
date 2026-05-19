"""Add tournament_info JSON column to tournaments table.

Revision ID: 0022_tournament_info
Revises: 0021_venue_lat_lng
Create Date: 2026-05-19
"""

from alembic import op
import sqlalchemy as sa

revision = "0022_tournament_info"
down_revision = "0021_venue_lat_lng"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tournaments", sa.Column("tournament_info", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("tournaments", "tournament_info")
