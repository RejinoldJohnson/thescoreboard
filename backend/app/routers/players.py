"""
Player routes — register players, add to events, manage groups.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from app.database import get_db
from app.models.user import User
from app.models.organization import OrgMember
from app.models.tournament import Tournament
from app.models.event import Event
from app.models.player import Player
from app.models.group import Group, EventParticipant
from app.schemas.player import PlayerCreate, PlayerOut, EventParticipantOut
from app.utils.auth import get_current_user

router = APIRouter()


# ── Player CRUD ──────────────────────────────────────────────

@router.post("/", response_model=PlayerOut)
def create_player(
    data: PlayerCreate,
    org_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    player = Player(
        name=data.name,
        age=data.age,
        gender=data.gender,
        phone=data.phone,
        email=data.email,
        org_id=org_id,
    )
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


@router.get("/", response_model=List[PlayerOut])
def list_players(
    org_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Player)
    if org_id:
        query = query.filter(Player.org_id == org_id)
    return query.order_by(Player.name).all()


@router.delete("/{player_id}")
def delete_player(
    player_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    player = db.query(Player).filter(Player.player_id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    db.delete(player)
    db.commit()
    return {"ok": True}


# ── Event enrollment ─────────────────────────────────────────

@router.post("/events/{event_id}/participants")
def add_player_to_event(
    event_id: int,
    player_id: int,
    group_id: Optional[int] = None,
    seed: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = db.query(Event).filter(Event.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    player = db.query(Player).filter(Player.player_id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    existing = db.query(EventParticipant).filter(
        EventParticipant.event_id == event_id,
        EventParticipant.player_id == player_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Player already enrolled in this event")

    ep = EventParticipant(
        event_id=event_id,
        player_id=player_id,
        group_id=group_id,
        seed=seed,
    )
    db.add(ep)
    db.commit()
    return {"ok": True, "ep_id": ep.ep_id}


@router.get("/events/{event_id}/participants")
def get_event_participants(event_id: int, db: Session = Depends(get_db)):
    """Public — get all participants grouped by group."""
    event = db.query(Event).filter(Event.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    groups = (
        db.query(Group)
        .filter(Group.event_id == event_id)
        .order_by(Group.name)
        .all()
    )

    result = []
    for group in groups:
        participants = (
            db.query(EventParticipant)
            .filter(
                EventParticipant.event_id == event_id,
                EventParticipant.group_id == group.group_id,
            )
            .options(joinedload(EventParticipant.player))
            .all()
        )
        result.append({
            "group_id": group.group_id,
            "group_name": group.name,
            "players": [
                {
                    "player_id": ep.player.player_id,
                    "name": ep.player.name,
                    "age": ep.player.age,
                    "gender": ep.player.gender,
                    "seed": ep.seed,
                }
                for ep in participants
                if ep.player
            ],
        })

    # Also include ungrouped participants
    ungrouped = (
        db.query(EventParticipant)
        .filter(
            EventParticipant.event_id == event_id,
            EventParticipant.group_id == None,
        )
        .options(joinedload(EventParticipant.player))
        .all()
    )
    if ungrouped:
        result.append({
            "group_id": None,
            "group_name": "Ungrouped",
            "players": [
                {
                    "player_id": ep.player.player_id,
                    "name": ep.player.name,
                    "age": ep.player.age,
                    "gender": ep.player.gender,
                    "seed": ep.seed,
                }
                for ep in ungrouped
                if ep.player
            ],
        })

    return result


@router.delete("/events/{event_id}/participants/{player_id}")
def remove_player_from_event(
    event_id: int,
    player_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ep = db.query(EventParticipant).filter(
        EventParticipant.event_id == event_id,
        EventParticipant.player_id == player_id,
    ).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Player not in this event")
    db.delete(ep)
    db.commit()
    return {"ok": True}


# ── Groups ───────────────────────────────────────────────────

@router.post("/events/{event_id}/groups")
def create_group(
    event_id: int,
    name: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = db.query(Event).filter(Event.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    group = Group(event_id=event_id, name=name)
    db.add(group)
    db.commit()
    db.refresh(group)
    return {"ok": True, "group_id": group.group_id, "name": group.name}
