"""
recommender.py  —  RAG-powered feature engineering recommender.

The LLM only RECOMMENDS — no data is modified here.
Actual transformations are done by the user in their own pipeline.
"""

import json
import time
import httpx
from typing import Dict, Any, List

# Import tenacity for robust rate-limit handling
from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception_type

from components.retriever import FeatureEngineeringRetriever


GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """You are a feature engineering expert AI for DataPrep AI, a no-code data preprocessing tool.

Your role:
1. Analyze a dataset column's characteristics
2. Use the provided reference knowledge to recommend specific feature engineering operations
3. Explain WHY each operation is recommended in plain English
4. Name the exact transformer to apply

Rules:
- Only recommend operations supported by the reference knowledge provided
- Be specific: name exact transformers (e.g., "RobustScaler", "OneHotEncoder", "CyclicalFeatures")
- Explain reasoning in simple language a non-technical user can understand
- Respond ONLY with valid JSON — no markdown, no preamble, no explanation outside JSON

OUTPUT FORMAT (strict):
{
  "recommendations": [
    {
      "operation": "exact transformer name",
      "category": "scaling | encoding | feature_creation | transformation | selection",
      "priority": "high | medium | low",
      "explanation": "Plain English explanation of why this is recommended",
      "when_to_apply": "Specific condition that makes this applicable",
      "sklearn_class": "e.g. sklearn.preprocessing.RobustScaler",
      "expected_benefit": "What this will improve",
      "source_reference": "Which document this is based on"
    }
  ],
  "summary": "One-sentence summary of the top recommendation for this column",
  "warnings": ["Any caveats or data quality warnings"]
}"""


def _build_prompt(column_context: Dict[str, Any], chunks: List[Dict]) -> str:
    # Reduced to 4 chunks max to drastically lower the active Token Per Minute (TPM) footprint
    knowledge_blocks = []
    for i, chunk in enumerate(chunks[:4]):
        knowledge_blocks.append(
            f"--- Knowledge Block {i+1} ---\n"
            f"Source: {chunk['source']}\nTopic: {chunk['topic']}\n"
            f"Score: {chunk['score']}\nContent:\n{chunk['text'][:400]}" # Truncated block length to save tokens
        )

    ctx = column_context
    lines = [
        f"Column Name: {ctx.get('column_name', 'unknown')}",
        f"Data Type: {ctx.get('dtype', 'unknown')}",
    ]
    for k, label in [
        ("cardinality",  "Unique Values"),
        ("skewness",     "Skewness"),
        ("missing_pct",  "Missing %"),
        ("has_outliers", "Has Outliers"),
        ("is_cyclical",  "Is Cyclical"),
        ("task",         "ML Task"),
    ]:
        if k in ctx:
            v = ctx[k]
            lines.append(f"{label}: {v:.2f}" if isinstance(v, float) else f"{label}: {v}")
    if ctx.get("paired_columns"):
        lines.append(f"Can combine with: {', '.join(ctx['paired_columns'])}")
    if ctx.get("sample_values"):
        lines.append(f"Sample Values: {str(ctx['sample_values'])[:80]}")

    return (
        "COLUMN ANALYSIS REQUEST\n\n"
        "## Column Information:\n" + "\n".join(lines) +
        "\n\n## Reference Knowledge:\n" + "\n\n".join(knowledge_blocks) +
        "\n\nBased ONLY on the reference knowledge above, "
        "provide feature engineering recommendations. Respond with valid JSON only."
    )


# Exception to capture explicitly for rate limits, allowing tenacity to catch it
class GroqRateLimitException(Exception):
    pass


