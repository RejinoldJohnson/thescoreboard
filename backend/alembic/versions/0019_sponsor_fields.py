"""Add contact_phone and description to sponsors table.

Revision ID: 0019_sponsor_fields
Revises: 0018_google_sso
Create Date: 2026-05-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0019_sponsor_fields"
down_revision = "0018_google_sso"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("sponsors", sa.Column("contact_phone", sa.String(50),  nullable=True))
    op.add_column("sponsors", sa.Column("description",   sa.Text(),       nullable=True))


def downgrade():
    op.drop_column("sponsors", "contact_phone")
    op.drop_column("sponsors", "description")
