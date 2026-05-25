# DataPrep AI — FastAPI backend with JWT auth + Groq AI summaries
#
# Setup:
#   pip install -r requirements.txt
#   uvicorn main:app --reload
#   Then open http://localhost:8000

import base64
import io
import json
from pathlib import Path

import pandas as pd
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from auth import (
    create_token, create_user, get_connection,
    get_user_by_email, init_db, require_auth, verify_password
)
from cleaner import analyze_dataframe, apply_approved_changes, clean_dataframe
from groq_summary import get_groq_summary

app = FastAPI(title="DataPrep AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

INDEX_HTML = Path(__file__).parent / "index.html"


def _read_file(file: UploadFile, contents: bytes) -> pd.DataFrame:
    name = file.filename.lower()
    if name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(contents))
    elif name.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(contents))
    raise HTTPException(status_code=400, detail="Only CSV and Excel (.xlsx/.xls) files are accepted.")


# ══════════════════════════════════════════════════════════════════════
# PUBLIC ROUTES
# ══════════════════════════════════════════════════════════════════════

@app.get("/", response_class=HTMLResponse)
async def root():
    if not INDEX_HTML.exists():
        raise HTTPException(status_code=404, detail="index.html not found")
    return HTMLResponse(content=INDEX_HTML.read_text(encoding="utf-8"))


@app.post("/auth/register")
async def register(
    email:    str = Form(...),
    username: str = Form(...),
    password: str = Form(...),
):
    email    = email.strip().lower()
    username = username.strip()
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    conn = get_connection()
    try:
        user = create_user(conn, email, username, password)
    finally:
        conn.close()
    token = create_token(user["id"], user["username"])
    return {"token": token, "username": user["username"], "email": user["email"]}


@app.post("/auth/login")
async def login(
    email:    str = Form(...),
    password: str = Form(...),
):
    conn = get_connection()
    try:
        user = get_user_by_email(conn, email.strip().lower())
    finally:
        conn.close()
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_token(user["id"], user["username"])
    return {"token": token, "username": user["username"], "email": user["email"]}


# ══════════════════════════════════════════════════════════════════════
# PROTECTED ROUTES
# ══════════════════════════════════════════════════════════════════════

@app.get("/auth/me")
async def me(current_user: dict = Depends(require_auth)):
    return {"username": current_user["username"], "user_id": current_user["sub"]}


@app.post("/clean")
async def clean_csv(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_auth),
):
    contents = await file.read()
    try:
        df = _read_file(file, contents)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")
    if df.empty:
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")
    cleaned_df, summary = clean_dataframe(df)
    buf = io.StringIO()
    cleaned_df.to_csv(buf, index=False)
    encoded = base64.b64encode(buf.getvalue().encode()).decode()
    return {"summary": summary, "cleaned_csv": encoded, "filename": file.filename}


@app.post("/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_auth),
):
    contents = await file.read()
    try:
        df = _read_file(file, contents)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")
    if df.empty:
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")
    result = analyze_dataframe(df)
    result["original_b64"] = base64.b64encode(contents).decode()
    result["filename"]     = file.filename
    result["is_excel"]     = file.filename.lower().endswith((".xlsx", ".xls"))
    return result


@app.post("/apply")
async def apply_changes(
    file:         UploadFile = File(...),
    approved_ids: str        = Form(...),
    current_user: dict       = Depends(require_auth),
):
    ids      = json.loads(approved_ids)
    contents = await file.read()
    try:
        df = _read_file(file, contents)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")
    analysis      = analyze_dataframe(df)
    all_changes   = analysis["changes"]
    file_bytes, _ = apply_approved_changes(df, ids, all_changes)
    encoded       = base64.b64encode(file_bytes).decode()
    return {"cleaned_csv": encoded, "filename": file.filename, "applied_count": len(ids)}


# ══════════════════════════════════════════════════════════════════════
# GROQ AI SUMMARY  (protected)
# ══════════════════════════════════════════════════════════════════════

@app.post("/summarize")
async def summarize(
    groq_api_key: str  = Form(...),
    filename:     str  = Form(...),
    summary_json: str  = Form("{}"),        # JSON string of auto-clean summary dict
    changes_json: str  = Form("[]"),        # JSON string of review-mode changes list
    current_user: dict = Depends(require_auth),
):
    """
    Call Groq LLM to generate a detailed AI summary of what was cleaned.
    Accepts data from either auto-clean mode (summary_json) or
    review mode (changes_json), or both.
    """
    if not groq_api_key.strip():
        raise HTTPException(status_code=400, detail="Groq API key is required.")

    try:
        summary_data = json.loads(summary_json)
        changes_data = json.loads(changes_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {e}")

    try:
        ai_text = await get_groq_summary(
            api_key  = groq_api_key.strip(),
            filename = filename,
            summary  = summary_data or None,
            changes  = changes_data or None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Groq request failed: {e}")

    return {"summary_text": ai_text}