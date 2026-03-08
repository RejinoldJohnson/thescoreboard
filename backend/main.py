from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import players, matches, auth, tournaments
import schemas # This must be plural to match your file name

# This triggers the table creation in Supabase
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Table Tennis Tournament API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Fine for initial deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(tournaments.router, prefix="/api/tournaments", tags=["tournaments"])
app.include_router(players.router, prefix="/api/players", tags=["players"])
app.include_router(matches.router, prefix="/api/matches", tags=["matches"])

@app.get("/api/health")
def health():
    return {"status": "ok"}