from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class OrgCreate(BaseModel):
    name: str
    description: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None


class OrgOut(BaseModel):
    org_id: int
    name: str
    slug: str
    description: Optional[str]
    city: Optional[str]
    state: Optional[str]
    logo_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
