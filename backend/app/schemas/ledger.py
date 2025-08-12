from pydantic import BaseModel, Field
from decimal import Decimal

class PostLedgerEntry(BaseModel):
    tipo: str = Field(pattern="^(CREDITO|DEBITO)$")
    valor: Decimal
    referencia: str = ""
