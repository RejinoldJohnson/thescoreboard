"""Fix doubles participant_type: team → doubles_pair for badminton and table_tennis events.

Revision ID: 0012_fix_doubles_participant_type
Revises: 0011_event_is_configured
Create Date: 2026-04-27

Changes
-------
events.participant_type
    Badminton and table_tennis events with participant_type='team' were
    incorrectly normalized from 'doubles_pair' before storage. This migration
    corrects those rows. Football and cricket team events are unaffected.
"""

from alembic import op
import sqlalchemy as sa

revision = "0012_fix_doubles_participant_type"
down_revision = "0011_event_is_configured"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        UPDATE events
        SET participant_type = 'doubles_pair'
        WHERE participant_type = 'team'
          AND sport_key IN ('badminton', 'table_tennis')
    """)


def downgrade():
    op.execute("""
        UPDATE events
        SET participant_type = 'team'
        WHERE participant_type = 'doubles_pair'
          AND sport_key IN ('badminton', 'table_tennis')
    """)
