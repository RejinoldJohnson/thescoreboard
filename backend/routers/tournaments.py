from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
from models.models import Tournament, Player, TournamentParticipant, Group, Match, MatchParticipant
from schemas import TournamentCreate, TournamentOut, StandingOut, PlayerOut
from routers.auth import verify_token


def _sub_group_label(group_name: str) -> str:
    labels = {
        "Group A": "Boys U18 & Women",
        "Group B": "Men 18–29",
        "Group C": "Men 18–29",
        "Group D": "Men 30+",
    }
    return labels.get(group_name, "")


router = APIRouter()

# Group A : Boys under 18 (sub_group="boys") + Women all ages (sub_group="women")
# Group B/C: Men 18-29 (balanced, no sub_group)
# Group D  : Men 30+   (no sub_group)
GROUP_NAMES        = ["Group A", "Group B", "Group C", "Group D"]
MEN_18_29_GROUPS   = ["Group B", "Group C"]


def _is_female(gender: Optional[str]) -> bool:
    if not gender:
        return False
    return gender.strip().lower() in ("female", "f", "girl", "women", "woman")


def assign_group_and_subgroup(
    age: Optional[int],
    gender: Optional[str],
    existing_counts: dict,
) -> tuple:
    """
    Returns (group_name, sub_group).

    Group A boys  : male, age < 18   → sub_group="boys"
    Group A women : female, any age  → sub_group="women"
    Group B/C     : male, 18 ≤ age < 30 → sub_group=None (balanced)
    Group D       : male, age ≥ 30   → sub_group=None
    """
    age = age or 0

    if _is_female(gender):
        return "Group A", "women"

    if age < 18:
        return "Group A", "boys"

    if age >= 30:
        return "Group D", None

    # Male 18-29 → least populated of B/C
    group = min(MEN_18_29_GROUPS, key=lambda g: existing_counts.get(g, 0))
    return group, None


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


# Keep old function signature for backward compat with players.py
def assign_group_name(age, gender, existing_counts):
    group, _ = assign_group_and_subgroup(age, gender, existing_counts)
    return group


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


@router.post("/{tournament_id}/participants/{player_id}", response_model=PlayerOut)
def add_player_to_tournament(
    tournament_id: int, player_id: int, seed: Optional[int] = None,
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
    group_name, sub_group = assign_group_and_subgroup(player.age, player.gender, counts)
    group = db.query(Group).filter(
        Group.tournament_id == tournament_id, Group.name == group_name,
    ).first()

    db.add(TournamentParticipant(
        tournament_id=tournament_id,
        player_id=player_id,
        group_id=group.group_id if group else None,
        seed=seed,
        sub_group=sub_group,
    ))
    db.commit()
    return player


@router.delete("/{tournament_id}/participants/{player_id}")
def remove_player_from_tournament(
    tournament_id: int, player_id: int,
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
    tournament_id: int, player_id: int, seed: Optional[int] = None,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)
    tp = db.query(TournamentParticipant).filter_by(
        tournament_id=tournament_id, player_id=player_id
    ).first()
    if not tp:
        raise HTTPException(status_code=404, detail="Player not in this tournament")
    # Seeds only 1-5 allowed
    if seed is not None and seed not in range(1, 6):
        raise HTTPException(status_code=400, detail="Seed must be between 1 and 5")
    # Check no other player in the same group already has this seed
    if seed is not None and tp.group_id:
        conflict = db.query(TournamentParticipant).filter(
            TournamentParticipant.tournament_id == tournament_id,
            TournamentParticipant.group_id == tp.group_id,
            TournamentParticipant.seed == seed,
            TournamentParticipant.tp_id != tp.tp_id,
        ).first()
        if conflict:
            raise HTTPException(
                status_code=400,
                detail=f"Seed {seed} is already taken in this group. Choose a different seed."
            )
    tp.seed = seed
    db.commit()
    return {"ok": True, "seed": seed}


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
            "group_id":       group.group_id,
            "group_name":     group.name,
            "sub_group_label": _sub_group_label(group.name),
            "players": [
                {
                    "player_id": tp.player.player_id,
                    "name":      tp.player.name,
                    "age":       tp.player.age,
                    "gender":    tp.player.gender,
                    "seed":      tp.seed,
                    "sub_group": getattr(tp, "sub_group", None),
                }
                for tp in tps
            ],
        })
    return result


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
        .filter(Match.tournament_id == tournament_id, Match.status.in_(["done", "completed"]))
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
        StandingOut(player=players_map[pid], score_diff=s["score_for"] - s["score_against"], **s)
        for pid, s in stats.items() if pid in players_map
    ]
    return sorted(result, key=lambda x: (-x.wins, -x.score_diff))