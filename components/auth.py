# auth.py — DataPrep AI authentication
import sqlite3
import secrets
import bcrypt
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

# ── Config ────────────────────────────────────────────────────────────────────
_SECRET_FILE = Path(__file__).parent / ".secret_key"

def _load_secret() -> str:
    if _SECRET_FILE.exists():
        return _SECRET_FILE.read_text().strip()
    key = secrets.token_hex(32)
    _SECRET_FILE.write_text(key)
    return key

SECRET_KEY     = _load_secret()
ALGORITHM      = "HS256"
TOKEN_EXPIRE_H = 24

# ── Password hashing (bcrypt directly, no passlib) ────────────────────────────
def hash_password(plain: str) -> str:
    # bcrypt has a 72-byte limit; SHA-256 pre-hash removes that constraint
    import hashlib
    hashed_input = hashlib.sha256(plain.encode()).hexdigest().encode()
    return bcrypt.hashpw(hashed_input, bcrypt.gensalt(rounds=12)).decode()

def verify_password(plain: str, hashed: str) -> bool:
    import hashlib
    hashed_input = hashlib.sha256(plain.encode()).hexdigest().encode()
    return bcrypt.checkpw(hashed_input, hashed.encode())

# ── SQLite ─────────────────────────────────────────────────────────────────────
DB_PATH = Path(__file__).parent / "users.db"

def get_connection() -> sqlite3.Connection:
    """Return an open connection — caller must close it."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_db():
    """FastAPI dependency — yields connection, closes after request."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT    UNIQUE NOT NULL,
            username      TEXT    UNIQUE NOT NULL,
            password_hash TEXT    NOT NULL,
            created_at    TEXT    NOT NULL
        )
    """)
    conn.commit()
    conn.close()

# ── User CRUD ──────────────────────────────────────────────────────────────────
def create_user(conn: sqlite3.Connection, email: str, username: str, password: str) -> dict:
    if conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone():
        raise HTTPException(status_code=400, detail="Email already registered.")
    if conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone():
        raise HTTPException(status_code=400, detail="Username already taken.")

    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO users (email, username, password_hash, created_at) VALUES (?,?,?,?)",
        (email, username, hash_password(password), now),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone())

def get_user_by_email(conn: sqlite3.Connection, email: str):
    row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    return dict(row) if row else None

# ── JWT ────────────────────────────────────────────────────────────────────────
def create_token(user_id: int, username: str) -> str:
    expire  = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_H)
    payload = {"sub": str(user_id), "username": username, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

# ── FastAPI auth dependency ────────────────────────────────────────────────────
bearer_scheme = HTTPBearer()

def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    return decode_token(credentials.credentials)