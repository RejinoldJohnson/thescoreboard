"""Add plan column to users table.

Revision ID: 0023_user_plan
Revises: 0022_tournament_info
Create Date: 2026-05-20
"""

from alembic import op
import sqlalchemy as sa

revision = "0023_user_plan"
down_revision = "0022_tournament_info"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("plan", sa.String(20), nullable=False, server_default="free"),
    )


def downgrade():
    op.drop_column("users", "plan")
