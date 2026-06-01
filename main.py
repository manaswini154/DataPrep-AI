import base64
import io
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import pandas as pd
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from components.auth import (
    create_token, create_user, get_connection,
    get_user_by_email, init_db, require_auth, verify_password,
)
from components.cleaner import analyze_dataframe, apply_approved_changes, clean_dataframe
from components.groq_summary import get_groq_summary
from components.recommender import FeatureEngineeringRecommender
from components.column_profiler import profile_dataframe
from components.feature_transformer import apply_feature_operations, df_to_csv_bytes

# ── Server-side Groq key (set GROQ_API_KEY in .env or environment) ─────────────
_GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


# ══════════════════════════════════════════════════════════════════════
# LIFESPAN
# ══════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    timeout = httpx.Timeout(30.0)
    app.state.http_client = httpx.AsyncClient(timeout=timeout)

    # Load RAG recommender once at startup (non-fatal if not yet ingested)
    try:
        app.state.recommender = FeatureEngineeringRecommender()
        print("✅ RAG recommender ready.")
    except Exception as e:
        app.state.recommender = None
        print(f"⚠️  RAG recommender unavailable (run ingest.py first): {e}")

    print("🗄️  Database ready & HTTP client initialized.")
    yield

    await app.state.http_client.aclose()
    print("🛑 HTTP client closed.")


# ══════════════════════════════════════════════════════════════════════
# APP
# ══════════════════════════════════════════════════════════════════════

app = FastAPI(title="DataPrep AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

INDEX_HTML = Path(__file__).parent / "index.html"


def _read_file(file: UploadFile, contents: bytes) -> pd.DataFrame:
    name = file.filename.lower()
    if name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(contents))
    elif name.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(contents))
    raise HTTPException(
        status_code=400,
        detail="Only CSV and Excel (.xlsx/.xls) files are accepted.",
    )


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
# GROQ AI SUMMARY
# ══════════════════════════════════════════════════════════════════════

