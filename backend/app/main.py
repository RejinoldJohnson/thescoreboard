"""
TheScoreBoard API — main application.
"""
import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
from app.routers import auth, organizations, tournaments, events, players, matches, public, teams

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Dev convenience — Alembic handles migrations in prod
Base.metadata.create_all(bind=engine)

app = FastAPI(title=f"{settings.APP_NAME} API", version=settings.VERSION)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all so every error shows in the backend console."""
    logger.error(f"Unhandled error on {request.method} {request.url}:")
    logger.error(traceback.format_exc())
    return JSONResponse(status_code=500, content={"detail": str(exc)})

# ── CORS Configuration ────────────────────────────────────────
# Support comma-separated origins: "https://dev.thescoreboard.in,http://localhost:5173"
allowed_origins = []
if settings.FRONTEND_URL == "*":
    allowed_origins = ["*"]
else:
    # Split by comma and strip whitespace
    allowed_origins = [origin.strip() for origin in settings.FRONTEND_URL.split(",") if origin.strip()]

logger.info(f"CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Authenticated routes (organizers) ─────────────────────────
app.include_router(auth.router,          prefix="/api/auth",    tags=["auth"])
app.include_router(organizations.router, prefix="/api/orgs",    tags=["organizations"])
app.include_router(tournaments.router,   prefix="/api/orgs",    tags=["tournaments"])
app.include_router(events.router,        prefix="/api",         tags=["events"])
app.include_router(players.router,       prefix="/api/players", tags=["players"])
app.include_router(matches.router,       prefix="/api",         tags=["matches"])
app.include_router(teams.router, prefix="/api", tags=["teams"])

# ── Public routes (spectators, no auth) ───────────────────────
app.include_router(public.router,        prefix="/api/public",  tags=["public"])


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.ENV}
