# app/api/v1/routes/ledger.py
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, case, asc, desc
from typing import Literal, Optional
from datetime import datetime

# 🔧 AJUSTE AQUI se seu get_db estiver em outro módulo:
from app.database.session import get_db  # -> troque para "from app.db.session import get_db" se for o seu caso

# Modelo de transação do seu projeto
from app.models.transaction import Transaction as TM

router = APIRouter()

TipoMov = Literal["CREDITO", "DEBITO"]
VALID_ORDER_FIELDS = {"id", "data", "tipo", "valor", "descricao"}


# -------- helpers de schema/compat ----------

def col(model, *names):
    """
    Retorna a primeira coluna existente no model dentre os nomes dados.
    Ex.: col(TM, 'ledger_id', 'wallet_id')
    """
    for n in names:
        if hasattr(model, n):
            return getattr(model, n)
    raise AttributeError(f"Coluna não encontrada: {names!r}")


def _parse_dt(x: Optional[str]) -> Optional[datetime]:
    if not x:
        return None
    try:
        # aceita 'Z' e sem timezone
        x = x.replace("Z", "+00:00")
        return datetime.fromisoformat(x)
    except Exception:
        return None


def _parse_range(start: Optional[str], end: Optional[str]):
    """Aceita 'YYYY-MM-DD' ou ISO completo. Ajusta end para fim do dia se vier só data."""
    s = _parse_dt(start)
    e = _parse_dt(end)

    # se usuário mandar só data (10 chars), faz início/fim do dia
    if start and len(start) == 10 and not s:
        try:
            s = datetime.fromisoformat(start + "T00:00:00")
        except Exception:
            s = None
    if end and len(end) == 10 and not e:
        try:
            e = datetime.fromisoformat(end + "T23:59:59")
        except Exception:
            e = None
    return s, e


# -------- rota JSON ----------

