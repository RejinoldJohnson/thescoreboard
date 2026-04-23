from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


class EventInput(BaseModel):
    """Event to create as part of tournament creation wizard."""
    name: str
    sport_key: str
    format: str = "group_knockout"
    participant_type: str = "individual"   # individual | doubles_pair | team
    sport_config: Optional[dict] = None
    squad_size:   Optional[int] = None    # cricket
    team_size:    Optional[int] = None    # football (players on field)
    substitutes:  Optional[int] = None    # football (bench size)


class TournamentCreate(BaseModel):
    """Step 1-5 of creation wizard combined."""
    name: str
    venue: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_multi_sport: bool = False
    is_published: bool = False
    primary_color: Optional[str] = None
    events: List[EventInput] = []


class TournamentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    venue: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    is_published: Optional[bool] = None


class SponsorOut(BaseModel):
    sponsor_id: int
    name: str
    logo_url: Optional[str]
    tier: str
    website: Optional[str]

    class Config:
        from_attributes = True


class TournamentOut(BaseModel):
    tournament_id: int
    org_id: int
    name: str
    slug: str
    description: Optional[str]
    is_multi_sport: bool
    start_date: Optional[date]
    end_date: Optional[date]
    poster_url: Optional[str]
    banner_url: Optional[str]
    primary_color: Optional[str]
    secondary_color: Optional[str]
    venue: Optional[str]
    city: Optional[str]
    state: Optional[str]
    status: str
    is_active: bool
    is_published: bool
    created_at: datetime
    sponsors: List[SponsorOut] = []

    class Config:
        from_attributes = True