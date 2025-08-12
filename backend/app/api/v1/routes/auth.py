from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.auth import RegisterIn, LoginIn, TokenOut
from app.core.security import hash_password, verify_password, create_access_token
from app.models.user import User
from app.models.wallet import Wallet

router = APIRouter()

@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email já cadastrado")
    if db.query(User).filter(User.cpf == payload.cpf).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "CPF já cadastrado")

    u = User(
        nome=payload.nome,
        email=payload.email,
        cpf=payload.cpf,
        senha_hash=hash_password(payload.senha)
    )
    db.add(u); db.flush()
    w = Wallet(user_id=u.id, saldo_atual=0)
    db.add(w); db.commit()
    return TokenOut(access_token=create_access_token(sub=str(u.id)))

@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.email == payload.email).first()
    if not u or not verify_password(payload.senha, u.senha_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciais inválidas")
    return TokenOut(access_token=create_access_token(sub=str(u.id)))
