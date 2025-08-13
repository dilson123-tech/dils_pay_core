# app/database/init_db.py
from app.database.session import engine
from app.db.base import Base

def init_db() -> None:
    # Importa as models para registrar no metadata antes do create_all
    from app.models.user import User                  # noqa: F401
    from app.models.wallet import Wallet              # noqa: F401
    from app.models.transaction import Transaction    # noqa: F401
    try:
        from app.models.pix import Pix                # noqa: F401
    except Exception:
        pass
    try:
        from app.models.invoice import Invoice        # noqa: F401
    except Exception:
        pass
    try:
        from app.models.audit_log import AuditLog     # noqa: F401
    except Exception:
        pass

    Base.metadata.create_all(bind=engine)
