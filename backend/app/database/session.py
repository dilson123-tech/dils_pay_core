from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

# Caminho do seu banco local (ajuste se usar outro)
SQLALCHEMY_DATABASE_URL = "sqlite:///./dev.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},  # necessário pro SQLite no single-thread
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
