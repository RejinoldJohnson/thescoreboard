"""
Tournament routes — create wizard, workspace data, lifecycle management.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.database import get_db
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.models.tournament import Tournament, Sponsor, TOURNAMENT_STATUSES
from app.models.event import Event
from app.models.match import Match, MatchParticipant, MatchSet
from app.models.group import Group, EventParticipant
from app.schemas.tournament import TournamentCreate, TournamentUpdate, TournamentOut
from app.utils.auth import get_current_user
from app.utils.slug import generate_unique_slug
from app.sports.registry import get_sport_engine

router = APIRouter()


def _check_org_access(org_id: int, user: User, db: Session):
    if not user.is_superadmin:
        member = db.query(OrgMember).filter(
            OrgMember.org_id == org_id, OrgMember.user_id == user.user_id).first()
        if not member:
            raise HTTPException(status_code=403, detail="Not authorized for this organization")


def _check_tournament_access(tournament_id: int, user: User, db: Session) -> Tournament:
    t = db.query(Tournament).filter(Tournament.tournament_id == tournament_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    _check_org_access(t.org_id, user, db)
    return t


# ── Create tournament (wizard) ────────────────────────────────

@router.post("/{org_id}/tournaments", response_model=TournamentOut)
def create_tournament(
    org_id: int,
    data: TournamentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _check_org_access(org_id, user, db)
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    slug = generate_unique_slug(
        data.name,
        lambda s: db.query(Tournament).filter(Tournament.slug == s).first() is not None,
    )

    tournament = Tournament(
        org_id=org_id,
        name=data.name,
        slug=slug,
        venue=data.venue,
        city=data.city,
        state=data.state,
        start_date=data.start_date,
        end_date=data.end_date,
        is_multi_sport=data.is_multi_sport,
        primary_color=data.primary_color,
        status="draft",
    )
    db.add(tournament)
    db.flush()

    # Create events from wizard step 2
    for ev_input in data.events:
        try:
            engine = get_sport_engine(ev_input.sport_key)
        except KeyError as e:
            raise HTTPException(status_code=400, detail=str(e))

        config = engine.get_default_config()
        if ev_input.sport_config:
            try:
                config = engine.validate_config({**config, **ev_input.sport_config})
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

        event = Event(
            tournament_id=tournament.tournament_id,
            name=ev_input.name,
            sport_key=ev_input.sport_key,
            format=ev_input.format,
            participant_type=ev_input.participant_type,
            sport_config=config,
            squad_size       = ev_input.squad_size,
    team_size        = ev_input.team_size,
    substitutes      = ev_input.substitutes,
        )
        db.add(event)

    db.commit()
    db.refresh(tournament)
    return tournament


# ── List tournaments ──────────────────────────────────────────

@router.get("/{org_id}/tournaments", response_model=List[TournamentOut])
def list_tournaments(
    org_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _check_org_access(org_id, user, db)
    return (
        db.query(Tournament)
        .filter(Tournament.org_id == org_id)
        .options(joinedload(Tournament.sponsors))
        .order_by(Tournament.created_at.desc())
        .all()
    )


# ── Get single tournament ────────────────────────────────────

@router.get("/tournaments/{tournament_id}", response_model=TournamentOut)
def get_tournament(
    tournament_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _check_tournament_access(tournament_id, user, db)


# ── Tournament workspace data (the big one) ───────────────────

@router.get("/tournaments/{tournament_id}/workspace")
def get_workspace(
    tournament_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Returns ALL data needed to render the tournament workspace."""
    t = _check_tournament_access(tournament_id, user, db)

    events_data = []
    total_players = 0
    total_matches = 0
    total_live = 0
    total_done = 0

    events = db.query(Event).filter(
        Event.tournament_id == tournament_id, Event.is_active == True
    ).all()

    for event in events:
        # Groups
        groups = db.query(Group).filter(Group.event_id == event.event_id).order_by(Group.name).all()
        groups_data = []
        for g in groups:
            participants = (
                db.query(EventParticipant)
                .filter(EventParticipant.event_id == event.event_id, EventParticipant.group_id == g.group_id)
                .options(joinedload(EventParticipant.player))
                .all()
            )
            groups_data.append({
                "group_id": g.group_id,
                "name": g.name,
                "players": [
                    {"player_id": ep.player.player_id, "name": ep.player.name,
                     "age": ep.player.age, "gender": ep.player.gender, "seed": ep.seed}
                    for ep in participants if ep.player
                ],
            })

        # Ungrouped participants
        ungrouped = (
            db.query(EventParticipant)
            .filter(EventParticipant.event_id == event.event_id, EventParticipant.group_id == None)
            .options(joinedload(EventParticipant.player))
            .all()
        )

        # Matches
        matches = (
            db.query(Match).filter(Match.event_id == event.event_id)
            .options(
                joinedload(Match.participants).joinedload(MatchParticipant.player),
                joinedload(Match.sets))
            .order_by(Match.stage, Match.round, Match.match_id)
            .all()
        )

        player_count = db.query(EventParticipant).filter(
            EventParticipant.event_id == event.event_id).count()
        match_count = len(matches)
        live_count = sum(1 for m in matches if m.status == "live")
        done_count = sum(1 for m in matches if m.status == "done")

        total_players += player_count
        total_matches += match_count
        total_live += live_count
        total_done += done_count

        events_data.append({
            "event_id": event.event_id,
            "name": event.name,
            "sport_key": event.sport_key,
            "format": event.format,
            "participant_type": event.participant_type,
            "sport_config": event.sport_config,
            "status": event.status,
            "squad_size":      event.squad_size,
    "team_size":       event.team_size,
    "substitutes":     event.substitutes,
            "player_count": player_count,
            "match_count": match_count,
            "live_count": live_count,
            "done_count": done_count,
            "groups": groups_data,
            "ungrouped_players": [
                {"player_id": ep.player.player_id, "name": ep.player.name,
                 "age": ep.player.age, "gender": ep.player.gender, "seed": ep.seed}
                for ep in ungrouped if ep.player
            ],
            "matches": [_serialize_match(m) for m in matches],
        })

    return {
        "tournament": {
            "tournament_id": t.tournament_id,
            "org_id": t.org_id,
            "name": t.name,
            "slug": t.slug,
            "description": t.description,
            "is_multi_sport": t.is_multi_sport,
            "venue": t.venue,
            "city": t.city,
            "start_date": str(t.start_date) if t.start_date else None,
            "end_date": str(t.end_date) if t.end_date else None,
            "status": t.status,
            "primary_color": t.primary_color,
            "is_published": t.is_published,
        },
        "events": events_data,
        "stats": {
            "total_events": len(events_data),
            "total_players": total_players,
            "total_matches": total_matches,
            "live_matches": total_live,
            "done_matches": total_done,
        },
    }