@router.get("/ledger/{ledger_id}")
def get_ledger(
    ledger_id: int,
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    tipo: Optional[TipoMov] = Query(default=None),
    start: Optional[str] = None,   # "2025-08-12" ou ISO "2025-08-12T00:00:00"
    end: Optional[str] = None,     # idem
    order_by: str = Query("data"),
    order_dir: Literal["asc", "desc"] = Query("desc"),
    db: Session = Depends(get_db),
):
    """
    Extrato paginado do ledger com totais globais.
    Headers expostos: X-Total, X-Total-Count, X-Total-Pages, X-Page, X-Page-Size,
                      X-Total-Credito, X-Total-Debito, X-Total-Saldo
    """
    # mapeia colunas do seu modelo (compatível c/ ambos schemas)
    C_ID   = col(TM, "id")
    C_LED  = col(TM, "ledger_id", "wallet_id")
    C_TIPO = col(TM, "tipo")
    C_VAL  = col(TM, "valor")
    C_DT   = col(TM, "data", "criado_em")
    C_DESC = col(TM, "descricao", "referencia")

    # 1) base + filtros
    qb = db.query(TM).filter(C_LED == ledger_id)
    if tipo:
        qb = qb.filter(C_TIPO == tipo)

    ds, de = _parse_range(start, end)
    if ds:
        qb = qb.filter(C_DT >= ds)
    if de:
        qb = qb.filter(C_DT <= de)

    # 2) subquery padronizada (id, data, tipo, valor, descricao)
    subq = (
        qb.with_entities(
            C_ID.label("id"),
            C_DT.label("data"),
            C_TIPO.label("tipo"),
            C_VAL.label("valor"),
            C_DESC.label("descricao"),
        )
        .subquery()
    )

    # 3) totais globais (independente da paginação)
    n = db.query(func.count()).select_from(subq).scalar() or 0

    cred_sum, deb_sum = db.query(
        func.coalesce(func.sum(case((subq.c.tipo == "CREDITO", subq.c.valor), else_=0.0)), 0.0),
        func.coalesce(func.sum(case((subq.c.tipo == "DEBITO",  subq.c.valor), else_=0.0)), 0.0),
    ).one()

    tot_credito = float(cred_sum or 0.0)
    tot_debito  = float(deb_sum  or 0.0)
    saldo       = tot_credito - tot_debito

    # 4) ordenação + paginação
    order_field = (order_by if order_by in VALID_ORDER_FIELDS else "data")
    ORDER_MAP = {
        "id": C_ID, "data": C_DT, "tipo": C_TIPO, "valor": C_VAL, "descricao": C_DESC
    }
    ord_col = ORDER_MAP[order_field]
    qb_sorted = qb.order_by(asc(ord_col) if order_dir == "asc" else desc(ord_col))

    rows = qb_sorted.offset((page - 1) * page_size).limit(page_size).all()

    # 5) headers
    total_pages = max(1, (n + page_size - 1) // page_size)
    response.headers["X-Total"] = str(n)
    response.headers["X-Total-Count"] = str(n)
    response.headers["X-Total-Pages"] = str(total_pages)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    response.headers["X-Total-Credito"] = f"{tot_credito:.2f}"
    response.headers["X-Total-Debito"]  = f"{tot_debito:.2f}"
    response.headers["X-Total-Saldo"]   = f"{saldo:.2f}"

    # 6) corpo
    out = []
    for it in rows:
        dt = getattr(it, C_DT.key, None)
        if hasattr(dt, "isoformat"):
            data_iso = dt.isoformat()
        else:
            data_iso = str(dt) if dt is not None else ""
        out.append({
            "id": getattr(it, C_ID.key),
            "data": data_iso,
            "tipo": getattr(it, C_TIPO.key),
            "valor": float(getattr(it, C_VAL.key) or 0.0),
            "descricao": getattr(it, C_DESC.key) or "",
        })
    return out


# -------- rota CSV ----------

from fastapi.responses import StreamingResponse
import io, csv

@router.get("/ledger/{ledger_id}/csv")
def ledger_csv(
    ledger_id: int,
    tipo: Optional[TipoMov] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    order_by: str = "data",
    order_dir: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
):
    C_ID   = col(TM, "id")
    C_LED  = col(TM, "ledger_id", "wallet_id")
    C_TIPO = col(TM, "tipo")
    C_VAL  = col(TM, "valor")
    C_DT   = col(TM, "data", "criado_em")
    C_DESC = col(TM, "descricao", "referencia")

    qb = db.query(TM).filter(C_LED == ledger_id)
    if tipo:
        qb = qb.filter(C_TIPO == tipo)

    ds, de = _parse_range(start, end)
    if ds:
        qb = qb.filter(C_DT >= ds)
    if de:
        qb = qb.filter(C_DT <= de)

    ORDER_MAP = {"id": C_ID, "data": C_DT, "tipo": C_TIPO, "valor": C_VAL, "descricao": C_DESC}
    col_ord = ORDER_MAP.get(order_by, C_DT)
    qb = qb.order_by(asc(col_ord) if order_dir == "asc" else desc(col_ord))

    def gen():
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=';', quoting=csv.QUOTE_MINIMAL)
        w.writerow(["id", "data", "tipo", "valor", "descricao"])
        yield buf.getvalue(); buf.seek(0); buf.truncate(0)

        for t in qb.yield_per(500):
            dt = getattr(t, C_DT.key, None)
            data_txt = dt.isoformat(sep=" ") if hasattr(dt, "isoformat") else (str(dt) if dt else "")
            w.writerow([
                getattr(t, C_ID.key),
                data_txt,
                getattr(t, C_TIPO.key) or "",
                f"{float(getattr(t, C_VAL.key) or 0):.2f}".replace(".", ","),
                (getattr(t, C_DESC.key) or "").replace("\n", " "),
            ])
            yield buf.getvalue(); buf.seek(0); buf.truncate(0)

    headers = {"Content-Disposition": f'attachment; filename="extrato_wallet_{ledger_id}.csv"'}
    return StreamingResponse(gen(), media_type="text/csv; charset=utf-8", headers=headers)