class FeatureEngineeringRecommender:
    def __init__(self, n_retrieval_results: int = 4, max_tokens: int = 800):
        self.retriever  = FeatureEngineeringRetriever()
        self.n_results  = n_retrieval_results # Reduced default context budget
        self.max_tokens = max_tokens

    def recommend(
        self,
        column_context: Dict[str, Any],
        api_key: str,
    ) -> Dict:
        col_name = column_context.get("column_name", "unknown")

        chunks = self.retriever.retrieve(column_context, n_results=self.n_results)
        if not chunks:
            return {
                "column_name"  : col_name,
                "column_stats" : self._stats(column_context),
                "recommendations": [],
                "summary"      : "No relevant knowledge found. Run `python ingest.py` to populate the knowledge base.",
                "warnings"     : ["Knowledge base appears empty."],
            }

        prompt = _build_prompt(column_context, chunks)
        
        try:
            raw = self._call_groq_with_retry(prompt, api_key)
            parsed = self._parse(raw)
        except Exception as e:
            # Fallback error mapping if max retries are hit or unhandled errors pop up
            parsed = {
                "recommendations": [],
                "summary": f"Failed to get recommendations due to system limits: {e}",
                "warnings": [str(e)]
            }

        return {
            "column_name"    : col_name,
            "column_stats"   : self._stats(column_context),
            "recommendations": parsed.get("recommendations", []),
            "summary"        : parsed.get("summary", ""),
            "warnings"       : parsed.get("warnings", []),
        }

    def batch_recommend(
        self,
        columns: List[Dict[str, Any]],
        api_key: str,
    ) -> List[Dict]:
        results = []
        for ctx in columns:
            results.append(self.recommend(ctx, api_key=api_key))
            # 🕒 Pacing Delay: Forces a 3.5 second cooldown between column calls to protect the 12k TPM pool
            time.sleep(3.5) 
        return results

    # ── private ──────────────────────────────────────────────────────────────

    def _stats(self, ctx: Dict[str, Any]) -> Dict:
        return {
            "dtype"       : ctx.get("dtype"),
            "cardinality" : ctx.get("cardinality"),
            "skewness"    : ctx.get("skewness"),
            "missing_pct" : ctx.get("missing_pct"),
            "has_outliers": ctx.get("has_outliers"),
            "is_cyclical" : ctx.get("is_cyclical"),
            "paired_cols" : ctx.get("paired_columns", []),
        }

    # Added tenacity wrapper to handle 429 responses explicitly
    @retry(
        wait=wait_random_exponential(min=3, max=30),
        stop=stop_after_attempt(4),
        retry=retry_if_exception_type(GroqRateLimitException),
        reraise=True
    )
    def _call_groq_with_retry(self, user_prompt: str, api_key: str) -> str:
        payload = {
            "model"          : GROQ_MODEL,
            "max_tokens"     : self.max_tokens,
            "messages"       : [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type" : "application/json",
        }
        
        with httpx.Client(timeout=45) as client:
            resp = client.post(GROQ_API_URL, headers=headers, json=payload)
        
        if resp.status_code == 401:
            raise ValueError("Invalid Groq API key.")
        if resp.status_code == 429:
            # Trigger our retry logic loops
            raise GroqRateLimitException("Groq TPM/RPM limit hit. Backing off and retrying...")
        if resp.status_code != 200:
            raise ValueError(f"Groq API error {resp.status_code}: {resp.text[:200]}")
            
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    def _parse(self, text: str) -> Dict:
        text = text.strip()
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1][4:].strip() if parts[1].startswith("json") else parts[1].strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {
                "recommendations": [],
                "summary" : "Could not parse LLM response.",
                "warnings": ["JSON parse error — try again."],
            }


# ══════════════════════════════════════════════════════════════════════
# RULE-BASED FALLBACK (no API key required)
# ══════════════════════════════════════════════════════════════════════

