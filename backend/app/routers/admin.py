"""
Super-admin panel routes.

All endpoints require is_superadmin=True — enforced via get_superadmin dependency.

GET  /admin/users              — list all users with plan + org count
PATCH /admin/users/{id}        — set plan ('free'|'pro') and/or toggle is_active
"""
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.models.tournament import Tournament
from app.utils.auth import get_superadmin

router = APIRouter()

VALID_PLANS = {"free", "pro"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class AdminUserOut(BaseModel):
    user_id: int
    email: str
    name: str
    plan: str
    is_superadmin: bool
    is_active: bool
    org_count: int
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class AdminUserPatch(BaseModel):
    plan: Optional[str] = None        # "free" | "pro"
    is_active: Optional[bool] = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_stats(
    _admin: User = Depends(get_superadmin),
    db: Session = Depends(get_db),
):
    """Platform-wide analytics for the admin dashboard."""
    now = datetime.now(timezone.utc)
    week_ago  = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_users   = db.query(User).count()
    active_users  = db.query(User).filter(User.is_active != False).count()
    pro_users     = db.query(User).filter(User.plan == "pro").count()
    new_7d        = db.query(User).filter(User.created_at >= week_ago).count()
    new_30d       = db.query(User).filter(User.created_at >= month_ago).count()

    total_orgs        = db.query(Organization).count()
    total_tournaments = db.query(Tournament).count()

    # Count per status
    from sqlalchemy import func
    status_rows = db.query(Tournament.status, func.count(Tournament.tournament_id))\
                    .group_by(Tournament.status).all()
    by_status = {row[0]: row[1] for row in status_rows}

    return {
        "users": {
            "total":    total_users,
            "active":   active_users,
            "pro":      pro_users,
            "new_7d":   new_7d,
            "new_30d":  new_30d,
        },
        "orgs": {
            "total": total_orgs,
        },
        "tournaments": {
            "total":        total_tournaments,
            "live":         by_status.get("live", 0),
            "registration": by_status.get("registration", 0),
            "draft":        by_status.get("draft", 0),
            "completed":    by_status.get("completed", 0),
        },
    }


@router.get("/users", response_model=List[AdminUserOut])
def list_users(
    _admin: User = Depends(get_superadmin),
    db: Session = Depends(get_db),
):
    """Return all users ordered by sign-up date (newest first)."""
    from collections import Counter
    users = db.query(User).order_by(User.created_at.desc()).all()
    # Fetch all org memberships in one query and count per user
    memberships = db.query(OrgMember.user_id).all()
    counts = Counter(m.user_id for m in memberships)

    result = []
    for u in users:
        result.append(AdminUserOut(
            user_id=u.user_id,
            email=u.email,
            name=u.name,
            plan=u.plan,
            is_superadmin=u.is_superadmin,
            is_active=u.is_active,
            org_count=counts.get(u.user_id, 0),
            created_at=u.created_at.isoformat() if u.created_at else None,
        ))
    return result


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    data: AdminUserPatch,
    _admin: User = Depends(get_superadmin),
    db: Session = Depends(get_db),
):
    """Update a user's plan or active status."""
    target = db.query(User).filter(User.user_id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if data.plan is not None:
        if data.plan not in VALID_PLANS:
            raise HTTPException(status_code=422, detail=f"plan must be one of {VALID_PLANS}")
        target.plan = data.plan

    if data.is_active is not None:
        # Prevent self-deactivation
        if not data.is_active and target.user_id == _admin.user_id:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
        target.is_active = data.is_active

    db.commit()
    db.refresh(target)

    memberships = db.query(OrgMember).filter(OrgMember.user_id == target.user_id).count()
    return AdminUserOut(
        user_id=target.user_id,
        email=target.email,
        name=target.name,
        plan=target.plan,
        is_superadmin=target.is_superadmin,
        is_active=target.is_active,
        org_count=memberships,
        created_at=target.created_at.isoformat() if target.created_at else None,
    )
