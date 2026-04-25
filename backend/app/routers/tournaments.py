"""
Tournament routes — create wizard, workspace data, lifecycle management.
"""
import random
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


# ── Helpers ───────────────────────────────────────────────────

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


def _normalize_participant_type(pt: str) -> str:
    """doubles_pair is a frontend concept — backend stores it as 'team'."""
    if pt == "doubles_pair":
        return "team"
    return pt


def _serialize_match(m: Match) -> dict:
    parts = sorted(m.participants, key=lambda p: p.position)
    p1 = parts[0] if len(parts) > 0 else None
    p2 = parts[1] if len(parts) > 1 else None
    sets = sorted(m.sets, key=lambda s: s.set_number) if m.sets else []

    def _participant_data(p, label):
        if not p:
            return {"player_id": None, "team_id": None, "name": "TBD", "score": 0, "is_winner": False}
        name = "TBD"
        if p.player:
            name = p.player.name
        elif p.team:
            name = p.team.name
        return {
            "player_id": p.player_id,
            "team_id":   p.team_id,
            "name":      name,
            "score":     p.score,
            "is_winner": p.is_winner,
        }

    return {
        "match_id":       m.match_id,
        "event_id":       m.event_id,
        "group_id":       m.group_id,
        "stage":          m.stage,
        "round":          m.round,
        "status":         m.status,
        "table_number":   m.table_number,
        "current_server": m.current_server,
        "started_at":     str(m.started_at)  if m.started_at  else None,
        "finished_at":    str(m.finished_at) if m.finished_at else None,
        "player_1":       _participant_data(p1, "player_1"),
        "player_2":       _participant_data(p2, "player_2"),
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
        is_published=data.is_published,
        primary_color=data.primary_color,
        status="draft",
    )
    db.add(tournament)
    db.flush()

    for ev_input in data.events:
        try:
            engine = get_sport_engine(ev_input.sport_key)
        except KeyError as e:
            raise HTTPException(status_code=400, detail=str(e))

        if data.is_multi_sport:
            # Multi-sport: store a clean shell — no defaults injected.
            # The organiser completes per-sport setup from the dashboard.
            config        = None
            is_configured = False
            event_format  = None          # set during setup wizard
        else:
            # Single-sport: apply engine defaults + any provided overrides now.
            config = engine.get_default_config()
            if ev_input.sport_config:
                try:
                    config = engine.validate_config({**config, **ev_input.sport_config})
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e))
            is_configured = True
            event_format  = ev_input.format  # validated non-null by creation wizard

        # Normalize doubles_pair → team before storing
        participant_type = _normalize_participant_type(ev_input.participant_type or "individual")

        event = Event(
            tournament_id=tournament.tournament_id,
            name=ev_input.name,
            sport_key=ev_input.sport_key,
            format=event_format,
            participant_type=participant_type,
            sport_config=config,
            squad_size=ev_input.squad_size,
            team_size=ev_input.team_size,
            substitutes=ev_input.substitutes,
            is_configured=is_configured,
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


# ── Tournament workspace data ─────────────────────────────────

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
        is_team_event = event.participant_type == "team"

        # Groups
        groups = db.query(Group).filter(Group.event_id == event.event_id).order_by(Group.name).all()
        groups_data = []
        for g in groups:
            participants = (
                db.query(EventParticipant)
                .filter(EventParticipant.event_id == event.event_id, EventParticipant.group_id == g.group_id)
                .options(
                    joinedload(EventParticipant.player),
                    joinedload(EventParticipant.team),
                )
                .all()
            )
            groups_data.append({
                "group_id": g.group_id,
                "name":     g.name,
                "participants": [
                    _serialize_participant(ep, is_team_event)
                    for ep in participants
                ],
                # keep backward compat key
                "players": [
                    _serialize_participant(ep, is_team_event)
                    for ep in participants
                ],
            })

        # Ungrouped participants
        ungrouped = (
            db.query(EventParticipant)
            .filter(EventParticipant.event_id == event.event_id, EventParticipant.group_id == None)
            .options(
                joinedload(EventParticipant.player),
                joinedload(EventParticipant.team),
            )
            .all()
        )

        # Matches
        matches = (
            db.query(Match).filter(Match.event_id == event.event_id)
            .options(
                joinedload(Match.participants).joinedload(MatchParticipant.player),
                joinedload(Match.participants).joinedload(MatchParticipant.team),
                joinedload(Match.sets),
            )
            .order_by(Match.stage, Match.round, Match.match_id)
            .all()
        )

        participant_count = db.query(EventParticipant).filter(
            EventParticipant.event_id == event.event_id).count()
        match_count  = len(matches)
        live_count   = sum(1 for m in matches if m.status == "live")
        done_count   = sum(1 for m in matches if m.status == "done")

        total_players += participant_count
        total_matches += match_count
        total_live    += live_count
        total_done    += done_count

        events_data.append({
            "event_id":        event.event_id,
            "name":            event.name,
            "sport_key":       event.sport_key,
            "format":          event.format,
            "participant_type": event.participant_type,
            "sport_config":    event.sport_config,
            "status":          event.status,
            "is_configured":   event.is_configured,
            "squad_size":      event.squad_size,
            "team_size":       event.team_size,
            "substitutes":     event.substitutes,
            "player_count":    participant_count,
            "match_count":     match_count,
            "live_count":      live_count,
            "done_count":      done_count,
            "groups":          groups_data,
            "ungrouped_players": [
                _serialize_participant(ep, is_team_event)
                for ep in ungrouped
            ],
            "matches": [_serialize_match(m) for m in matches],
        })

    return {
        "tournament": {
            "tournament_id":  t.tournament_id,
            "org_id":         t.org_id,
            "name":           t.name,
            "slug":           t.slug,
            "description":    t.description,
            "is_multi_sport": t.is_multi_sport,
            "venue":          t.venue,
            "city":           t.city,
            "start_date":     str(t.start_date) if t.start_date else None,
            "end_date":       str(t.end_date)   if t.end_date   else None,
            "status":         t.status,
            "primary_color":  t.primary_color,
            "is_published":   t.is_published,
        },
        "events": events_data,
        "stats": {
            "total_events":   len(events_data),
            "total_players":  total_players,
            "total_matches":  total_matches,
            "live_matches":   total_live,
            "done_matches":   total_done,
        },
    }


def _serialize_participant(ep: EventParticipant, is_team: bool) -> dict:
    if is_team and ep.team:
        return {
            "ep_id":    ep.ep_id,
            "team_id":  ep.team.team_id,
            "name":     ep.team.name,
            "seed":     ep.seed,
            "group_id": ep.group_id,
        }
    elif ep.player:
        return {
            "ep_id":     ep.ep_id,
            "player_id": ep.player.player_id,
            "name":      ep.player.name,
            "age":       ep.player.age,
            "gender":    ep.player.gender,
            "seed":      ep.seed,
            "group_id":  ep.group_id,
        }
    return {"ep_id": ep.ep_id, "name": "Unknown", "seed": ep.seed, "group_id": ep.group_id}


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


# ── Generate fixtures ─────────────────────────────────────────

@router.post("/events/{event_id}/generate-fixtures")
def generate_fixtures(
    event_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Auto-generate fixtures for an event.

    Behaviour by format:
      group_knockout  — round-robin within each group (groups must exist and be populated)
      round_robin     — everyone plays everyone (no groups needed)
      direct_knockout — single-elimination bracket (no groups needed, participants shuffled randomly)

    Works for both individual (player_id) and team (team_id) events.
    """
    event = db.query(Event).filter(Event.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if not event.is_configured:
        raise HTTPException(
            status_code=400,
            detail=(
                "Sport configuration is incomplete. "
                "Open this sport from the tournament dashboard and complete setup first."
            ),
        )
    if not event.format:
        raise HTTPException(
            status_code=400,
            detail="Event format is not set. Please complete sport setup first.",
        )

    t = db.query(Tournament).filter(Tournament.tournament_id == event.tournament_id).first()
    _check_org_access(t.org_id, user, db)

    engine = get_sport_engine(event.sport_key)
    is_team_event = event.participant_type == "team"

    # ── Helper: create one match between two participants ─────
    def _create_match(pid1, pid2, group_id, stage, round_num, table_num):
        match = Match(
            event_id=event_id,
            group_id=group_id,
            round=round_num,
            stage=stage,
            status="scheduled",
            table_number=table_num,
        )
        db.add(match)
        db.flush()

        if is_team_event:
            db.add_all([
                MatchParticipant(match_id=match.match_id, team_id=pid1, position=1),
                MatchParticipant(match_id=match.match_id, team_id=pid2, position=2),
            ])
        else:
            db.add_all([
                MatchParticipant(match_id=match.match_id, player_id=pid1, position=1),
                MatchParticipant(match_id=match.match_id, player_id=pid2, position=2),
            ])

        if hasattr(engine, "check_set_winner"):
            db.add(MatchSet(match_id=match.match_id, set_number=1))

        return match

    # ── Helper: get all participant IDs for this event ────────
    def _get_all_ids():
        eps = db.query(EventParticipant).filter(
            EventParticipant.event_id == event_id
        ).all()
        if is_team_event:
            return [ep.team_id for ep in eps if ep.team_id]
        return [ep.player_id for ep in eps if ep.player_id]

    # ── Helper: already-existing pair set ─────────────────────
    def _existing_pairs(group_id=None):
        q = db.query(Match).filter(Match.event_id == event_id)
        if group_id is not None:
            q = q.filter(Match.group_id == group_id)
        existing = q.options(joinedload(Match.participants)).all()
        pairs = set()
        for m in existing:
            if is_team_event:
                ids = tuple(sorted(p.team_id for p in m.participants if p.team_id))
            else:
                ids = tuple(sorted(p.player_id for p in m.participants if p.player_id))
            if len(ids) == 2:
                pairs.add(ids)
        return pairs

    matches_created = 0
    table_counter = 0

    # ════════════════════════════════════════════════════════════
    # FORMAT: group_knockout — round-robin within each group
    # ════════════════════════════════════════════════════════════
    if event.format == "group_knockout":
        groups = db.query(Group).filter(Group.event_id == event_id).all()
        if not groups:
            raise HTTPException(
                status_code=400,
                detail="No groups found. Create groups and assign participants first."
            )

        for group in groups:
            eps = db.query(EventParticipant).filter(
                EventParticipant.event_id == event_id,
                EventParticipant.group_id == group.group_id,
            ).all()

            if len(eps) < 2:
                continue

            ids = [ep.team_id if is_team_event else ep.player_id for ep in eps]
            existing = _existing_pairs(group.group_id)

            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    pair = tuple(sorted([ids[i], ids[j]]))
                    if pair in existing:
                        continue
                    table_counter += 1
                    _create_match(ids[i], ids[j], group.group_id, "group", 1, ((table_counter - 1) % 2) + 1)
                    matches_created += 1

    # ════════════════════════════════════════════════════════════
    # FORMAT: round_robin — everyone plays everyone, no groups
    # ════════════════════════════════════════════════════════════
    elif event.format == "round_robin":
        ids = _get_all_ids()
        if len(ids) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 participants to generate fixtures.")

        existing = _existing_pairs()

        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                pair = tuple(sorted([ids[i], ids[j]]))
                if pair in existing:
                    continue
                table_counter += 1
                _create_match(ids[i], ids[j], None, "round_robin", 1, ((table_counter - 1) % 2) + 1)
                matches_created += 1

    # ════════════════════════════════════════════════════════════
    # FORMAT: direct_knockout — single elimination bracket
    # ════════════════════════════════════════════════════════════
    elif event.format == "direct_knockout":
        ids = _get_all_ids()
        if len(ids) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 participants to generate fixtures.")

        # Delete any existing knockout matches before regenerating
        existing_matches = db.query(Match).filter(Match.event_id == event_id).all()
        for m in existing_matches:
            db.delete(m)
        db.flush()

        # Shuffle for random seeding
        ids_shuffled = ids[:]
        random.shuffle(ids_shuffled)

        # Pad to next power of 2 with byes (None)
        import math
        n = len(ids_shuffled)
        bracket_size = 2 ** math.ceil(math.log2(n)) if n > 1 else 2
        byes = bracket_size - n
        padded = ids_shuffled + [None] * byes

        round_num = 1
        current_round_ids = padded

        while len(current_round_ids) > 1:
            next_round = []
            for i in range(0, len(current_round_ids), 2):
                a = current_round_ids[i]
                b = current_round_ids[i + 1] if i + 1 < len(current_round_ids) else None

                if a is None and b is None:
                    next_round.append(None)
                elif a is None:
                    next_round.append(b)   # bye — advance automatically
                elif b is None:
                    next_round.append(a)   # bye — advance automatically
                else:
                    # Real match
                    stage = "final" if len(current_round_ids) == 2 else \
                            "semi"  if len(current_round_ids) == 4 else \
                            "quarter" if len(current_round_ids) == 8 else "knockout"
                    table_counter += 1
                    _create_match(a, b, None, stage, round_num, ((table_counter - 1) % 2) + 1)
                    matches_created += 1
                    next_round.append(None)  # winner TBD

            current_round_ids = next_round
            round_num += 1

    else:
        raise HTTPException(status_code=400, detail=f"Unknown format: {event.format}")

    db.commit()
    return {
        "ok": True,
        "format": event.format,
        "matches_created": matches_created,
    }