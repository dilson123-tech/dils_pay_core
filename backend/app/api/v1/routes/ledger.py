# app/api/v1/routes/ledger.py
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, case, asc, desc
from typing import Literal, Optional

from app.database.session import get_db

# Modelo de transação do seu projeto
try:
    from app.models.transaction import Transaction as TM  # type: ignore
except Exception:
    from app.models.transaction import TransactionModel as TM  # type: ignore

router = APIRouter()

TipoMov = Literal["CREDITO", "DEBITO"]

# Campos do SEU schema:
# id, wallet_id, tipo, valor, referencia, criado_em
ORDER_MAP = {
    "id": TM.id,
    "data": TM.criado_em,     # mapeia 'data' (UI) -> 'criado_em' (DB)
    "tipo": TM.tipo,
    "valor": TM.valor,
    "descricao": TM.referencia,
}

@router.get("/ledger/{ledger_id}")
def get_ledger(
    ledger_id: int,
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    tipo: Optional[TipoMov] = Query(default=None),
    start: Optional[str] = None,   # ISO ex: 2025-08-12T00:00:00
    end: Optional[str] = None,     # ISO ex: 2025-08-12T23:59:59
    order_by: str = Query("data"),
    order_dir: Literal["asc", "desc"] = Query("desc"),
    db: Session = Depends(get_db),
):
    # 1) Base + filtros (usa wallet_id e criado_em)
    q = db.query(TM).filter(TM.wallet_id == ledger_id)
    if tipo:
        q = q.filter(TM.tipo == tipo)
    if start:
        q = q.filter(TM.criado_em >= start.strip())
    if end:
        q = q.filter(TM.criado_em <= end.strip())

    # 2) Totais globais (ignorando paginação)
    subq = q.with_entities(
        TM.id.label("id"),
        TM.criado_em.label("data"),
        TM.tipo.label("tipo"),
        TM.valor.label("valor"),
        TM.referencia.label("descricao"),
    ).subquery()

    total_count = db.query(func.count()).select_from(subq).scalar() or 0

    tot_credito, tot_debito = db.query(
        func.coalesce(func.sum(case((subq.c.tipo == "CREDITO", subq.c.valor), else_=0.0)), 0.0),
        func.coalesce(func.sum(case((subq.c.tipo == "DEBITO",  subq.c.valor), else_=0.0)), 0.0),
    ).one()

    tot_credito = float(tot_credito or 0.0)
    tot_debito  = float(tot_debito  or 0.0)
    saldo = tot_credito - tot_debito

    # 3) Ordenação server-side (UI manda 'data', aqui vira 'criado_em')
    col = ORDER_MAP.get(order_by, TM.criado_em)
    q_sorted = q.order_by(asc(col) if order_dir == "asc" else desc(col))

    # 4) Paginação
    items = q_sorted.offset((page - 1) * page_size).limit(page_size).all()

    # 5) Headers
    total_pages = max(1, (total_count + page_size - 1) // page_size)
    response.headers["X-Total"] = str(total_count)
    response.headers["X-Total-Count"] = str(total_count)
    response.headers["X-Total-Pages"] = str(total_pages)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    response.headers["X-Total-Credito"] = f"{tot_credito:.2f}"
    response.headers["X-Total-Debito"]  = f"{tot_debito:.2f}"
    response.headers["X-Total-Saldo"]   = f"{saldo:.2f}"

    # 6) Corpo (padroniza chaves pro front)
    saida = []
    for it in items:
        dt = getattr(it, "criado_em", None)
        data_iso = dt.isoformat() if hasattr(dt, "isoformat") else (str(dt) if dt is not None else "")
        saida.append({
            "id": it.id,
            "data": data_iso,
            "tipo": it.tipo,
            "valor": float(it.valor or 0.0),
            "descricao": it.referencia or "",
        })
    return saida
