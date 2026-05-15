"""Add age column to team_members.

Revision ID: 0015_team_member_age
Revises: 0014_seed_level
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0015_team_member_age"
down_revision = "0014_seed_level"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("team_members", sa.Column("age", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("team_members", "age")
