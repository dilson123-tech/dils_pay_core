from sqlalchemy import String, Numeric, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class PixInvoice(Base):
    __tablename__ = "pix_invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    txid: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    valor: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)  # PENDING | CONFIRMED | CANCELED
    criado_em: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
