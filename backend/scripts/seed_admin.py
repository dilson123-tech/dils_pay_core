import os, sys, sqlite3, pathlib
from passlib.context import CryptContext

PWD = pathlib.Path(__file__).resolve().parent
BACKEND = PWD.parent
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dev.db")

def db_path(url: str) -> str:
    if not url.startswith("sqlite:///"):
        print(f"[ERRO] Só suportado sqlite:/// — DATABASE_URL={url}")
        sys.exit(1)
    p = url[len("sqlite:///"):]
    if p.startswith("./"):
        p = str((BACKEND / p[2:]).resolve())
    return p

def main():
    path = db_path(DATABASE_URL)
    print(f"[seed] DB: {path}")
    if not os.path.exists(path):
        print("[ERRO] DB não existe. Suba o backend uma vez pra gerar o dev.db.")
        sys.exit(1)

    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # checa colunas
    cur.execute("PRAGMA table_info(users);")
    cols = [r["name"] for r in cur.fetchall()]
    print("[seed] Colunas:", cols)
    required = {"id", "nome", "email", "senha_hash"}
    if not required.issubset(set(cols)):
        print("[ERRO] Esperado ao menos: id, nome, email, senha_hash")
        sys.exit(1)

    # dados do admin
    ADMIN_USER  = os.getenv("SEED_ADMIN_USER", "admin")
    ADMIN_EMAIL = os.getenv("SEED_ADMIN_EMAIL", "admin@example.com")
    ADMIN_PASS  = os.getenv("SEED_ADMIN_PASS", "123456")

    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto").hash(ADMIN_PASS)

    # procura por email OU nome
    cur.execute(
        "SELECT id, nome, email FROM users WHERE email = ? OR nome = ? LIMIT 1",
        (ADMIN_EMAIL, ADMIN_USER),
    )
    row = cur.fetchone()

    if row:
        cur.execute(
            "UPDATE users SET senha_hash = ?, nome = ?, email = ? WHERE id = ?",
            (pwd, ADMIN_USER, ADMIN_EMAIL, row["id"]),
        )
        conn.commit()
        print(f"[seed] Atualizado usuário existente (id={row['id']}).")
    else:
        cur.execute(
            "INSERT INTO users (nome, email, senha_hash) VALUES (?, ?, ?)",
            (ADMIN_USER, ADMIN_EMAIL, pwd),
        )
        conn.commit()
        print("[seed] Inserido usuário admin.")

    conn.close()
    print("[seed] OK.")

if __name__ == "__main__":
    main()
