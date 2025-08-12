import hmac, hashlib, json
from fastapi import APIRouter, Header, HTTPException, Depends, status, Request
from sqlalchemy.orm import Session
from decimal import Decimal

from app.core.config import settings
from app.db.session import get_db
from app.models.pix_invoice import PixInvoice
from app.models.wallet import Wallet
from app.models.transaction import Transaction

router = APIRouter()

def verify_hmac(raw_body: bytes, signature: str | None) -> None:
    if not signature:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing signature")
    mac = hmac.new(settings.WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(mac, signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid signature")

@router.post("/webhooks/psp/pix", status_code=status.HTTP_204_NO_CONTENT)
async def psp_pix_webhook(
    request: Request,
    x_signature: str | None = Header(default=None, alias="X-Signature"),
    db: Session = Depends(get_db),
):
    raw = await request.body()
    verify_hmac(raw, x_signature)

    try:
        payload = json.loads(raw.decode())
        txid = payload["txid"]
        valor = Decimal(str(payload["valor"]))
        status_psp = payload.get("status", "CONFIRMED")
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid payload")

    inv = db.query(PixInvoice).filter(PixInvoice.txid == txid).first()
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    # Idempotência
    if inv.status == "CONFIRMED":
        return

    if status_psp not in ("CONFIRMED", "PAID", "COMPLETED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment not confirmed")

    w = db.query(Wallet).filter(Wallet.user_id == inv.user_id).first()
    if not w:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Wallet not found")

    ref = f"pix:{txid}"
    exists_tx = db.query(Transaction).filter(
        Transaction.wallet_id == w.id,
        Transaction.referencia == ref
    ).first()
    if exists_tx:
        inv.status = "CONFIRMED"
        db.add(inv); db.commit()
        return

    w.saldo_atual = (w.saldo_atual or 0) + valor
    tx = Transaction(wallet_id=w.id, tipo="CREDITO", valor=valor, referencia=ref)

    inv.status = "CONFIRMED"
    db.add_all([w, tx, inv]); db.commit()
    return
