# app/api/v1/routes/ledger.py
from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy import asc, case, desc, func
from sqlalchemy.orm import Session

from app.database.session import get_db

try:
    from app.models.transaction import Transaction as TM  # modelo "principal"
except Exception:
    from app.models.transaction import TransactionModel as TM  # fallback

router = APIRouter()  # tem que vir antes dos decorators

# ---- Colunas com fallback, pra não quebrar se mudar nomes no modelo ----
WALLET_COL = (
    getattr(TM, "wallet_id", None)
    or getattr(TM, "ledger_id", None)
    or getattr(TM, "conta_id", None)
)
DATE_COL = getattr(
    TM, "criado_em", getattr(TM, "data", getattr(TM, "created_at", TM.id))
)
DESC_COL = getattr(
    TM, "referencia", getattr(TM, "descricao", getattr(TM, "memo", TM.id))
)
TIPO_COL = getattr(TM, "tipo", getattr(TM, "natureza", TM.id))
VALOR_COL = getattr(TM, "valor", getattr(TM, "amount", TM.id))

TipoMov = Literal["CREDITO", "DEBITO"]

ORDER_MAP = {
    "id": getattr(TM, "id", TM),
    "data": DATE_COL,
    "tipo": TIPO_COL,
    "valor": VALOR_COL,
    "descricao": DESC_COL,
}


def _parse_dt(x: str | None, end_of_day: bool = False):
    if not x:
        return None
    x = x.strip()
    if len(x) == 10:
        x = x + (" 23:59:59" if end_of_day else " 00:00:00")
    try:
        return datetime.fromisoformat(x.replace("Z", "+00:00"))
    except Exception:
        # como fallback, retorna string (SQLite aceita ISO-like em comparação)
        return x


def _get_attr(obj, col):
    if hasattr(col, "key"):
        try:
            return getattr(obj, col.key)
        except Exception:
            pass
    for name in ("criado_em", "data", "created_at"):
        if hasattr(obj, name):
            return getattr(obj, name)
    return None


def _fmt_dt(v):
    if v is None:
        return ""
    try:
        return v.isoformat(sep=" ")
    except AttributeError:
        return str(v).replace("T", " ")
    except Exception:
        return str(v)


