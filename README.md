# ElectriAI — YouTube Q&A Knowledge for Electrical Contractors

Companion website for the ElectriAI Research paper analyzing **794 YouTube videos** and **~18,000 viewer comments** about electrical-construction topics. The site exposes the dataset, the figures, and a chatbot grounded in the project's markdown knowledge base.

The site has four tabs:

- **Overview** — Project summary, top-line stats, and the 10-class category schema (LV, HVAC, GBF, OCP, RE, DL, CRR, CISF, PDS, OTH).
- **Findings** — Four visualizations from `notebooks/05_Visualizations.ipynb`: the knowledge-bottleneck bubble chart (interactive Plotly with an SVG fallback), theme dictionary frequency, transcript topics treemap, and a data-collection / comment-analysis panel.
- **Comments** — Searchable, filterable browser over the 200-comment curated set (20 per category × 10, sourced from `data/processed/qualtrics_comments.csv`) with every label attached: category, themes, topic / sub-topic, Q&A excerpts and summaries, reply counts, and video metadata.
- **Wiki Chat** — RAG chatbot grounded in `knowledge_base/wiki/**/*.md`. Uses `gemini-embedding-001` (build-time) and `gemini-2.5-flash` (generation). Local-first: calls the Gemini API directly from the browser with a dev key in `localStorage`. A Cloudflare Worker proxy is planned for public deployment (see "Deploying" below). Cites video IDs and comment IDs from the underlying corpus.

## Architecture

Vanilla React 18 (CDN) + Tailwind CSS (CDN) + Babel standalone for in-browser JSX. No build step. PapaParse handles CSVs; native `fetch` handles JSON. Embeddings are pre-computed and shipped as a static JSON file; cosine similarity runs in the browser.

```
web_app/
├── index.html                    # Shell, tab nav, root mount, CDN script tags
├── README.md                     # This file
├── data/                         # JSON exports built by src/web/export_data.py
│   ├── comments.json
│   ├── categories.json
│   ├── summary_stats.json
│   ├── theme_dictionary.json
│   ├── wiki_pages.json
│   ├── wiki_embeddings.json
│   └── wiki_chunks.json
├── figures/                      # PNG/SVG/HTML figure artifacts copied from notebooks
│   ├── knowledge_bottleneck_bubble.html
│   ├── knowledge_bottleneck_bubble.svg
│   ├── theme_dictionary_frequency.svg
│   ├── transcript_topics_treemap_views.svg
│   └── data_collection_comment_analysis.svg
├── js/
│   ├── utils.js                  # Small shared helpers
│   ├── components.js             # Shared UI primitives (Chip, Card, modal overlay)
│   ├── overview.js               # Overview tab
│   ├── findings.js               # Findings tab (5 figures)
│   ├── comments.js               # Comments explorer
│   ├── chat.js                   # Wiki Chat (RAG)
│   └── app.js                    # Root component, tab routing, data loaders
└── worker/
    ├── worker.js                 # Cloudflare Worker: /api/embed, /api/generate, CORS, rate limit
    └── wrangler.toml             # Worker deploy config
```

## Local development

The site requires HTTP serving (`file://` breaks `fetch`).

```powershell
cd web_app
python -m http.server 8000
# Open http://localhost:8000
```

Or use VS Code's Live Server extension, or `npx http-server`.

Three tabs (Overview, Findings, Comments) work with no extra setup. The Wiki Chat tab needs a Gemini key.

### Gemini dev key for Wiki Chat

Paste a Google AI Studio key into `localStorage` once, then reload:

```js
localStorage.setItem('GEMINI_DEV_KEY', '<your-key>'); location.reload();
```

The frontend will call the Gemini API directly from the browser. The key never leaves your machine. **Do not commit a key. Do not enable this path on a deployed site** — once the Cloudflare Worker is in place (see "Deploying"), the Worker holds the key as a secret and the browser stops needing one.

## Refreshing the data after notebook updates

All JSON under `web_app/data/` is generated from the upstream notebook outputs. After re-running notebooks `01–05`, regenerate the webapp data:

```powershell
python -m src.web.export_data
python -m src.web.compute_wiki_embeddings   # requires GEMINI_API_KEY in .env
```

The first script writes every JSON in `web_app/data/` and copies the five figure assets into `web_app/figures/`. The second computes one Gemini embedding per wiki page (chunked at H2 boundaries) and writes `wiki_embeddings.json` + `wiki_chunks.json`.

Commit the resulting JSON. The site reads everything from static files at load time, so no rebuild is needed beyond a redeploy.

## Deploying

> **Status: deferred.** The site currently runs locally only — the Cloudflare account, custom domain, and Worker secrets aren't set up yet. The instructions below are the planned path for when those details land.

The deployed site is two pieces: a static front-end (Cloudflare Pages) and a Worker that proxies Gemini calls (Cloudflare Workers).

### 1. Worker

```powershell
npm i -g wrangler
wrangler login
cd web_app/worker
wrangler kv:namespace create ELECTRIAI_RL_KV
# Paste the returned id into wrangler.toml
wrangler secret put GEMINI_API_KEY
# Paste the Gemini free-tier API key when prompted
wrangler deploy
```

Note the deployed URL (e.g. `https://electriai-proxy.<account>.workers.dev`) and ensure it appears as `API_BASE` in `web_app/js/app.js`.

### 2. Pages

Connect this repo to Cloudflare Pages with:

- Build command: **None**
- Build output directory: `/`
- Root directory: `web_app`

Once the Pages domain is final, add it to `ALLOWED_ORIGINS` in `web_app/worker/worker.js` and redeploy the Worker.

## Citation

If you reference this dataset or chatbot, please cite the underlying ElectriAI Research paper (preprint pending).

## Licence

Code released under the MIT Licence. Dataset (CSV/JSON) released under CC BY 4.0 — please attribute the ElectriAI Research paper when reusing.
