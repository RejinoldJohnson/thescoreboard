"""
Auth routes — email/password register & login, Google SSO, player profile.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.player import Player
from app.models.organization import OrgMember
from app.models.group import EventParticipant
from app.models.event import Event
from app.models.tournament import Tournament
from app.models.match import Match, MatchParticipant
from app.schemas.auth import (
    RegisterRequest, LoginRequest, GoogleAuthRequest,
    TokenOut, UserOut, PlayerProfileIn, PlayerProfileOut,
)
from app.utils.auth import hash_password, verify_password, create_access_token, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Email / password ──────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        name=req.name,
        phone=req.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


@router.post("/login", response_model=TokenOut)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email, User.is_active != False).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


# ── Google SSO ────────────────────────────────────────────────────────────────

@router.post("/google", response_model=TokenOut)
def google_auth(req: GoogleAuthRequest, db: Session = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google login is not configured on this server")

    try:
        import httpx
        resp = httpx.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {req.access_token}"},
            timeout=5.0,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google token")
        info = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Google userinfo request failed: %s", e)
        raise HTTPException(status_code=401, detail="Could not verify Google token")

    google_id  = info["sub"]
    email      = info["email"]
    name       = info.get("name", email.split("@")[0])
    avatar_url = info.get("picture")

    user = db.query(User).filter(User.google_id == google_id).first()
    if user is None:
        user = db.query(User).filter(User.email == email).first()

    if user is None:
        user = User(
            email=email,
            password_hash=None,
            name=name,
            google_id=google_id,
            avatar_url=avatar_url,
        )
        db.add(user)
    else:
        if user.google_id is None:
            user.google_id = google_id
        if avatar_url:
            user.avatar_url = avatar_url

    if user.is_active is False:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    db.commit()
    db.refresh(user)

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


# ── Current user ──────────────────────────────────────────────────────────────

def _compute_roles(user: User, db: Session) -> list[str]:
    """Derive roles from DB state — no roles column on User."""
    roles = ["player"]  # every authenticated user is a player
    has_org = db.query(OrgMember).filter(OrgMember.user_id == user.user_id).first()
    if has_org:
        roles.append("organiser")
    if user.is_superadmin:
        roles.append("superadmin")
    return roles


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(Player).filter(Player.user_id == user.user_id).first()
    result = UserOut.model_validate(user)
    if profile:
        result.player_profile = PlayerProfileOut.model_validate(profile)
    result.roles = _compute_roles(user, db)
    return result


# ── Player profile ────────────────────────────────────────────────────────────

@router.get("/player-profile")
def get_player_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(Player).filter(Player.user_id == user.user_id).first()
    if not profile:
        return None
    return PlayerProfileOut.model_validate(profile)


@router.put("/player-profile", response_model=PlayerProfileOut)
def save_player_profile(
    req: PlayerProfileIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Player).filter(Player.user_id == user.user_id).first()
    if not profile:
        profile = Player(
            user_id=user.user_id,
            name=req.name,
            phone=req.phone,
            age=req.age,
            gender=req.gender or "Male",
            location=req.location,
            email=user.email,
        )
        db.add(profile)
    else:
        profile.name     = req.name
        profile.phone    = req.phone    or profile.phone
        profile.age      = req.age      if req.age      is not None else profile.age
        profile.gender   = req.gender   or profile.gender
        profile.location = req.location or profile.location
    db.commit()
    db.refresh(profile)
    return PlayerProfileOut.model_validate(profile)


# ── Player history endpoints ──────────────────────────────────────────────────

_STAGE_ORDER = {"group": 0, "quarter": 1, "semi": 2, "third_place": 3, "final": 4}
_STAGE_LABELS = {
    "group": "Group Stage",
    "quarter": "Quarter-Final",
    "semi": "Semi-Final",
    "third_place": "Third Place",
    "final": "Final",
}


def _stage_reached_label(stage: str, won: bool) -> str:
    if stage == "final":
        return "Champion" if won else "Runner-up"
    if stage == "third_place":
        return "3rd Place" if won else "4th Place"
    return _STAGE_LABELS.get(stage, stage.replace("_", " ").title())


def _best_finish_for_player(db: Session, player_ids: list[int], tournament_id: int) -> str | None:
    """Return the best finish label for these player_ids within a tournament."""
    rows = (
        db.query(Match, MatchParticipant)
        .join(MatchParticipant, MatchParticipant.match_id == Match.match_id)
        .join(Event, Event.event_id == Match.event_id)
        .filter(
            Event.tournament_id == tournament_id,
            MatchParticipant.player_id.in_(player_ids),
            Match.status == "done",
        )
        .all()
    )
    if not rows:
        return None
    best_row = max(rows, key=lambda r: _STAGE_ORDER.get(r[0].stage or "group", 0))
    match, mp = best_row
    return _stage_reached_label(match.stage or "group", bool(mp.is_winner))


@router.get("/my-tournaments")
def get_my_tournaments(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all tournaments the authenticated user has registered in."""
    players = db.query(Player).filter(Player.user_id == user.user_id).all()
    if not players:
        return []

    player_ids = [p.player_id for p in players]

    eps = (
        db.query(EventParticipant)
        .filter(EventParticipant.player_id.in_(player_ids))
        .all()
    )
    if not eps:
        return []

    # Deduplicate by tournament; keep first ep per tournament
    seen: dict[int, dict] = {}
    for ep in eps:
        event = db.query(Event).filter(Event.event_id == ep.event_id).first()
        if not event:
            continue
        t = db.query(Tournament).filter(
            Tournament.tournament_id == event.tournament_id,
            Tournament.is_active == True,
        ).first()
        if not t:
            continue
        tid = t.tournament_id
        if tid not in seen:
            seen[tid] = {
                "tournament_id": t.tournament_id,
                "name": t.name,
                "slug": t.slug,
                "status": t.status,
                "sport_key": event.sport_key,
                "event_name": event.name,
                "start_date": t.start_date.isoformat() if t.start_date else None,
                "end_date": t.end_date.isoformat() if t.end_date else None,
                "city": t.city,
                "participant_status": ep.status,
                "stage_reached": _best_finish_for_player(db, player_ids, tid),
            }

    result = list(seen.values())
    status_order = {"live": 0, "registration": 1, "upcoming": 1, "fixtures": 2,
                    "completed": 3, "cancelled": 4}
    result.sort(key=lambda x: (status_order.get(x["status"], 9), x["start_date"] or ""))
    return result


