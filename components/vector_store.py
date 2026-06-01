"""
vector_store.py
Lightweight local vector store using TF-IDF + cosine similarity.
No external model downloads needed. Works fully offline.

For production, swap this with ChromaDB + a real embedding model.
The interface is identical — just change the backend.
"""

import os
import json
import pickle
import numpy as np
from typing import List, Dict, Any, Optional
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Store the vector DB at the project root level
STORE_PATH = os.path.join(BASE_DIR, "chroma_db", "tfidf_store.pkl")


class LocalVectorStore:
    def __init__(self, store_path: str = STORE_PATH):
        self.store_path = store_path
        self.vectorizer = TfidfVectorizer(
            max_features=8000,
            ngram_range=(1, 2),    # unigrams + bigrams for better matching
            sublinear_tf=True,     # log normalization
            min_df=1,
            analyzer="word",
            stop_words="english",
        )
        self.chunks: List[Dict] = []
        self.matrix = None         # shape: (n_chunks, n_features)
        self._fitted = False

    # ── Persistence ─────────────────────────────────────────────────────────

    def save(self):
        os.makedirs(os.path.dirname(self.store_path), exist_ok=True)
        with open(self.store_path, "wb") as f:
            pickle.dump({
                "vectorizer": self.vectorizer,
                "chunks": self.chunks,
                "matrix": self.matrix,
            }, f)

    def load(self) -> bool:
        if not os.path.exists(self.store_path):
            return False
        with open(self.store_path, "rb") as f:
            data = pickle.load(f)
        self.vectorizer = data["vectorizer"]
        self.chunks = data["chunks"]
        self.matrix = data["matrix"]
        self._fitted = True
        return True

    # ── Ingestion ────────────────────────────────────────────────────────────

    def add_chunks(self, chunks: List[Dict], reset: bool = False):
        """
        Embed and store chunks.
        chunks: list of {id, text, metadata}
        """
        if reset:
            self.chunks = []
            self.matrix = None
            self._fitted = False

        # Deduplicate by ID
        existing_ids = {c["id"] for c in self.chunks}
        new_chunks = [c for c in chunks if c["id"] not in existing_ids]

        if not new_chunks:
            print(f"  ✅ All {len(chunks)} chunks already in store")
            return 0

        self.chunks.extend(new_chunks)

        # Re-fit vectorizer on ALL chunks (including old ones)
        all_texts = [c["text"] for c in self.chunks]
        self.matrix = self.vectorizer.fit_transform(all_texts)
        self._fitted = True

        print(f"  📥 Added {len(new_chunks)} chunks | Total: {len(self.chunks)}")
        self.save()
        return len(new_chunks)

    # ── Retrieval ────────────────────────────────────────────────────────────

    def query(
        self,
        query_text: str,
        n_results: int = 5,
        category_filter: Optional[str] = None,
    ) -> List[Dict]:
        """
        Retrieve top-N relevant chunks for a query.
        Returns list of {id, text, metadata, score}
        """
        if not self._fitted or self.matrix is None:
            raise RuntimeError("Vector store not fitted. Run ingestion first.")

        # Filter by category if specified
        if category_filter:
            candidate_indices = [
                i for i, c in enumerate(self.chunks)
                if c["metadata"].get("category") == category_filter
            ]
        else:
            candidate_indices = list(range(len(self.chunks)))

        if not candidate_indices:
            candidate_indices = list(range(len(self.chunks)))

        # Embed query
        q_vec = self.vectorizer.transform([query_text])

        # Compute cosine similarity only against candidates
        candidate_matrix = self.matrix[candidate_indices]
        scores = cosine_similarity(q_vec, candidate_matrix)[0]

        # Get top N
        top_local = np.argsort(scores)[::-1][:n_results]

        results = []
        for local_idx in top_local:
            global_idx = candidate_indices[local_idx]
            chunk = self.chunks[global_idx]
            results.append({
                "id": chunk["id"],
                "text": chunk["text"],
                "metadata": chunk["metadata"],
                "score": float(scores[local_idx]),
            })

        return results

    def count(self) -> int:
        return len(self.chunks)

    def get_stats(self) -> Dict:
        return {
            "total_chunks": len(self.chunks),
            "store_path": self.store_path,
            "fitted": self._fitted,
            "vocab_size": len(self.vectorizer.vocabulary_) if self._fitted else 0,
        }


# Singleton for reuse
_store_instance = None

def get_store() -> LocalVectorStore:
    global _store_instance
    if _store_instance is None:
        _store_instance = LocalVectorStore()
        _store_instance.load()
    return _store_instance
