"""
Match routes — create, score, and manage matches.
Scoring is delegated to the sport engine based on event.sport_key.
Supports: table_tennis, badminton (set-based), cricket (innings), football (goals).
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.models.event import Event
from app.models.match import Match, MatchParticipant, MatchSet
from app.models.player import Player
from app.schemas.match import MatchCreate, MatchOut, MatchStatusUpdate
from app.utils.auth import get_current_user
from app.sports.registry import get_sport_engine

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────

class ScoreUpdate(BaseModel):
    # Universal
    score_p1: int
    score_p2: int
    current_server: Optional[int] = None

    # Cricket-specific
    wickets_p1: Optional[int] = None   # wickets lost by team batting
    wickets_p2: Optional[int] = None
    overs:      Optional[str] = None   # e.g. "12.3"

    # Football-specific
    minute:     Optional[int] = None   # current match minute
    half:       Optional[int] = None   # 1 or 2


class FinishMatch(BaseModel):
    """Explicitly finish a match (football full-time, cricket innings complete)."""
    winner_position: Optional[int] = None  # 1, 2, or None for draw


# ── Helpers ───────────────────────────────────────────────────

def _load_match(match_id: int, db: Session) -> Match:
    match = (
        db.query(Match)
        .filter(Match.match_id == match_id)
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.sets),
        )
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


def _serialize_match(m: Match) -> dict:
    parts = sorted(m.participants, key=lambda p: p.position)
    p1 = parts[0] if len(parts) > 0 else None
    p2 = parts[1] if len(parts) > 1 else None
    sets = sorted(m.sets, key=lambda s: s.set_number) if m.sets else []
    return {
        "match_id":       m.match_id,
        "event_id":       m.event_id,
        "group_id":       m.group_id,
        "stage":          m.stage,
        "round":          m.round,
        "status":         m.status,
        "table_number":   m.table_number,
        "current_server": m.current_server,
        "live_state":     m.live_state,
        "started_at":     str(m.started_at)  if m.started_at  else None,
        "finished_at":    str(m.finished_at) if m.finished_at else None,
        "player_1": {
            "player_id": p1.player_id if p1 else None,
            "name":      p1.player.name if p1 and p1.player else "TBD",
            "score":     p1.score      if p1 else 0,
            "is_winner": p1.is_winner  if p1 else False,
        },
        "player_2": {
            "player_id": p2.player_id if p2 else None,
            "name":      p2.player.name if p2 and p2.player else "TBD",
            "score":     p2.score      if p2 else 0,
            "is_winner": p2.is_winner  if p2 else False,
        },
        "sets": [
            {
                "set_number":  s.set_number,
                "score_p1":    s.score_p1,
                "score_p2":    s.score_p2,
                "winner":      s.winner_position,
                "is_complete": s.is_complete,
            }
            for s in sets
        ],
    }


def _finish_match(match: Match, winner_position: Optional[int]):
    match.status      = "done"
    match.finished_at = datetime.now(timezone.utc)
    for p in match.participants:
        p.is_winner = (p.position == winner_position) if winner_position else False


# ── Routes ────────────────────────────────────────────────────

@router.get("/events/{event_id}/matches")
def get_matches(event_id: int, db: Session = Depends(get_db)):
    matches = (
        db.query(Match)
        .filter(Match.event_id == event_id)
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.sets),
        )
        .order_by(Match.stage, Match.round, Match.match_id)
        .all()
    )
    return [_serialize_match(m) for m in matches]


@router.post("/events/{event_id}/matches")
def create_match(
    event_id: int,
    data: MatchCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = db.query(Event).filter(Event.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if data.player1_id == data.player2_id:
        raise HTTPException(status_code=400, detail="A player cannot play themselves")
    for pid in [data.player1_id, data.player2_id]:
        if not db.query(Player).filter(Player.player_id == pid).first():
            raise HTTPException(status_code=404, detail=f"Player {pid} not found")

    match = Match(
        event_id=event_id,
        group_id=data.group_id,
        round=data.round,
        stage=data.stage,
        status="scheduled",
        table_number=data.table_number,
    )
    db.add(match)
    db.flush()

    db.add_all([
        MatchParticipant(match_id=match.match_id, player_id=data.player1_id, position=1),
        MatchParticipant(match_id=match.match_id, player_id=data.player2_id, position=2),
    ])

    engine = get_sport_engine(event.sport_key)

    # Set-based sports: create first set
    if getattr(engine, "has_sets", False):
        db.add(MatchSet(match_id=match.match_id, set_number=1))

    db.commit()
    return _serialize_match(_load_match(match.match_id, db))


@router.patch("/matches/{match_id}/status")
def update_match_status(
    match_id: int,
    data: MatchStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    match = _load_match(match_id, db)
    match.status = data.status
    if data.table_number is not None:
        match.table_number = data.table_number
    if data.status == "live" and not match.started_at:
        match.started_at = datetime.now(timezone.utc)
    elif data.status == "done" and not match.finished_at:
        match.finished_at = datetime.now(timezone.utc)
    db.commit()
    return _serialize_match(_load_match(match_id, db))


@router.patch("/matches/{match_id}/score")
def update_score(
    match_id: int,
    data: ScoreUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    match = _load_match(match_id, db)
    event  = db.query(Event).filter(Event.event_id == match.event_id).first()
    engine = get_sport_engine(event.sport_key)
    config = event.sport_config or engine.get_default_config()

    sport = event.sport_key

    # ── TABLE TENNIS & BADMINTON (set-based) ──────────────────
    if sport in ("table_tennis", "badminton"):
        if data.current_server is not None:
            match.current_server = data.current_server

        current_set = next((s for s in sorted(match.sets, key=lambda x: x.set_number) if not s.is_complete), None)
        if not current_set:
            raise HTTPException(status_code=400, detail="No active set — match may be over")

        current_set.score_p1 = data.score_p1
        current_set.score_p2 = data.score_p2

        # Check instant win (table tennis only)
        instant_winner = None
        if hasattr(engine, "check_instant_win"):
            instant_winner = engine.check_instant_win(data.score_p1, data.score_p2, config)

        if instant_winner:
            current_set.is_complete      = True
            current_set.winner_position  = instant_winner
            _finish_match(match, instant_winner)
        else:
            set_winner = engine.check_set_winner(data.score_p1, data.score_p2, config)
            if set_winner:
                current_set.is_complete     = True
                current_set.winner_position = set_winner
                sets_won = {1: 0, 2: 0}
                for s in match.sets:
                    if s.is_complete and s.winner_position:
                        sets_won[s.winner_position] += 1
                match_winner = engine.check_match_winner(sets_won[1], sets_won[2], config)
                if match_winner:
                    _finish_match(match, match_winner)
                else:
                    next_num = max(s.set_number for s in match.sets) + 1
                    db.add(MatchSet(match_id=match.match_id, set_number=next_num))

        # Update aggregate scores (sets won)
        parts = sorted(match.participants, key=lambda p: p.position)
        if len(parts) == 2:
            sets_won = {1: 0, 2: 0}
            for s in match.sets:
                if s.is_complete and s.winner_position:
                    sets_won[s.winner_position] += 1
            parts[0].score = sets_won[1]
            parts[1].score = sets_won[2]

    # ── CRICKET (innings-based) ───────────────────────────────
    elif sport == "cricket":
        current_set = next((s for s in sorted(match.sets, key=lambda x: x.set_number) if not s.is_complete), None)
        if not current_set:
            raise HTTPException(status_code=400, detail="Both innings are complete")

        # score_p1 = runs for batting team, score_p2 = wickets fallen
        current_set.score_p1 = data.score_p1   # runs
        current_set.score_p2 = data.score_p2   # wickets

        # Update live_state with over info
        live_state = match.live_state or {}
        if data.overs:
            live_state["overs"] = data.overs
        if current_set.set_number == 2 and match.sets:
            # Calculate target
            first_innings = next((s for s in match.sets if s.set_number == 1), None)
            if first_innings:
                live_state["target"] = first_innings.score_p1 + 1
        match.live_state = live_state

        # Update participant scores with total runs
        parts = sorted(match.participants, key=lambda p: p.position)
        if len(parts) == 2:
            # Set 1 = team 1 bats, Set 2 = team 2 bats
            inn1 = next((s for s in match.sets if s.set_number == 1), None)
            inn2 = next((s for s in match.sets if s.set_number == 2), None)
            parts[0].score = inn1.score_p1 if inn1 else 0
            parts[1].score = inn2.score_p1 if inn2 else 0

    # ── FOOTBALL (goals) ──────────────────────────────────────
    elif sport == "football":
        # Football uses a single "set" to track goals
        current_set = next((s for s in sorted(match.sets, key=lambda x: x.set_number) if not s.is_complete), None)
        if not current_set:
            # Create the single score record if it doesn't exist yet
            db.add(MatchSet(match_id=match.match_id, set_number=1))
            db.flush()
            match = _load_match(match_id, db)
            current_set = match.sets[0]

        current_set.score_p1 = data.score_p1   # goals team 1
        current_set.score_p2 = data.score_p2   # goals team 2

        # Update live_state with match clock
        live_state = match.live_state or {}
        if data.minute is not None:
            live_state["minute"] = data.minute
        if data.half is not None:
            live_state["half"] = data.half
        match.live_state = live_state

        # Update participant goal tallies
        parts = sorted(match.participants, key=lambda p: p.position)
        if len(parts) == 2:
            parts[0].score = data.score_p1
            parts[1].score = data.score_p2

    db.commit()
    return _serialize_match(_load_match(match_id, db))


@router.post("/matches/{match_id}/finish")
def finish_match(
    match_id: int,
    data: FinishMatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Explicitly finish a match — used for football (full time) and
    cricket (all out / overs up). Marks current set as complete.
    """
    match  = _load_match(match_id, db)
    event  = db.query(Event).filter(Event.event_id == match.event_id).first()
    engine = get_sport_engine(event.sport_key)
    config = event.sport_config or engine.get_default_config()

    # Mark the active set complete
    current_set = next((s for s in sorted(match.sets, key=lambda x: x.set_number) if not s.is_complete), None)

    if event.sport_key == "cricket":
        if current_set:
            current_set.is_complete = True

        # Check if both innings done → determine winner
        all_sets = sorted(match.sets, key=lambda s: s.set_number)
        if len(all_sets) >= 2 and all(s.is_complete for s in all_sets[:2]):
            runs_p1 = all_sets[0].score_p1
            runs_p2 = all_sets[1].score_p1
            winner  = engine.check_match_winner(runs_p1, runs_p2, config)
            _finish_match(match, winner)
        elif current_set and len([s for s in match.sets if s.is_complete]) == 1:
            # First innings done — start second innings
            db.add(MatchSet(match_id=match.match_id, set_number=2))

    elif event.sport_key == "football":
        if current_set:
            current_set.is_complete     = True
            current_set.winner_position = data.winner_position
        # Determine winner from goals
        all_sets = match.sets
        if all_sets:
            s = all_sets[0]
            winner = engine.check_match_winner(s.score_p1, s.score_p2, config)
        else:
            winner = data.winner_position
        _finish_match(match, winner)

    db.commit()
    return _serialize_match(_load_match(match_id, db))


