# backend/app/api/v1/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Tuple, Dict
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database.session import get_db
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)

router = APIRouter(tags=["auth"])


class LoginJSON(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    password: str


# ---------- helpers ----------
def _users_columns(db: Session) -> List[str]:
    cols = []
    try:
        res = db.execute(text("PRAGMA table_info(users);"))
        cols = [row[1] for row in res]  # (cid, name, type, notnull, dflt_value, pk)
    except Exception:
        pass
    return cols


def _pick_existing(candidates: List[str], cols: List[str]) -> List[str]:
    return [c for c in candidates if c in cols]


def _find_user_row(db: Session, key: str) -> Tuple[Optional[Dict], List[str]]:
    cols = _users_columns(db)
    if not cols:
        raise HTTPException(status_code=500, detail="Tabela 'users' não encontrada")

    user_keys = _pick_existing(["username", "email", "login", "usuario"], cols)
    if not user_keys:
        raise HTTPException(status_code=500, detail="Nenhuma coluna de login reconhecida em 'users'")

    where = " OR ".join([f"{c} = :key" for c in user_keys])
    sql = text(f"SELECT * FROM users WHERE {where} LIMIT 1;")
    row = db.execute(sql, {"key": key}).mappings().first()
    return (dict(row) if row else None, cols)


def _extract_hash(user_row: Dict, cols: List[str]) -> Optional[str]:
    for c in ["hashed_password", "password_hash", "senha_hash", "password", "senha"]:
        if c in cols and user_row.get(c):
            return user_row[c]
    return None


def _user_id_and_label(user_row: Dict, cols: List[str]) -> Tuple[str, Optional[str]]:
    uid = str(user_row.get("id") or user_row.get("user_id") or "0")
    label = None
    for c in ["email", "username", "login", "usuario"]:
        if c in cols and user_row.get(c):
            label = str(user_row[c])
            break
    return uid, label


# ---------- rotas ----------
@router.post("/login")
async def login(request: Request, db: Session = Depends(get_db)):
    ctype = (request.headers.get("content-type") or "").lower()

    # JSON
    if "application/json" in ctype:
        try:
            data = await request.json()
            payload = LoginJSON.model_validate(data)
        except Exception:
            raise HTTPException(status_code=422, detail="JSON inválido")

        key = payload.username or payload.email
        if not key:
            raise HTTPException(status_code=422, detail="Informe username/login ou email")

        user_row, cols = _find_user_row(db, str(key))
        if not user_row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")

        pwd_hash = _extract_hash(user_row, cols)
        if not pwd_hash or not verify_password(payload.password, pwd_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

        uid, label = _user_id_and_label(user_row, cols)
        tok = create_access_token(sub=uid, extra={"user": label})
        rtok = create_refresh_token(sub=uid, extra={"user": label})
        return {"access_token": tok, "refresh_token": rtok, "token_type": "bearer"}

    # FORM (x-www-form-urlencoded / multipart)
    raw = (await request.body()).decode(errors="ignore")
    from urllib.parse import parse_qs

    q = parse_qs(raw)
    key = (q.get("username") or q.get("email") or q.get("login") or q.get("usuario") or [""])[0]
    password = (q.get("password") or q.get("senha") or [""])[0]
    if not key or not password:
        raise HTTPException(status_code=422, detail="Payload inválido")

    user_row, cols = _find_user_row(db, key)
    if not user_row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")
    pwd_hash = _extract_hash(user_row, cols)
    if not pwd_hash or not verify_password(password, pwd_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")
    uid, label = _user_id_and_label(user_row, cols)
    tok = create_access_token(sub=uid, extra={"user": label})
    rtok = create_refresh_token(sub=uid, extra={"user": label})
    return {"access_token": tok, "refresh_token": rtok, "token_type": "bearer"}


class RefreshIn(BaseModel):
    refresh_token: Optional[str] = None


@router.post("/refresh")
async def refresh(body: RefreshIn | None = None, request: Request = None):
    # aceita no JSON body ou em cookie
    rtok = (body and body.refresh_token) or (request.cookies.get("refresh_token") if request else None)
    if not rtok:
        raise HTTPException(status_code=422, detail="refresh_token ausente")
    try:
        data = decode_token(rtok, expect="refresh")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh inválido")

    sub = str(data.get("sub") or "0")
    user = data.get("user")
    atok = create_access_token(sub=sub, extra={"user": user})
    return {"access_token": atok, "token_type": "bearer"}
