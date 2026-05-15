"""
Match routes — create, score, and manage matches.
Scoring is delegated to the sport engine based on event.sport_key.
Supports: table_tennis, badminton (set-based), cricket (innings), football (goals).
"""
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional, Union
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
    score_p1: int
    score_p2: int
    current_server: Optional[int] = None

    # Cricket ball-by-ball
    overs:              Optional[str]  = None
    minute:             Optional[int]  = None   # balls bowled (legal deliveries) for cricket
    half:               Optional[int]  = None   # innings number for cricket (1, 2, 3 for super over)
    cricket_live_state: Optional[dict] = None

    # Football
    football_minute: Optional[int] = None
    football_half:   Optional[int] = None


class FinishMatch(BaseModel):
    """Explicitly finish a match (football full-time, cricket innings complete)."""
    winner_position: Optional[Union[int, str]] = None  # 1, 2, None for draw, "super_over" for cricket


# ── Helpers ───────────────────────────────────────────────────

def _load_match(match_id: int, db: Session) -> Match:
    match = (
        db.query(Match)
        .filter(Match.match_id == match_id)
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.participants).joinedload(MatchParticipant.team),
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

    def _name(p):
        if not p:
            return "TBD"
        if p.player:
            return p.player.name
        if p.team:
            return p.team.name
        return "TBD"

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
            "team_id":   p1.team_id   if p1 else None,
            "name":      _name(p1),
            "score":     p1.score     if p1 else 0,
            "is_winner": p1.is_winner if p1 else False,
        },
        "player_2": {
            "player_id": p2.player_id if p2 else None,
            "team_id":   p2.team_id   if p2 else None,
            "name":      _name(p2),
            "score":     p2.score     if p2 else 0,
            "is_winner": p2.is_winner if p2 else False,
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


def _place_in_match(
    target: Match,
    participant_id: int,
    position: int,
    is_team: bool,
    db: Session,
) -> None:
    """Insert a participant into a specific bracket slot if it is still empty."""
    already = db.query(MatchParticipant).filter(
        MatchParticipant.match_id == target.match_id,
        MatchParticipant.position == position,
    ).first()
    if already:
        return
    if is_team:
        db.add(MatchParticipant(match_id=target.match_id, team_id=participant_id, position=position))
    else:
        db.add(MatchParticipant(match_id=target.match_id, player_id=participant_id, position=position))


def _advance_winner(match: Match, winner_position: Optional[int], db: Session) -> None:
    """
    After a direct-knockout match finishes, propagate the winner into the
    correct slot of the next-round match (and the loser into the third-place
    match when the stage is 'semi').

    Bracket position mapping
    ─────────────────────────
    For rounds after the first:  match k → next-round match k//2, position k%2+1
    For the first round (byes possible):
        bye_count = 2*|next_round| - |current_round|
        match k → next-round match (bye_count+k)//2, position (bye_count+k)%2+1
    """
    # Terminal stages never propagate; "group" stage = old round-robin rows, also skip
    if not winner_position or match.stage in ("third_place", "final", "group"):
        return

    event = db.query(Event).filter(Event.event_id == match.event_id).first()
    if not event or event.format not in ("direct_knockout", "group_knockout"):
        return

    winner_mp = next((p for p in match.participants if p.position == winner_position), None)
    loser_mp  = next((p for p in match.participants if p.position != winner_position), None)
    if not winner_mp:
        return

    winner_id = winner_mp.player_id or winner_mp.team_id
    is_team   = winner_mp.team_id is not None

    # Scope bracket to the same context:
    #   group bracket match  (group_id set) → only look within that group
    #   final bracket match  (group_id None) → only look at ungrouped matches
    q = db.query(Match).filter(
        Match.event_id == match.event_id,
        Match.stage.notin_(["third_place", "group"]),
    )
    if match.group_id is not None:
        q = q.filter(Match.group_id == match.group_id)
    else:
        q = q.filter(Match.group_id == None)  # noqa: E711
    bracket_matches = q.order_by(Match.round, Match.match_id).all()

    by_round = defaultdict(list)
    for m in bracket_matches:
        by_round[m.round].append(m)

    rounds        = sorted(by_round.keys())
    current_round = match.round
    round_idx     = rounds.index(current_round)

    # ── Advance winner to next bracket round ─────────────────
    if round_idx + 1 < len(rounds):
        next_round          = rounds[round_idx + 1]
        current_rnd_matches = by_round[current_round]
        next_rnd_matches    = by_round[next_round]

        match_k = next(
            (i for i, m in enumerate(current_rnd_matches) if m.match_id == match.match_id),
            None,
        )
        if match_k is not None:
            earliest_round = rounds[0]
            if current_round == earliest_round:
                # Round 1 may have byes; compute offset so r1 winners land in
                # the correct slots of round 2 (after all bye-player pairs).
                bye_count = 2 * len(next_rnd_matches) - len(current_rnd_matches)
            else:
                bye_count = 0

            next_k = (bye_count + match_k) // 2
            pos    = (bye_count + match_k) % 2 + 1

            if next_k < len(next_rnd_matches):
                _place_in_match(next_rnd_matches[next_k], winner_id, pos, is_team, db)

    # ── Advance loser to third-place match (semi-finals only) ─
    if match.stage == "semi" and loser_mp:
        loser_id = loser_mp.player_id or loser_mp.team_id
        if loser_id:
            tq = db.query(Match).filter(
                Match.event_id == match.event_id, Match.stage == "third_place"
            )
            if match.group_id is not None:
                tq = tq.filter(Match.group_id == match.group_id)
            else:
                tq = tq.filter(Match.group_id == None)  # noqa: E711
            third = tq.first()
            if third:
                semi_matches = sorted(by_round.get(current_round, []), key=lambda m: m.match_id)
                semi_k       = next(
                    (i for i, m in enumerate(semi_matches) if m.match_id == match.match_id),
                    0,
                )
                _place_in_match(third, loser_id, semi_k + 1, is_team, db)


def _finish_match(match: Match, winner_position: Optional[int], db: Optional[Session] = None):
    match.status      = "done"
    match.finished_at = datetime.now(timezone.utc)
    for p in match.participants:
        p.is_winner = (p.position == winner_position) if winner_position else False
    if db is not None:
        _advance_winner(match, winner_position, db)


# ── Routes ────────────────────────────────────────────────────

@router.get("/events/{event_id}/matches")
def get_matches(event_id: int, db: Session = Depends(get_db)):
    matches = (
        db.query(Match)
        .filter(Match.event_id == event_id)
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.participants).joinedload(MatchParticipant.team),
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
    if data.sets_to_win is not None:
        ls = dict(match.live_state or {})
        ls["sets_to_win"] = data.sets_to_win
        match.live_state = ls
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
    config = dict(event.sport_config or engine.get_default_config())
    # Per-match sets_to_win overrides event-wide default (set during fixture generation)
    if match.live_state and "sets_to_win" in match.live_state:
        config["sets_to_win"] = match.live_state["sets_to_win"]

    sport = event.sport_key

    # ── TABLE TENNIS & BADMINTON (set-based) ──────────────────
    if sport in ("table_tennis", "badminton"):
        if data.current_server is not None:
            match.current_server = data.current_server

        current_set = next(
            (s for s in sorted(match.sets, key=lambda x: x.set_number) if not s.is_complete),
            None
        )
        if not current_set:
            raise HTTPException(status_code=400, detail="No active set — match may be over")

        current_set.score_p1 = data.score_p1
        current_set.score_p2 = data.score_p2

        # A set can be won either by reaching the normal point target (e.g. 11)
        # or by the 7-0 early-win rule.  Both are treated identically: the SET
        # is marked complete and we check whether enough sets have been won to
        # decide the match.  The 7-0 rule NEVER ends the match on its own.
        set_winner = engine.check_set_winner(data.score_p1, data.score_p2, config)
        if not set_winner and hasattr(engine, "check_instant_win"):
            set_winner = engine.check_instant_win(data.score_p1, data.score_p2, config)

        if set_winner:
            current_set.is_complete     = True
            current_set.winner_position = set_winner
            sets_won = {1: 0, 2: 0}
            for s in match.sets:
                if s.is_complete and s.winner_position:
                    sets_won[s.winner_position] += 1
            match_winner = engine.check_match_winner(sets_won[1], sets_won[2], config)
            if match_winner:
                _finish_match(match, match_winner, db)
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

    # ── CRICKET (ball-by-ball) ────────────────────────────────
    elif sport == "cricket":
        innings = data.half or 1
        balls   = data.minute or 0

        # Get or create the set for this innings
        target_set = next(
            (s for s in sorted(match.sets, key=lambda x: x.set_number) if s.set_number == innings),
            None
        )
        if not target_set:
            target_set = MatchSet(match_id=match.match_id, set_number=innings)
            db.add(target_set)
            db.flush()

        target_set.score_p1 = data.score_p1  # runs
        target_set.score_p2 = data.score_p2  # wickets

        # Update live_state
        ls = dict(match.live_state or {})
        ls["current_innings"] = innings
        ls["runs"]    = data.score_p1
        ls["wickets"] = data.score_p2
        ls["balls"]   = balls
        if data.overs:
            ls["overs"] = data.overs
        if data.cricket_live_state:
            ls.update(data.cricket_live_state)
        match.live_state = ls

        # Update participant aggregate scores
        parts = sorted(match.participants, key=lambda p: p.position)
        if len(parts) == 2:
            inn1 = next((s for s in match.sets if s.set_number == 1), None)
            inn2 = next((s for s in match.sets if s.set_number == 2), None)
            parts[0].score = inn1.score_p1 if inn1 else 0
            parts[1].score = inn2.score_p1 if inn2 else 0

    # ── FOOTBALL (goals) ──────────────────────────────────────
    elif sport == "football":
        current_set = next(
            (s for s in sorted(match.sets, key=lambda x: x.set_number) if not s.is_complete),
            None
        )
        if not current_set:
            db.add(MatchSet(match_id=match.match_id, set_number=1))
            db.flush()
            match = _load_match(match_id, db)
            current_set = match.sets[0]

        current_set.score_p1 = data.score_p1
        current_set.score_p2 = data.score_p2

        live_state = dict(match.live_state or {})
        if data.football_minute is not None:
            live_state["minute"] = data.football_minute
        if data.football_half is not None:
            live_state["half"] = data.football_half
        match.live_state = live_state

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
    cricket (all out / overs up / innings end).
    """
    match  = _load_match(match_id, db)
    event  = db.query(Event).filter(Event.event_id == match.event_id).first()
    engine = get_sport_engine(event.sport_key)
    config = event.sport_config or engine.get_default_config()

    current_set = next(
        (s for s in sorted(match.sets, key=lambda x: x.set_number) if not s.is_complete),
        None
    )

    # ── CRICKET ──────────────────────────────────────────────
    if event.sport_key == "cricket":
        ls = dict(match.live_state or {})

        # Super over requested
        if data.winner_position == "super_over":
            if current_set:
                current_set.is_complete = True
            so_num = len(match.sets) + 1
            db.add(MatchSet(match_id=match.match_id, set_number=so_num))
            ls["is_super_over"]   = True
            ls["current_innings"] = so_num
            ls["runs"]    = 0
            ls["wickets"] = 0
            ls["balls"]   = 0
            ls["ball_log"] = []
            match.live_state = ls
            db.commit()
            return _serialize_match(_load_match(match_id, db))

        # Normal innings end
        if current_set:
            current_set.is_complete = True

        all_sets  = sorted(match.sets, key=lambda s: s.set_number)
        completed = [s for s in all_sets if s.is_complete]

        if len(completed) >= 2:
            # Both innings done — determine winner
            runs_p1 = all_sets[0].score_p1
            runs_p2 = all_sets[1].score_p1
            winner  = engine.check_match_winner(runs_p1, runs_p2, config)
            _finish_match(match, winner, db)
        elif len(completed) == 1:
            # First innings done — set up second innings
            ls["current_innings"] = 2
            ls["runs"]    = 0
            ls["wickets"] = 0
            ls["balls"]   = 0
            ls["ball_log"] = []
            match.live_state = ls
            db.add(MatchSet(match_id=match.match_id, set_number=2))

    # ── FOOTBALL ─────────────────────────────────────────────
    elif event.sport_key == "football":
        if current_set:
            current_set.is_complete     = True
            current_set.winner_position = data.winner_position if isinstance(data.winner_position, int) else None
        all_sets = match.sets
        if all_sets:
            s      = all_sets[0]
            winner = engine.check_match_winner(s.score_p1, s.score_p2, config)
        else:
            winner = data.winner_position if isinstance(data.winner_position, int) else None
        _finish_match(match, winner, db)

    db.commit()
    return _serialize_match(_load_match(match_id, db))


@router.post("/matches/{match_id}/walkover")
def walkover_match(
    match_id: int,
    winner_position: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Record a walkover / no-show.
    The winner receives pts-0 in every required set and is immediately declared
    match winner.  Winner advances in the bracket exactly as after a normal win.
    """
    match = _load_match(match_id, db)
    if match.status == "done":
        raise HTTPException(status_code=400, detail="Match is already done")
    if winner_position not in (1, 2):
        raise HTTPException(status_code=400, detail="winner_position must be 1 or 2")

    event  = db.query(Event).filter(Event.event_id == match.event_id).first()
    engine = get_sport_engine(event.sport_key)
    config = dict(event.sport_config or engine.get_default_config())
    if match.live_state and "sets_to_win" in match.live_state:
        config["sets_to_win"] = match.live_state["sets_to_win"]

    sets_to_win = config.get("sets_to_win", 2)
    pts         = config.get("points_per_set", 11)

    # Wipe any existing sets
    for s in list(match.sets):
        db.delete(s)
    db.flush()

    parts = sorted(match.participants, key=lambda p: p.position)

    if engine.has_sets:
        # Set-based sports (TT, Badminton): create N walkover sets, winner gets pts-0 each
        for i in range(1, sets_to_win + 1):
            db.add(MatchSet(
                match_id        = match.match_id,
                set_number      = i,
                score_p1        = pts if winner_position == 1 else 0,
                score_p2        = pts if winner_position == 2 else 0,
                is_complete     = True,
                winner_position = winner_position,
            ))
        if len(parts) == 2:
            parts[0].score = sets_to_win if winner_position == 1 else 0
            parts[1].score = sets_to_win if winner_position == 2 else 0
    else:
        # Non-set sports (Football, Cricket): single result row, 1–0 walkover
        db.add(MatchSet(
            match_id        = match.match_id,
            set_number      = 1,
            score_p1        = 1 if winner_position == 1 else 0,
            score_p2        = 1 if winner_position == 2 else 0,
            is_complete     = True,
            winner_position = winner_position,
        ))
        if len(parts) == 2:
            parts[0].score = 1 if winner_position == 1 else 0
            parts[1].score = 1 if winner_position == 2 else 0

    # Stamp started_at if match hadn't been started yet
    if not match.started_at:
        match.started_at = datetime.now(timezone.utc)

    # Flag in live_state so UI can display "Walkover" badge
    ls = dict(match.live_state or {})
    ls["walkover"]        = True
    ls["walkover_winner"] = winner_position
    match.live_state = ls

    _finish_match(match, winner_position, db)
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
        prev.is_complete     = False
        prev.winner_position = None
        if match.status == "done":
            match.status      = "live"
            match.finished_at = None
            for p in match.participants:
                p.is_winner = False
    else:
        current.score_p1        = 0
        current.score_p2        = 0
        current.is_complete     = False
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
    preserved_sets = (match.live_state or {}).get("sets_to_win")
    match.status         = "scheduled"
    match.started_at     = None
    match.finished_at    = None
    match.current_server = None
    match.live_state     = {"sets_to_win": preserved_sets} if preserved_sets else None
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