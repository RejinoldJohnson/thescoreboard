from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Player ───────────────────────────────────────────────────
class PlayerCreate(BaseModel):
    name:   str
    age:    Optional[int] = None
    gender: Optional[str] = None
    phone:  Optional[str] = None


class PlayerOut(BaseModel):
    player_id:    int
    name:         str
    age:          Optional[int]
    gender:       Optional[str]
    phone:        Optional[str] = None
    created_date: datetime

    class Config:
        from_attributes = True


# ── Tournament ───────────────────────────────────────────────
class TournamentCreate(BaseModel):
    name:       str
    sport_type: str
    format:     str
    is_active:  bool = True


class TournamentOut(BaseModel):
    tournament_id: int
    name:          str
    sport_type:    str
    format:        str
    is_active:     bool
    created_date:  datetime

    class Config:
        from_attributes = True


# ── Set schemas ──────────────────────────────────────────────
class MatchSetOut(BaseModel):
    set_number:      int
    score_p1:        int
    score_p2:        int
    winner_position: Optional[int]

    class Config:
        from_attributes = True


class SetUpdate(BaseModel):
    """Admin sends this when a set finishes."""
    set_number: int
    score_p1:   int
    score_p2:   int


# ── Match participant ────────────────────────────────────────
class MatchParticipantOut(BaseModel):
    player:    PlayerOut
    score:     int       # sets won
    is_winner: bool
    position:  int

    class Config:
        from_attributes = True


# ── Match ────────────────────────────────────────────────────
class MatchCreate(BaseModel):
    tournament_id: int
    group_id:      Optional[int] = None
    round:         int
    status:        str = "scheduled"
    player1_id:    int
    player2_id:    int
    stage:         str = "group"
    table_number:  Optional[int] = None


class MatchUpdate(BaseModel):
    status:         Optional[str]       = None
    table_number:   Optional[int]       = None
    current_server: Optional[int]       = None   # 1 or 2 — admin sets who is serving
    set_update:     Optional[SetUpdate] = None   # record a completed set
    undo_set:       Optional[int]       = None   # set_number to delete (undo last set)


class MatchOut(BaseModel):
    match_id:      int
    tournament_id: int
    group_id:      Optional[int]
    round:         int
    status:        str
    stage:         str
    table_number:  Optional[int]
    sets_to_win:    int
    current_server: Optional[int]
    scheduled_at:   Optional[datetime]
    participants:  List[MatchParticipantOut]
    sets:          List[MatchSetOut] = []

    class Config:
        from_attributes = True


# ── Auth ─────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"


# ── Standings ────────────────────────────────────────────────
class StandingOut(BaseModel):
    player:         PlayerOut
    wins:           int
    losses:         int
    score_for:      int
    score_against:  int
    score_diff:     int
    matches_played: int

    class Config:
        from_attributes = True