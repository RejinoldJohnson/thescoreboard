from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
from models.models import Tournament, Player, TournamentParticipant, Group, Match, MatchParticipant
from schemas import TournamentCreate, TournamentOut, StandingOut, PlayerOut
from routers.auth import verify_token

router = APIRouter()

# ── Group rules ───────────────────────────────────────────────
# Group A: Men  0–35  (sub-group 1 — split by seed/random)
# Group B: Men  0–35  (sub-group 2 — split by seed/random)
# Group C: Men  0–35  (sub-group 3 — split by seed/random)
# Group D: Men 36+  AND  Women of ALL ages

GROUP_NAMES = ["Group A", "Group B", "Group C", "Group D"]
MEN_UNDER_36_GROUPS = ["Group A", "Group B", "Group C"]


def assign_group_name(age: Optional[int], gender: Optional[str],
                      existing_counts: dict) -> str:
    """
    Group D: Men 36+ or any Woman.
    Groups A/B/C: Men under 36, distributed evenly
                  (seeded → assigned by caller; unseeded → smallest group).
    existing_counts = {"Group A": n, "Group B": n, "Group C": n, "Group D": n}
    """
    age = age or 0
    gender = (gender or "").strip().lower()
    is_female = gender in ("female", "f", "girl", "women", "woman")

    if is_female or age >= 36:
        return "Group D"

    # Men under 36 — assign to smallest of A/B/C
    min_group = min(MEN_UNDER_36_GROUPS, key=lambda g: existing_counts.get(g, 0))
    return min_group


def require_admin(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    verify_token(authorization.split(" ")[1])


def _group_counts(tournament_id: int, db: Session) -> dict:
    counts = {g: 0 for g in GROUP_NAMES}
    groups = db.query(Group).filter(Group.tournament_id == tournament_id).all()
    for group in groups:
        n = db.query(TournamentParticipant).filter(
            TournamentParticipant.tournament_id == tournament_id,
            TournamentParticipant.group_id == group.group_id,
        ).count()
        counts[group.name] = n
    return counts


# ── Tournament CRUD ───────────────────────────────────────────

@router.post("/", response_model=TournamentOut)
def create_tournament(
    tournament: TournamentCreate,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)
    db_t = Tournament(**tournament.model_dump())
    db.add(db_t)
    db.flush()
    for name in GROUP_NAMES:
        db.add(Group(tournament_id=db_t.tournament_id, name=name))
    db.commit()
    db.refresh(db_t)
    return db_t


@router.get("/", response_model=List[TournamentOut])
def get_tournaments(db: Session = Depends(get_db)):
    return db.query(Tournament).order_by(Tournament.created_date.desc()).all()


@router.get("/{tournament_id}", response_model=TournamentOut)
def get_tournament(tournament_id: int, db: Session = Depends(get_db)):
    t = db.query(Tournament).filter(Tournament.tournament_id == tournament_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return t


# ── Add player to tournament (auto-assigns group) ─────────────

@router.post("/{tournament_id}/participants/{player_id}", response_model=PlayerOut)
def add_player_to_tournament(
    tournament_id: int,
    player_id: int,
    seed: Optional[int] = None,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)

    tourn = db.query(Tournament).filter(Tournament.tournament_id == tournament_id).first()
    if not tourn:
        raise HTTPException(status_code=404, detail="Tournament not found")
    player = db.query(Player).filter(Player.player_id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    existing = db.query(TournamentParticipant).filter_by(
        tournament_id=tournament_id, player_id=player_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Player already in this tournament")

    counts = _group_counts(tournament_id, db)
    group_name = assign_group_name(player.age, player.gender, counts)
    group = db.query(Group).filter(
        Group.tournament_id == tournament_id,
        Group.name == group_name,
    ).first()

    participant = TournamentParticipant(
        tournament_id=tournament_id,
        player_id=player_id,
        group_id=group.group_id if group else None,
        seed=seed,
    )
    db.add(participant)
    db.commit()
    return player


@router.delete("/{tournament_id}/participants/{player_id}")
def remove_player_from_tournament(
    tournament_id: int,
    player_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)
    tp = db.query(TournamentParticipant).filter_by(
        tournament_id=tournament_id, player_id=player_id
    ).first()
    if not tp:
        raise HTTPException(status_code=404, detail="Player not in this tournament")
    db.delete(tp)
    db.commit()
    return {"ok": True}


@router.patch("/{tournament_id}/participants/{player_id}/seed")
def set_player_seed(
    tournament_id: int,
    player_id: int,
    seed: Optional[int] = None,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)
    tp = db.query(TournamentParticipant).filter_by(
        tournament_id=tournament_id, player_id=player_id
    ).first()
    if not tp:
        raise HTTPException(status_code=404, detail="Player not in this tournament")
    tp.seed = seed
    db.commit()
    return {"ok": True, "seed": seed}


# ── Get participants grouped ──────────────────────────────────

@router.get("/{tournament_id}/participants")
def get_participants(tournament_id: int, db: Session = Depends(get_db)):
    groups = (
        db.query(Group)
        .filter(Group.tournament_id == tournament_id)
        .order_by(Group.name)
        .all()
    )
    result = []
    for group in groups:
        tps = (
            db.query(TournamentParticipant)
            .filter(
                TournamentParticipant.tournament_id == tournament_id,
                TournamentParticipant.group_id == group.group_id,
            )
            .options(joinedload(TournamentParticipant.player))
            .all()
        )
        result.append({
            "group_id":   group.group_id,
            "group_name": group.name,
            "players": [
                {
                    "player_id": tp.player.player_id,
                    "name":      tp.player.name,
                    "age":       tp.player.age,
                    "gender":    tp.player.gender,
                    "seed":      tp.seed,
                }
                for tp in tps
            ],
        })
    return result


# ── Standings ─────────────────────────────────────────────────

@router.get("/{tournament_id}/standings", response_model=List[StandingOut])
def get_standings(tournament_id: int, db: Session = Depends(get_db)):
    participants = db.query(TournamentParticipant).filter(
        TournamentParticipant.tournament_id == tournament_id
    ).all()
    if not participants:
        return []

    player_ids = [p.player_id for p in participants]
    stats = {
        pid: {"wins": 0, "losses": 0, "score_for": 0, "score_against": 0, "matches_played": 0}
        for pid in player_ids
    }

    completed = (
        db.query(Match)
        .filter(
            Match.tournament_id == tournament_id,
            Match.status.in_(["done", "completed"]),
        )
        .options(joinedload(Match.participants))
        .all()
    )

    for match in completed:
        if len(match.participants) != 2:
            continue
        parts = sorted(match.participants, key=lambda x: x.position)
        p1, p2 = parts[0], parts[1]
        for pid, mp, opp in [(p1.player_id, p1, p2), (p2.player_id, p2, p1)]:
            if pid not in stats:
                continue
            stats[pid]["matches_played"] += 1
            stats[pid]["score_for"]      += mp.score
            stats[pid]["score_against"]  += opp.score
            if mp.is_winner:
                stats[pid]["wins"]   += 1
            else:
                stats[pid]["losses"] += 1

    players_map = {
        p.player_id: p
        for p in db.query(Player).filter(Player.player_id.in_(player_ids)).all()
    }

    result = [
        StandingOut(
            player=players_map[pid],
            score_diff=s["score_for"] - s["score_against"],
            **s,
        )
        for pid, s in stats.items()
        if pid in players_map
    ]
    return sorted(result, key=lambda x: (-x.wins, -x.score_diff))