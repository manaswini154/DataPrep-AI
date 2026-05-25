import pandas as pd
import re
import io
import base64


# ── Helpers ────────────────────────────────────────────────────────────────────

def _normalize_col(col: str) -> str:
    clean = col.strip().lower()
    clean = re.sub(r"[^\w\s]", "", clean)
    clean = re.sub(r"\s+", "_", clean)
    clean = re.sub(r"_+", "_", clean)
    return clean.strip("_")


# ── AUTO CLEAN (existing feature) ──────────────────────────────────────────────

def clean_dataframe(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Fully automatic clean. Returns (cleaned_df, summary_dict).
    """
    summary = {
        "original_rows": len(df),
        "duplicates_removed": 0,
        "nulls_filled": {},
        "whitespace_fixed": 0,
        "columns_renamed": {},
    }

    # 1. Standardize column names
    new_columns = {}
    for col in df.columns:
        clean = _normalize_col(col)
        if clean != col:
            new_columns[col] = clean
    if new_columns:
        df = df.rename(columns=new_columns)
        summary["columns_renamed"] = new_columns

    # 2. Remove duplicates
    before = len(df)
    df = df.drop_duplicates()
    summary["duplicates_removed"] = before - len(df)

    # 3. Strip whitespace
    whitespace_count = 0
    for col in df.select_dtypes(include=["object"]).columns:
        original = df[col].copy()
        df[col] = df[col].apply(lambda x: x.strip() if isinstance(x, str) else x)
        whitespace_count += int((original != df[col]).sum())
    summary["whitespace_fixed"] = whitespace_count

    # 4 & 5. Fill nulls
    for col in df.columns:
        null_count = int(df[col].isna().sum())
        if null_count == 0:
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            median_val = df[col].median()
            df[col] = df[col].fillna(median_val)
            summary["nulls_filled"][col] = {"count": null_count, "method": f"median ({median_val:.4g})"}
        else:
            df[col] = df[col].fillna("Unknown")
            summary["nulls_filled"][col] = {"count": null_count, "method": "Unknown"}

    summary["final_rows"] = len(df)
    return df, summary


# ── REVIEW MODE — analyze only, no mutations ───────────────────────────────────

def analyze_dataframe(df: pd.DataFrame) -> dict:
    """
    Scan a DataFrame and return structured proposed changes without applying them.

    Returns:
    {
      "rows":    [ [cell_value, ...], ... ],   # original data as list of lists
      "columns": ["col1", "col2", ...],
      "changes": [
        {
          "id":       unique int,
          "type":     "duplicate_row" | "null_fill" | "whitespace" | "col_rename",
          "row":      int | null,          # 0-based data row index
          "col":      int | null,          # 0-based column index
          "col_name": str | null,
          "old":      str | null,
          "new":      str | null,
          "reason":   str,
        },
        ...
      ]
    }
    """
    changes = []
    cid = 0

    # --- Column renames (affects headers, row=None) ---
    col_map = {}        # original → new name
    for i, col in enumerate(df.columns):
        new_name = _normalize_col(col)
        if new_name != col:
            changes.append({
                "id": cid, "type": "col_rename",
                "row": None, "col": i, "col_name": col,
                "old": col, "new": new_name,
                "reason": f'Rename to snake_case lowercase',
            })
            cid += 1
            col_map[col] = new_name
        else:
            col_map[col] = col

    # Working copy with normalized names for analysis
    wdf = df.copy()
    wdf.columns = [col_map[c] for c in wdf.columns]
    norm_cols = list(wdf.columns)

    # --- Duplicate rows ---
    seen = {}
    for row_idx, row_tuple in enumerate(wdf.itertuples(index=False, name=None)):
        key = row_tuple
        if key in seen:
            changes.append({
                "id": cid, "type": "duplicate_row",
                "row": row_idx, "col": None, "col_name": None,
                "old": f"Row {row_idx + 1} (duplicate of row {seen[key] + 1})",
                "new": "(remove row)",
                "reason": f"Identical to row {seen[key] + 1}",
            })
            cid += 1
        else:
            seen[key] = row_idx

    # --- Per-cell: whitespace & nulls ---
    for col_idx, col in enumerate(norm_cols):
        is_numeric = pd.api.types.is_numeric_dtype(wdf[col])

        # compute median once for numeric columns (ignoring NaN)
        median_val = None
        if is_numeric:
            m = wdf[col].median()
            if pd.notna(m):
                median_val = round(float(m), 6)

        for row_idx in range(len(wdf)):
            val = wdf.iloc[row_idx, col_idx]

            # Null fill
            if pd.isna(val):
                if is_numeric and median_val is not None:
                    changes.append({
                        "id": cid, "type": "null_fill",
                        "row": row_idx, "col": col_idx, "col_name": col,
                        "old": "", "new": str(median_val),
                        "reason": f"Fill missing with column median ({median_val})",
                    })
                else:
                    changes.append({
                        "id": cid, "type": "null_fill",
                        "row": row_idx, "col": col_idx, "col_name": col,
                        "old": "", "new": "Unknown",
                        "reason": "Fill missing text value with 'Unknown'",
                    })
                cid += 1
                continue

            # Whitespace strip (text only)
            if isinstance(val, str):
                stripped = val.strip()
                if stripped != val:
                    changes.append({
                        "id": cid, "type": "whitespace",
                        "row": row_idx, "col": col_idx, "col_name": col,
                        "old": val, "new": stripped,
                        "reason": "Strip leading/trailing whitespace",
                    })
                    cid += 1

    # Serialize original rows as strings for safe JSON transport
    rows_out = []
    for _, row in df.iterrows():
        rows_out.append([("" if pd.isna(v) else str(v)) for v in row])

    return {
        "columns": list(df.columns),
        "rows": rows_out,
        "changes": changes,
    }


# ── Apply approved changes & export ───────────────────────────────────────────

def apply_approved_changes(
    df: pd.DataFrame,
    approved_ids: list[int],
    all_changes: list[dict],
) -> tuple[bytes, str]:
    """
    Apply only approved change IDs to df and return (file_bytes, media_type).
    Exports as CSV.
    """
    approved = {c["id"]: c for c in all_changes if c["id"] in set(approved_ids)}

    wdf = df.copy()

    # 1. Column renames
    rename_map = {}
    for c in approved.values():
        if c["type"] == "col_rename":
            rename_map[c["old"]] = c["new"]
    if rename_map:
        wdf = wdf.rename(columns=rename_map)

    # Re-index columns after rename
    col_list = list(wdf.columns)

    # 2. Remove duplicate rows (collect row indices, remove once)
    rows_to_drop = set()
    for c in approved.values():
        if c["type"] == "duplicate_row":
            rows_to_drop.add(c["row"])
    if rows_to_drop:
        wdf = wdf.drop(index=list(rows_to_drop)).reset_index(drop=True)

    # 3. Cell-level changes (whitespace, null_fill)
    # Build a lookup: (row, col_idx) → new_value
    # After drop we need to remap row indices
    # Build sorted drop list to compute offset
    drop_sorted = sorted(rows_to_drop)

    def adjusted_row(orig_row):
        """Return new row index after drops, or None if this row was dropped."""
        if orig_row in rows_to_drop:
            return None
        offset = sum(1 for d in drop_sorted if d < orig_row)
        return orig_row - offset

    for c in approved.values():
        if c["type"] not in ("whitespace", "null_fill"):
            continue
        new_row = adjusted_row(c["row"])
        if new_row is None:
            continue
        col_idx = c["col"]
        # col_idx refers to original df column order; after rename same position
        col_name = col_list[col_idx]
        new_val = c["new"]
        # Cast to numeric if column is numeric
        if pd.api.types.is_numeric_dtype(wdf[col_name]):
            try:
                new_val = float(new_val)
            except ValueError:
                pass
        wdf.at[new_row, col_name] = new_val

    buf = io.StringIO()
    wdf.to_csv(buf, index=False)
    return buf.getvalue().encode("utf-8"), "text/csv"