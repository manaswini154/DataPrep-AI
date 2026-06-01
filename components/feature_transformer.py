"""
feature_transformer.py  —  DataPrep AI
Applies selected feature-engineering operations to a DataFrame.
Each operation maps to a transformer name (as recommended by the LLM).
Returns the transformed DataFrame + a change log.
"""

import re
import io
import math
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple


# ── Mapping from sklearn_class / operation name → handler key ─────────────────

# Normalise incoming operation/sklearn_class strings to a canonical key
_OP_MAP: Dict[str, str] = {
    # Scaling
    "robustscaler":           "robust_scale",
    "robust scaler":          "robust_scale",
    "sklearn.preprocessing.robustscaler": "robust_scale",
    "standardscaler":         "standard_scale",
    "standard scaler":        "standard_scale",
    "sklearn.preprocessing.standardscaler": "standard_scale",
    "minmaxscaler":           "minmax_scale",
    "minmax scaler":          "minmax_scale",
    "sklearn.preprocessing.minmaxscaler":  "minmax_scale",
    "normalizer":             "normalize",
    "sklearn.preprocessing.normalizer":    "normalize",

    # Encoding
    "onehotencoder":          "onehot_encode",
    "one-hot encoding":       "onehot_encode",
    "one hot encoding":       "onehot_encode",
    "sklearn.preprocessing.onehotencoder": "onehot_encode",
    "labelencoder":           "label_encode",
    "label encoding":         "label_encode",
    "ordinal encoding":       "label_encode",
    "sklearn.preprocessing.labelencoder":  "label_encode",
    "ordinalencoder":         "label_encode",
    "sklearn.preprocessing.ordinalencoder":"label_encode",
    "targetencoder":          "target_encode",
    "target encoding":        "target_encode",
    "frequency encoding":     "frequency_encode",

    # Transformation
    "log transformation":     "log_transform",
    "log transform":          "log_transform",
    "logtransformer":         "log_transform",
    "numpy.log1p":            "log_transform",
    "squareroottransformer":  "sqrt_transform",
    "sqrt transform":         "sqrt_transform",
    "square root transform":  "sqrt_transform",
    "powertransformer":       "power_transform",
    "power transform":        "power_transform",
    "boxcoxtransformer":      "boxcox_transform",
    "box-cox":                "boxcox_transform",
    "quantiletransformer":    "quantile_transform",
    "quantile transform":     "quantile_transform",
    "sklearn.preprocessing.quantiletransformer": "quantile_transform",

    # Feature creation
    "cyclicalfeatures":       "cyclical_encode",
    "cyclical encoding":      "cyclical_encode",
    "sine/cosine encoding":   "cyclical_encode",
    "cyclical features":      "cyclical_encode",
    "datetime decomposition": "datetime_decompose",
    "datetimefeatures":       "datetime_decompose",
    "datetime features":      "datetime_decompose",
    "ratiofeatures":          "ratio_feature",
    "ratio feature":          "ratio_feature",
    "ratio features":         "ratio_feature",
    "math features":          "ratio_feature",
    "differencetransformer":  "diff_feature",
    "difference feature":     "diff_feature",
    "interactionfeatures":    "interaction_feature",
    "interaction features":   "interaction_feature",
    "polynomialfeatures":     "polynomial_features",
    "polynomial features":    "polynomial_features",
    "sklearn.preprocessing.polynomialfeatures": "polynomial_features",
    "binarizer":              "binarize",
    "binarize":               "binarize",
    "sklearn.preprocessing.binarizer": "binarize",

    # Selection / misc
    "variancethreshold":      "drop_low_variance",
    "variance threshold":     "drop_low_variance",
    "sklearn.feature_selection.variancethreshold": "drop_low_variance",
    "drop constant":          "drop_low_variance",
    "missingindicator":       "missing_indicator",
    "missing indicator":      "missing_indicator",
    "sklearn.impute.missingindicator": "missing_indicator",
}


