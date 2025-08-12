from datetime import datetime
from typing import Optional, Literal, List

from fastapi import APIRouter, Response, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

# ajuste se seus paths forem diferentes
from app.database.session import get_db
from app.models.transaction import Transaction
try:
    from app.models.wallet import Wallet
except Exception:
    Wallet = None  # type: ignore

router = APIRouter(tags=["ledger"])

def pick_attr_name(cls, candidates):
    cols = set(getattr(cls, "__mapper__").c.keys()) if hasattr(cls, "__mapper__") else set()
    for c in candidates:
        if c in cols or hasattr(cls, c):
            return c
    return None

# mapeia nomes reais no seu modelo (inclui 'criado_em' e 'referencia')
USER_FIELD = pick_attr_name(Transaction, ["user_id","usuario_id","uid","owner_id","wallet_id","account_id","cliente_id","conta_id"])
DATE_FIELD = pick_attr_name(Transaction, ["data","created_at","criado_em","timestamp","ts","dt","date"])
TIPO_FIELD = pick_attr_name(Transaction, ["tipo","type","movement_type","kind","direction"])
VAL_FIELD  = pick_attr_name(Transaction, ["valor","amount","value","quantia","total"])
DESC_FIELD = pick_attr_name(Transaction, ["descricao","description","referencia","memo","details","observacao","obs"])

if USER_FIELD is None:
    cols = list(getattr(Transaction, "__mapper__").c.keys())
    raise RuntimeError(f"[ledger] Não encontrei a coluna de vínculo (user/wallet) em Transaction. Colunas: {cols}")

def resolve_target_id(db: Session, path_id: int) -> int:
    if USER_FIELD != "wallet_id":
        return path_id
    if Wallet is None:
        return path_id
    W_USER = pick_attr_name(Wallet, ["user_id","usuario_id","uid","owner_id","account_id","cliente_id","conta_id"])
    W_ID   = pick_attr_name(Wallet, ["id","wallet_id"])
    if W_ID is None:
        return path_id
    if W_USER is not None:
        w = db.query(Wallet).filter(getattr(Wallet, W_USER) == path_id).first()
        if w:
            return getattr(w, W_ID)
    return path_id

def as_float(x):
    try:
        return float(x or 0.0)
    except Exception:
        return float(getattr(x, "real", 0.0) or 0.0)

class LedgerIn(BaseModel):
    data: Optional[datetime] = None
    tipo: Optional[Literal["CREDITO","DEBITO"]] = None
    valor: float
    descricao: Optional[str] = None

@router.post("/ledger/{id}")
def create_ledger(
    id: int,
    payload: LedgerIn,
    db: Session = Depends(get_db),
):
    target_id = resolve_target_id(db, id)
    t = Transaction()
    setattr(t, USER_FIELD, target_id)

    # data: usa payload.data ou agora() se existir campo de data
    if DATE_FIELD:
        dt = payload.data or datetime.utcnow()
        setattr(t, DATE_FIELD, dt)

    # tipo
    if TIPO_FIELD and payload.tipo is not None:
        setattr(t, TIPO_FIELD, payload.tipo)

    # valor / descricao
    if VAL_FIELD:
        setattr(t, VAL_FIELD, payload.valor)
    else:
        try: setattr(t, "valor", payload.valor)
        except Exception: pass

    if DESC_FIELD and payload.descricao is not None:
        setattr(t, DESC_FIELD, payload.descricao)
    else:
        try: setattr(t, "descricao", payload.descricao)
        except Exception: pass

    db.add(t); db.commit(); db.refresh(t)
    return {"id": getattr(t, "id")}

@router.get("/ledger/{id}", response_model=List[dict])
def list_ledger(
    id: int,
    response: Response,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    tipo: Optional[Literal["CREDITO", "DEBITO"]] = Query(None),
    format: Optional[str] = Query(None),
):
    target_id = resolve_target_id(db, id)

    q = db.query(Transaction).filter(getattr(Transaction, USER_FIELD) == target_id)
    if DATE_FIELD and start:
        q = q.filter(getattr(Transaction, DATE_FIELD) >= start)
    if DATE_FIELD and end:
        q = q.filter(getattr(Transaction, DATE_FIELD) <= end)
    if TIPO_FIELD and tipo:
        q = q.filter(getattr(Transaction, TIPO_FIELD) == tipo)

    total_count = q.count()

    order_col = getattr(Transaction, DATE_FIELD) if DATE_FIELD else getattr(Transaction, "id")
    q_ordered = q.order_by(order_col.desc(), getattr(Transaction, "id").desc())

    items = q_ordered.offset((page - 1) * page_size).limit(page_size).all()

    rows_for_totals = q.all()
    total_credito = 0.0
    total_debito  = 0.0
    for r in rows_for_totals:
        v = as_float(getattr(r, VAL_FIELD) if VAL_FIELD else getattr(r, "valor", 0.0))
        if TIPO_FIELD:
            t = str(getattr(r, TIPO_FIELD)).upper()
            if "CREDITO" in t:
                total_credito += v
            elif "DEBITO" in t:
                total_debito += v
            else:
                (total_credito if v >= 0 else total_debito).__iadd__(abs(v))
        else:
            (total_credito if v >= 0 else total_debito).__iadd__(abs(v))

    saldo_periodo = total_credito - total_debito

    response.headers["X-Total-Count"] = str(total_count)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    response.headers["X-Total-Credito"] = f"{total_credito}"
    response.headers["X-Total-Debito"] = f"{total_debito}"
    response.headers["X-Total-Saldo-Periodo"] = f"{saldo_periodo}"

    if (format or "").lower() == "csv":
        import csv, io
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["id", "data", "tipo", "valor", "descricao"])
        for t in items:
            dt = getattr(t, DATE_FIELD) if DATE_FIELD else None
            w.writerow([
                getattr(t, "id"),
                (dt.isoformat() if dt else ""),
                (getattr(t, TIPO_FIELD) if TIPO_FIELD else ""),
                as_float(getattr(t, VAL_FIELD) if VAL_FIELD else getattr(t, "valor", 0.0)),
                (getattr(t, DESC_FIELD) if DESC_FIELD else getattr(t, "descricao", "")) or "",
            ])
        return Response(content=buf.getvalue().encode("utf-8"), media_type="text/csv")

    def to_dict(t):
        dt = getattr(t, DATE_FIELD) if DATE_FIELD else None
        return {
            "id": getattr(t, "id"),
            "data": (dt.isoformat() if dt else None),
            "tipo": (getattr(t, TIPO_FIELD) if TIPO_FIELD else None),
            "valor": as_float(getattr(t, VAL_FIELD) if VAL_FIELD else getattr(t, "valor", 0.0)),     
            "descricao": (getattr(t, DESC_FIELD) if DESC_FIELD else getattr(t, "descricao", None)),
        }

    return [to_dict(t) for t in items]
