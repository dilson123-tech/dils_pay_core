# backend/app/core/security.py
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
import jwt  # PyJWT
from passlib.context import CryptContext

# -------------------- Config via ENV --------------------
ALGORITHM = os.getenv("ALGORITHM", "HS256")

SECRET_KEY = os.getenv("SECRET_KEY", "dev-change-me")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))

# Refresh usa outra chave (pode ser igual em dev)
REFRESH_SECRET_KEY = os.getenv("REFRESH_SECRET_KEY", SECRET_KEY)
REFRESH_TOKEN_EXPIRE_MINUTES = int(os.getenv("REFRESH_TOKEN_EXPIRE_MINUTES", "43200"))  # 30 dias

# -------------------- Password hashing --------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

# -------------------- JWT helpers --------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)

def create_access_token(*, sub: str, extra: dict | None = None, minutes: int | None = None) -> str:
    """Gera Access Token (type=access). `minutes` sobrescreve o default se passado."""
    now = _now()
    exp_min = minutes if minutes is not None else ACCESS_TOKEN_EXPIRE_MINUTES
    payload = {
        "sub": sub,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=exp_min)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(*, sub: str, extra: dict | None = None, minutes: int | None = None) -> str:
    """Gera Refresh Token (type=refresh)."""
    now = _now()
    exp_min = minutes if minutes is not None else REFRESH_TOKEN_EXPIRE_MINUTES
    payload = {
        "sub": sub,
        "type": "refresh",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=exp_min)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, REFRESH_SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str, *, expect: str = "access") -> dict:
    """Decodifica e valida tipo do token ('access' ou 'refresh')."""
    key = REFRESH_SECRET_KEY if expect == "refresh" else SECRET_KEY
    data = jwt.decode(token, key, algorithms=[ALGORITHM])
    if data.get("type") != expect:
        raise jwt.InvalidTokenError("wrong token type")
    return data
