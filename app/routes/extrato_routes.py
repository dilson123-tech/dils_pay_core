from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from fastapi.responses import StreamingResponse
import csv, io

from app.database.session import get_db
from app.models.transacao_model import TransacaoModel  # ajuste se o nome/campos forem diferentes

router = APIRouter()

def _parse_date(label: str, value: str | None):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{label} inválida. Use YYYY-MM-DD.")

def _data_column():
    # tenta detectar o nome da coluna de data no modelo
    for name in ("data", "criado_em", "created_at"):
        if hasattr(TransacaoModel, name):
            return name, getattr(TransacaoModel, name)
    raise HTTPException(status_code=500, detail="Coluna de data não encontrada no modelo (esperado: data/criado_em/created_at).")

@router.get("/extrato", tags=["Extrato"])
def listar_extrato(
    data_inicial: str | None = Query(None, description="YYYY-MM-DD"),
    data_final: str | None = Query(None, description="YYYY-MM-DD"),
    tipo: str | None = Query(None, description="entrada ou saída"),
    export_csv: bool = Query(False, description="Define se retorna CSV"),
    db: Session = Depends(get_db),
):
    dt_ini = _parse_date("data_inicial", data_inicial)
    dt_fim = _parse_date("data_final", data_final)
    data_field_name, data_field = _data_column()

    query = db.query(TransacaoModel)

    if dt_ini:
        query = query.filter(data_field >= dt_ini)
    if dt_fim:
        dt_fim = dt_fim.replace(hour=23, minute=59, second=59, microsecond=999999)
        query = query.filter(data_field <= dt_fim)
    if tipo:
        query = query.filter(TransacaoModel.tipo == tipo)

    transacoes = query.order_by(data_field.desc()).all()

    if export_csv:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "data", "tipo", "valor", "descricao"])
        for t in transacoes:
            dt = getattr(t, data_field_name, None)
            data_fmt = dt.strftime("%Y-%m-%d %H:%M:%S") if dt else ""
            writer.writerow([
                getattr(t, "id", None),
                data_fmt,
                getattr(t, "tipo", None),
                float(getattr(t, "valor", 0)),
                getattr(t, "descricao", "")])
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=extrato.csv"}
        )

    # JSON seguro (sem retornar objeto ORM cru)
    resultado = []
    for t in transacoes:
        dt = getattr(t, data_field_name, None)
        resultado.append({
            "id": getattr(t, "id", None),
            "data": dt.isoformat() if dt else None,
            "tipo": getattr(t, "tipo", None),
            "valor": float(getattr(t, "valor", 0)),
            "descricao": getattr(t, "descricao", None),
        })
    return resultado
