import base64
import io
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
import uvicorn

import httpx
import pandas as pd
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

# ── Load .env file BEFORE reading any env vars ─────────────────────────────────
try:
    from dotenv import load_dotenv
    # Search up from main.py's directory to find .env
    _env_path = Path(__file__).parent / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
        print(f"✅ Loaded .env from {_env_path}")
    else:
        load_dotenv()   # fallback: search CWD and parent dirs
        print("✅ load_dotenv() called (searching standard locations)")
except ImportError:
    print("⚠️  python-dotenv not installed — run: pip install python-dotenv")

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
if _GROQ_API_KEY:
    print(f"✅ GROQ_API_KEY loaded ({len(_GROQ_API_KEY)} chars) — AI chat enabled")
else:
    print("⚠️  GROQ_API_KEY not found — check your .env file exists and contains GROQ_API_KEY=gsk_...")


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
# AI CHAT ASSISTANT — Groq-powered dataset Q&A proxy
# ══════════════════════════════════════════════════════════════════════

GROQ_CHAT_MODEL = "llama-3.3-70b-versatile"

@app.post("/chat")
async def chat_with_data(
    messages_json: str  = Form(...),   # JSON array [{role, content}, ...]
    system_prompt: str  = Form(""),    # context-rich system prompt from frontend
    user_api_key:  str  = Form(""),    # optional key from browser session storage
    current_user:  dict = Depends(require_auth),
):
    """
    Proxy chat messages to Groq. Uses server GROQ_API_KEY env var first,
    then falls back to user-supplied key, then returns a helpful fallback message.
    """
    groq_key = (_GROQ_API_KEY or "").strip() or user_api_key.strip()

    # Parse messages
    try:
        messages = json.loads(messages_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid messages JSON: {e}")

    if not isinstance(messages, list) or not messages:
        raise HTTPException(status_code=400, detail="messages must be a non-empty array.")

    # Sanitise: keep only valid role/content pairs, last 12 turns max
    clean_msgs = [
        {"role": m["role"], "content": str(m.get("content", "")).strip()}
        for m in messages[-12:]
        if m.get("role") in ("user", "assistant") and str(m.get("content", "")).strip()
    ]
    if not clean_msgs:
        raise HTTPException(status_code=400, detail="No valid messages after sanitisation.")

    # No key → return helpful fallback (don't error out)
    if not groq_key:
        last_q = next((m["content"] for m in reversed(clean_msgs) if m["role"] == "user"), "")
        fallback = (
            f"I received your question but the **GROQ_API_KEY** is not configured on the server. "
            f"To enable AI-powered chat:\n\n"
            f"1. Get a free key at https://console.groq.com\n"
            f"2. Add `GROQ_API_KEY=your_key_here` to your `.env` file\n"
            f"3. Restart the server\n\n"
            f"Once configured, I'll be able to answer questions like: \"{last_q[:100]}\""
        )
        return {"reply": fallback, "mode": "fallback"}

    # Build payload for Groq
    groq_messages = []
    if system_prompt.strip():
        groq_messages.append({"role": "system", "content": system_prompt.strip()})
    groq_messages.extend(clean_msgs)

    headers = {
        "Authorization": f"Bearer {groq_key}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":       GROQ_CHAT_MODEL,
        "messages":    groq_messages,
        "max_tokens":  600,
        "temperature": 0.5,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Groq API request timed out. Please try again.")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Groq API: {e}")

    if resp.status_code == 401:
        raise HTTPException(
            status_code=401,
            detail="Groq API key is invalid. Check GROQ_API_KEY in your .env file."
        )
    if resp.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail="Groq rate limit reached. Please wait a moment and try again."
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Groq returned error {resp.status_code}: {resp.text[:300]}"
        )

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
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)