def _rule_based_recommend(column_context: dict) -> dict:
    """
    Pure rule-based feature engineering recommendations.
    Used when no Groq API key is available.
    """
    col_name    = column_context.get("column_name", "unknown")
    dtype       = column_context.get("dtype", "numeric")
    skewness    = column_context.get("skewness", 0.0)
    has_outliers= column_context.get("has_outliers", False)
    cardinality = column_context.get("cardinality", 0)
    is_cyclical = column_context.get("is_cyclical", False)
    missing_pct = column_context.get("missing_pct", 0.0)
    paired_cols = column_context.get("paired_columns", [])
    task        = column_context.get("task", "unknown")

    recs = []
    warnings = []

    if missing_pct > 20:
        warnings.append(f"{missing_pct:.0f}% missing values — imputation strategy was already applied during cleaning.")

    if dtype in ("numeric", "geo"):
        if abs(skewness) > 1.5:
            recs.append({
                "operation": "Log Transformation",
                "category": "transformation",
                "priority": "high",
                "explanation": f"Skewness of {skewness:.2f} indicates a heavily skewed distribution. Log transform (log1p) compresses the long tail and makes the distribution more Gaussian, which benefits most linear models and neural networks.",
                "when_to_apply": "When skewness > 1.5 and all values are non-negative. Use log1p to handle zeros safely.",
                "sklearn_class": "numpy.log1p",
                "expected_benefit": "Reduces skewness, improves linear model convergence and prediction accuracy",
                "source_reference": "Statistical preprocessing best practices",
            })
        elif abs(skewness) > 0.75:
            recs.append({
                "operation": "PowerTransformer (Yeo-Johnson)",
                "category": "transformation",
                "priority": "medium",
                "explanation": f"Moderate skewness of {skewness:.2f}. Yeo-Johnson power transform handles both positive and negative values and makes data more Gaussian-like.",
                "when_to_apply": "When skewness is moderate (0.5–1.5) or data contains negative values",
                "sklearn_class": "sklearn.preprocessing.PowerTransformer",
                "expected_benefit": "Normalizes distribution for parametric models",
                "source_reference": "Scikit-learn preprocessing guide",
            })

        if has_outliers:
            recs.append({
                "operation": "RobustScaler",
                "category": "scaling",
                "priority": "high",
                "explanation": "Outliers detected in this column. RobustScaler uses the median and IQR instead of mean/std, making it resistant to outliers. Ideal before feeding into distance-based algorithms (KNN, SVM) or gradient descent models.",
                "when_to_apply": "When the column has significant outliers — confirmed by IQR analysis",
                "sklearn_class": "sklearn.preprocessing.RobustScaler",
                "expected_benefit": "Prevents outliers from dominating scale; improves KNN, SVM, and linear model performance",
                "source_reference": "Feature Scaling Techniques Guide",
            })
        else:
            if task in ("regression", "classification", "unknown"):
                recs.append({
                    "operation": "StandardScaler",
                    "category": "scaling",
                    "priority": "medium",
                    "explanation": "No outliers detected. StandardScaler (z-score normalization) centers data at mean=0 with unit variance. Required for algorithms that assume Gaussian-distributed features.",
                    "when_to_apply": "When data appears approximately Gaussian and no significant outliers exist. Use before logistic regression, linear SVM, PCA.",
                    "sklearn_class": "sklearn.preprocessing.StandardScaler",
                    "expected_benefit": "Ensures all features contribute equally; required for PCA and linear models",
                    "source_reference": "Feature Scaling Techniques Guide",
                })
            recs.append({
                "operation": "MinMaxScaler",
                "category": "scaling",
                "priority": "low",
                "explanation": "Alternative to StandardScaler. Rescales to [0, 1]. Good for neural networks and when you need bounded output.",
                "when_to_apply": "For neural networks, image data, or when the algorithm requires non-negative bounded inputs",
                "sklearn_class": "sklearn.preprocessing.MinMaxScaler",
                "expected_benefit": "Bounded [0,1] range; useful for neural networks and KNN",
                "source_reference": "Feature Scaling Techniques Guide",
            })

        if paired_cols:
            recs.append({
                "operation": "Ratio Features",
                "category": "feature_creation",
                "priority": "medium",
                "explanation": f"This column can be combined with '{', '.join(paired_cols)}' to create ratio or difference features. Ratios often capture relationships better than raw values.",
                "when_to_apply": f"When '{col_name}' and '{paired_cols[0]}' represent related quantities (e.g., price/cost, height/weight)",
                "sklearn_class": "feature_engine.creation.RelativeFeatures",
                "expected_benefit": "New features capturing relative relationships between columns",
                "source_reference": "Feature-engine Docs v1.9.4 - RelativeFeatures",
            })
            recs.append({
                "operation": "MathFeatures (multiply/divide)",
                "category": "feature_creation",
                "priority": "low",
                "explanation": f"Create arithmetic combinations (sum, difference, product, ratio) between '{col_name}' and related columns like '{', '.join(paired_cols)}'.",
                "when_to_apply": "When domain knowledge suggests interaction between columns",
                "sklearn_class": "feature_engine.creation.MathFeatures",
                "expected_benefit": "Captures interaction effects that individual features miss",
                "source_reference": "Feature-engine Docs v1.9.4 - MathFeatures",
            })

        if is_cyclical:
            recs.append({
                "operation": "CyclicalFeatures (sin/cos encoding)",
                "category": "feature_creation",
                "priority": "high",
                "explanation": f"'{col_name}' appears to be a cyclical/periodic feature (e.g., hour, month, day of week). Encoding as sine and cosine preserves the cyclical nature — so that value 23 is 'close to' value 0.",
                "when_to_apply": "For any periodic feature: hour_of_day, month, day_of_week, angle, bearing",
                "sklearn_class": "feature_engine.creation.CyclicalFeatures",
                "expected_benefit": "Correctly represents periodicity; dramatically improves time-aware models",
                "source_reference": "Feature-engine Docs v1.9.4 - CyclicalFeatures",
            })

        if dtype == "geo" and paired_cols:
            recs.append({
                "operation": "GeoDistanceFeatures",
                "category": "feature_creation",
                "priority": "high",
                "explanation": f"Latitude/longitude detected. Calculate Haversine distance to reference point(s) — a much more informative feature than raw coordinates for most ML tasks.",
                "when_to_apply": "When lat/lon coordinates represent locations and distance to key points matters",
                "sklearn_class": "feature_engine.creation.GeoDistanceFeatures",
                "expected_benefit": "Converts raw coordinates into meaningful distance features",
                "source_reference": "Feature-engine Docs v1.9.4 - GeoDistanceFeatures",
            })

    elif dtype == "categorical":
        if cardinality <= 5:
            recs.append({
                "operation": "OneHotEncoder",
                "category": "encoding",
                "priority": "high",
                "explanation": f"Only {cardinality} unique categories — perfect for one-hot encoding. Creates one binary column per category. No ordinal relationship is implied.",
                "when_to_apply": "For low-cardinality nominal categories (≤10 unique values) with no natural ordering",
                "sklearn_class": "sklearn.preprocessing.OneHotEncoder",
                "expected_benefit": "Lossless representation of categorical information for all ML algorithms",
                "source_reference": "Train in Data Blog - One-Hot Encoding",
            })
        elif cardinality <= 15:
            recs.append({
                "operation": "OneHotEncoder",
                "category": "encoding",
                "priority": "medium",
                "explanation": f"{cardinality} unique categories. One-hot encoding is still feasible but will add {cardinality} columns. Consider target encoding if this causes dimensionality issues.",
                "when_to_apply": "When the number of dummies created is acceptable relative to your dataset size",
                "sklearn_class": "sklearn.preprocessing.OneHotEncoder",
                "expected_benefit": "Clean categorical representation; interpretable",
                "source_reference": "Train in Data Blog - One-Hot Encoding",
            })
            recs.append({
                "operation": "OrdinalEncoder",
                "category": "encoding",
                "priority": "low",
                "explanation": f"Alternative to one-hot for {cardinality} categories. Assigns integer labels 0..{cardinality-1}. Use only if there is a natural ordering to the categories.",
                "when_to_apply": "Only when categories have a meaningful order (e.g., low/medium/high, XS/S/M/L/XL)",
                "sklearn_class": "sklearn.preprocessing.OrdinalEncoder",
                "expected_benefit": "Compact single-column representation; memory efficient",
                "source_reference": "Scikit-learn preprocessing guide",
            })
        else:
            recs.append({
                "operation": "Target Encoding",
                "category": "encoding",
                "priority": "high",
                "explanation": f"High cardinality with {cardinality} unique values. Target encoding replaces each category with the mean of the target variable, avoiding the curse of dimensionality from one-hot encoding.",
                "when_to_apply": "For high-cardinality categoricals in supervised learning tasks (regression or classification)",
                "sklearn_class": "sklearn.preprocessing.TargetEncoder",
                "expected_benefit": "Reduces dimensionality while preserving target-relevant information",
                "source_reference": "Feature engineering best practices",
            })
            recs.append({
                "operation": "Frequency Encoding",
                "category": "encoding",
                "priority": "medium",
                "explanation": f"Replace each of the {cardinality} categories with its frequency (count or proportion). Simple, effective, and works in unsupervised settings where target encoding isn't possible.",
                "when_to_apply": "When target variable is unavailable or as a baseline for high-cardinality features",
                "sklearn_class": "feature_engine.encoding.CountFrequencyEncoder",
                "expected_benefit": "Single column representation capturing category prevalence",
                "source_reference": "Feature engineering best practices",
            })

    elif dtype == "datetime":
        recs.append({
            "operation": "DateTime Decomposition",
            "category": "feature_creation",
            "priority": "high",
            "explanation": "Extract year, month, day, hour, day_of_week, quarter, and is_weekend from the datetime column. These components often have strong predictive power individually.",
            "when_to_apply": "Always for datetime columns — raw timestamps are rarely useful directly",
            "sklearn_class": "feature_engine.datetime.DatetimeFeatures",
            "expected_benefit": "Extracts multiple informative features from a single datetime column",
            "source_reference": "Feature-engine Docs v1.9.4 - CyclicalFeatures",
        })
        if is_cyclical:
            recs.append({
                "operation": "CyclicalFeatures (sin/cos)",
                "category": "feature_creation",
                "priority": "high",
                "explanation": "After extracting month/hour/day_of_week, apply sine/cosine encoding to preserve cyclical continuity (e.g., hour 23 is adjacent to hour 0).",
                "when_to_apply": "After DatetimeFeatures extraction, apply to month, hour, day_of_week",
                "sklearn_class": "feature_engine.creation.CyclicalFeatures",
                "expected_benefit": "Correctly models periodicity for time-series and temporal patterns",
                "source_reference": "Feature-engine Docs v1.9.4 - CyclicalFeatures",
            })

    # Universal: feature selection suggestion
    recs.append({
        "operation": "VarianceThreshold (remove low-variance)",
        "category": "selection",
        "priority": "low",
        "explanation": "After all transformations, remove features with near-zero variance — they contribute no information to any model.",
        "when_to_apply": "As a final cleanup step after all feature engineering is complete",
        "sklearn_class": "sklearn.feature_selection.VarianceThreshold",
        "expected_benefit": "Reduces dimensionality; removes noise features",
        "source_reference": "Scikit-learn feature selection guide",
    })

    summary_parts = []
    if recs:
        top = recs[0]
        summary_parts.append(f"Top recommendation: apply {top['operation']} ({top['priority']} priority).")
    if warnings:
        summary_parts.append(" | ".join(warnings))

    return {
        "column_name":     col_name,
        "column_stats":    {
            "dtype": dtype, "cardinality": cardinality, "skewness": skewness,
            "missing_pct": missing_pct, "has_outliers": has_outliers,
            "is_cyclical": is_cyclical, "paired_cols": paired_cols,
        },
        "recommendations": recs,
        "summary":         " ".join(summary_parts) or f"Rule-based recommendations for {dtype} column '{col_name}'.",
        "warnings":        warnings,
    }