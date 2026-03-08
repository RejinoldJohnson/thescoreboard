from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Player ──────────────────────────────────────────────────
class PlayerCreate(BaseModel):
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None


class PlayerOut(BaseModel):
    player_id: int
    name: str
    age: Optional[int]
    gender: Optional[str]
    created_date: datetime

    class Config:
        from_attributes = True


# ── Tournament ──────────────────────────────────────────────
class TournamentCreate(BaseModel):
    name: str
    sport_type: str
    format: str
    is_active: bool = True


class TournamentOut(BaseModel):
    tournament_id: int
    name: str
    sport_type: str
    format: str
    is_active: bool
    created_date: datetime

    class Config:
        from_attributes = True


# ── Match Participant ─────────────────────────────────────────
class MatchParticipantOut(BaseModel):
    player: PlayerOut
    score: int
    is_winner: bool
    position: int

    class Config:
        from_attributes = True


# ── Match ───────────────────────────────────────────────────
class MatchCreate(BaseModel):
    tournament_id: int
    group_id: Optional[int] = None
    round: int
    status: str = "scheduled"
    player1_id: int
    player2_id: int
    stage: str = "group"          # group | quarter | semi | final
    table_number: Optional[int] = None


class MatchUpdate(BaseModel):
    status: Optional[str] = None
    score_p1: Optional[int] = None
    score_p2: Optional[int] = None
    table_number: Optional[int] = None


class MatchOut(BaseModel):
    match_id: int
    tournament_id: int
    group_id: Optional[int]
    round: int
    status: str
    stage: str
    table_number: Optional[int]
    scheduled_at: Optional[datetime]
    participants: List[MatchParticipantOut]

    class Config:
        from_attributes = True


# ── Auth ─────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Standings ────────────────────────────────────────────────
class StandingOut(BaseModel):
    player: PlayerOut
    wins: int
    losses: int
    score_for: int
    score_against: int
    score_diff: int
    matches_played: int

    class Config:
        from_attributes = True