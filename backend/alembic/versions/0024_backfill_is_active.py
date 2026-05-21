"""Backfill is_active = TRUE for any users where it is NULL.

This fixes accounts created before is_active had a server-side default,
which caused NULL rows to be treated as deactivated by the auth code.

Revision ID: 0024_backfill_is_active
Revises: 0023_user_plan
"""

from alembic import op

revision = "0024_backfill_is_active"
down_revision = "0023_user_plan"
branch_labels = None
depends_on = None


def upgrade():
    # Backfill NULL → TRUE (unintentionally deactivated rows)
    op.execute("UPDATE users SET is_active = TRUE WHERE is_active IS NULL")
    # Set server-side default going forward so INSERTs never get NULL
    op.execute("ALTER TABLE users ALTER COLUMN is_active SET DEFAULT TRUE")


def downgrade():
    op.execute("ALTER TABLE users ALTER COLUMN is_active DROP DEFAULT")
