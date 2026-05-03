"""
compute_embeddings.py
─────────────────────────────────────────────────────────
Pre-compute Gemini embeddings for all papers in data.csv,
save them to paper_embeddings.json. The web app loads this
JSON at startup and uses it for fast in-browser similarity
search (RAG-style Q&A).

Usage:
    1. Set GEMINI_API_KEY below or as environment variable
    2. pip install google-genai pandas
    3. python compute_embeddings.py

Re-run this script whenever data.csv changes. The output
file paper_embeddings.json should be placed in the same
folder as index.html.

Free tier (gemini-embedding-001):
  - Quota: ~150 requests/minute, ~10,000/day
  - Output dimension: 768
  - This script processes ~148 papers in under 2 minutes
"""

import os
import json
import time
import pandas as pd
from google import genai
from google.genai import types

# ─── Configuration ──────────────────────────────────────
# Set your key here, or set the environment variable GEMINI_API_KEY
API_KEY = os.environ.get("GEMINI_API_KEY", "PASTE_YOUR_KEY_HERE")

INPUT_CSV = "data.csv"
OUTPUT_JSON = "paper_embeddings.json"

# Embedding model. text-embedding-004 is the legacy free model.
# gemini-embedding-001 is the current model (768 dims, free tier).
MODEL = "gemini-embedding-001"

# Sleep between calls to stay under the rate limit (150 RPM = ~0.4s)
SLEEP_BETWEEN_CALLS = 0.5


def build_embedding_text(row):
    """
    Build the text that gets embedded for each paper. We concatenate the
    most semantically meaningful fields. Order matters less than coverage:
    we want a query about "computer vision for safety" to match papers
    whose abstracts, AI models, or gaps mention any of those concepts.
    """
    parts = []
    parts.append(f"Title: {row.get('Title', '')}")
    if row.get("Construction Topic"):
        parts.append(f"Topic: {row['Construction Topic']}")
    if row.get("Construction Application Area"):
        parts.append(f"Application: {row['Construction Application Area']}")
    if row.get("AI Model Used"):
        parts.append(f"AI techniques: {row['AI Model Used']}")
    if row.get("Research Method"):
        parts.append(f"Method: {row['Research Method']}")
    if row.get("Research Goal"):
        parts.append(f"Goal: {row['Research Goal']}")
    if row.get("Abstract"):
        parts.append(f"Abstract: {row['Abstract']}")
    if row.get("Gaps Addressed"):
        parts.append(f"Gaps: {row['Gaps Addressed']}")
    if row.get("Future Research"):
        parts.append(f"Future research: {row['Future Research']}")
    return "\n\n".join(parts)


def build_summary(row):
    """
    Compact summary embedded into paper_embeddings.json. The web app
    sends this (not the full abstract) to Gemini at query time, which
    keeps each Q&A call small. Aim for ~400 chars per field max.
    """
    def trim(s, n):
        return (str(s) if s else "").replace("\n", " ").strip()[:n]
    return {
        "title": trim(row.get("Title"), 250),
        "topic": trim(row.get("Construction Topic"), 80),
        "ai_model": trim(row.get("AI Model Used"), 120),
        "method": trim(row.get("Research Method"), 60),
        "abstract": trim(row.get("Abstract"), 600),
        "gaps": trim(row.get("Gaps Addressed"), 400),
        "future": trim(row.get("Future Research"), 400),
        "results": trim(row.get("Results"), 300),
    }


def main():
    if API_KEY in ("PASTE_YOUR_KEY_HERE", "", None):
        print("ERROR: API key not set.")
        print("Either edit API_KEY in this script, or:")
        print("  Windows PowerShell: $env:GEMINI_API_KEY='your-key'")
        print("  Mac/Linux:          export GEMINI_API_KEY='your-key'")
        return

    if not os.path.exists(INPUT_CSV):
        print(f"ERROR: {INPUT_CSV} not found in current directory.")
        print(f"Current directory: {os.getcwd()}")
        return

    print(f"Reading {INPUT_CSV}...")
    df = pd.read_csv(INPUT_CSV)
    df = df[df["Title"].notna() & (df["Title"].astype(str).str.strip() != "")]
    print(f"Loaded {len(df)} papers.")

    client = genai.Client(api_key=API_KEY)

    results = []
    failed = []

    for i, row in enumerate(df.to_dict(orient="records")):
        paper_id = str(row.get("ID", i + 1)).strip()
        text = build_embedding_text(row)

        # Build a short citation string
        authors = str(row.get("Authors", "")).strip()
        year = row.get("Year", "")
        try:
            year = str(int(float(year)))
        except (ValueError, TypeError):
            year = str(year).strip()
        if row.get("Author_Year"):
            citation = str(row["Author_Year"]).strip()
        elif authors:
            first_author = authors.split(";")[0].split(",")[0].strip()
            n_authors = len([a for a in authors.split(";") if a.strip()])
            if n_authors == 1:
                citation = f"{first_author} ({year})"
            elif n_authors == 2:
                second_author = authors.split(";")[1].split(",")[0].strip()
                citation = f"{first_author} and {second_author} ({year})"
            else:
                citation = f"{first_author} et al. ({year})"
        else:
            citation = f"Paper {paper_id} ({year})"

        try:
            print(f"[{i + 1}/{len(df)}] {citation[:60]}...", end=" ", flush=True)
            resp = client.models.embed_content(
                model=MODEL,
                contents=text,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    output_dimensionality=768,
                ),
            )
            vec = resp.embeddings[0].values
            results.append({
                "id": paper_id,
                "citation": citation,
                "embedding": vec,
                "summary": build_summary(row),
            })
            print("OK")
        except Exception as e:
            print(f"FAIL: {e}")
            failed.append({"id": paper_id, "error": str(e)})

        time.sleep(SLEEP_BETWEEN_CALLS)

    print(f"\nDone. {len(results)} embedded, {len(failed)} failed.")
    if failed:
        print("Failed IDs:", [f["id"] for f in failed])

    print(f"\nWriting {OUTPUT_JSON}...")
    output = {
        "model": MODEL,
        "dimension": 768,
        "task_type": "RETRIEVAL_DOCUMENT",
        "n_papers": len(results),
        "papers": results,
    }
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        # Use compact JSON to keep file size down
        json.dump(output, f, separators=(",", ":"), ensure_ascii=False)

    size_kb = os.path.getsize(OUTPUT_JSON) / 1024
    print(f"Saved {OUTPUT_JSON} ({size_kb:.1f} KB)")
    print("\nPlace this file next to index.html and reload the web app.")


if __name__ == "__main__":
    main()
