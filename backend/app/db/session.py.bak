import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Tenta várias variáveis de ambiente comuns
DATABASE_URL = (
    os.getenv("DATABASE_URL")
    or os.getenv("SQLALCHEMY_DATABASE_URI")
    or os.getenv("DB_URL")
    or os.getenv("DB_URI")
)

# Fallback seguro: SQLite local
if not DATABASE_URL or not isinstance(DATABASE_URL, str) or DATABASE_URL.strip() == "":
    DATABASE_URL = "sqlite:///./dev.db"

# Ajustes específicos do SQLite
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    # cria diretório se for caminho relativo para arquivo
    try:
        path = DATABASE_URL.replace("sqlite:///", "")
        dirpath = os.path.dirname(path)
        if dirpath and not os.path.exists(dirpath):
            os.makedirs(dirpath, exist_ok=True)
    except Exception:
        pass
    connect_args = {"check_same_thread": False}

# Log discreto pra debug
print(f"[DB] DATABASE_URL em uso: {DATABASE_URL}")

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