@router.post("/matches/{match_id}/undo-set")
def undo_set(
    match_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    match = _load_match(match_id, db)
    sets  = sorted(match.sets, key=lambda s: s.set_number)
    if not sets:
        raise HTTPException(status_code=400, detail="No sets to undo")

    current = sets[-1]
    if current.score_p1 == 0 and current.score_p2 == 0 and len(sets) > 1:
        db.delete(current)
        prev = sets[-2]
        prev.is_complete      = False
        prev.winner_position  = None
        if match.status == "done":
            match.status      = "live"
            match.finished_at = None
            for p in match.participants:
                p.is_winner = False
    else:
        current.score_p1      = 0
        current.score_p2      = 0
        current.is_complete   = False
        current.winner_position = None

    match.current_server = None
    parts = sorted(match.participants, key=lambda p: p.position)
    if len(parts) == 2:
        sets_won = {1: 0, 2: 0}
        for s in match.sets:
            if s.is_complete and s.winner_position:
                sets_won[s.winner_position] += 1
        parts[0].score = sets_won[1]
        parts[1].score = sets_won[2]

    db.commit()
    return _serialize_match(_load_match(match_id, db))


@router.post("/matches/{match_id}/rematch")
def rematch(
    match_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    match = _load_match(match_id, db)
    match.status       = "scheduled"
    match.started_at   = None
    match.finished_at  = None
    match.current_server = None
    match.live_state   = None
    for p in match.participants:
        p.score     = 0
        p.is_winner = False
    for s in match.sets:
        db.delete(s)
    db.flush()

    event  = db.query(Event).filter(Event.event_id == match.event_id).first()
    engine = get_sport_engine(event.sport_key)
    if getattr(engine, "has_sets", False):
        db.add(MatchSet(match_id=match.match_id, set_number=1))

    db.commit()
    return _serialize_match(_load_match(match_id, db))


@router.delete("/matches/{match_id}")
def delete_match(
    match_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    match = db.query(Match).filter(Match.match_id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    db.delete(match)
    db.commit()
    return {"ok": True}