# ── Update tournament ─────────────────────────────────────────

@router.patch("/{org_id}/tournaments/{tournament_id}", response_model=TournamentOut)
def update_tournament(
    org_id: int,
    tournament_id: int,
    data: TournamentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _check_org_access(org_id, user, db)
    t = db.query(Tournament).filter(
        Tournament.tournament_id == tournament_id, Tournament.org_id == org_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")

    if data.status and data.status not in TOURNAMENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {TOURNAMENT_STATUSES}")

    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(t, field, val)

    db.commit()
    db.refresh(t)
    return t

# ── Delete tournament ─────────────────────────────────────────

@router.delete("/{org_id}/tournaments/{tournament_id}")
def delete_tournament(
    org_id: int,
    tournament_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _check_org_access(org_id, user, db)
    t = db.query(Tournament).filter(
        Tournament.tournament_id == tournament_id,
        Tournament.org_id == org_id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


# ── Lifecycle transitions ─────────────────────────────────────

@router.post("/tournaments/{tournament_id}/transition")
def transition_status(
    tournament_id: int,
    target_status: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Move tournament to the next lifecycle phase."""
    t = _check_tournament_access(tournament_id, user, db)

    if target_status not in TOURNAMENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {target_status}")

    t.status = target_status

    # Auto-publish when going live
    if target_status == "live":
        t.is_published = True

    db.commit()
    return {"ok": True, "status": t.status}


# ── Auto-generate fixtures for an event ───────────────────────

@router.post("/events/{event_id}/generate-fixtures")
def generate_fixtures(
    event_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Auto-generate round-robin group matches for an event."""
    event = db.query(Event).filter(Event.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Check access
    t = db.query(Tournament).filter(Tournament.tournament_id == event.tournament_id).first()
    _check_org_access(t.org_id, user, db)

    engine = get_sport_engine(event.sport_key)
    groups = db.query(Group).filter(Group.event_id == event_id).all()

    if not groups:
        raise HTTPException(status_code=400, detail="No groups found. Create groups and assign players first.")

    matches_created = 0
    table_counter = 0

    for group in groups:
        participants = (
            db.query(EventParticipant)
            .filter(EventParticipant.event_id == event_id, EventParticipant.group_id == group.group_id)
            .all()
        )

        if len(participants) < 2:
            continue

        player_ids = [ep.player_id for ep in participants]

        # Check which matches already exist in this group
        existing = (
            db.query(Match)
            .filter(Match.event_id == event_id, Match.group_id == group.group_id)
            .options(joinedload(Match.participants))
            .all()
        )
        existing_pairs = set()
        for m in existing:
            pids = tuple(sorted(p.player_id for p in m.participants))
            existing_pairs.add(pids)

        # Round-robin within group
        for i in range(len(player_ids)):
            for j in range(i + 1, len(player_ids)):
                pair = tuple(sorted([player_ids[i], player_ids[j]]))
                if pair in existing_pairs:
                    continue

                table_counter += 1
                table = ((table_counter - 1) % 2) + 1

                match = Match(
                    event_id=event_id,
                    group_id=group.group_id,
                    round=1,
                    stage="group",
                    status="scheduled",
                    table_number=table,
                )
                db.add(match)
                db.flush()

                db.add_all([
                    MatchParticipant(match_id=match.match_id, player_id=player_ids[i], position=1),
                    MatchParticipant(match_id=match.match_id, player_id=player_ids[j], position=2),
                ])

                # Create first set for set-based sports
                if hasattr(engine, "check_set_winner"):
                    db.add(MatchSet(match_id=match.match_id, set_number=1))

                matches_created += 1

    db.commit()
    return {"ok": True, "matches_created": matches_created}


def _serialize_match(m: Match) -> dict:
    parts = sorted(m.participants, key=lambda p: p.position)
    p1 = parts[0] if len(parts) > 0 else None
    p2 = parts[1] if len(parts) > 1 else None
    sets = sorted(m.sets, key=lambda s: s.set_number) if m.sets else []
    return {
        "match_id": m.match_id,
        "event_id": m.event_id,
        "group_id": m.group_id,
        "stage": m.stage,
        "round": m.round,
        "status": m.status,
        "table_number": m.table_number,
        "current_server": m.current_server,
        "started_at": str(m.started_at) if m.started_at else None,
        "finished_at": str(m.finished_at) if m.finished_at else None,
        "player_1": {
            "player_id": p1.player_id if p1 else None,
            "name": p1.player.name if p1 and p1.player else "TBD",
            "score": p1.score if p1 else 0,
            "is_winner": p1.is_winner if p1 else False,
        },
        "player_2": {
            "player_id": p2.player_id if p2 else None,
            "name": p2.player.name if p2 and p2.player else "TBD",
            "score": p2.score if p2 else 0,
            "is_winner": p2.is_winner if p2 else False,
        },
        "sets": [
            {"set_number": s.set_number, "score_p1": s.score_p1, "score_p2": s.score_p2,
             "winner": s.winner_position, "is_complete": s.is_complete}
            for s in sets
        ],
    }