import os
from fastapi import APIRouter, HTTPException
from jose import jwt
from datetime import datetime, timedelta
from schemas import LoginRequest, TokenOut
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey_changeme")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8

def create_token(data: dict):
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({**data, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

@router.post("/login", response_model=TokenOut)
def login(req: LoginRequest):
    if req.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Incorrect password")
    token = create_token({"role": "admin"})
    return TokenOut(access_token=token)
