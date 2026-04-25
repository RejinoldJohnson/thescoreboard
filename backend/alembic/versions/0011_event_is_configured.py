"""Add is_configured flag to events; make format nullable.

Revision ID: 0011_event_is_configured
Revises: 0010_sport_subformat
Create Date: 2026-04-25

Changes
-------
events.format
    Allow NULL.  Multi-sport events are created without a format until the
    organiser completes the per-sport setup wizard.  All existing rows already
    have a non-NULL value, so this is a safe ALTER.

events.is_configured
    Boolean flag, server default TRUE so every existing event stays in the
    "configured" state and all existing functionality is preserved.
    New multi-sport events are inserted with is_configured=FALSE until the
    organiser submits the setup wizard.

Migration strategy for existing data
-------------------------------------
No existing rows are modified.  All current events get is_configured=TRUE via
the server_default, which means they continue to work exactly as before.
Organisers can optionally reconfigure them through the new setup modal.
"""
from alembic import op
import sqlalchemy as sa

revision      = "0011_event_is_configured"
down_revision = "0010_sport_subformat"
branch_labels = None
depends_on    = None


def upgrade():
    # Allow NULL in format — multi-sport events created before setup have no format
    op.alter_column(
        "events", "format",
        existing_type=sa.String(50),
        nullable=True,
        existing_server_default=None,
    )

    # Track per-event setup completion; all existing events default to configured
    op.add_column(
        "events",
        sa.Column("is_configured", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade():
    # Restore NOT NULL: fill any NULLs with a safe default first
    op.execute("UPDATE events SET format = 'group_knockout' WHERE format IS NULL")
    op.alter_column(
        "events", "format",
        existing_type=sa.String(50),
        nullable=False,
        existing_server_default=None,
    )
    op.drop_column("events", "is_configured")