def _canonical(name: str) -> str:
    """Normalise operation/class name to lookup key."""
    return re.sub(r"\s+", " ", name.strip().lower())


def resolve_op(op_name: str, sklearn_class: str = "") -> str | None:
    """Return canonical handler key or None if unsupported."""
    for candidate in [op_name, sklearn_class]:
        key = _canonical(candidate)
        if key in _OP_MAP:
            return _OP_MAP[key]
        # try without spaces
        key2 = key.replace(" ", "")
        if key2 in _OP_MAP:
            return _OP_MAP[key2]
    return None


# ── Handlers ──────────────────────────────────────────────────────────────────

def _robust_scale(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    s = df[col]
    q1, q3 = s.quantile(0.25), s.quantile(0.75)
    iqr = q3 - q1 or 1.0
    df[col] = (s - s.median()) / iqr
    return df, f"RobustScaler applied to '{col}' (median={s.median():.4g}, IQR={iqr:.4g})"


def _standard_scale(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    s = df[col]
    mu, sigma = s.mean(), s.std() or 1.0
    df[col] = (s - mu) / sigma
    return df, f"StandardScaler applied to '{col}' (μ={mu:.4g}, σ={sigma:.4g})"


def _minmax_scale(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    s = df[col]
    lo, hi = s.min(), s.max()
    rng = hi - lo or 1.0
    df[col] = (s - lo) / rng
    return df, f"MinMaxScaler applied to '{col}' → [0, 1]"


def _normalize(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    s = df[col].astype(float)
    norm = np.linalg.norm(s.values)
    df[col] = s / (norm or 1.0)
    return df, f"L2 Normalizer applied to '{col}'"


def _log_transform(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    s = df[col]
    shift = max(0.0, -s.min() + 1e-6) if s.min() <= 0 else 0.0
    df[col] = np.log1p(s + shift)
    note = f" (shifted by {shift:.4g})" if shift else ""
    return df, f"log1p transform applied to '{col}'{note}"


def _sqrt_transform(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    s = df[col]
    shift = max(0.0, -s.min()) if s.min() < 0 else 0.0
    df[col] = np.sqrt(s + shift)
    note = f" (shifted by {shift:.4g})" if shift else ""
    return df, f"sqrt transform applied to '{col}'{note}"


def _power_transform(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    # Yeo-Johnson (works on any range)
    from scipy.stats import yeojohnson
    vals, _ = yeojohnson(df[col].astype(float).fillna(df[col].median()))
    df[col] = vals
    return df, f"Yeo-Johnson power transform applied to '{col}'"


def _boxcox_transform(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    from scipy.stats import boxcox
    s = df[col].astype(float)
    shift = max(0.0, -s.min() + 1e-6) if s.min() <= 0 else 0.0
    vals, _ = boxcox(s + shift)
    df[col] = vals
    note = f" (shifted by {shift:.4g})" if shift else ""
    return df, f"Box-Cox transform applied to '{col}'{note}"


def _quantile_transform(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    s = df[col].astype(float)
    ranks = s.rank(method="average") / (len(s) + 1)
    df[col] = ranks
    return df, f"Quantile transform applied to '{col}' → uniform [0,1]"


def _onehot_encode(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    dummies = pd.get_dummies(df[col], prefix=col, drop_first=False, dtype=int)
    df = pd.concat([df.drop(columns=[col]), dummies], axis=1)
    return df, f"One-hot encoding applied to '{col}' → {list(dummies.columns)}"


def _label_encode(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    categories = sorted(df[col].dropna().unique().tolist())
    mapping = {v: i for i, v in enumerate(categories)}
    df[col] = df[col].map(mapping).astype("Int64")
    return df, f"Label encoding applied to '{col}' ({len(categories)} categories)"


def _frequency_encode(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    freq = df[col].value_counts(normalize=True)
    new_col = col + "_freq"
    df[new_col] = df[col].map(freq).round(6)
    return df, f"Frequency encoding: new column '{new_col}' added"


def _target_encode(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    # Without a target column we fall back to frequency encoding
    return _frequency_encode(df, col)


def _cyclical_encode(df: pd.DataFrame, col: str, **kw) -> Tuple[pd.DataFrame, str]:
    s = df[col]
    # try to infer period
    max_val = kw.get("period") or s.max()
    if max_val == 0:
        max_val = 1
    df[col + "_sin"] = np.sin(2 * math.pi * s / max_val)
    df[col + "_cos"] = np.cos(2 * math.pi * s / max_val)
    return df, f"Cyclical encoding applied to '{col}' → '{col}_sin', '{col}_cos' (period={max_val})"


def _datetime_decompose(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    try:
        dt = pd.to_datetime(df[col], errors="coerce")
    except Exception:
        return df, f"Could not parse '{col}' as datetime — skipped"
    prefix = col
    df[prefix + "_year"]       = dt.dt.year.astype("Int64")
    df[prefix + "_month"]      = dt.dt.month.astype("Int64")
    df[prefix + "_day"]        = dt.dt.day.astype("Int64")
    df[prefix + "_dayofweek"]  = dt.dt.dayofweek.astype("Int64")
    df[prefix + "_hour"]       = dt.dt.hour.astype("Int64")
    new_cols = [f"{prefix}_year", f"{prefix}_month", f"{prefix}_day",
                f"{prefix}_dayofweek", f"{prefix}_hour"]
    return df, f"Datetime decomposed '{col}' → {new_cols}"


def _ratio_feature(df: pd.DataFrame, col: str, paired_cols: List[str] = None, **_) -> Tuple[pd.DataFrame, str]:
    if not paired_cols:
        return df, f"No paired column for ratio feature on '{col}' — skipped"
    partner = paired_cols[0]
    if partner not in df.columns:
        return df, f"Paired column '{partner}' not found — skipped"
    new_col = f"{col}_div_{partner}"
    df[new_col] = df[col] / df[partner].replace(0, np.nan)
    return df, f"Ratio feature created: '{new_col}' = {col} / {partner}"


def _diff_feature(df: pd.DataFrame, col: str, paired_cols: List[str] = None, **_) -> Tuple[pd.DataFrame, str]:
    if not paired_cols:
        return df, f"No paired column for diff feature on '{col}' — skipped"
    partner = paired_cols[0]
    if partner not in df.columns:
        return df, f"Paired column '{partner}' not found — skipped"
    new_col = f"{col}_minus_{partner}"
    df[new_col] = df[col] - df[partner]
    return df, f"Difference feature created: '{new_col}' = {col} - {partner}"


def _interaction_feature(df: pd.DataFrame, col: str, paired_cols: List[str] = None, **_) -> Tuple[pd.DataFrame, str]:
    if not paired_cols:
        return df, f"No paired column for interaction on '{col}' — skipped"
    partner = paired_cols[0]
    if partner not in df.columns:
        return df, f"Paired column '{partner}' not found — skipped"
    new_col = f"{col}_x_{partner}"
    df[new_col] = df[col] * df[partner]
    return df, f"Interaction feature created: '{new_col}' = {col} × {partner}"


def _polynomial_features(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    s = df[col]
    df[col + "_sq"]   = s ** 2
    df[col + "_cube"] = s ** 3
    return df, f"Polynomial features added: '{col}_sq' (²) and '{col}_cube' (³)"


def _binarize(df: pd.DataFrame, col: str, **kw) -> Tuple[pd.DataFrame, str]:
    threshold = kw.get("threshold", df[col].median())
    new_col = col + "_bin"
    df[new_col] = (df[col] > threshold).astype(int)
    return df, f"Binarized '{col}' at threshold={threshold:.4g} → '{new_col}'"


def _drop_low_variance(df: pd.DataFrame, col: str, **kw) -> Tuple[pd.DataFrame, str]:
    threshold = kw.get("threshold", 0.01)
    variance = df[col].var()
    if pd.isna(variance) or variance <= threshold:
        df = df.drop(columns=[col])
        return df, f"Dropped '{col}' (variance={variance:.6g} ≤ {threshold})"
    return df, f"'{col}' kept (variance={variance:.6g} > {threshold})"


def _missing_indicator(df: pd.DataFrame, col: str, **_) -> Tuple[pd.DataFrame, str]:
    new_col = col + "_was_missing"
    df[new_col] = df[col].isna().astype(int)
    return df, f"Missing indicator added: '{new_col}' (1 = was null)"


_HANDLERS = {
    "robust_scale":       _robust_scale,
    "standard_scale":     _standard_scale,
    "minmax_scale":       _minmax_scale,
    "normalize":          _normalize,
    "log_transform":      _log_transform,
    "sqrt_transform":     _sqrt_transform,
    "power_transform":    _power_transform,
    "boxcox_transform":   _boxcox_transform,
    "quantile_transform": _quantile_transform,
    "onehot_encode":      _onehot_encode,
    "label_encode":       _label_encode,
    "frequency_encode":   _frequency_encode,
    "target_encode":      _target_encode,
    "cyclical_encode":    _cyclical_encode,
    "datetime_decompose": _datetime_decompose,
    "ratio_feature":      _ratio_feature,
    "diff_feature":       _diff_feature,
    "interaction_feature":_interaction_feature,
    "polynomial_features":_polynomial_features,
    "binarize":           _binarize,
    "drop_low_variance":  _drop_low_variance,
    "missing_indicator":  _missing_indicator,
}


# ── Public API ─────────────────────────────────────────────────────────────────

class ApplyResult:
    def __init__(self):
        self.applied: List[Dict] = []     # {column, operation, message}
        self.skipped: List[Dict] = []     # {column, operation, reason}
        self.errors:  List[Dict] = []     # {column, operation, error}


def apply_feature_operations(
    df: pd.DataFrame,
    selections: List[Dict[str, Any]],
) -> Tuple[pd.DataFrame, ApplyResult]:
    """
    Apply a list of selected feature-engineering operations.

    Each item in `selections` is:
    {
        "column_name":   str,
        "operation":     str,       # LLM-generated operation name
        "sklearn_class": str,       # optional sklearn class
        "paired_cols":   [str],     # optional paired columns
        "period":        float,     # optional (for cyclical)
    }

    Returns (transformed_df, result_log).
    """
    result = ApplyResult()
    wdf = df.copy()

    for sel in selections:
        col        = sel.get("column_name", "")
        op_name    = sel.get("operation", "")
        sk_class   = sel.get("sklearn_class", "")
        paired     = sel.get("paired_cols", [])
        extra_kw   = {k: v for k, v in sel.items()
                      if k not in ("column_name", "operation", "sklearn_class", "paired_cols")}

        handler_key = resolve_op(op_name, sk_class)
        if handler_key is None:
            result.skipped.append({
                "column": col, "operation": op_name,
                "reason": f"Operation '{op_name}' is not yet supported for automatic application.",
            })
            continue

        if col not in wdf.columns:
            result.skipped.append({
                "column": col, "operation": op_name,
                "reason": f"Column '{col}' not found in dataframe.",
            })
            continue

        handler = _HANDLERS[handler_key]
        try:
            wdf, message = handler(wdf, col, paired_cols=paired, **extra_kw)
            result.applied.append({"column": col, "operation": op_name, "message": message})
        except Exception as exc:
            result.errors.append({"column": col, "operation": op_name, "error": str(exc)})

    return wdf, result


def df_to_csv_bytes(df: pd.DataFrame) -> bytes:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue().encode("utf-8")