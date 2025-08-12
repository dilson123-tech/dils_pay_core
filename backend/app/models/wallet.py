from sqlalchemy import ForeignKey, Numeric, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class Wallet(Base):
    __tablename__ = "wallets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    saldo_atual: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    criado_em: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
