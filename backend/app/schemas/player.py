from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PlayerCreate(BaseModel):
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class PlayerOut(BaseModel):
    player_id: int
    name: str
    age: Optional[int]
    gender: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class TeamCreate(BaseModel):
    name: str
    player_ids: list[int] = []


class TeamOut(BaseModel):
    team_id: int
    name: str
    members: list[PlayerOut] = []

    class Config:
        from_attributes = True


class EventParticipantOut(BaseModel):
    ep_id: int
    player: Optional[PlayerOut] = None
    team: Optional[TeamOut] = None
    group_name: Optional[str] = None
    seed: Optional[int] = None
    status: str

    class Config:
        from_attributes = True
