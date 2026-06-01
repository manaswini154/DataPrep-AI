# DataPrep AI — RAG System

## Overview

This RAG (Retrieval-Augmented Generation) system powers feature engineering
recommendations in DataPrep AI. It retrieves relevant preprocessing rules
from curated documents, then feeds them to Claude for context-aware suggestions.

```
Dataset Column Metadata
        ↓
   retriever.py  →  ChromaDB  ←  Ingested Docs
        ↓               ↑
   recommender.py       |
        ↓           ingest.py ← document_parser.py + chunker.py
   Claude API
        ↓
   JSON Recommendations
        ↓
   FastAPI Backend → Pandas/Sklearn Engine
```

---

## Files

| File | Purpose |
|------|---------|
| `document_parser.py` | Parses HTML/MD source files into clean text |
| `chunker.py` | Splits text into semantic chunks |
| `ingest.py` | Embeds chunks and stores in ChromaDB |
| `retriever.py` | Retrieves relevant chunks for a column context |
| `recommender.py` | Calls Claude API with retrieved context |
| `chroma_db/` | Persistent vector database (auto-created) |
| `processed_docs/chunks_log.json` | Debug log of all chunks |

---

## Quick Start

### 1. Install dependencies
```bash
pip install chromadb sentence-transformers beautifulsoup4 lxml langchain
```

### 2. Run ingestion (one time)
```bash
cd rag_system
python ingest.py
```

### 3. Test retrieval
```bash
python retriever.py
```

### 4. Test full recommendation
```python
from recommender import FeatureEngineeringRecommender

rec = FeatureEngineeringRecommender()

result = rec.recommend({
    "column_name": "income",
    "dtype": "numeric",
    "skewness": 2.4,
    "has_outliers": True,
    "task": "regression"
})

print(result)
```

---

## Column Context Schema

Pass this dict to `retriever.retrieve()` or `recommender.recommend()`:

```python
{
    "column_name": "age",           # str — column name
    "dtype": "numeric",             # "numeric" | "categorical" | "datetime" | "geo" | "text"
    "cardinality": 50,              # int — number of unique values (for categorical)
    "skewness": 1.5,                # float — skewness (for numeric)
    "has_outliers": True,           # bool
    "is_cyclical": False,           # bool — True for hour/month/day_of_week
    "missing_pct": 5.2,             # float — % missing values
    "paired_columns": ["col2"],     # list — columns to combine with
    "task": "regression",           # "classification" | "regression" | "clustering"
    "sample_values": [1, 2, 3],     # list — optional sample values
}
```

---

## Source Documents

| Document | Category | Key Content |
|----------|----------|-------------|
| Feature-engine MathFeatures | feature_engineering | Arithmetic combinations of numeric columns |
| Feature-engine RelativeFeatures | feature_engineering | Ratio/difference features |
| Feature-engine CyclicalFeatures | feature_engineering | Sine/cosine encoding for cyclical features |
| Feature-engine DecisionTreeFeatures | feature_engineering | Tree-based non-linear features |
| Feature-engine GeoDistanceFeatures | feature_engineering | Haversine distance from coordinates |
| Feature-engine Feature Creation Index | feature_engineering | Overview of all creation transformers |
| Train in Data — One-Hot Encoding | encoding | Variants of one-hot encoding |
| Feature Scaling Techniques PDF | scaling | MinMax, Standard, Robust, MaxAbs scalers |
| Short Guide FE & Feature Selection | feature_engineering | Comprehensive reference guide |

---

## Adding New Documents

1. Add entry to `SOURCES` dict in `document_parser.py`
2. Re-run ingestion:
   ```bash
   python ingest.py --source <your_new_source_id>
   ```
   Or full reset:
   ```bash
   python ingest.py --reset
   ```

---

## Integration with FastAPI

```python
# In your FastAPI endpoint:
from rag_system.recommender import FeatureEngineeringRecommender

recommender = FeatureEngineeringRecommender()  # initialize once at startup

@app.post("/api/feature-suggestions")
async def get_feature_suggestions(column_info: ColumnInfo):
    context = {
        "column_name": column_info.name,
        "dtype": column_info.dtype,
        "skewness": column_info.skewness,
        "has_outliers": column_info.has_outliers,
        "cardinality": column_info.cardinality,
        "task": column_info.task,
    }
    recommendations = recommender.recommend(context)
    return recommendations
```

---

## Architecture Notes

- **Embedding model**: `all-MiniLM-L6-v2` (384-dim, fast, good retrieval quality)
- **Vector DB**: ChromaDB (persistent, no server needed)
- **Chunk size**: ~800 chars, semantic boundary splitting
- **Query strategy**: metadata-driven (not generic) — queries are built from column stats
- **LLM role**: recommendation + explanation ONLY — no data manipulation
