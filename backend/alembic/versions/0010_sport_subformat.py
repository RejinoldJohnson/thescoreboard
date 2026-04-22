"""add sport sub-format fields to events

Revision ID: 0010_sport_subformat
Revises: 0009c049637f
Create Date: 2026-04-21

Adds:
  - events.squad_size       (cricket: total squad size, default 11)
  - events.team_size        (football: players on field, e.g. 5/7/11)
  - events.substitutes      (football: bench size)
  - events.participant_type now supports 'doubles_pair' in addition to 'individual'/'team'
    (no schema change needed — it's a string column)
"""
from alembic import op
import sqlalchemy as sa

revision      = "0010_sport_subformat"
down_revision = "0009c049637f"   # ← your current latest revision
branch_labels = None
depends_on    = None


def upgrade():
    # Cricket squad size (how many players per team roster)
    op.add_column("events",
        sa.Column("squad_size", sa.Integer(), nullable=True, server_default="11")
    )
    # Football: players on the field per side (5, 7, or 11)
    op.add_column("events",
        sa.Column("team_size", sa.Integer(), nullable=True, server_default="11")
    )
    # Football: substitutes allowed on bench
    op.add_column("events",
        sa.Column("substitutes", sa.Integer(), nullable=True, server_default="0")
    )


def downgrade():
    op.drop_column("events", "substitutes")
    op.drop_column("events", "team_size")
    op.drop_column("events", "squad_size")