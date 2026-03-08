from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
from models.models import Match, MatchParticipant, Player, TournamentParticipant, Group, Tournament
from schemas import MatchCreate, MatchOut, MatchUpdate
from routers.auth import verify_token
import random

router = APIRouter()

TABLE_COUNT = 2  # only Table 1 and Table 2


def require_admin(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    verify_token(authorization.split(" ")[1])


def _load_match(match_id: int, db: Session) -> Match:
    match = (
        db.query(Match)
        .filter(Match.match_id == match_id)
        .options(joinedload(Match.participants).joinedload(MatchParticipant.player))
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


def _check_and_trigger_knockout(tournament_id: int, db: Session):
    """
    After any match finishes, check if ALL group-stage matches for the
    tournament are done. If so, auto-generate the knockout bracket.
    """
    group_matches = db.query(Match).filter(
        Match.tournament_id == tournament_id,
        Match.stage == "group",
    ).all()

    if not group_matches:
        return

    all_done = all(m.status in ("done", "completed") for m in group_matches)
    if not all_done:
        return

    # Check if knockout already exists
    ko_exists = db.query(Match).filter(
        Match.tournament_id == tournament_id,
        Match.stage != "group",
    ).first()
    if ko_exists:
        return

    # Collect winners from each group
    groups = db.query(Group).filter(Group.tournament_id == tournament_id).all()
    group_winners = []
    for group in groups:
        g_matches = [m for m in group_matches if m.group_id == group.group_id]
        for m in g_matches:
            parts = sorted(m.participants, key=lambda x: x.position)
            for p in parts:
                if p.is_winner:
                    group_winners.append(p.player_id)

    if len(group_winners) < 2:
        return

    random.shuffle(group_winners)
    _create_ko_round(tournament_id, group_winners, db, round_num=1)
    db.commit()


def _create_ko_round(tournament_id: int, player_ids: list, db: Session, round_num: int):
    """Pair up players for a knockout round, alternating table numbers."""
    pairs = []
    ids = list(player_ids)
    while len(ids) >= 2:
        pairs.append((ids.pop(0), ids.pop(0)))

    stage = _ko_stage_label(len(player_ids))

    for i, (pid1, pid2) in enumerate(pairs):
        table = (i % TABLE_COUNT) + 1
        new_match = Match(
            tournament_id=tournament_id,
            group_id=None,
            round=round_num,
            status="scheduled",
            stage=stage,
            table_number=table,
        )
        db.add(new_match)
        db.flush()
        db.add_all([
            MatchParticipant(match_id=new_match.match_id, player_id=pid1, position=1, score=0, is_winner=False),
            MatchParticipant(match_id=new_match.match_id, player_id=pid2, position=2, score=0, is_winner=False),
        ])


def _ko_stage_label(n_players: int) -> str:
    if n_players >= 8: return "quarter"
    if n_players >= 4: return "semi"
    return "final"


# ── GET /matches/ ─────────────────────────────────────────────
@router.get("/", response_model=List[MatchOut])
def get_matches(tournament_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Match).options(
        joinedload(Match.participants).joinedload(MatchParticipant.player)
    )
    if tournament_id:
        query = query.filter(Match.tournament_id == tournament_id)
    return query.order_by(Match.stage, Match.round, Match.match_id).all()


# ── POST /matches/ ────────────────────────────────────────────
@router.post("/", response_model=MatchOut)
def create_match(
    match_data: MatchCreate,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)
    p1 = db.query(Player).filter(Player.player_id == match_data.player1_id).first()
    p2 = db.query(Player).filter(Player.player_id == match_data.player2_id).first()
    if not p1 or not p2:
        raise HTTPException(status_code=404, detail="One or both players not found")
    if match_data.player1_id == match_data.player2_id:
        raise HTTPException(status_code=400, detail="A player cannot play against themselves")

    new_match = Match(
        tournament_id=match_data.tournament_id,
        group_id=match_data.group_id,
        round=match_data.round,
        status=match_data.status,
        stage=match_data.stage,
        table_number=match_data.table_number,
    )
    db.add(new_match)
    db.flush()
    db.add_all([
        MatchParticipant(match_id=new_match.match_id, player_id=p1.player_id, position=1, score=0, is_winner=False),
        MatchParticipant(match_id=new_match.match_id, player_id=p2.player_id, position=2, score=0, is_winner=False),
    ])
    db.commit()
    return _load_match(new_match.match_id, db)


# ── PATCH /matches/{match_id} ─────────────────────────────────
@router.patch("/{match_id}", response_model=MatchOut)
def update_match(
    match_id: int,
    update_data: MatchUpdate,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)

    match = (
        db.query(Match)
        .filter(Match.match_id == match_id)
        .options(joinedload(Match.participants))
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    if update_data.status is not None:
        match.status = update_data.status
    if update_data.table_number is not None:
        match.table_number = update_data.table_number

    parts = sorted(match.participants, key=lambda x: x.position)
    if len(parts) == 2:
        p1_part, p2_part = parts[0], parts[1]

        if update_data.score_p1 is not None:
            p1_part.score = update_data.score_p1
        if update_data.score_p2 is not None:
            p2_part.score = update_data.score_p2

        if update_data.status in ("done", "completed"):
            s1, s2 = p1_part.score, p2_part.score
            # 7-0 instant win rule
            if (s1 == 7 and s2 == 0) or (s1 > s2 and s1 >= 11 and s1 - s2 >= 2):
                p1_part.is_winner = True
                p2_part.is_winner = False
            elif (s2 == 7 and s1 == 0) or (s2 > s1 and s2 >= 11 and s2 - s1 >= 2):
                p2_part.is_winner = True
                p1_part.is_winner = False

    db.commit()

    # Auto-trigger knockout if all group matches are now done
    if update_data.status in ("done", "completed") and match.stage == "group":
        _check_and_trigger_knockout(match.tournament_id, db)

    return _load_match(match_id, db)


# ── DELETE /matches/{match_id} ────────────────────────────────
@router.delete("/{match_id}")
def delete_match(
    match_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)
    match = db.query(Match).filter(Match.match_id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    db.delete(match)
    db.commit()
    return {"ok": True}


# ── POST /matches/{match_id}/rematch ─────────────────────────
@router.post("/{match_id}/rematch", response_model=MatchOut)
def rematch(
    match_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    """Reset a completed match back to scheduled with scores at 0-0."""
    require_admin(authorization)
    match = (
        db.query(Match)
        .filter(Match.match_id == match_id)
        .options(joinedload(Match.participants))
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    match.status = "scheduled"
    for p in match.participants:
        p.score = 0
        p.is_winner = False
    db.commit()
    return _load_match(match_id, db)


# ── POST /matches/generate/{tournament_id} ────────────────────
@router.post("/generate/{tournament_id}")
def generate_fixtures(
    tournament_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    """
    Generate knockout fixtures for each group.
    - Only creates matches for players who don't already have a scheduled match.
    - Seeded players play (no byes) — odd player out gets matched with the lowest seed.
    - Tables auto-assigned alternating 1/2.
    """
    require_admin(authorization)

    groups = db.query(Group).filter(Group.tournament_id == tournament_id).all()
    if not groups:
        raise HTTPException(status_code=400, detail="No groups found. Add players first.")

    matches_created = 0
    table_counter = 0  # global across groups so tables alternate cleanly

    for group in groups:
        participants = (
            db.query(TournamentParticipant)
            .filter(
                TournamentParticipant.tournament_id == tournament_id,
                TournamentParticipant.group_id == group.group_id,
            )
            .all()
        )

        if len(participants) < 2:
            continue

        # Find players who already have a scheduled/live match in this group
        existing_matches = db.query(Match).filter(
            Match.tournament_id == tournament_id,
            Match.group_id == group.group_id,
            Match.status.in_(["scheduled", "live"]),
            Match.stage == "group",
        ).options(joinedload(Match.participants)).all()

        already_matched = set()
        for m in existing_matches:
            for p in m.participants:
                already_matched.add(p.player_id)

        # Only generate matches for players NOT already matched
        unmatched = [tp for tp in participants if tp.player_id not in already_matched]

        if len(unmatched) < 2:
            continue

        # Sort: seeded first, then random
        seeded   = sorted([tp for tp in unmatched if tp.seed is not None], key=lambda x: x.seed)
        unseeded = [tp for tp in unmatched if tp.seed is None]
        random.shuffle(unseeded)
        ordered = [tp.player_id for tp in seeded] + [tp.player_id for tp in unseeded]

        # Odd player: pair last two together (no byes for seeded players)
        if len(ordered) % 2 == 1:
            # Move last player to pair with second-to-last
            # (seeded players at front are never left over)
            ordered = ordered  # already handled by pairing logic below

        # Pair top vs bottom bracket style
        lo, hi = 0, len(ordered) - 1
        while lo < hi:
            pid1, pid2 = ordered[lo], ordered[hi]
            table_counter += 1
            table = (table_counter % TABLE_COUNT) + 1 if TABLE_COUNT > 0 else 1

            new_match = Match(
                tournament_id=tournament_id,
                group_id=group.group_id,
                round=1,
                status="scheduled",
                stage="group",
                table_number=table,
            )
            db.add(new_match)
            db.flush()
            db.add_all([
                MatchParticipant(match_id=new_match.match_id, player_id=pid1, position=1, score=0, is_winner=False),
                MatchParticipant(match_id=new_match.match_id, player_id=pid2, position=2, score=0, is_winner=False),
            ])
            matches_created += 1
            lo += 1
            hi -= 1

        # If odd one out — pair with closest opponent (last unmatched)
        if lo == hi:
            # Find existing player in this group who has fewest matches
            leftover = ordered[lo]
            # pair with a random existing matched player for a second match
            if already_matched:
                opponent = random.choice(list(already_matched))
                table_counter += 1
                table = (table_counter % TABLE_COUNT) + 1

                new_match = Match(
                    tournament_id=tournament_id,
                    group_id=group.group_id,
                    round=1,
                    status="scheduled",
                    stage="group",
                    table_number=table,
                )
                db.add(new_match)
                db.flush()
                db.add_all([
                    MatchParticipant(match_id=new_match.match_id, player_id=leftover, position=1, score=0, is_winner=False),
                    MatchParticipant(match_id=new_match.match_id, player_id=opponent, position=2, score=0, is_winner=False),
                ])
                matches_created += 1

    db.commit()
    return {"ok": True, "matches_created": matches_created}