"""
chunker.py
Splits parsed documents into high-quality, semantically coherent chunks.

Strategy:
- Concept-boundary chunking (not character-count chunking)
- Each chunk = one technique, one rule, or one parameter group
- Chunks tagged with metadata for precise retrieval
- Overlap between adjacent chunks to avoid context loss
"""

import re
from typing import List, Dict, Any


# ── Chunk size configuration ─────────────────────────────────────────────────

CHUNK_SIZE = 800          # target characters per chunk
CHUNK_OVERLAP = 150       # overlap between consecutive chunks
MIN_CHUNK_SIZE = 100      # discard chunks shorter than this


# ── Semantic section splitters ────────────────────────────────────────────────

# Patterns that signal a new concept/section boundary
SECTION_PATTERNS = [
    r"^#{1,4}\s+",                    # Markdown headers
    r"^Parameters\s*$",               # Sphinx parameter sections
    r"^Returns\s*$",
    r"^Attributes\s*$",
    r"^Methods\s*$",
    r"^Examples?\s*$",
    r"^Notes?\s*$",
    r"^See Also\s*$",
    r"^References?\s*$",
    r"^class\s+\w+",                  # Class definitions
    r"^def\s+\w+",                    # Function definitions
    r"^\d+\.\s+\w+",                  # Numbered sections
    r"^[A-Z][A-Za-z\s]{3,40}:?\s*$", # Title-like lines (all caps or title case)
]

SECTION_RE = re.compile("|".join(SECTION_PATTERNS), re.MULTILINE)


def split_by_sections(text: str) -> List[str]:
    """
    Split text at semantic boundaries (headers, class/function defs, etc.).
    Returns list of sections.
    """
    # Find all section start positions
    boundaries = [0]
    for match in SECTION_RE.finditer(text):
        pos = match.start()
        if pos > boundaries[-1] + MIN_CHUNK_SIZE:
            boundaries.append(pos)
    boundaries.append(len(text))

    sections = []
    for i in range(len(boundaries) - 1):
        section = text[boundaries[i]:boundaries[i + 1]].strip()
        if len(section) >= MIN_CHUNK_SIZE:
            sections.append(section)

    return sections if sections else [text]


def sliding_window_split(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """
    Fallback: split long text using sliding window at paragraph boundaries.
    """
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    chunks = []
    current = []
    current_len = 0

    for para in paragraphs:
        para_len = len(para)

        if current_len + para_len > size and current:
            chunks.append("\n\n".join(current))
            # Keep last paragraph for overlap
            overlap_paras = []
            overlap_len = 0
            for p in reversed(current):
                if overlap_len + len(p) < overlap:
                    overlap_paras.insert(0, p)
                    overlap_len += len(p)
                else:
                    break
            current = overlap_paras
            current_len = overlap_len

        current.append(para)
        current_len += para_len

    if current:
        chunks.append("\n\n".join(current))

    return [c for c in chunks if len(c) >= MIN_CHUNK_SIZE]


def chunk_document(source_id: str, text: str, base_metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Chunk a single document into RAG-ready pieces with metadata.

    Returns list of:
    {
        "id": "source_id_chunk_N",
        "text": "...",
        "metadata": { source_id, category, topic, chunk_index, source_label }
    }
    """
    # First try semantic section split
    sections = split_by_sections(text)

    all_chunks = []
    for section in sections:
        if len(section) <= CHUNK_SIZE:
            all_chunks.append(section)
        else:
            # Section too large — apply sliding window
            sub_chunks = sliding_window_split(section)
            all_chunks.extend(sub_chunks)

    # Build final chunk objects
    result = []
    for i, chunk_text in enumerate(all_chunks):
        chunk_text = chunk_text.strip()
        if len(chunk_text) < MIN_CHUNK_SIZE:
            continue

        chunk_id = f"{source_id}_chunk_{i:04d}"

        # Extract a short title for the chunk (first non-empty line)
        first_line = chunk_text.split("\n")[0][:80].strip()
        first_line = re.sub(r"^#+\s*", "", first_line)  # strip markdown #

        result.append({
            "id": chunk_id,
            "text": chunk_text,
            "metadata": {
                **base_metadata,
                "chunk_index": i,
                "chunk_title": first_line,
                "chunk_length": len(chunk_text),
            }
        })

    return result


def chunk_all_documents(parsed_docs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Chunk all parsed documents and return flat list of chunks.
    """
    all_chunks = []

    for source_id, doc_data in parsed_docs.items():
        text = doc_data["text"]
        metadata = doc_data["metadata"]

        chunks = chunk_document(source_id, text, metadata)
        all_chunks.extend(chunks)

        print(f"  📦 {source_id}: {len(chunks)} chunks")

    return all_chunks


if __name__ == "__main__":
    from components.document_parser import parse_all_sources

    print("\n=== Parsing documents ===")
    docs = parse_all_sources()

    print("\n=== Chunking documents ===")
    chunks = chunk_all_documents(docs)

    print(f"\nTotal chunks: {len(chunks)}")
    print("\nSample chunk:")
    if chunks:
        sample = chunks[0]
        print(f"  ID: {sample['id']}")
        print(f"  Title: {sample['metadata']['chunk_title']}")
        print(f"  Length: {sample['metadata']['chunk_length']} chars")
        print(f"  Text preview: {sample['text'][:200]}...")
