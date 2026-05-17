"""
Social share router — OG meta-tag HTML pages and OG image endpoints.

GET /api/share/t/{slug}              → HTML with OG tags + JS redirect (crawlers see tags, users get redirected)
GET /api/share/og/tournament/{slug}.png → 1200×630 tournament card PNG (cached in Supabase og-cache)
GET /api/share/og/match/{match_id}.png  → 1200×630 match card PNG (cached in Supabase og-cache)
"""
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models.match import Match, MatchParticipant, MatchSet
from app.models.tournament import Tournament
from app.services import storage, og_generator

logger = logging.getLogger(__name__)
router = APIRouter()

SPORT_LABELS = {
    "cricket":      "Cricket",
    "football":     "Football",
    "badminton":    "Badminton",
    "table_tennis": "Table Tennis",
}

_OG_BUCKET = settings.BUCKET_OG_CACHE


# ── Helpers ───────────────────────────────────────────────────────────────────

def _og_redirect_html(
    title: str,
    description: str,
    image_url: str,
    redirect_url: str,
    url: str,
) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>{title}</title>
  <meta property="og:title"       content="{title}"/>
  <meta property="og:description" content="{description}"/>
  <meta property="og:image"       content="{image_url}"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:url"         content="{url}"/>
  <meta property="og:type"        content="website"/>
  <meta name="twitter:card"       content="summary_large_image"/>
  <meta name="twitter:title"      content="{title}"/>
  <meta name="twitter:description" content="{description}"/>
  <meta name="twitter:image"      content="{image_url}"/>
  <script>window.location.replace("{redirect_url}")</script>
</head>
<body>
  <p>Redirecting… <a href="{redirect_url}">Click here if not redirected.</a></p>
</body>
</html>"""


def _cached_png(cache_key: str, generate_fn) -> bytes:
    """Return cached PNG bytes from Supabase, or generate + cache + return."""
    if settings.supabase_configured:
        try:
            pub = storage.get_public_url(_OG_BUCKET, cache_key)
            import httpx
            r = httpx.get(pub, timeout=5, follow_redirects=True)
            if r.status_code == 200:
                return r.content
        except Exception:
            pass

    png = generate_fn()

    if settings.supabase_configured:
        try:
            storage.upload_bytes(_OG_BUCKET, cache_key, png, "image/png", upsert=True)
        except Exception as exc:
            logger.warning("OG cache upload failed: %s", exc)

    return png


# ── Tournament share page ─────────────────────────────────────────────────────

@router.get("/t/{slug}", response_class=HTMLResponse)
def share_tournament(slug: str, db: Session = Depends(get_db)):
    t = db.query(Tournament).filter(Tournament.slug == slug, Tournament.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")

    sport_keys = list({e.sport_key for e in t.events if e.is_active})
    sport_label = SPORT_LABELS.get(sport_keys[0]) if len(sport_keys) == 1 else "Multi-Sport"

    title = t.name
    desc_parts = [p for p in [sport_label, t.city, t.venue] if p]
    description = " · ".join(desc_parts) if desc_parts else "Live tournament on TheScoreBoard"

    image_url  = f"{settings.APP_URL}/api/share/og/tournament/{slug}.png"
    share_url  = f"{settings.APP_URL}/api/share/t/{slug}"
    spa_url    = f"{settings.SITE_URL}/t/{slug}"

    return HTMLResponse(_og_redirect_html(title, description, image_url, spa_url, share_url))


# ── Tournament OG image ───────────────────────────────────────────────────────

@router.get("/og/tournament/{slug}.png")
def og_tournament_image(slug: str, db: Session = Depends(get_db)):
    t = db.query(Tournament).filter(Tournament.slug == slug, Tournament.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")

    sport_keys = list({e.sport_key for e in t.events if e.is_active})
    sport_label = SPORT_LABELS.get(sport_keys[0]) if len(sport_keys) == 1 else "Multi-Sport"

    start = t.start_date.strftime("%d %b %Y") if t.start_date else None
    end   = t.end_date.strftime("%d %b %Y")   if t.end_date   else None

    cache_key = f"tournament/{slug}.png"

    def _gen():
        return og_generator.generate_tournament_card(
            name=t.name,
            status=t.status,
            sport_label=sport_label,
            city=t.city,
            venue=t.venue,
            start_date=start,
            end_date=end,
            primary_color=t.primary_color,
        )

    png = _cached_png(cache_key, _gen)
    return Response(content=png, media_type="image/png", headers={
        "Cache-Control": "public, max-age=3600",
    })


# ── Match share page ──────────────────────────────────────────────────────────

@router.get("/m/{match_id}", response_class=HTMLResponse)
def share_match(match_id: int, db: Session = Depends(get_db)):
    match = (
        db.query(Match)
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.event),
        )
        .filter(Match.match_id == match_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    parts = sorted(match.participants, key=lambda p: p.position)
    t1 = parts[0].player.name if len(parts) > 0 else "TBD"
    t2 = parts[1].player.name if len(parts) > 1 else "TBD"

    title = f"{t1} vs {t2}"
    event_name = match.event.name if match.event else ""
    description = f"{event_name} · Live on TheScoreBoard" if event_name else "Live on TheScoreBoard"

    tournament_slug = match.event.tournament.slug if (match.event and match.event.tournament) else "tournament"

    image_url  = f"{settings.APP_URL}/api/share/og/match/{match_id}.png"
    share_url  = f"{settings.APP_URL}/api/share/m/{match_id}"
    spa_url    = f"{settings.SITE_URL}/t/{tournament_slug}"

    return HTMLResponse(_og_redirect_html(title, description, image_url, spa_url, share_url))


# ── Match OG image ────────────────────────────────────────────────────────────

@router.get("/og/match/{match_id}.png")
def og_match_image(match_id: int, db: Session = Depends(get_db)):
    match = (
        db.query(Match)
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.sets),
            joinedload(Match.event),
        )
        .filter(Match.match_id == match_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    parts = sorted(match.participants, key=lambda p: p.position)
    t1 = parts[0].player.name if len(parts) > 0 else "TBD"
    t2 = parts[1].player.name if len(parts) > 1 else "TBD"

    # Compute scores from sets
    score1 = score2 = None
    if match.sets:
        s1 = sum(1 for s in match.sets if s.winner_position == 1)
        s2 = sum(1 for s in match.sets if s.winner_position == 2)
        score1, score2 = str(s1), str(s2)
    elif match.score_a is not None and match.score_b is not None:
        score1, score2 = str(match.score_a), str(match.score_b)

    sport_key    = match.event.sport_key if match.event else None
    sport_label  = SPORT_LABELS.get(sport_key) if sport_key else None
    round_label  = match.round_name
    t_name       = match.event.tournament.name if (match.event and match.event.tournament) else None
    t_color      = match.event.tournament.primary_color if (match.event and match.event.tournament) else None

    cache_key = f"match/{match_id}_{match.status}.png"

    def _gen():
        return og_generator.generate_match_card(
            team1=t1,
            team2=t2,
            score1=score1,
            score2=score2,
            status=match.status,
            round_label=round_label,
            tournament_name=t_name,
            sport_label=sport_label,
            primary_color=t_color,
        )

    # Live matches: skip cache so score is always fresh
    if match.status == "live":
        png = _gen()
    else:
        png = _cached_png(cache_key, _gen)

    return Response(content=png, media_type="image/png", headers={
        "Cache-Control": "public, max-age=60" if match.status == "live" else "public, max-age=3600",
    })
