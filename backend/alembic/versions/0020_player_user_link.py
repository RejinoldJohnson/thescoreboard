"""Link players to user accounts; add location field.

Revision ID: 0020_player_user_link
Revises: 0019_sponsor_fields
Create Date: 2026-05-19
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_player_user_link"
down_revision = "0019_sponsor_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("players", sa.Column("user_id",  sa.Integer(), sa.ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True))
    op.add_column("players", sa.Column("location", sa.String(150), nullable=True))
    op.create_index("ix_players_user_id", "players", ["user_id"])


def downgrade():
    op.drop_index("ix_players_user_id", table_name="players")
    op.drop_column("players", "user_id")
    op.drop_column("players", "location")