@app.post("/summarize")
async def summarize(
    request:      Request,
    filename:     str  = Form(...),
    summary_json: str  = Form("{}"),
    changes_json: str  = Form("[]"),
    current_user: dict = Depends(require_auth),
):
    groq_api_key = _GROQ_API_KEY
    if not groq_api_key:
        # Return a rule-based summary instead of failing
        try:
            summary_data = json.loads(summary_json)
            changes_data = json.loads(changes_json)
        except json.JSONDecodeError:
            summary_data, changes_data = {}, []
        lines = [f"Cleaning completed for **{filename}**."]
        if summary_data:
            if summary_data.get("duplicates_removed", 0):
                lines.append(f"• Removed {summary_data['duplicates_removed']} duplicate rows.")
            if summary_data.get("whitespace_fixed", 0):
                lines.append(f"• Fixed whitespace in {summary_data['whitespace_fixed']} cells.")
            nulls = summary_data.get("nulls_filled", {})
            if nulls:
                lines.append(f"• Filled missing values in {len(nulls)} column(s): {', '.join(nulls.keys())}.")
            renamed = summary_data.get("columns_renamed", {})
            if renamed:
                lines.append(f"• Renamed {len(renamed)} column(s) to snake_case.")
            lines.append(f"\nFinal dataset: {summary_data.get('final_rows', '?')} rows (started with {summary_data.get('original_rows', '?')}).")
        if changes_data:
            lines.append(f"\n{len(changes_data)} changes were applied during review.")
        lines.append("\n_AI narrative summary unavailable — add GROQ_API_KEY to .env for richer summaries._")
        return {"summary_text": "\n".join(lines)}
    try:
        summary_data = json.loads(summary_json)
        changes_data = json.loads(changes_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {e}")
    try:
        ai_text = await get_groq_summary(
            api_key  = groq_api_key,
            filename = filename,
            summary  = summary_data or None,
            changes  = changes_data or None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Groq request failed: {e}")
    return {"summary_text": ai_text}


# ══════════════════════════════════════════════════════════════════════
# RAG FEATURE ENGINEERING RECOMMENDER
# ══════════════════════════════════════════════════════════════════════

@app.post("/recommend")
async def recommend_features(
    request:      Request,
    file:         UploadFile = File(...),
    task:         str        = Form("unknown"),
    user_api_key: str        = Form(""),          # optional user-supplied Groq key
    current_user: dict       = Depends(require_auth),
):
    """
    RAG-powered feature engineering recommendations.
    Falls back to intelligent rule-based recommendations if no Groq API key is available.
    """
    from components.recommender import _rule_based_recommend

    # Resolve API key: server env → user-supplied → None (rule-based fallback)
    groq_api_key = _GROQ_API_KEY or user_api_key.strip() or ""

    contents = await file.read()
    try:
        df = _read_file(file, contents)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")
    if df.empty:
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")

    # Profile all columns
    column_contexts = profile_dataframe(df, task=task.strip().lower())

    # Try RAG+LLM first; fall back to rule-based if unavailable
    recommender: FeatureEngineeringRecommender | None = request.app.state.recommender
    use_ai = bool(groq_api_key) and recommender is not None

    if use_ai:
        try:
            results = recommender.batch_recommend(
                columns=column_contexts,
                api_key=groq_api_key,
            )
            mode = "ai"
        except Exception:
            # AI failed — fall back silently
            results = [_rule_based_recommend(ctx) for ctx in column_contexts]
            mode = "rule_based"
    else:
        results = [_rule_based_recommend(ctx) for ctx in column_contexts]
        mode = "rule_based"

    return {
        "filename"        : file.filename,
        "task"            : task,
        "columns_analysed": len(results),
        "columns"         : results,
        "mode"            : mode,   # "ai" or "rule_based"
    }



# ══════════════════════════════════════════════════════════════════════
# AI CHAT ASSISTANT — Groq-powered dataset Q&A
# ══════════════════════════════════════════════════════════════════════

GROQ_API_URL  = "https://api.groq.com/openai/v1/chat/completions"
GROQ_CHAT_MODEL = "llama-3.3-70b-versatile"

@app.post("/chat")
async def chat_with_data(
    request:      Request,
    messages_json: str = Form(...),     # JSON array of {role, content}
    system_prompt: str = Form(""),      # context-rich system prompt from frontend
    user_api_key:  str = Form(""),      # optional user-supplied key
    current_user:  dict = Depends(require_auth),
):
    """
    Groq-powered chat endpoint for the dataset AI assistant.
    Accepts conversation history + a context-rich system prompt built client-side.
    Falls back to a helpful static response if no API key is configured.
    """
    groq_key = _GROQ_API_KEY or user_api_key.strip()

    try:
        messages = json.loads(messages_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid messages JSON: {e}")

    if not isinstance(messages, list) or not messages:
        raise HTTPException(status_code=400, detail="messages must be a non-empty array.")

    # Sanitise — only keep role/content, enforce alternating roles
    clean_messages = []
    for m in messages[-12:]:   # cap at last 12 turns
        role    = m.get("role", "")
        content = str(m.get("content", "")).strip()
        if role in ("user", "assistant") and content:
            clean_messages.append({"role": role, "content": content})

    if not clean_messages:
        raise HTTPException(status_code=400, detail="No valid messages found.")

    # No API key → return a polite fallback
    if not groq_key:
        last_user_msg = next(
            (m["content"] for m in reversed(clean_messages) if m["role"] == "user"), ""
        )
        fallback = (
            f"I can see you asked: \"{last_user_msg[:120]}\". "
            "To enable AI-powered answers, add your **GROQ_API_KEY** to the `.env` file "
            "and restart the server. You can get a free key at console.groq.com."
        )
        return {"reply": fallback, "mode": "fallback"}

    # Build Groq payload
    groq_messages = []
    if system_prompt.strip():
        # Groq uses a system message at position 0
        groq_messages.append({"role": "system", "content": system_prompt.strip()})
    groq_messages.extend(clean_messages)

    headers = {
        "Authorization": f"Bearer {groq_key}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":       GROQ_CHAT_MODEL,
        "messages":    groq_messages,
        "max_tokens":  512,
        "temperature": 0.5,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(GROQ_API_URL, headers=headers, json=payload)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Groq API request timed out.")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Groq API: {e}")

    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Invalid Groq API key.")
    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="Groq rate limit reached. Please wait a moment.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Groq error {resp.status_code}: {resp.text[:200]}")

    data  = resp.json()
    reply = data["choices"][0]["message"]["content"].strip()
    return {"reply": reply, "mode": "groq"}


# ══════════════════════════════════════════════════════════════════════
# APPLY SELECTED FEATURE ENGINEERING OPERATIONS
# ══════════════════════════════════════════════════════════════════════

@app.post("/apply_features")
async def apply_features(
    file:       UploadFile = File(...),
    selections: str        = Form(...),   # JSON list of operation dicts
    current_user: dict     = Depends(require_auth),
):
    """
    Apply selected feature-engineering operations to a cleaned CSV.

    `selections` is a JSON array of:
    [
      {
        "column_name":   "price",
        "operation":     "RobustScaler",
        "sklearn_class": "sklearn.preprocessing.RobustScaler",
        "paired_cols":   ["cost"]
      },
      ...
    ]

    Returns the transformed CSV as base64.
    """
    try:
        ops = json.loads(selections)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid selections JSON: {e}")

    contents = await file.read()
    try:
        df = _read_file(file, contents)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")
    if df.empty:
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")

    try:
        transformed_df, result = apply_feature_operations(df, ops)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transformation failed: {e}")

    csv_bytes = df_to_csv_bytes(transformed_df)
    encoded   = base64.b64encode(csv_bytes).decode()

    return {
        "transformed_csv": encoded,
        "filename":        file.filename,
        "original_cols":   len(df.columns),
        "final_cols":      len(transformed_df.columns),
        "applied":         result.applied,
        "skipped":         result.skipped,
        "errors":          result.errors,
    }