from sqlalchemy import (
    Column, Integer, String, ForeignKey, DateTime, Boolean,
    UniqueConstraint, CheckConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Tournament(Base):
    __tablename__ = "tournaments"
    tournament_id = Column(Integer, primary_key=True)
    name          = Column(String(255), nullable=False)
    sport_type    = Column(String(100), nullable=False)
    format        = Column(String(100), nullable=False)
    is_active     = Column(Boolean, default=True)
    created_date  = Column(DateTime, server_default=func.now())

    groups       = relationship("Group",                back_populates="tournament")
    participants = relationship("TournamentParticipant", back_populates="tournament")
    matches      = relationship("Match",                back_populates="tournament")


class Group(Base):
    __tablename__ = "groups"
    group_id      = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.tournament_id", ondelete="CASCADE"), nullable=False)
    name          = Column(String(100), nullable=False)
    created_date  = Column(DateTime, server_default=func.now())

    tournament   = relationship("Tournament",           back_populates="groups")
    participants = relationship("TournamentParticipant", back_populates="group")
    matches      = relationship("Match",                back_populates="group")


class Player(Base):
    __tablename__ = "players"
    player_id    = Column(Integer, primary_key=True)
    name         = Column(String(255), nullable=False)
    age          = Column(Integer,     nullable=True)
    gender       = Column(String(20),  nullable=True)
    phone        = Column(String(20),  nullable=True)
    created_date = Column(DateTime, server_default=func.now())

    tournament_associations = relationship("TournamentParticipant", back_populates="player")
    match_participations    = relationship("MatchParticipant",       back_populates="player")


class TournamentParticipant(Base):
    __tablename__ = "tournament_participants"
    tp_id         = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.tournament_id", ondelete="CASCADE"), nullable=False)
    player_id     = Column(Integer, ForeignKey("players.player_id",          ondelete="CASCADE"), nullable=False)
    group_id      = Column(Integer, ForeignKey("groups.group_id",            ondelete="SET NULL"), nullable=True)
    seed          = Column(Integer, nullable=True)
    status        = Column(String(50), nullable=True)
    sub_group     = Column(String(20), nullable=True)   # "men" or "women" for Group D

    __table_args__ = (
        UniqueConstraint("tournament_id", "player_id", name="unique_tournament_player"),
    )

    tournament = relationship("Tournament",           back_populates="participants")
    player     = relationship("Player",               back_populates="tournament_associations")
    group      = relationship("Group",                back_populates="participants")


class Match(Base):
    __tablename__ = "matches"
    match_id      = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.tournament_id", ondelete="CASCADE"), nullable=False)
    group_id      = Column(Integer, ForeignKey("groups.group_id",           ondelete="SET NULL"), nullable=True)
    round         = Column(Integer, nullable=False)
    status        = Column(String(50), nullable=False)
    stage         = Column(String(50), default="group")
    table_number  = Column(Integer, nullable=True)
    sets_to_win    = Column(Integer, default=2)
    current_server = Column(Integer, nullable=True)   # 1 or 2 — updated live by admin
    exhibition_p1  = Column(String(100), nullable=True)  # free-text name, exhibition only
    exhibition_p2  = Column(String(100), nullable=True)  # free-text name, exhibition only
    scheduled_at   = Column(DateTime, nullable=True)
    created_date  = Column(DateTime, server_default=func.now())

    __table_args__ = (
        # The two most common queries: all matches for a tournament, and live matches
        Index("ix_match_tournament",        "tournament_id"),
        Index("ix_match_tournament_status", "tournament_id", "status"),
        Index("ix_match_status",            "status"),
    )

    tournament   = relationship("Tournament", back_populates="matches")
    group        = relationship("Group",      back_populates="matches")
    participants = relationship("MatchParticipant", back_populates="match",
                                cascade="all, delete-orphan")
    sets         = relationship("MatchSet", back_populates="match",
                                cascade="all, delete-orphan",
                                order_by="MatchSet.set_number")


class MatchParticipant(Base):
    __tablename__ = "match_participants"
    mp_id     = Column(Integer, primary_key=True)
    match_id  = Column(Integer, ForeignKey("matches.match_id",  ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.player_id", ondelete="CASCADE"), nullable=False)
    position  = Column(Integer, nullable=False)
    score     = Column(Integer, default=0)
    is_winner = Column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint("match_id", "position",  name="unique_match_position"),
        UniqueConstraint("match_id", "player_id", name="unique_match_player"),
        CheckConstraint("position IN (1, 2)",     name="check_position"),
    )

    match  = relationship("Match",  back_populates="participants")
    player = relationship("Player", back_populates="match_participations")


class MatchSet(Base):
    __tablename__ = "match_sets"
    set_id          = Column(Integer, primary_key=True)
    match_id        = Column(Integer, ForeignKey("matches.match_id", ondelete="CASCADE"), nullable=False)
    set_number      = Column(Integer, nullable=False)
    score_p1        = Column(Integer, default=0)
    score_p2        = Column(Integer, default=0)
    winner_position = Column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("match_id", "set_number", name="unique_match_set"),
    )

    match = relationship("Match", back_populates="sets")