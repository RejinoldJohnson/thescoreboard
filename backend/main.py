from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import players, matches, auth, tournaments
import schemas
import os

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Table Tennis Tournament API", version="1.0.0")

# Allow requests from your frontend URL
# Set FRONTEND_URL env variable on Render to your static site URL
# e.g. https://tt-tournament.onrender.com
FRONTEND_URL = os.getenv("FRONTEND_URL", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL] if FRONTEND_URL != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,        prefix="/api/auth",        tags=["auth"])
app.include_router(tournaments.router, prefix="/api/tournaments",  tags=["tournaments"])
app.include_router(players.router,     prefix="/api/players",      tags=["players"])
app.include_router(matches.router,     prefix="/api/matches",      tags=["matches"])

@app.get("/api/health")
def health():
    return {"status": "ok"}