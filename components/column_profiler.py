"""
column_profiler.py  —  DataPrep AI
Profiles every column in a DataFrame and produces column_context dicts
that drive the RAG retriever's query-building logic in retriever.py.
"""

import re
import pandas as pd
from typing import List, Dict, Any


# ── Cyclical name hints ───────────────────────────────────────────────────────
_CYCLICAL_RE = re.compile(
    r"\b(hour|minute|second|month|day_of_week|weekday|day_of_year"
    r"|week|quarter|season|angle|bearing|direction)\b",
    re.IGNORECASE,
)

# ── Geo name hints ────────────────────────────────────────────────────────────
_GEO_RE = re.compile(
    r"\b(lat(itude)?|lon(gitude)?|lng|coord|geo|location)\b",
    re.IGNORECASE,
)


def _has_outliers(series: pd.Series, k: float = 1.5) -> bool:
    q1, q3 = series.quantile(0.25), series.quantile(0.75)
    iqr = q3 - q1
    if iqr == 0:
        return False
    return bool(((series < q1 - k * iqr) | (series > q3 + k * iqr)).any())


def _classify_dtype(col_name: str, series: pd.Series) -> str:
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    if pd.api.types.is_numeric_dtype(series):
        return "geo" if _GEO_RE.search(col_name) else "numeric"
    return "geo" if _GEO_RE.search(col_name) else "categorical"


def _find_pairs(col_name: str, numeric_cols: List[str]) -> List[str]:
    stem = re.sub(
        r"[_\-\s](id|code|no|num|count|amount|val|value|score|rate|pct|percent)$",
        "", col_name, flags=re.IGNORECASE,
    )
    pairs = []
    for other in numeric_cols:
        if other == col_name:
            continue
        other_stem = re.sub(
            r"[_\-\s](id|code|no|num|count|amount|val|value|score|rate|pct|percent)$",
            "", other, flags=re.IGNORECASE,
        )
        if stem and (stem in other or other_stem in col_name):
            pairs.append(other)
        elif _GEO_RE.search(col_name) and _GEO_RE.search(other) and other not in pairs:
            pairs.append(other)
    return pairs[:4]


def profile_dataframe(
    df: pd.DataFrame,
    task: str = "unknown",
    max_sample: int = 5,
) -> List[Dict[str, Any]]:
    """
    Profile every column and return a list of column_context dicts.

    Parameters
    ----------
    df         : The cleaned DataFrame to profile.
    task       : ML task hint.
    max_sample : Number of sample values to include.
    """
    numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    contexts: List[Dict[str, Any]] = []

    for col in df.columns:
        series   = df[col]
        n_total  = len(series)
        n_null   = int(series.isna().sum())
        non_null = series.dropna()
        dtype    = _classify_dtype(col, series)

        skewness    = 0.0
        has_out     = False
        cardinality = 0

        if dtype in ("numeric", "geo") and len(non_null) >= 2:
            try:
                skewness = round(float(non_null.skew()), 4)
            except Exception:
                skewness = 0.0
            has_out     = _has_outliers(non_null)
            cardinality = int(non_null.nunique())
        elif dtype == "categorical":
            cardinality = int(non_null.nunique())

        is_cyclical = bool(_CYCLICAL_RE.search(col)) or dtype == "datetime"
        paired      = _find_pairs(col, numeric_cols) if dtype in ("numeric", "geo") else []

        try:
            samples = [round(v, 4) if isinstance(v, float) else v
                       for v in non_null.head(max_sample).tolist()]
        except Exception:
            samples = []

        contexts.append({
            "column_name"   : col,
            "dtype"         : dtype,
            "cardinality"   : cardinality,
            "skewness"      : skewness,
            "missing_pct"   : round(n_null / n_total * 100, 2) if n_total else 0.0,
            "has_outliers"  : has_out,
            "is_cyclical"   : is_cyclical,
            "paired_columns": paired,
            "sample_values" : samples,
            "task"          : task,
        })

    return contexts