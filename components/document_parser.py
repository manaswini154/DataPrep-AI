"""
document_parser.py
Extracts clean, meaningful text from HTML and Markdown source files.
Strips all CSS, JS, nav elements — keeps only actual content.
"""

import os
import re
from pathlib import Path
from bs4 import BeautifulSoup


# ── Source file registry ─────────────────────────────────────────────────────

import os

# Add this near the top of document_parser.py
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES_DIR = os.path.join(BASE_DIR, "files")

# Then update every path in SOURCES like this:
SOURCES = {
    "math_features": {
        "path": os.path.join(FILES_DIR, "MathFeatures — 1.9.4.html"),
        "type": "html",
        "category": "feature_engineering",
        "topic": "math_features_combination",
        "source_label": "Feature-engine Docs v1.9.4 - MathFeatures",
    },
    "relative_features": {
        "path": os.path.join(FILES_DIR, "RelativeFeatures — 1.9.4.html"),
        "type": "html",
        "category": "feature_engineering",
        "topic": "relative_features_ratios",
        "source_label": "Feature-engine Docs v1.9.4 - RelativeFeatures",
    },
    "cyclical_features": {
        "path": os.path.join(FILES_DIR, "CyclicalFeatures — 1.9.4.html"),
        "type": "html",
        "category": "feature_engineering",
        "topic": "cyclical_features_datetime",
        "source_label": "Feature-engine Docs v1.9.4 - CyclicalFeatures",
    },
    "decision_tree_features": {
        "path": os.path.join(FILES_DIR, "DecisionTreeFeatures — 1.9.4.html"),
        "type": "html",
        "category": "feature_engineering",
        "topic": "decision_tree_based_features",
        "source_label": "Feature-engine Docs v1.9.4 - DecisionTreeFeatures",
    },
    "geo_distance_features": {
        "path": os.path.join(FILES_DIR, "GeoDistanceFeatures — 1.9.4.html"),
        "type": "html",
        "category": "feature_engineering",
        "topic": "geo_distance_features",
        "source_label": "Feature-engine Docs v1.9.4 - GeoDistanceFeatures",
    },
    "feature_creation_index": {
        "path": os.path.join(FILES_DIR, "Feature Creation — 1.9.4.html"),
        "type": "html",
        "category": "feature_engineering",
        "topic": "feature_creation_overview",
        "source_label": "Feature-engine Docs v1.9.4",
    },
    "one_hot_encoding_blog": {
        "path": os.path.join(FILES_DIR, "One-hot encoding categorical variables....html"),
        "type": "html",
        "category": "encoding",
        "topic": "one_hot_encoding_categorical",
        "source_label": "Train in Data Blog - One-Hot Encoding",
    },
    "feature_engineering_guide": {
        "path": os.path.join(FILES_DIR, "document_pdf.pdf"),
        "type": "pdf",
        "category": "feature_engineering",
        "topic": "comprehensive_guide",
        "source_label": "Feature Engineering Guide PDF",
    },
}

# Scaling techniques — from the PDF already rendered in context
SCALING_TEXT = """
## Feature Scaling Techniques

### Why Scale?
Real world datasets contain features that highly vary in magnitudes, units, and range.
Algorithms that use Euclidean Distance (KNN, K-means, SVM) are most affected by feature scale.
Gradient Descent based algorithms (linear regression, logistic regression, neural networks) also require scaling to converge smoothly.
Tree-based algorithms (Decision Tree, Random Forest) are fairly insensitive to feature scale.
Normalisation should be performed when the scale of a feature is irrelevant or misleading.

### Min-Max Scaling (Normalization)
Formula: X' = (X - Xmin) / (Xmax - Xmin)
Rescales values to range [0, 1].
When to use: when you do not know the distribution of your data, or when the distribution is not Gaussian.
Useful for algorithms like KNN and neural networks that do not assume Gaussian distribution.
Sensitive to outliers because it uses min and max values.

### Standardization (Z-score / StandardScaler)
Formula: z = (x - mean) / std_deviation
Centers data around mean=0 with unit standard deviation.
When to use: when data has a Gaussian (bell curve) distribution, or when algorithm assumes Gaussian distribution (linear regression, logistic regression, linear discriminant analysis).
More robust than MinMax when outliers are present.

### Robust Scaler
Uses interquartile range (IQR) instead of min-max.
Formula: (x - Q1) / (Q3 - Q1)
When to use: when dataset contains significant outliers.
Resistant to outliers because it uses median and IQR.

### Maximum Absolute Scaling
Divides every observation by the maximum absolute value.
Formula: xscaled = x / max(|x|)
Result varies approximately in range [-1, 1].
Recommended by scikit-learn for data centered at zero or sparse data.
Sensitive to outliers if all values are positive.

### When NOT to scale
Tree-based algorithms (Decision Tree, Random Forest, XGBoost) are invariant to feature scale.
Do not scale when the scale itself carries meaning (e.g., actual price values in economics).
"""


