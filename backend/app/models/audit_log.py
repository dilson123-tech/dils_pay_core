from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    entidade: Mapped[str] = mapped_column(String(64), nullable=False)
    entidade_id: Mapped[int] = mapped_column(Integer, nullable=False)
    evento: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    criado_em: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
