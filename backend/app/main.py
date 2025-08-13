from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DilsPay Core", version="0.1.0")

# CORS básico p/ dev local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Routers ===
# os obrigatórios:
from app.api.v1.routes import health, auth, ledger
from app.api.v1.routes import wallet as wallet_routes  # nosso dropdown

# os opcionais: tenta importar, mas não quebra se não existirem
try:
    from app.api.v1.routes import pix as pix_routes
except Exception:
    pix_routes = None

try:
    from app.api.v1.routes import webhooks
except Exception:
    webhooks = None

try:
    from app.api.v1.routes import debug
except Exception:
    debug = None

# monte aqui os routers
app.include_router(health.router,        prefix="/api/v1", tags=["health"])
app.include_router(auth.router,          prefix="/api/v1", tags=["auth"])
app.include_router(ledger.router,        prefix="/api/v1", tags=["ledger"])
app.include_router(wallet_routes.router, prefix="/api/v1", tags=["wallet"])

if pix_routes:
    app.include_router(pix_routes.router, prefix="/api/v1", tags=["pix"])
if webhooks:
    app.include_router(webhooks.router,   prefix="/api/v1", tags=["webhooks"])
if debug:
    app.include_router(debug.router,      prefix="/api/v1", tags=["debug"])

# raiz simples
@app.get("/")
def root():
    return {"status": "ok", "name": "DilsPay Core"}
