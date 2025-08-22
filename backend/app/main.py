from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# -----------------------------------------------------------------------------
# App
# -----------------------------------------------------------------------------
app = FastAPI(title="DilsPay API")

# -----------------------------------------------------------------------------
# CORS (dev) – porta do front 5501
# -----------------------------------------------------------------------------
ALLOWED = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://192.168.1.14:5500",
    "http://127.0.0.1:5501",
    "http://localhost:5501",
    "http://192.168.1.14:5501",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Total",
        "X-Total-Count",
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

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(ledger.router, prefix="/api/v1", tags=["ledger"])
app.include_router(wallet_routes.router, prefix="/api/v1", tags=["wallet"])

# opcionais
try:
    from app.api.v1.routes import auth

    app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
except Exception as e:
    print("⚠️ auth router pulado:", e)

try:
    from app.api.v1.routes import pix as pix_routes

    app.include_router(pix_routes.router, prefix="/api/v1", tags=["pix"])
except Exception:
    pass

try:
    from app.api.v1.routes import webhooks

    app.include_router(webhooks.router, prefix="/api/v1", tags=["webhooks"])
except Exception:
    pass

try:
    from app.api.v1.routes import debug

    app.include_router(debug.router, prefix="/api/v1", tags=["debug"])
except Exception:
    pass

# -----------------------------------------------------------------------------
# DEV token (para testes)
# -----------------------------------------------------------------------------


from datetime import datetime, timedelta

try:
    import jwt  # PyJWT
except ImportError:
    jwt = None

DEV_JWT_SECRET = "dev-super-secret"
DEV_JWT_ALG = "HS256"
DEV_JWT_TTL_MIN = 60


def _make_dev_token(sub: str = "dev-user"):
    if jwt is None:
        return f"dev-token::{sub}::{int(datetime.utcnow().timestamp())}"
    payload = {
        "sub": sub,
        "iat": int(datetime.utcnow().timestamp()),
        "exp": int(
            (datetime.utcnow() + timedelta(minutes=DEV_JWT_TTL_MIN)).timestamp()
        ),
        "scope": "dev",
    }
    return jwt.encode(payload, DEV_JWT_SECRET, algorithm=DEV_JWT_ALG)


@app.post("/api/v1/login_dev")
def login_dev():
    token = _make_dev_token()
    return {"access_token": token}


# === Static files (frontend) ===
import os as _os

from fastapi.staticfiles import StaticFiles

_frontend_dir = _os.path.abspath(
    _os.path.join(_os.path.dirname(__file__), "..", "..", "frontend")
)
app.mount("/static", StaticFiles(directory=_frontend_dir), name="static")
print(f"[STATIC] Servindo frontend em: {_frontend_dir}")

# === Rota raiz -> extrato.html ===
from fastapi.responses import FileResponse


@app.get("/", include_in_schema=False)
def _root():
    return FileResponse(_os.path.join(_frontend_dir, "extrato.html"))


# --- SW root route (escopo "/" p/ controlar a página) ---
try:
    import os

    from fastapi.responses import FileResponse

    _FRONTEND_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
    )
    _SW_FILE = os.path.join(_FRONTEND_DIR, "sw.js")

    @app.get("/sw.js", include_in_schema=False)
    def _sw_root():
        return FileResponse(
            _SW_FILE,
            media_type="application/javascript",
            headers={"Service-Worker-Allowed": "/"},
        )

except Exception as _e:
    print("[SW] rota /sw.js não instalada:", _e)

# HEAD /sw.js para evitar 405
try:
    from fastapi.responses import Response

    @app.head("/sw.js", include_in_schema=False)
    def _sw_head():
        return Response(headers={"Service-Worker-Allowed": "/"})

except Exception as _e:
    print("[SW] rota HEAD /sw.js não instalada:", _e)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === Frontend HTML routes (idempotent) ===
try:
    import os

    from fastapi.responses import FileResponse

    _FRONTEND_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
    )
    _FRONT_HTML = os.path.join(_FRONTEND_DIR, "extrato.html")

    if os.path.exists(_FRONT_HTML):
        # /  -> extrato.html
        if not any(getattr(r, "path", "") == "/" for r in app.routes):

            @app.get("/", include_in_schema=False)
            def _serve_root():
                return FileResponse(_FRONT_HTML)

        # /extrato.html -> extrato.html
        if not any(getattr(r, "path", "") == "/extrato.html" for r in app.routes):

            @app.get("/extrato.html", include_in_schema=False)
            def _serve_extrato():
                return FileResponse(_FRONT_HTML)

    else:
        print("[FRONT] extrato.html não encontrado em", _FRONT_HTML)
except Exception as _e:
    print("[FRONT] rotas de HTML não instaladas:", _e)


# === Wallets HTML route (idempotent) ===
try:
    import os

    from fastapi.responses import FileResponse

    _FRONTEND_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
    )
    _WALLETS_HTML = os.path.join(_FRONTEND_DIR, "wallets.html")
    if os.path.exists(_WALLETS_HTML):
        if not any(getattr(r, "path", "") == "/wallets" for r in app.routes):

            @app.get("/wallets", include_in_schema=False)
            def _serve_wallets():
                return FileResponse(_WALLETS_HTML)

    else:
        print("[FRONT] wallets.html não encontrado em", _WALLETS_HTML)
except Exception as _e:
    print("[FRONT] rota /wallets não instalada:", _e)
