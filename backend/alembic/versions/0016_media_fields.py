"""Add og_image_url to tournaments and logo_url to teams.

Revision ID: 0016_media_fields
Revises: 0015_team_member_age
Create Date: 2026-05-17
"""

from alembic import op
import sqlalchemy as sa

revision = "0016_media_fields"
down_revision = "0015_team_member_age"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tournaments", sa.Column("og_image_url", sa.String(500), nullable=True))
    op.add_column("teams", sa.Column("logo_url", sa.String(500), nullable=True))


def downgrade():
    op.drop_column("tournaments", "og_image_url")
    op.drop_column("teams", "logo_url")
