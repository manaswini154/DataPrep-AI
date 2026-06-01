import httpx

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL        = "llama-3.3-70b-versatile"   # fast, free-tier friendly


def build_prompt(filename: str, summary: dict, changes: list[dict] | None = None) -> str:
    """
    Build a structured prompt from cleaning metadata.
    Works for both auto-clean (summary dict) and review-mode (changes list).
    """
    lines = [
        f"You are a data quality analyst. A user just cleaned a file called '{filename}'.",
        "Write a clear, detailed summary of what was done to the data.",
        "Use plain English. Be specific with numbers. Use bullet points per category.",
        "For null fills, mention the actual fill strategy used per column (e.g. median, mode, placeholder).",
        "End with a 1-sentence overall data quality verdict.",
        "",
        "=== CLEANING METADATA ===",
    ]

    if summary:
        lines += [
            f"- Original rows: {summary.get('original_rows', '?')}",
            f"- Final rows: {summary.get('final_rows', '?')}",
            f"- Duplicate rows removed: {summary.get('duplicates_removed', 0)}",
            f"- Whitespace issues fixed: {summary.get('whitespace_fixed', 0)}",
        ]
        nulls = summary.get("nulls_filled", {})
        if nulls:
            lines.append(f"- Null values filled in {len(nulls)} column(s):")
            for col, info in nulls.items():
                lines.append(f"    • '{col}': {info['count']} nulls — strategy: {info['method']}")
        renamed = summary.get("columns_renamed", {})
        if renamed:
            lines.append(f"- {len(renamed)} column(s) renamed to snake_case:")
            for old, new in renamed.items():
                lines.append(f"    • '{old}' → '{new}'")

    if changes:
        type_counts: dict[str, int] = {}
        for c in changes:
            type_counts[c["type"]] = type_counts.get(c["type"], 0) + 1
        lines.append(f"- Total proposed changes: {len(changes)}")
        for t, n in type_counts.items():
            label = {"null_fill": "Null fills", "whitespace": "Whitespace fixes",
                     "duplicate_row": "Duplicate rows", "col_rename": "Column renames"}.get(t, t)
            lines.append(f"    • {label}: {n}")

    lines += ["", "Write the summary now:"]
    return "\n".join(lines)


async def get_groq_summary(
    api_key: str,
    filename: str,
    summary: dict | None = None,
    changes: list[dict] | None = None,
) -> str:
    """
    Call Groq API and return the AI-generated summary string.
    Raises ValueError on auth errors, httpx errors on network issues.
    """
    prompt = build_prompt(filename, summary or {}, changes)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 600,
        "temperature": 0.4,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(GROQ_API_URL, headers=headers, json=payload)

    if resp.status_code == 401:
        raise ValueError("Invalid Groq API key. Check your key at console.groq.com.")
    if resp.status_code != 200:
        raise ValueError(f"Groq API error {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()