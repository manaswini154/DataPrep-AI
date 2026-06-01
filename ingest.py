"""
ingest.py  —  DataPrep AI RAG Ingestion Pipeline
Parses, chunks, embeds, and stores all source documents.

Usage:
    python ingest.py              # incremental (skips existing chunks)
    python ingest.py --reset      # wipe and re-ingest everything
    python ingest.py --source <id>  # ingest one source only
"""

import os, sys, json, argparse

def run_ingestion(reset=False, source_filter=None):
    from components.document_parser import parse_all_sources
    from components.chunker import chunk_all_documents
    from components.vector_store import LocalVectorStore, STORE_PATH

    print("\n" + "="*60)
    print("  DataPrep AI — RAG Ingestion Pipeline")
    print("="*60)

    print("\n[1/4] Parsing source documents...")
    docs = parse_all_sources()
    if source_filter:
        if source_filter not in docs:
            print(f"  ❌ Source '{source_filter}' not found. Available: {list(docs.keys())}")
            return
        docs = {source_filter: docs[source_filter]}

    print("\n[2/4] Chunking documents...")
    chunks = chunk_all_documents(docs)
    print(f"  Total chunks: {len(chunks)}")

    print("\n[3/4] Saving chunk log...")
    log_path = os.path.join(os.path.dirname(__file__), "processed_docs", "chunks_log.json")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    chunk_log = [{"id": c["id"], "title": c["metadata"]["chunk_title"],
                  "length": c["metadata"]["chunk_length"],
                  "category": c["metadata"]["category"]} for c in chunks]
    with open(log_path, "w") as f:
        json.dump(chunk_log, f, indent=2)
    print(f"  Chunk log saved: {log_path}")

    print("\n[4/4] Embedding and storing in local vector store...")
    store = LocalVectorStore(STORE_PATH)
    if reset:
        added = store.add_chunks(chunks, reset=True)
    else:
        store.load()
        added = store.add_chunks(chunks)

    stats = store.get_stats()
    print(f"\n{'='*60}")
    print(f"  ✅ Ingestion complete!")
    print(f"  📊 Chunks added this run  : {added}")
    print(f"  📊 Total chunks in store  : {stats['total_chunks']}")
    print(f"  📊 Vocabulary size        : {stats['vocab_size']:,} terms")
    print(f"  🗄️  Store location        : {STORE_PATH}")
    print("="*60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--source", type=str, default=None)
    args = parser.parse_args()
    run_ingestion(reset=args.reset, source_filter=args.source)
