"""Add logo_url to tournaments (poster replaces banner as primary visual).

Revision ID: 0017_tournament_logo_url
Revises: 0016_media_fields
Create Date: 2026-05-17
"""

from alembic import op
import sqlalchemy as sa

revision = "0017_tournament_logo_url"
down_revision = "0016_media_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tournaments", sa.Column("logo_url", sa.String(500), nullable=True))


def downgrade():
    op.drop_column("tournaments", "logo_url")
