"""
Auth routes — email/password register & login, Google SSO, player profile.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.player import Player
from app.schemas.auth import (
    RegisterRequest, LoginRequest, GoogleAuthRequest,
    TokenOut, UserOut, PlayerProfileIn, PlayerProfileOut,
)
from app.utils.auth import hash_password, verify_password, create_access_token, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Email / password ──────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        name=req.name,
        phone=req.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


@router.post("/login", response_model=TokenOut)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email, User.is_active != False).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


# ── Google SSO ────────────────────────────────────────────────────────────────

@router.post("/google", response_model=TokenOut)
def google_auth(req: GoogleAuthRequest, db: Session = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google login is not configured on this server")

    try:
        import httpx
        resp = httpx.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {req.access_token}"},
            timeout=5.0,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google token")
        info = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Google userinfo request failed: %s", e)
        raise HTTPException(status_code=401, detail="Could not verify Google token")

    google_id  = info["sub"]
    email      = info["email"]
    name       = info.get("name", email.split("@")[0])
    avatar_url = info.get("picture")

    user = db.query(User).filter(User.google_id == google_id).first()
    if user is None:
        user = db.query(User).filter(User.email == email).first()

    if user is None:
        user = User(
            email=email,
            password_hash=None,
            name=name,
            google_id=google_id,
            avatar_url=avatar_url,
        )
        db.add(user)
    else:
        if user.google_id is None:
            user.google_id = google_id
        if avatar_url:
            user.avatar_url = avatar_url

    if user.is_active is False:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    db.commit()
    db.refresh(user)

    token = create_access_token(user.user_id, user.email)
    return TokenOut(access_token=token)


# ── Current user ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(Player).filter(Player.user_id == user.user_id).first()
    result = UserOut.model_validate(user)
    if profile:
        result.player_profile = PlayerProfileOut.model_validate(profile)
    return result


# ── Player profile ────────────────────────────────────────────────────────────

@router.get("/player-profile")
def get_player_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(Player).filter(Player.user_id == user.user_id).first()
    if not profile:
        return None
    return PlayerProfileOut.model_validate(profile)


@router.put("/player-profile", response_model=PlayerProfileOut)
def save_player_profile(
    req: PlayerProfileIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Player).filter(Player.user_id == user.user_id).first()
    if not profile:
        profile = Player(
            user_id=user.user_id,
            name=req.name,
            phone=req.phone,
            age=req.age,
            gender=req.gender or "Male",
            location=req.location,
            email=user.email,
        )
        db.add(profile)
    else:
        profile.name     = req.name
        profile.phone    = req.phone    or profile.phone
        profile.age      = req.age      if req.age      is not None else profile.age
        profile.gender   = req.gender   or profile.gender
        profile.location = req.location or profile.location
    db.commit()
    db.refresh(profile)
    return PlayerProfileOut.model_validate(profile)