# ========= JSON (paginado) =========
@router.get("/ledger/{ledger_id}")
def get_ledger(
    ledger_id: int,
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    tipo: TipoMov | None = Query(default=None),
    start: str | None = None,
    end: str | None = None,
    order_by: str = Query("data"),
    order_dir: Literal["asc", "desc"] = Query("desc"),
    db: Session = Depends(get_db),
):
    if WALLET_COL is None:
        raise HTTPException(500, "Modelo de transação não tem coluna wallet/ledger id")

    # base query
    q = db.query(TM).filter(ledger_id == WALLET_COL)

    # filtro por tipo (se veio)
    if tipo:
        q = q.filter(tipo == TIPO_COL)

    # datas (precisa calcular antes de usar nos filtros)
    ds, de = _parse_dt(start, False), _parse_dt(end, True)
    if ds is not None:
        q = q.filter(ds <= DATE_COL)
    if de is not None:
        q = q.filter(de >= DATE_COL)

    # totais globais
    subq = q.with_entities(
        TM.id.label("id"),
        DATE_COL.label("data"),
        TIPO_COL.label("tipo"),
        VALOR_COL.label("valor"),
        DESC_COL.label("descricao"),
    ).subquery()

    total_count = db.query(func.count()).select_from(subq).scalar() or 0
    tot_credito, tot_debito = db.query(
        func.coalesce(
            func.sum(case((subq.c.tipo == "CREDITO", subq.c.valor), else_=0.0)), 0.0
        ),
        func.coalesce(
            func.sum(case((subq.c.tipo == "DEBITO", subq.c.valor), else_=0.0)), 0.0
        ),
    ).one()

    tot_credito = float(tot_credito or 0.0)
    tot_debito = float(tot_debito or 0.0)
    saldo = tot_credito - tot_debito

    # ordenação + paginação
    col = ORDER_MAP.get(order_by, DATE_COL)
    q_sorted = q.order_by(asc(col) if order_dir == "asc" else desc(col))
    items = q_sorted.offset((page - 1) * page_size).limit(page_size).all()

    # headers
    total_pages = max(1, (total_count + page_size - 1) // page_size)
    response.headers["X-Total"] = str(total_count)
    response.headers["X-Total-Count"] = str(total_count)
    response.headers["X-Total-Pages"] = str(total_pages)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    response.headers["X-Total-Credito"] = f"{tot_credito:.2f}"
    response.headers["X-Total-Debito"] = f"{tot_debito:.2f}"
    response.headers["X-Total-Saldo"] = f"{saldo:.2f}"

    # corpo
    out = []
    for it in items:
        dt = _get_attr(it, DATE_COL)
        desc_txt = getattr(it, getattr(DESC_COL, "key", "referencia"), None)
        if desc_txt is None:
            desc_txt = getattr(it, "descricao", "") or ""
        out.append(
            {
                "id": getattr(it, "id", None),
                "data": _fmt_dt(dt),
                "tipo": getattr(it, getattr(TIPO_COL, "key", "tipo"), ""),
                "valor": float(
                    getattr(it, getattr(VALOR_COL, "key", "valor"), 0.0) or 0.0
                ),
                "descricao": desc_txt,
            }
        )
    return out


# ========= CSV (não streaming) =========
@router.get("/ledger/{wallet_id}/csv")
def ledger_csv(
    wallet_id: int,
    tipo: str | None = None,
    start: str | None = None,
    end: str | None = None,
    order_by: str = "data",
    order_dir: str = "desc",
    csv_sep: str = ";",  # ";" BR | "," US
    csv_decimal: str = "comma",  # "comma" BR | "dot" US
    filename: str | None = None,
    db: Session = Depends(get_db),
):
    if WALLET_COL is None:
        raise HTTPException(500, "Modelo de transação não tem coluna wallet/ledger id")

    q = db.query(TM).filter(wallet_id == WALLET_COL)
    if tipo in ("CREDITO", "DEBITO"):
        q = q.filter(tipo == TIPO_COL)

    ds, de = _parse_dt(start, False), _parse_dt(end, True)
    if ds is not None:
        q = q.filter(ds <= DATE_COL)
    if de is not None:
        q = q.filter(de >= DATE_COL)

    col = ORDER_MAP.get(order_by, DATE_COL)
    q = q.order_by(desc(col) if order_dir.lower() == "desc" else asc(col))

    rows = q.all()  # materializa (evita sessão fechar no meio)

    sep = "," if csv_sep == "," else ";"
    use_comma = csv_decimal.lower() != "dot"  # default BR

    buf = io.StringIO()
    w = csv.writer(buf, delimiter=sep, quoting=csv.QUOTE_MINIMAL)
    w.writerow(["id", "data", "tipo", "valor", "descricao"])

    for t in rows:
        dt = _get_attr(t, DATE_COL)
        val = f"{float(getattr(t, getattr(VALOR_COL, 'key', 'valor'), 0) or 0):.2f}"
        if use_comma:
            val = val.replace(".", ",")
        desc_txt = getattr(t, getattr(DESC_COL, "key", "referencia"), None)
        if desc_txt is None:
            desc_txt = getattr(t, "descricao", "") or ""
        w.writerow(
            [
                getattr(t, "id", ""),
                _fmt_dt(dt),
                getattr(t, getattr(TIPO_COL, "key", "tipo"), "") or "",
                val,
                (desc_txt or "").replace("\n", " "),
            ]
        )

    data = buf.getvalue().encode("utf-8")
    name = filename or f"extrato_wallet_{wallet_id}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{name}"'}
    return FastAPIResponse(
        content=data, media_type="text/csv; charset=utf-8", headers=headers
    )


# ==================== [ TOTAIS DO EXTRATO – HELPER ] ====================
# (pode ficar no final do arquivo)


def _set_totais_headers(
    db: Session, wallet_id: int, response: Response, dt_ini=None, dt_fim=None
) -> None:
    """
    Calcula totais (CREDITO, DEBITO, SALDO) para a carteira e envia nos headers:
      - X-Total-Credito
      - X-Total-Debito
      - X-Total-Saldo
    """
    q = db.query(
        func.coalesce(
            func.sum(case((TM.tipo == "CREDITO", TM.valor), else_=0)), 0
        ).label("credito"),
        func.coalesce(
            func.sum(case((TM.tipo == "DEBITO", TM.valor), else_=0)), 0
        ).label("debito"),
    ).filter(TM.wallet_id == wallet_id)

    if dt_ini is not None:
        q = q.filter(TM.criado_em >= dt_ini)
    if dt_fim is not None:
        q = q.filter(TM.criado_em <= dt_fim)

    r = q.one()
    credito = float(r.credito or 0)
    debito = float(r.debito or 0)
    saldo = credito - debito

    response.headers["X-Total-Credito"] = f"{credito:.2f}"
    response.headers["X-Total-Debito"] = f"{debito:.2f}"
    response.headers["X-Total-Saldo"] = f"{saldo:.2f}"


# =======================================================================
@router.get("/ledger/{ledger_id}/export")
def export_ledger_csv(ledger_id: int, db: Session = Depends(get_db)):
    # imports locais pra não mexer no topo do arquivo
    import csv
    import io

    from fastapi.responses import StreamingResponse

    # Busca transações da carteira
    rows = db.query(TM).filter(ledger_id == WALLET_COL).order_by(DATE_COL.desc()).all()

    # Monta CSV em memória
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["ID", "Data", "Descrição", "Tipo", "Valor"])
    for r in rows:
        data = getattr(r, "criado_em", getattr(r, "data", None))
        desc = getattr(r, "referencia", getattr(r, "descricao", getattr(r, "memo", "")))
        tipo = getattr(r, "tipo", getattr(r, "kind", ""))
        valor = getattr(r, "valor", getattr(r, "amount", 0))
        w.writerow([r.id, data, desc, tipo, valor])

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=ledger_{ledger_id}.csv"},
    )
