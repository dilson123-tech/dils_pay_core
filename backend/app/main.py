# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# init_db opcional (não quebra se não existir)
try:
    from app.database.init_db import init_db
except Exception:
    def init_db():
        pass

# ✅ cria o app primeiro
app = FastAPI(title="DilsPay Core", version="0.1.0")

# 🔓 CORS único (sem duplicatas)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "null", "http://127.0.0.1:5500", "http://localhost:5500"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*", "Authorization", "Content-Type"],
    # expõe cabeçalhos para os totalizadores no front
    expose_headers=[
        "X-Total", "X-Total-Count", "X-Total-Pages", "X-Page", "X-Page-Size",
        "X-Total-Credito", "X-Total-Debito", "X-Total-Saldo", "X-Total-Saldo-Periodo",
    ],
)

# 🚀 startup
@app.on_event("startup")
def on_startup():
    try:
        init_db()
    except Exception as e:
        print(f"[startup] init_db falhou: {e}")

# 🔌 helper para incluir routers com segurança
def _mount(module_path: str, tag: str):
    try:
        mod = __import__(module_path, fromlist=["router"])
        app.include_router(mod.router, prefix="/api/v1", tags=[tag])
        print(f"[router] OK -> {module_path}")
    except Exception as e:
        print(f"[router] PULANDO {module_path}: {e}")

# 🧭 monte aqui os routers que existirem no seu projeto
_mount("app.api.v1.routes.health",   "health")
_mount("app.api.v1.routes.auth",     "auth")      # <- login/register
_mount("app.api.v1.routes.ledger",   "ledger")
_mount("app.api.v1.routes.wallet",   "wallet")
_mount("app.api.v1.routes.pix",      "pix")       # opcional
_mount("app.api.v1.routes.webhooks", "webhooks")  # opcional
_mount("app.api.v1.routes.debug",    "debug")     # opcional

# raiz simples
@app.get("/")
def root():
    return {"status": "ok", "name": "DilsPay Core"}
