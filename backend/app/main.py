from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# -----------------------------------------------------------------------------
# App
# -----------------------------------------------------------------------------
app = FastAPI(title="DilsPay Core", version="1.0.0")

# 🔑 Rota de token DEV (apenas para teste rápido; remova depois)
# 🔑 Rota de token DEV (só existe se ALLOW_LOGIN_DEV=1)
if os.getenv("ALLOW_LOGIN_DEV", "1") == "1":
    @app.post("/api/v1/login_dev")
    def login_dev():
        from app.core.security import create_access_token
        return {"access_token": create_access_token(sub="1"), "token_type": "bearer"}
# Se diferente de "1", a rota simplesmente NÃO é registrada."token"

# -----------------------------------------------------------------------------
# CORS (DEV): origens permitidas
# -----------------------------------------------------------------------------
_default_origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://192.168.1.14:5500",
    "http://192.168.1.14:5173",
]
_env_origins = os.getenv("ALLOW_ORIGINS", "")
origins = [o.strip() for o in _env_origins.split(",") if o.strip()] or _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Total",
        "X-Total-Pages",
        "X-Page",
        "X-Page-Size",
        "X-Total-Credito",
        "X-Total-Debito",
        "X-Total-Saldo",
    ],
)

# -----------------------------------------------------------------------------
# Routers
# -----------------------------------------------------------------------------
from app.api.v1.routes import health, ledger  # obrigatórios
from app.api.v1.routes import wallet as wallet_routes

app.include_router(health.router,        prefix="/api/v1", tags=["health"])
try:
    from app.api.v1.routes import auth
    app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
except Exception as e:
    print("⚠️ auth router pulado:", e)
app.include_router(ledger.router,        prefix="/api/v1", tags=["ledger"])
app.include_router(wallet_routes.router, prefix="/api/v1", tags=["wallet"])

# opcionais
try:
    from app.api.v1.routes import pix as pix_routes
    app.include_router(pix_routes.router, prefix="/api/v1", tags=["pix"])
except Exception:
    pass

try:
    from app.api.v1.routes import webhooks
    app.include_router(webhooks.router,   prefix="/api/v1", tags=["webhooks"])
except Exception:
    pass

try:
    from app.api.v1.routes import debug
    app.include_router(debug.router,      prefix="/api/v1", tags=["debug"])
except Exception:
    pass

# -----------------------------------------------------------------------------
# Health simples
# -----------------------------------------------------------------------------
@app.get("/")
def root():
    return {"status": "ok", "name": "DilsPay Core"}

# -----------------------------------------------------------------------------
# Execução direta
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
