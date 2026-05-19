"""Add venue_lat and venue_lng to tournaments table.

Revision ID: 0021_venue_lat_lng
Revises: 13a928ba5104
Create Date: 2026-05-19
"""

from alembic import op
import sqlalchemy as sa

revision = "0021_venue_lat_lng"
down_revision = "13a928ba5104"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tournaments", sa.Column("venue_lat", sa.Float(), nullable=True))
    op.add_column("tournaments", sa.Column("venue_lng", sa.Float(), nullable=True))


def downgrade():
    op.drop_column("tournaments", "venue_lng")
    op.drop_column("tournaments", "venue_lat")