def extract_html_content(filepath: str) -> str:
    """
    Extract meaningful text content from a Feature-engine or blog HTML page.
    Aggressively removes: style, script, nav, header, footer, sidebar, ads.
    Keeps: main article content, code examples, parameter descriptions, docstrings.
    """
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        raw = f.read()

    soup = BeautifulSoup(raw, "lxml")

    # Remove all noise tags completely
    noise_tags = [
        "style", "script", "noscript", "nav", "footer", "header",
        "aside", "form", "button", "iframe", "svg", "img",
        ".headerlink", ".toctree-wrapper", ".sphinxsidebar",
        ".related", ".navigation", ".breadcrumb", ".topbar",
        ".et-menu", ".et_mobile_menu", "#sidebar", "#footer",
        "#header", ".et_social", ".comment", ".widget",
    ]

    for tag in noise_tags[:8]:  # tag names
        for element in soup.find_all(tag):
            element.decompose()

    # Remove by class/id patterns
    for element in soup.find_all(class_=re.compile(
        r"(nav|menu|header|footer|sidebar|breadcrumb|toc|social|comment|widget|cookie|banner|ad-|popup)", re.I
    )):
        element.decompose()

    # Try to find the main content area
    main_content = (
        soup.find("article") or
        soup.find("main") or
        soup.find(class_=re.compile(r"(content|article|post|entry|main)", re.I)) or
        soup.find("div", {"id": re.compile(r"(content|main|article)", re.I)}) or
        soup.find("body")
    )

    if main_content is None:
        return ""

    text = main_content.get_text(separator="\n", strip=True)

    # Clean up excessive whitespace
    lines = [line.strip() for line in text.split("\n")]
    lines = [line for line in lines if line and len(line) > 3]

    # Remove lines that are clearly CSS/JS remnants
    filtered = []
    for line in lines:
        # Skip lines that look like CSS selectors or JS
        if re.match(r'^[.#\{]', line): continue
        if re.match(r'^(var |const |let |function |import |export )', line): continue
        if line.count('{') > 2: continue
        if len(line) > 500 and '{' in line: continue  # minified CSS/JS
        filtered.append(line)

    return "\n".join(filtered)


def extract_markdown_content(filepath: str) -> str:
    """Read markdown file directly — it's already clean text."""
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def parse_all_sources() -> dict:
    """
    Parse all source files and return a dict of {source_id: {text, metadata}}.
    """
    results = {}

    for source_id, config in SOURCES.items():
        filepath = config["path"]
        if not os.path.exists(filepath):
            print(f"  ⚠️  File not found: {filepath}")
            continue

        print(f"  📄 Parsing: {source_id}")

        if config["type"] == "html":
            text = extract_html_content(filepath)
        elif config["type"] == "markdown":
            text = extract_markdown_content(filepath)
        else:
            text = ""

        if len(text) < 100:
            print(f"     ⚠️  Very short content ({len(text)} chars) — skipping")
            continue

        results[source_id] = {
            "text": text,
            "metadata": {
                "source_id": source_id,
                "category": config["category"],
                "topic": config["topic"],
                "source_label": config["source_label"],
                "char_count": len(text),
            }
        }
        print(f"     ✅ Extracted {len(text):,} chars")

    # Add scaling text from PDF (already in context)
    results["feature_scaling_pdf"] = {
        "text": SCALING_TEXT,
        "metadata": {
            "source_id": "feature_scaling_pdf",
            "category": "scaling",
            "topic": "feature_scaling_techniques",
            "source_label": "Feature Scaling Techniques (Tushar B. Kute / mitu skillologies)",
            "char_count": len(SCALING_TEXT),
        }
    }
    print(f"  ✅ Added scaling PDF content ({len(SCALING_TEXT):,} chars)")

    return results


if __name__ == "__main__":
    print("\n=== Parsing Documents ===")
    docs = parse_all_sources()
    print(f"\nTotal documents parsed: {len(docs)}")
    for sid, data in docs.items():
        print(f"  {sid}: {data['metadata']['char_count']:,} chars")
