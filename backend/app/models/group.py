"""
Group — a pool within an event (Group A, Group B, etc.)
EventParticipant — enrollment of a player or team in an event + group assignment.
"""
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Group(Base):
    __tablename__ = "groups"

    group_id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.event_id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)  # "Group A", "Pool 1", etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    event = relationship("Event", back_populates="groups")
    participants = relationship("EventParticipant", back_populates="group")
    matches = relationship("Match", back_populates="group")


class EventParticipant(Base):
    """
    Enrolls a player (individual sport) or team (team sport) in an event.
    Exactly one of player_id or team_id will be set, based on event.participant_type.
    """
    __tablename__ = "event_participants"

    ep_id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.event_id", ondelete="CASCADE"), nullable=False)

    # One of these is set depending on participant_type
    player_id = Column(Integer, ForeignKey("players.player_id", ondelete="CASCADE"), nullable=True)
    team_id = Column(Integer, ForeignKey("teams.team_id", ondelete="CASCADE"), nullable=True)

    group_id = Column(Integer, ForeignKey("groups.group_id", ondelete="SET NULL"), nullable=True)
    seed = Column(Integer, nullable=True)
    status = Column(String(50), default="active")  # active | eliminated | withdrawn

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # A player or team can only be enrolled once per event
        UniqueConstraint("event_id", "player_id", name="uq_event_player"),
        UniqueConstraint("event_id", "team_id", name="uq_event_team"),
    )

    event = relationship("Event", back_populates="participants")
    player = relationship("Player", back_populates="event_participations")
    team = relationship("Team", back_populates="event_participations")
    group = relationship("Group", back_populates="participants")
