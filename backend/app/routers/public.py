"""
Public routes — no auth required. For spectators and tournament discovery.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, distinct, or_
from typing import Optional, List

from app.database import get_db
from app.models.tournament import Tournament
from app.models.event import Event
from app.models.match import Match, MatchParticipant, MatchSet
from app.models.group import EventParticipant
from app.models.player import Player

from pydantic import BaseModel

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────

class PublicRegistration(BaseModel):
    name:      str
    phone:     str
    age:       Optional[int] = None
    gender:    Optional[str] = "Male"
    event_ids: List[int]     = []


# ── Helpers ───────────────────────────────────────────────────

SPORT_URL_MAP = {
    "football":    "football",
    "cricket":     "cricket",
    "table-tennis":"table_tennis",
    "badminton":   "badminton",
}

SPORT_KEY_TO_URL = {v: k for k, v in SPORT_URL_MAP.items()}


def _sport_key_from_url(url_slug: str) -> str:
    key = SPORT_URL_MAP.get(url_slug)
    if not key:
        raise HTTPException(status_code=404, detail=f"Unknown sport: {url_slug}")
    return key


def _tournament_summary(t: Tournament, db: Session, sport_filter: str = None):
    """Build a tournament card summary. Optionally filter events by sport."""
    events_summary = []
    t_live = 0
    t_total = 0
    t_done = 0
    t_players = 0
    sport_keys = set()

    for event in t.events:
        if not event.is_active:
            continue
        if sport_filter and event.sport_key != sport_filter:
            continue

        sport_keys.add(event.sport_key)
        live_count = db.query(Match).filter(
            Match.event_id == event.event_id, Match.status == "live").count()
        total_count = db.query(Match).filter(
            Match.event_id == event.event_id).count()
        done_count = db.query(Match).filter(
            Match.event_id == event.event_id, Match.status == "done").count()
        player_count = db.query(EventParticipant).filter(
            EventParticipant.event_id == event.event_id).count()

        live_matches = []
        if live_count > 0:
            live_ms = (
                db.query(Match)
                .filter(Match.event_id == event.event_id, Match.status == "live")
                .options(
                    joinedload(Match.participants).joinedload(MatchParticipant.player),
                    joinedload(Match.sets))
                .all()
            )
            live_matches = [_serialize_match(m) for m in live_ms]

        events_summary.append({
            "event_id":     event.event_id,
            "name":         event.name,
            "sport_key":    event.sport_key,
            "format":       event.format,
            "live_count":   live_count,
            "total_matches":total_count,
            "done_matches": done_count,
            "player_count": player_count,
            "live_matches": live_matches,
        })

        t_live   += live_count
        t_total  += total_count
        t_done   += done_count
        t_players += player_count

    status = "upcoming"
    if t_live > 0:
        status = "live"
    elif t_done > 0 and t_done == t_total and t_total > 0:
        status = "completed"
    elif t_done > 0:
        status = "live"

    return {
        "tournament_id":      t.tournament_id,
        "name":               t.name,
        "slug":               t.slug,
        "description":        t.description,
        "venue":              t.venue,
        "city":               t.city,
        "state":              t.state,
        "start_date":         str(t.start_date) if t.start_date else None,
        "poster_url":         t.poster_url,
        "primary_color":      t.primary_color,
        "org_name":           t.organization.name if t.organization else None,
        "sports":             list(sport_keys),
        "sport_urls":         [SPORT_KEY_TO_URL.get(s, s) for s in sport_keys],
        "status":             status,
        "is_live":            t_live > 0,
        "live_count":         t_live,
        "total_matches":      t_total,
        "completed_matches":  t_done,
        "total_players":      t_players,
        "events":             events_summary,
    }


# ── Homepage ──────────────────────────────────────────────────

@router.get("/home")
def homepage_data(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    tournaments = (
        db.query(Tournament)
        .filter(Tournament.is_active == True)
        .options(
            joinedload(Tournament.events),
            joinedload(Tournament.organization),
        )
        .order_by(Tournament.created_at.desc())
        .all()
    )

    if q:
        q_lower = q.lower()
        tournaments = [
            t for t in tournaments
            if q_lower in t.name.lower()
            or (t.city and q_lower in t.city.lower())
            or (t.venue and q_lower in t.venue.lower())
        ]

    sports_data = {}
    all_cards = []

    for t in tournaments:
        card = _tournament_summary(t, db)
        if card["total_matches"] == 0 and card["total_players"] == 0:
            if not card["events"]:
                continue
        all_cards.append(card)

        for sport_key in card["sports"]:
            if sport_key not in sports_data:
                sports_data[sport_key] = {
                    "sport_key":        sport_key,
                    "sport_url":        SPORT_KEY_TO_URL.get(sport_key, sport_key),
                    "tournament_count": 0,
                    "live_count":       0,
                    "tournaments":      [],
                }
            sports_data[sport_key]["tournament_count"] += 1
            if card["is_live"]:
                sports_data[sport_key]["live_count"] += 1

            sport_card = _tournament_summary(t, db, sport_filter=sport_key)
            if sport_card["events"]:
                sports_data[sport_key]["tournaments"].append(sport_card)

    for sd in sports_data.values():
        sd["tournaments"].sort(key=lambda c: (-int(c["is_live"]), -c["total_matches"]))
        sd["tournaments"] = sd["tournaments"][:6]

    all_cards.sort(key=lambda c: (-int(c["is_live"]), -c["total_matches"]))
    total_live = sum(c["live_count"] for c in all_cards)

    return {
        "sports":             list(sports_data.values()),
        "trending":           all_cards[:8],
        "total_live_matches": total_live,
    }


# ── Sport page ────────────────────────────────────────────────

@router.get("/sport/{sport_url}")
def sport_page_data(
    sport_url: str,
    q: Optional[str] = None,
    city: Optional[str] = None,
    db: Session = Depends(get_db),
):
    sport_key = _sport_key_from_url(sport_url)

    tournament_ids = (
        db.query(distinct(Event.tournament_id))
        .filter(Event.sport_key == sport_key, Event.is_active == True)
        .all()
    )
    t_ids = [tid[0] for tid in tournament_ids]

    if not t_ids:
        return {"sport_key": sport_key, "sport_url": sport_url, "tournaments": [], "cities": []}

    query = (
        db.query(Tournament)
        .filter(Tournament.tournament_id.in_(t_ids), Tournament.is_active == True)
        .options(joinedload(Tournament.events), joinedload(Tournament.organization))
    )

    if city:
        query = query.filter(Tournament.city.ilike(f"%{city}%"))

    tournaments = query.order_by(Tournament.created_at.desc()).all()

    if q:
        q_lower = q.lower()
        tournaments = [
            t for t in tournaments
            if q_lower in t.name.lower()
            or (t.city and q_lower in t.city.lower())
            or (t.venue and q_lower in t.venue.lower())
        ]

    cards = [_tournament_summary(t, db, sport_filter=sport_key) for t in tournaments]
    cards = [c for c in cards if c["events"]]

    order = {"live": 0, "upcoming": 1, "completed": 2}
    cards.sort(key=lambda c: (order.get(c["status"], 1), -c["total_matches"]))

    cities = sorted(set(t.city for t in tournaments if t.city))

    return {
        "sport_key":  sport_key,
        "sport_url":  sport_url,
        "tournaments": cards,
        "cities":     cities,
    }


# ── Tournament detail (all sports) ───────────────────────────

@router.get("/t/{slug}")
def get_tournament_page(slug: str, db: Session = Depends(get_db)):
    tournament = (
        db.query(Tournament)
        .filter(Tournament.slug == slug)
        .options(
            joinedload(Tournament.sponsors),
            joinedload(Tournament.events),
            joinedload(Tournament.organization),
        )
        .first()
    )
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    events_data = []
    for event in tournament.events:
        if not event.is_active:
            continue
        matches = (
            db.query(Match).filter(Match.event_id == event.event_id)
            .options(
                joinedload(Match.participants).joinedload(MatchParticipant.player),
                joinedload(Match.sets))
            .order_by(Match.stage, Match.round, Match.match_id).all()
        )
        events_data.append({
            "event_id":          event.event_id,
            "name":              event.name,
            "sport_key":         event.sport_key,
            "format":            event.format,
            "participant_type":  event.participant_type,
            "is_configured":     event.is_configured,
            "status":            event.status,
            "sport_config":      event.sport_config,
            "total_matches":     len(matches),
            "completed_matches": sum(1 for m in matches if m.status == "done"),
            "live_matches":      [_serialize_match(m) for m in matches if m.status == "live"],
            "all_matches":       [_serialize_match(m) for m in matches],
        })

    return {
        "tournament": {
            "tournament_id":   tournament.tournament_id,
            "name":            tournament.name,
            "slug":            tournament.slug,
            "description":     tournament.description,
            "status":          tournament.status,
            "start_date":      str(tournament.start_date) if tournament.start_date else None,
            "end_date":        str(tournament.end_date)   if tournament.end_date   else None,
            "poster_url":      tournament.poster_url,
            "banner_url":      tournament.banner_url,
            "primary_color":   tournament.primary_color,
            "secondary_color": tournament.secondary_color,
            "venue":           tournament.venue,
            "city":            tournament.city,
            "org_name":        tournament.organization.name if tournament.organization else None,
            "sponsors": [
                {"name": s.name, "logo_url": s.logo_url, "tier": s.tier}
                for s in tournament.sponsors
            ],
        },
        "events": events_data,
    }


# ── Tournament detail (sport-filtered) ───────────────────────

@router.get("/sport/{sport_url}/tournament/{slug}")
def get_tournament_by_sport(
    sport_url: str,
    slug: str,
    db: Session = Depends(get_db),
):
    sport_key = _sport_key_from_url(sport_url)

    tournament = (
        db.query(Tournament)
        .filter(Tournament.slug == slug)
        .options(
            joinedload(Tournament.sponsors),
            joinedload(Tournament.events),
            joinedload(Tournament.organization),
        )
        .first()
    )
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    events_data = []
    for event in tournament.events:
        if not event.is_active or event.sport_key != sport_key:
            continue
        matches = (
            db.query(Match).filter(Match.event_id == event.event_id)
            .options(
                joinedload(Match.participants).joinedload(MatchParticipant.player),
                joinedload(Match.sets))
            .order_by(Match.stage, Match.round, Match.match_id).all()
        )
        events_data.append({
            "event_id":          event.event_id,
            "name":              event.name,
            "sport_key":         event.sport_key,
            "format":            event.format,
            "participant_type":  event.participant_type,
            "is_configured":     event.is_configured,
            "status":            event.status,
            "sport_config":      event.sport_config,
            "total_matches":     len(matches),
            "completed_matches": sum(1 for m in matches if m.status == "done"),
            "live_matches":      [_serialize_match(m) for m in matches if m.status == "live"],
            "all_matches":       [_serialize_match(m) for m in matches],
        })

    return {
        "tournament": {
            "tournament_id": tournament.tournament_id,
            "name":          tournament.name,
            "slug":          tournament.slug,
            "description":   tournament.description,
            "status":        tournament.status,
            "start_date":    str(tournament.start_date) if tournament.start_date else None,
            "poster_url":    tournament.poster_url,
            "primary_color": tournament.primary_color,
            "venue":         tournament.venue,
            "city":          tournament.city,
            "org_name":      tournament.organization.name if tournament.organization else None,
            "sponsors": [
                {"name": s.name, "logo_url": s.logo_url, "tier": s.tier}
                for s in tournament.sponsors
            ],
        },
        "sport_key": sport_key,
        "sport_url": sport_url,
        "events":    events_data,
    }


# ── Search ────────────────────────────────────────────────────

@router.get("/search")
def search(q: str, db: Session = Depends(get_db)):
    if not q or len(q) < 2:
        return {"results": []}

    tournaments = (
        db.query(Tournament)
        .filter(
            Tournament.is_active == True,
            or_(
                Tournament.name.ilike(f"%{q}%"),
                Tournament.city.ilike(f"%{q}%"),
                Tournament.venue.ilike(f"%{q}%"),
            ),
        )
        .options(joinedload(Tournament.events), joinedload(Tournament.organization))
        .limit(10)
        .all()
    )

    return {"results": [_tournament_summary(t, db) for t in tournaments]}


# ── Public registration ───────────────────────────────────────

@router.post("/tournaments/{tournament_id}/register")
def public_register(
    tournament_id: int,
    data: PublicRegistration,
    db: Session = Depends(get_db),
):
    """Public registration — no auth required. Creates player + enrolls in events."""
    tournament = db.query(Tournament).filter(
        Tournament.tournament_id == tournament_id,
        Tournament.is_active == True,
    ).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if tournament.status != "registration":
        raise HTTPException(
            status_code=400,
            detail="This tournament is not currently accepting registrations",
        )

    # Deduplicate by phone
    player = None
    if data.phone:
        player = db.query(Player).filter(
            Player.phone == data.phone.strip()
        ).first()

    if not player:
        player = Player(
            name=data.name.strip(),
            phone=data.phone.strip() if data.phone else None,
            age=data.age,
            gender=data.gender,
            org_id=tournament.org_id,
        )
        db.add(player)
        db.flush()

    # Resolve target events
    if data.event_ids:
        target_events = db.query(Event).filter(
            Event.tournament_id == tournament_id,
            Event.event_id.in_(data.event_ids),
            Event.is_active == True,
        ).all()
    else:
        target_events = db.query(Event).filter(
            Event.tournament_id == tournament_id,
            Event.is_active == True,
        ).all()

    enrolled = []
    for event in target_events:
        already = db.query(EventParticipant).filter(
            EventParticipant.event_id == event.event_id,
            EventParticipant.player_id == player.player_id,
        ).first()
        if already:
            continue
        db.add(EventParticipant(
            event_id=event.event_id,
            player_id=player.player_id,
            group_id=None,
            seed=None,
        ))
        enrolled.append(event.event_id)

    db.commit()

    return {
        "ok":             True,
        "player_id":      player.player_id,
        "name":           player.name,
        "enrolled_events":enrolled,
        "message":        f"Successfully registered for {tournament.name}",
    }


# ── Serialization ─────────────────────────────────────────────

def _serialize_match(m: Match) -> dict:
    parts = sorted(m.participants, key=lambda p: p.position)
    p1 = parts[0] if len(parts) > 0 else None
    p2 = parts[1] if len(parts) > 1 else None
    sets = sorted(m.sets, key=lambda s: s.set_number) if m.sets else []

    def _name(p):
        if not p:
            return "TBD"
        if p.team:
            return p.team.name
        if p.player:
            return p.player.name
        return "TBD"

    return {
        "match_id":       m.match_id,
        "event_id":       m.event_id,
        "stage":          m.stage,
        "round":          m.round,
        "status":         m.status,
        "table_number":   m.table_number,
        "current_server": m.current_server,
        "player_1": {
            "name":      _name(p1),
            "score":     p1.score      if p1 else 0,
            "is_winner": p1.is_winner  if p1 else False,
        },
        "player_2": {
            "name":      _name(p2),
            "score":     p2.score      if p2 else 0,
            "is_winner": p2.is_winner  if p2 else False,
        },
        "sets": [
            {
                "set_number": s.set_number,
                "score_p1":   s.score_p1,
                "score_p2":   s.score_p2,
                "winner":     s.winner_position,
                "is_complete":s.is_complete,
            }
            for s in sets
        ],
    }