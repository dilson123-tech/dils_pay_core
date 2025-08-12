# DilsPay Core - Extrato

## Backend (dev)
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

## Frontend (dev)
Abrir `frontend/extrato.html` com Live Server (porta 5500).
Configurar na UI:
- BASE_URL: http://127.0.0.1:8000
- Token: (colar JWT)
- Ledger ID: 1

## Observações
- Traz paginação, filtros, chips de data, CSV (página e tudo), ordenação, loading.
- Variáveis sensíveis e `dev.db` estão ignorados no `.gitignore`.
