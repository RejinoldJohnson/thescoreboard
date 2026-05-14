"""Add seed_level column to players and teams.

Revision ID: 0014_seed_level
Revises: 0013_standings_table
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0014_seed_level"
down_revision = "0013_standings_table"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("players", sa.Column("seed_level", sa.String(20), nullable=True))
    op.add_column("teams",   sa.Column("seed_level", sa.String(20), nullable=True))


def downgrade():
    op.drop_column("players", "seed_level")
    op.drop_column("teams",   "seed_level")
