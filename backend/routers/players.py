from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models.models import Player, Tournament, TournamentParticipant, Group
from schemas import PlayerCreate, PlayerOut
from routers.auth import verify_token
from routers.tournaments import assign_group_name, _group_counts

router = APIRouter()


def require_admin(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    verify_token(authorization.split(" ")[1])


@router.get("/", response_model=List[PlayerOut])
def get_players(db: Session = Depends(get_db)):
    return db.query(Player).order_by(Player.created_date).all()


@router.post("/", response_model=PlayerOut)
def create_player(
    player: PlayerCreate,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)

    db_player = Player(**player.model_dump())
    db.add(db_player)
    db.flush()

    # Auto-enrol into all active tournaments
    active_tournaments = db.query(Tournament).filter(Tournament.is_active == True).all()
    for tournament in active_tournaments:
        existing = db.query(TournamentParticipant).filter_by(
            tournament_id=tournament.tournament_id,
            player_id=db_player.player_id
        ).first()
        if existing:
            continue

        counts = _group_counts(tournament.tournament_id, db)
        group_name = assign_group_name(db_player.age, db_player.gender, counts)
        group = db.query(Group).filter(
            Group.tournament_id == tournament.tournament_id,
            Group.name == group_name,
        ).first()

        participant = TournamentParticipant(
            tournament_id=tournament.tournament_id,
            player_id=db_player.player_id,
            group_id=group.group_id if group else None,
        )
        db.add(participant)

    db.commit()
    db.refresh(db_player)
    return db_player


@router.delete("/{player_id}")
def delete_player(
    player_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)
    player = db.query(Player).filter(Player.player_id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    db.delete(player)
    db.commit()
    return {"ok": True}