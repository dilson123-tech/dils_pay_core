from __future__ import annotations

from sqlalchemy import ForeignKey, Numeric, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base  # <- usa o mesmo DeclarativeBase

class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey("wallets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(String(16), nullable=False)  # "CREDITO" | "DEBITO"
    valor: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    referencia: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    criado_em: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
