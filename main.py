# app/api/v1/routes/ledger.py
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case, asc, desc
from typing import Literal, Optional
from datetime import datetime

# == AJUSTE ESTES IMPORTS ao seu projeto ==
from app.database.session import get_db  # -> se seu get_db estiver em outro módulo, ajuste
from app.models.transaction import Transaction as TransactionModel  # nome/classe da sua tabela de movimentos

router = APIRouter()

# Quais campos são ordenáveis na API
VALID_ORDER_FIELDS = {"id", "data", "tipo", "valor", "descricao"}

TipoMov = Literal["CREDITO", "DEBITO"]

def _parse_dt(x: Optional[str]) -> Optional[str]:
    """
    Aceita ISO em string e retorna string ISO (mantendo timezone se vier),
    mas sem explodir a API caso venham valores inválidos.
    """
    if not x:
        return None
    try:
        # Só validar — o banco costuma armazenar TEXT ISO ou DATETIME
        datetime.fromisoformat(x.replace("Z", "+00:00"))  # valida
        return x
    except Exception:
        return None


@router.get("/ledger/{ledger_id}")
def get_ledger(
    ledger_id: int,
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    tipo: Optional[TipoMov] = Query(default=None, pattern="^(CREDITO|DEBITO)$"),
    start: Optional[str] = None,  # ISO 8601 (ex: 2025-08-12T00:00:00)
    end: Optional[str] = None,    # ISO 8601 (ex: 2025-08-12T23:59:59)
    order_by: str = Query("data"),
    order_dir: Literal["asc", "desc"] = Query("desc"),
    db: Session = Depends(get_db),
):
    """
    Extrato paginado do ledger com totais globais SEM depender da paginação.
    Headers expostos:
      - X-Total, X-Total-Credito, X-Total-Debito, X-Total-Saldo
      - X-Total-Count (alias), X-Total-Pages, X-Page, X-Page-Size
    """
    # 1) Query base + filtros
    q = db.query(TransactionModel).filter(TransactionModel.ledger_id == ledger_id)

    if tipo:
        q = q.filter(TransactionModel.tipo == tipo)

    s = _parse_dt(start)
    e = _parse_dt(end)
    if s:
        q = q.filter(TransactionModel.data >= s)
    if e:
        q = q.filter(TransactionModel.data <= e)

    # 2) Totais globais (ignora paginação)
    credito_sum = func.sum(
        case((TransactionModel.tipo == "CREDITO", TransactionModel.valor), else_=0.0)
    )
    debito_sum = func.sum(
        case((TransactionModel.tipo == "DEBITO", TransactionModel.valor), else_=0.0)
    )
    total_count = func.count(TransactionModel.id)

    # usamos subquery pra não reexecutar filtros
    subq = q.subquery()
    agg_row = db.query(
        func.coalesce(func.sum(1), 0).label("n")  # sum(1) funciona em sqlite também
    ).select_from(subq).one_or_none()

    n = int(agg_row.n if agg_row and agg_row.n is not None else 0)

    sums = db.query(
        func.coalesce(credito_sum, 0.0).label("credito_all"),
        func.coalesce(debito_sum, 0.0).label("debito_all"),
    ).select_from(q.subquery()).one()

    tot_credito = float(sums.credito_all or 0.0)
    tot_debito  = float(sums.debito_all or 0.0)
    saldo       = tot_credito - tot_debito

    # 3) Ordenação server-side
    field = order_by if order_by in VALID_ORDER_FIELDS else "data"
    col = getattr(TransactionModel, field)
    q_sorted = q.order_by(asc(col) if order_dir == "asc" else desc(col))

    # 4) Paginação
    items = q_sorted.offset((page - 1) * page_size).limit(page_size).all()

    # 5) Headers consistentes
    # - Totais
    response.headers["X-Total"] = str(n)
    response.headers["X-Total-Count"] = str(n)
    # - Páginas
    total_pages = (n + page_size - 1) // page_size if page_size else 1
    response.headers["X-Total-Pages"] = str(total_pages)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    # - Financeiros
    response.headers["X-Total-Credito"] = f"{tot_credito:.2f}"
    response.headers["X-Total-Debito"]  = f"{tot_debito:.2f}"
    response.headers["X-Total-Saldo"]   = f"{saldo:.2f}"

    # 6) Serialização
    return [
        {
            "id": it.id,
            "data": it.data.isoformat() if hasattr(it.data, "isoformat") else str(it.data),
            "tipo": it.tipo,
            "valor": float(it.valor),
            "descricao": it.descricao or "",
        }
        for it in items
    ]
