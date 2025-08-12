from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import uuid4
from decimal import Decimal

from app.db.session import get_db
from app.models.pix_invoice import PixInvoice

router = APIRouter()

@router.post("/pix/invoices", status_code=status.HTTP_201_CREATED)
def create_pix_invoice(user_id: int, valor: Decimal, db: Session = Depends(get_db)):
    if valor <= 0:
        raise HTTPException(400, "Valor inválido")

    txid = uuid4().hex[:26]  # tamanho aceitável p/ txid
    inv = PixInvoice(user_id=user_id, txid=txid, valor=valor, status="PENDING")
    db.add(inv); db.commit(); db.refresh(inv)

    # Simulação de QR Code dinâmico (payload fake)
    qr_data = f"0002012636BR.GOV.BCB.PIX01DILSPAY02{txid}520400005303986540{valor:.2f}5802BR"

    return {
        "txid": inv.txid,
        "valor": str(inv.valor),
        "status": inv.status,
        "qr_data": qr_data
    }

@router.get("/pix/invoices/{txid}")
def get_pix_invoice(txid: str, db: Session = Depends(get_db)):
    inv = db.query(PixInvoice).filter(PixInvoice.txid == txid).first()
    if not inv:
        raise HTTPException(404, "Cobrança não encontrada")
    return {
        "txid": inv.txid,
        "valor": str(inv.valor),
        "status": inv.status
    }
