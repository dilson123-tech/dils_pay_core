from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.wallet import Wallet

router = APIRouter()

@router.get("/wallets/{user_id}")
def get_wallet(user_id: int, db: Session = Depends(get_db)):
    w = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if not w:
        raise HTTPException(404, "Wallet não encontrada")
    return {"user_id": user_id, "wallet_id": w.id, "saldo": str(w.saldo_atual)}
