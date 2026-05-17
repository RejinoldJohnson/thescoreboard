"""Add Google SSO fields — make password_hash nullable, add google_id and avatar_url.

Revision ID: 0018_google_sso
Revises: 0017_tournament_logo_url
Create Date: 2026-05-17
"""

from alembic import op
import sqlalchemy as sa

revision = "0018_google_sso"
down_revision = "0017_tournament_logo_url"
branch_labels = None
depends_on = None


def upgrade():
    # Allow NULL passwords (Google-only accounts have no password)
    op.alter_column("users", "password_hash", nullable=True)
    # Store Google's unique user ID for fast lookup on SSO login
    op.add_column("users", sa.Column("google_id", sa.String(255), nullable=True))
    op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)
    # Store Google profile picture URL
    op.add_column("users", sa.Column("avatar_url", sa.String(500), nullable=True))


def downgrade():
    op.drop_index("ix_users_google_id", table_name="users")
    op.drop_column("users", "google_id")
    op.drop_column("users", "avatar_url")
    op.alter_column("users", "password_hash", nullable=False)
