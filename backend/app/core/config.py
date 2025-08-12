from pydantic import BaseModel
import os

class Settings(BaseModel):
    ENV: str = os.getenv("ENV", "dev")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev")
    JWT_ALG: str = os.getenv("JWT_ALG", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    WEBHOOK_SECRET: str = os.getenv("WEBHOOK_SECRET", "dev")
    IDEMP_CACHE_TTL_SECONDS: int = int(os.getenv("IDEMP_CACHE_TTL_SECONDS", "86400"))

settings = Settings()
