from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.orm import Session
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
    tipo: str | None = Query(None, description="entrada/saida (ou credit/debit)"),
    export_csv: bool = Query(False, description="Se true, baixa CSV"),
    db: Session = Depends(get_db),
):
    data_field_name, data_field = _data_column()

    dt_ini = _parse_date("data_inicial", data_inicial)
    dt_fim = _parse_date("data_final", data_final)

    q = db.query(Model)
    if dt_ini:
        q = q.filter(data_field >= dt_ini)
    if dt_fim:
        dt_fim = dt_fim.replace(hour=23, minute=59, second=59, microsecond=999999)
        q = q.filter(data_field <= dt_fim)
    if tipo:
        if hasattr(Model, "tipo"):
            q = q.filter(getattr(Model, "tipo") == tipo)
        elif hasattr(Model, "direction"):
            q = q.filter(getattr(Model, "direction") == tipo)

    rows = q.order_by(data_field.desc()).all()

    # Mapeamentos tolerantes
    fname_tipo = _field_name("tipo", "direction", "kind")
    fname_valor = _field_name("valor", "amount", "value")
    fname_desc  = _field_name("descricao", "description", "memo", "observacao")

    if export_csv:
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["id", "data", "tipo", "valor", "descricao"])
        for t in rows:
            dt = getattr(t, data_field_name, None)
            data_fmt = dt.strftime("%Y-%m-%d %H:%M:%S") if dt else ""
            w.writerow([
                getattr(t, "id", None),
                data_fmt,
                getattr(t, fname_tipo, None) if fname_tipo else None,
                float(getattr(t, fname_valor, 0) or 0) if fname_valor else 0.0,
                getattr(t, fname_desc, "") if fname_desc else "",
            ])
        out.seek(0)
        return StreamingResponse(out, media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=extrato.csv"})

    resp = []
    for t in rows:
        dt = getattr(t, data_field_name, None)
        resp.append({
            "id": getattr(t, "id", None),
            "data": dt.isoformat() if dt else None,
            "tipo": getattr(t, fname_tipo, None) if fname_tipo else None,
            "valor": float(getattr(t, fname_valor, 0) or 0) if fname_valor else 0.0,
            "descricao": getattr(t, fname_desc, None) if fname_desc else None,
        })
    return resp
