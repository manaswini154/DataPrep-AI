"""
retriever.py  —  Metadata-driven retrieval from the local vector store.
Builds targeted queries from column statistics, not generic text.
"""

import os
from typing import List, Dict, Any, Optional
from components.vector_store import get_store


def build_queries(ctx: Dict[str, Any]) -> List[Dict[str, str]]:
    """Build semantic queries from column metadata."""
    queries = []
    dtype       = ctx.get("dtype", "numeric")
    cardinality = ctx.get("cardinality", 0)
    skewness    = ctx.get("skewness", 0.0)
    has_outliers= ctx.get("has_outliers", False)
    is_cyclical = ctx.get("is_cyclical", False)
    paired_cols = ctx.get("paired_columns", [])
    task        = ctx.get("task", "")
    col_name    = ctx.get("column_name", "feature")

    if dtype == "numeric":
        if abs(skewness) > 1.0:
            queries.append({"query": f"log transformation skewed numeric skewness distribution right-skewed", "category": "feature_engineering"})
        if has_outliers:
            queries.append({"query": "robust scaler outliers IQR interquartile scaling", "category": "scaling"})
        else:
            queries.append({"query": "feature scaling numeric standardization normalization when to use MinMax StandardScaler", "category": "scaling"})
        if paired_cols:
            queries.append({"query": "math features multiply divide ratio numeric columns arithmetic combination", "category": "feature_engineering"})
            queries.append({"query": "relative features ratio difference percentage columns feature creation", "category": "feature_engineering"})
        queries.append({"query": f"decision tree features non-linear transformation supervised {task}", "category": "feature_engineering"})

    elif dtype == "categorical":
        if cardinality <= 10:
            queries.append({"query": f"one-hot encoding low cardinality {cardinality} categories dummy variables", "category": "encoding"})
        elif cardinality <= 50:
            queries.append({"query": "ordinal label encoding medium cardinality categorical", "category": "encoding"})
        else:
            queries.append({"query": f"high cardinality {cardinality} target encoding frequency encoding hashing", "category": "encoding"})
        queries.append({"query": "categorical encoding advantages disadvantages when to use", "category": "encoding"})

    elif dtype == "datetime":
        if is_cyclical:
            queries.append({"query": "cyclical features datetime sine cosine encoding hour month day_of_week periodic", "category": "feature_engineering"})
        queries.append({"query": "datetime feature extraction year month day hour weekday decomposition", "category": "feature_engineering"})
        if paired_cols:
            queries.append({"query": "time difference elapsed time between two date columns", "category": "feature_engineering"})

    elif dtype == "geo":
        queries.append({"query": "geo distance features latitude longitude haversine geographic coordinates", "category": "feature_engineering"})

    queries.append({"query": f"feature selection {dtype} variance correlation redundant removal", "category": "feature_engineering"})
    return queries


class FeatureEngineeringRetriever:
    def __init__(self, n_results: int = 5):
        self.n_results = n_results
        self._store = None

    def _ensure_loaded(self):
        if self._store is None:
            self._store = get_store()
            if self._store.count() == 0:
                raise RuntimeError("Vector store is empty. Run `python ingest.py` first.")

    def retrieve(self, column_context: Dict[str, Any], n_results: int = None) -> List[Dict]:
        self._ensure_loaded()
        n = n_results or self.n_results
        queries = build_queries(column_context)

        seen, results = set(), []
        for q in queries:
            hits = self._store.query(q["query"], n_results=n, category_filter=q.get("category"))
            for h in hits:
                if h["id"] not in seen:
                    seen.add(h["id"])
                    results.append({
                        "chunk_id"   : h["id"],
                        "text"       : h["text"],
                        "score"      : round(h["score"], 4),
                        "source"     : h["metadata"].get("source_label", ""),
                        "category"   : h["metadata"].get("category", ""),
                        "topic"      : h["metadata"].get("topic", ""),
                        "chunk_title": h["metadata"].get("chunk_title", ""),
                        "query_used" : q["query"],
                    })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:n * 2]

    def retrieve_raw(self, query: str, n_results: int = 5) -> List[Dict]:
        self._ensure_loaded()
        return self._store.query(query, n_results=n_results)

    def get_stats(self) -> Dict:
        self._ensure_loaded()
        return self._store.get_stats()


if __name__ == "__main__":
    print("\n=== Testing Retriever ===")
    r = FeatureEngineeringRetriever()
    print("Stats:", r.get_stats())

    tests = [
        {"label": "Skewed numeric with outliers",
         "ctx": {"column_name": "income", "dtype": "numeric", "skewness": 2.8, "has_outliers": True, "task": "regression"}},
        {"label": "High cardinality categorical",
         "ctx": {"column_name": "city", "dtype": "categorical", "cardinality": 120, "task": "classification"}},
        {"label": "Cyclical datetime",
         "ctx": {"column_name": "hour_of_day", "dtype": "datetime", "is_cyclical": True}},
        {"label": "Geo coordinates",
         "ctx": {"column_name": "lat", "dtype": "geo", "paired_columns": ["lon"]}},
        {"label": "Math combination",
         "ctx": {"column_name": "price", "dtype": "numeric", "paired_columns": ["cost"], "task": "regression"}},
    ]

    for t in tests:
        print(f"\n--- {t['label']} ---")
        hits = r.retrieve(t["ctx"], n_results=3)
        for h in hits:
            print(f"  [{h['score']:.3f}] {h['chunk_title'][:65]}")
            print(f"          {h['source'][:55]}")
