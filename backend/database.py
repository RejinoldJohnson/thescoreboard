import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(
    DATABASE_URL,

    # Keep 10 connections open and ready — no cold-start per request
    pool_size=10,

    # Allow up to 20 total connections under heavy load
    max_overflow=20,

    # If a connection has been idle for 10 min, recycle it
    # Supabase closes idle connections after ~5 min so this prevents stale conn errors
    pool_recycle=600,

    # Test connection health before handing it to a request
    # Catches dropped connections without throwing errors to the user
    pool_pre_ping=True,

    # How long to wait for a connection from the pool before giving up
    pool_timeout=30,

    # Supabase pooler (pgbouncer) works best in transaction mode —
    # prepared statements must be disabled
    connect_args={
        "options": "-c statement_timeout=10000",  # 10s max per query
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    },
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()