@router.get("/my-stats")
def get_my_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return match stats for the authenticated user."""
    players = db.query(Player).filter(Player.user_id == user.user_id).all()
    empty = {
        "tournaments_count": 0, "matches_played": 0,
        "wins": 0, "losses": 0, "win_pct": 0, "by_sport": {},
    }
    if not players:
        return empty

    player_ids = [p.player_id for p in players]

    # Tournament count
    eps = db.query(EventParticipant).filter(EventParticipant.player_id.in_(player_ids)).all()
    tournament_ids: set[int] = set()
    event_sport_cache: dict[int, str] = {}
    for ep in eps:
        ev = db.query(Event).filter(Event.event_id == ep.event_id).first()
        if ev:
            tournament_ids.add(ev.tournament_id)
            event_sport_cache[ev.event_id] = ev.sport_key

    # Match stats
    rows = (
        db.query(Match, MatchParticipant)
        .join(MatchParticipant, MatchParticipant.match_id == Match.match_id)
        .filter(
            MatchParticipant.player_id.in_(player_ids),
            Match.status == "done",
        )
        .all()
    )

    matches_played = len(rows)
    wins   = sum(1 for _, mp in rows if mp.is_winner)
    losses = matches_played - wins
    win_pct = round(wins / matches_played * 100) if matches_played else 0

    # Per-sport breakdown
    by_sport: dict[str, dict] = {}
    for match, mp in rows:
        sport_key = event_sport_cache.get(match.event_id)
        if not sport_key:
            ev = db.query(Event).filter(Event.event_id == match.event_id).first()
            sport_key = ev.sport_key if ev else "unknown"
            if sport_key != "unknown":
                event_sport_cache[match.event_id] = sport_key
        if sport_key not in by_sport:
            by_sport[sport_key] = {"matches": 0, "wins": 0, "losses": 0, "win_pct": 0, "best_finish": None}
        by_sport[sport_key]["matches"] += 1
        if mp.is_winner:
            by_sport[sport_key]["wins"] += 1
        else:
            by_sport[sport_key]["losses"] += 1

    # Compute per-sport win_pct and best_finish
    all_tids = list(tournament_ids)
    for sport_key, data in by_sport.items():
        m = data["matches"]
        data["win_pct"] = round(data["wins"] / m * 100) if m else 0
        # Best finish across all tournaments for this sport
        best_label = None
        best_rank = -1
        FINISH_RANK = {
            "Champion": 6, "Runner-up": 5, "3rd Place": 4, "4th Place": 3,
            "Semi-Final": 2, "Quarter-Final": 1, "Group Stage": 0,
        }
        for tid in all_tids:
            label = _best_finish_for_player(db, player_ids, tid)
            if label and FINISH_RANK.get(label, -1) > best_rank:
                best_rank = FINISH_RANK[label]
                best_label = label
        data["best_finish"] = best_label

    return {
        "tournaments_count": len(tournament_ids),
        "matches_played": matches_played,
        "wins": wins,
        "losses": losses,
        "win_pct": win_pct,
        "by_sport": by_sport,
    }
