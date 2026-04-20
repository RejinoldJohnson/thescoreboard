"""add teams and team members

Revision ID: 0009c049637f
Revises: 
Create Date: 2026-04-15 23:54:58.190950

"""
from alembic import op
import sqlalchemy as sa

revision = "0009c049637f"
down_revision = None   # set this to your current latest revision ID
branch_labels = None
depends_on = None


def upgrade():
    # ── teams ─────────────────────────────────────────────────
    op.create_table(
        "teams",
        sa.Column("team_id",    sa.Integer(),     primary_key=True),
        sa.Column("org_id",     sa.Integer(),     sa.ForeignKey("organizations.org_id", ondelete="SET NULL"), nullable=True),
        sa.Column("name",       sa.String(150),   nullable=False),
        sa.Column("sport_key",  sa.String(50),    nullable=True),   # optional — team may play multiple sports
        sa.Column("contact_name",  sa.String(150), nullable=True),
        sa.Column("contact_phone", sa.String(30),  nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── team_members ──────────────────────────────────────────
    op.create_table(
        "team_members",
        sa.Column("tm_id",      sa.Integer(),     primary_key=True),
        sa.Column("team_id",    sa.Integer(),     sa.ForeignKey("teams.team_id", ondelete="CASCADE"), nullable=False),
        sa.Column("name",       sa.String(150),   nullable=False),
        sa.Column("role",       sa.String(50),    nullable=True),   # captain / player / goalkeeper etc.
        sa.Column("jersey_number", sa.Integer(),  nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_team_members_team", "team_members", ["team_id"])

    # ── add team_id to event_participants ─────────────────────
    # (player_id is already there; exactly one of player_id / team_id is set)
    op.add_column("event_participants",
        sa.Column("team_id", sa.Integer(),
                  sa.ForeignKey("teams.team_id", ondelete="CASCADE"),
                  nullable=True)
    )
    op.create_unique_constraint(
        "uq_event_team", "event_participants", ["event_id", "team_id"]
    )

    # ── add team_id to match_participants ─────────────────────
    op.add_column("match_participants",
        sa.Column("team_id", sa.Integer(),
                  sa.ForeignKey("teams.team_id", ondelete="CASCADE"),
                  nullable=True)
    )

    # ── add min_team_size / max_team_size to events ──────────
    op.add_column("events", sa.Column("min_squad_size", sa.Integer(), nullable=True))
    op.add_column("events", sa.Column("max_squad_size", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("events", "max_squad_size")
    op.drop_column("events", "min_squad_size")
    op.drop_column("match_participants", "team_id")
    op.drop_constraint("uq_event_team", "event_participants")
    op.drop_column("event_participants", "team_id")
    op.drop_table("team_members")
    op.drop_table("teams")
