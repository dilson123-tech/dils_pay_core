from fastapi import APIRouter, Query, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from fastapi.responses import StreamingResponse
import csv, io

from app.database.session import get_db

# Tenta achar o modelo de lançamentos
Model = None
_errs = []
for path, cls in [
    ("app.models.transacao_model", "TransacaoModel"),
    ("app.models.transaction", "Transaction"),
    ("app.models.ledger", "LedgerEntry"),
]:
    try:
        mod = __import__(path, fromlist=[cls])
        Model = getattr(mod, cls)
        break
    except Exception as e:
        _errs.append(f"{path}.{cls}: {e}")

router = APIRouter()

def _parse_date(label: str, value: str | None):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{label} inválida. Use YYYY-MM-DD.")

def _data_column():
    if Model is None:
        raise HTTPException(status_code=500, detail="Modelo de transação não encontrado. Ajuste o import em extrato.py")
    for name in ("data", "criado_em", "created_at", "timestamp"):
        if hasattr(Model, name):
            return name, getattr(Model, name)
    raise HTTPException(status_code=500, detail="Coluna de data não encontrada (tente data/criado_em/created_at/timestamp).")

def _field_name(*candidates):
    for name in candidates:
        if hasattr(Model, name):
            return name
    return None

@router.get("/extrato/_diag", tags=["Extrato"])
def diag(db: Session = Depends(get_db)):
    if Model is None:
        return {"model": None, "import_errors": _errs}
    cols = getattr(Model, "__table__", None)
    colnames = list(cols.columns.keys()) if cols else []
    return {
        "model": f"{Model.__module__}.{Model.__name__}",
        "columns": colnames,
        "guesses": {
            "data": _field_name("data", "criado_em", "created_at", "timestamp"),
            "tipo": _field_name("tipo", "direction", "kind"),
            "valor": _field_name("valor", "amount", "value"),
            "descricao": _field_name("descricao", "description", "memo", "observacao"),
        },
        "import_errors": _errs,
    }

@router.get("/extrato", tags=["Extrato"])
def listar_extrato(
    data_inicial: str | None = Query(None, description="YYYY-MM-DD"),
    data_final: str | None = Query(None, description="YYYY-MM-DD"),
    tipo: str | None = Query(None, description="CREDITO ou DEBITO"),
    export_csv: bool = Query(False, description="Se true, baixa CSV"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    response: Response = None,
    db = Depends(get_db),
):

    # Parse datas e pega coluna de data do modelo
    dt_ini = _parse_date("data_inicial", data_inicial)
    dt_fim = _parse_date("data_final", data_final)
    data_field_name, data_field = _data_column()

    # Normaliza tipo (case-insensitive) para o modelo
    tnorm = tipo.strip().upper() if tipo else None
    fname_tipo  = _field_name("tipo", "direction", "kind") or "tipo"
    fname_valor = _field_name("valor", "amount", "value") or "valor"
    fname_desc  = _field_name("descricao", "description", "memo", "observacao") or "descricao"

    typ_col = getattr(Model, fname_tipo)
    val_col = getattr(Model, fname_valor)

    # Monta filtros
    conds = []
    if dt_ini:
        conds.append(data_field >= dt_ini)
    if dt_fim:
        conds.append(data_field <= dt_fim.replace(hour=23, minute=59, second=59, microsecond=999999))
    if tnorm:
        conds.append(typ_col == tnorm)

    # Query base filtrada
    q = db.query(Model).filter(*conds).order_by(data_field.desc())

    # Total de itens
    total = q.count()

    # Paginação
    rows = q.offset((page - 1) * page_size).limit(page_size).all()

    # Totais do período (varrem o conjunto filtrado completo)
    # Para não estourar memória, se o volume crescer muito, troca por agregação SQL depois.
    all_rows = db.query(Model).filter(*conds).all()
    credito = 0.0
    debito  = 0.0
    for t in all_rows:
        v = float(getattr(t, fname_valor, 0) or 0)
        k = str(getattr(t, fname_tipo, "") or "").upper()
        if k == "CREDITO":
            credito += v
        elif k == "DEBITO":
            debito += v
    saldo_periodo = credito - debito

    # Headers de totais/paginação (se houver Response)
    if response is not None:
        response.headers["X-Total-Count"] = str(total)
        response.headers["X-Total-Credito"] = str(credito)
        response.headers["X-Total-Debito"]  = str(debito)
        response.headers["X-Total-Saldo-Periodo"] = str(saldo_periodo)

    # Export CSV?
    if export_csv:
        import io, csv
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["id", "data", "tipo", "valor", "descricao"])
        for t in rows:
            dt = getattr(t, data_field_name, None)
            data_fmt = dt.strftime("%Y-%m-%d %H:%M:%S") if dt else ""
            w.writerow([
                getattr(t, "id", None),
                data_fmt,
                getattr(t, fname_tipo, None),
                float(getattr(t, fname_valor, 0) or 0),
                getattr(t, fname_desc, ""),
            ])
        out.seek(0)
        from fastapi.responses import StreamingResponse
        return StreamingResponse(out, media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=extrato.csv"}
        )

    # JSON
    resp = []
    for t in rows:
        dt = getattr(t, data_field_name, None)
        resp.append({
            "id": getattr(t, "id", None),
            "data": dt.isoformat() if dt else None,
            "tipo": getattr(t, fname_tipo, None),
            "valor": float(getattr(t, fname_valor, 0) or 0),
            "descricao": getattr(t, fname_desc, None),
        })
    return resp

