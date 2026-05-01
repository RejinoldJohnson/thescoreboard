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

# Run alembic migrations on startup (handles prod deploys automatically)
try:
    from alembic.config import Config
    from alembic import command as alembic_command
    import os
    alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    alembic_command.upgrade(alembic_cfg, "head")
    logger.info("Alembic migrations applied.")
except Exception as _mig_err:
    logger.warning(f"Alembic migration skipped: {_mig_err}")
    # Fall back to create_all for local dev without a DB URL
    Base.metadata.create_all(bind=engine)

app = FastAPI(title=f"{settings.APP_NAME} API", version=settings.VERSION)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all so every error shows in the backend console."""
    logger.error(f"Unhandled error on {request.method} {request.url}:")
    logger.error(traceback.format_exc())
    return JSONResponse(status_code=500, content={"detail": str(exc)})

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL] if settings.FRONTEND_URL != "*" else ["*"],
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