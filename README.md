# AI in Construction Management — Systematic Review Database

Interactive companion website for the systematic review *"A Systematic Review of Artificial Intelligence Applications in Construction Management: Current Trends and Future Research Directions"* (International Journal of Construction Management, 2026).

The site presents the full dataset behind the review (148 peer-reviewed articles, 14 journals, 2006-2026) through interactive visualisations and an AI-assisted Q&A interface.

**Live site:** https://cm.electriai.com

## Features

- **Findings tab** — Interactive bar charts (publication trends, geography, journals, topics), bubble matrix (data sources × validation strategies), Sankey diagram (AI techniques → methodologies → themes), and heatmap (AI categories × construction areas). Every chart is clickable and drills down to the underlying papers.
- **Papers tab** — Full searchable database with filters by year, country, journal, research method, and construction topic. Each paper opens a detail modal with abstract, methodology, results, gaps, and future-research statements.
- **AI Assistant tab** — Free-form Q&A grounded in the 148 papers. Uses retrieval-augmented generation (RAG): each question is embedded, the most relevant papers are retrieved by semantic similarity, and Gemini answers with inline citations. Citations link to full paper records.

## Architecture

Vanilla React (CDN) + Tailwind CSS + Babel standalone. No build step. All visualisations are pure SVG. Data lives in CSV files alongside `index.html` and is loaded at startup via PapaParse.

```
project/
├── index.html                  # Slim entry, loads all JS modules
├── data.csv                    # 148-paper master database
├── bubble_chart.csv            # One-hot encoded sources and validation strategies
├── sankey_diagram.csv          # AI Model → Methodology → Goal mapping
├── heat_map.csv                # AI Model Categories × Construction Areas
├── paper_embeddings.json       # Pre-computed Gemini embeddings for RAG
├── compute_embeddings.py       # Generates paper_embeddings.json (run once)
└── js/
    ├── utils.js
    ├── chart-bar.js            # Bar and year charts
    ├── chart-bubble.js         # Bubble matrix
    ├── chart-sankey.js         # Sankey with two-hop highlighting
    ├── chart-heatmap.js        # Frequency heatmap
    ├── ai-chat.js              # RAG-based Q&A
    ├── paper-components.js     # Paper card, modal, helpers
    └── app.js                  # Main app, layout, state
```

## Local development

The site requires HTTP serving (file:// will not work due to fetch and CORS).

```bash
# Python
python -m http.server 8000

# Or Node
npx http-server

# Or VS Code: Live Server extension
```

Then open http://localhost:8000.

## Updating the data

To update the paper list, edit `data.csv`, `bubble_chart.csv`, `sankey_diagram.csv`, or `heat_map.csv` and commit. The site reads CSVs at startup.

If `data.csv` changes meaningfully (new papers added or abstracts revised), regenerate the embeddings:

```bash
pip install google-genai pandas
python compute_embeddings.py
```

This produces a new `paper_embeddings.json` (~1MB). Commit and the AI Assistant will use the updated embeddings on next page load.

## AI Assistant configuration

The Q&A feature uses the Gemini API. The API key is held server-side in a Cloudflare Worker (see `worker/` if present) and accessed via `/api/*` endpoints. For local testing, the key may be inlined in `js/app.js`; this is **not** committed to the public repo.

Free tier (gemini-2.5-flash): 1500 requests/day, 15 RPM.

## Citation

If you use this database in your own work, please cite:

> [Author(s)]. (2026). A Systematic Review of Artificial Intelligence Applications in Construction Management: Current Trends and Future Research Directions. *International Journal of Construction Management*.

## Licence

The code is released under the MIT Licence. The dataset is released under CC BY 4.0; please attribute the systematic review when reusing.