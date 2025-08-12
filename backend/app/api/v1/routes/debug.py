import hmac, hashlib
from fastapi import APIRouter, Request
from app.core.config import settings

router = APIRouter()

@router.post("/debug/hmac")
async def debug_hmac(request: Request):
    raw = await request.body()
    sig = hmac.new(settings.WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return {
        "server_secret": settings.WEBHOOK_SECRET,  # ⚠️ DEV somente!
        "hmac": sig,
        "bytes": len(raw),
    }
