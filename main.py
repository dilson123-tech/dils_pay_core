# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# DB init
from app.database.init_db import init_db

# importa os modelos (pra metadata das tabelas, se necessário)
from app.models import user, wallet, transaction, pix, invoice, audit_log  # ajuste se algum não existir

# routers
from app.api.v1.routes import health, auth, ledger, pix as pix_routes, webhooks, debug, wallet as wallet_routes

# ✅ cria o app primeiro
app = FastAPI(title="DilsPay Core", version="0.1.0")

# 🔓 CORS único e completo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "null", "http://127.0.0.1:5500", "http://localhost:5500"],
    allow_credentials=False,                       # não usamos cookies cross-domain
    allow_methods=["*"],                           # libera GET/POST/PUT/DELETE/OPTIONS
    allow_headers=["*", "Authorization", "Content-Type"],
    # expõe cabeçalhos pros totalizadores no front
    expose_headers=[
        "X-Total", "X-Total-Count", "X-Total-Pages", "X-Page", "X-Page-Size",
        "X-Total-Credito", "X-Total-Debito", "X-Total-Saldo", "X-Total-Saldo-Periodo",
    ],
)

# 🚀 startup
@app.on_event("startup")
def on_startup() -> None:
    init_db()

# 🧭 rotas
app.include_router(health.router,  prefix="/api/v1", tags=["health"])
app.include_router(auth.router,    prefix="/api/v1", tags=["auth"])
app.include_router(ledger.router,  prefix="/api/v1", tags=["ledger"])
app.include_router(pix_routes.router, prefix="/api/v1", tags=["pix"])
app.include_router(webhooks.router,   prefix="/api/v1", tags=["webhooks"])
app.include_router(debug.router,      prefix="/api/v1", tags=["debug"])
app.include_router(wallet_routes.router, prefix="/api/v1", tags=["wallet"])

# opcional: rota raiz simples
@app.get("/")
def root():
    return {"status": "ok", "name": "DilsPay Core"}
