from sqlalchemy import (
    Column, Integer, String, ForeignKey, DateTime, Boolean,
    UniqueConstraint, CheckConstraint
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
from database import Base


class Tournament(Base):
    __tablename__ = "tournaments"
    tournament_id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    sport_type = Column(String(100), nullable=False)
    format = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)
    created_date = Column(DateTime, server_default=func.now())

    groups = relationship("Group", back_populates="tournament")
    participants = relationship("TournamentParticipant", back_populates="tournament")
    matches = relationship("Match", back_populates="tournament")


class Group(Base):
    __tablename__ = "groups"
    group_id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.tournament_id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    created_date = Column(DateTime, server_default=func.now())

    tournament = relationship("Tournament", back_populates="groups")
    participants = relationship("TournamentParticipant", back_populates="group")
    matches = relationship("Match", back_populates="group")


class Player(Base):
    __tablename__ = "players"
    player_id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String(20), nullable=True)
    created_date = Column(DateTime, server_default=func.now())

    tournament_associations = relationship("TournamentParticipant", back_populates="player")
    match_participations = relationship("MatchParticipant", back_populates="player")


class TournamentParticipant(Base):
    __tablename__ = "tournament_participants"
    tp_id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.tournament_id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.player_id", ondelete="CASCADE"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.group_id", ondelete="SET NULL"), nullable=True)
    seed = Column(Integer, nullable=True)
    status = Column(String(50), nullable=True)

    __table_args__ = (UniqueConstraint('tournament_id', 'player_id', name='unique_tournament_player'),)

    tournament = relationship("Tournament", back_populates="participants")
    player = relationship("Player", back_populates="tournament_associations")
    group = relationship("Group", back_populates="participants")


class Match(Base):
    __tablename__ = "matches"
    match_id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.tournament_id", ondelete="CASCADE"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.group_id", ondelete="SET NULL"), nullable=True)
    round = Column(Integer, nullable=False)
    status = Column(String(50), nullable=False)
    stage = Column(String(50), default="group")        # group | quarter | semi | final
    table_number = Column(Integer, nullable=True)
    scheduled_at = Column(DateTime, nullable=True)
    created_date = Column(DateTime, server_default=func.now())

    tournament = relationship("Tournament", back_populates="matches")
    group = relationship("Group", back_populates="matches")
    participants = relationship("MatchParticipant", back_populates="match", cascade="all, delete-orphan")


class MatchParticipant(Base):
    __tablename__ = "match_participants"
    mp_id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.match_id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.player_id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, nullable=False)
    score = Column(Integer, default=0)
    is_winner = Column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint('match_id', 'position', name='unique_match_position'),
        UniqueConstraint('match_id', 'player_id', name='unique_match_player'),
        CheckConstraint('position IN (1, 2)', name='check_position')
    )

    match = relationship("Match", back_populates="participants")
    player = relationship("Player", back_populates="match_participations")