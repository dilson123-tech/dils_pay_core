from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.models.wallet import Wallet

router = APIRouter()

@router.get("/wallets")
def list_wallets(db: Session = Depends(get_db)):
    rows = (
        db.query(Wallet.id, Wallet.user_id, Wallet.saldo_atual, Wallet.criado_em)
          .order_by(Wallet.id.asc())
          .all()
    )
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "saldo": float(r.saldo_atual or 0),
            "criado_em": r.criado_em.isoformat() if r.criado_em else None,
        }
        for r in rows
    ]
