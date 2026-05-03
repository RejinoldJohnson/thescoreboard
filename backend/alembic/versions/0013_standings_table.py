"""Add standings table for round-robin and group-stage points tables.

Revision ID: 0013_standings_table
Revises: 0012_fix_doubles_type
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0013_standings_table"
down_revision = "0012_fix_doubles_type"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "standings",
        sa.Column("standing_id",    sa.Integer(), primary_key=True),
        sa.Column("event_id",       sa.Integer(), sa.ForeignKey("events.event_id",  ondelete="CASCADE"), nullable=False),
        sa.Column("group_id",       sa.Integer(), sa.ForeignKey("groups.group_id",  ondelete="CASCADE"), nullable=True),
        sa.Column("player_id",      sa.Integer(), sa.ForeignKey("players.player_id", ondelete="CASCADE"), nullable=True),
        sa.Column("team_id",        sa.Integer(), sa.ForeignKey("teams.team_id",    ondelete="CASCADE"), nullable=True),

        sa.Column("matches_played", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("wins",           sa.Integer(), nullable=False, server_default="0"),
        sa.Column("losses",         sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sets_won",       sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sets_lost",      sa.Integer(), nullable=False, server_default="0"),
        sa.Column("points_for",     sa.Integer(), nullable=False, server_default="0"),
        sa.Column("points_against", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ranking_points", sa.Integer(), nullable=False, server_default="0"),

        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),

        sa.UniqueConstraint("event_id", "group_id", "player_id", name="uq_standing_player"),
        sa.UniqueConstraint("event_id", "group_id", "team_id",   name="uq_standing_team"),
    )
    op.create_index("ix_standings_event_id", "standings", ["event_id"])
    op.create_index("ix_standings_group_id", "standings", ["group_id"])


def downgrade():
    op.drop_table("standings")
