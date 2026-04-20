from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class EventCreate(BaseModel):
    name: str
    sport_key: str                          # e.g. "table_tennis"
    format: str = "group_knockout"          # group_knockout | direct_knockout | round_robin
    participant_type: str = "individual"    # individual | team
    sport_config: Optional[dict] = None     # sport-specific overrides


class EventUpdate(BaseModel):
    name: Optional[str] = None
    format: Optional[str] = None
    sport_config: Optional[dict] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None


class EventOut(BaseModel):
    event_id: int
    tournament_id: int
    name: str
    sport_key: str
    format: str
    participant_type: str
    sport_config: Optional[dict]
    status: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
