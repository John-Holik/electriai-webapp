# ElectriAI: Practitioner Knowledge Base for Electrical Construction

Companion website for the ElectriAI Research paper analyzing **794 YouTube videos** and **16,862 viewer comment threads** about electrical-construction topics. The site exposes the dataset, the figures, and a chatbot grounded in a 288-page knowledge base compiled from the question taxonomy.

This repo is self-contained: everything the site serves (HTML, JS, JSON data, figures, Worker code) lives here. The JSON data and figure assets are generated upstream in the separate ElectriAI Research repo (notebooks plus `src/web` builder scripts) and committed here as static files.

The site has six tabs:

- **Findings**, the taxonomy bottleneck figures (question-type reply and answer rates, family-level gaps, activity over time) plus the first-generation research figures: the knowledge-bottleneck bubble chart (interactive Plotly), theme dictionary frequency, transcript topics treemap, and a data-collection / comment-analysis panel, and the 10-class category schema (LV, HVAC, GBF, OCP, RE, DL, CRR, CISF, PDS, OTH).
- **Questions & Answers**, explorer over the question taxonomy: ten substantive question types, ten answer mechanisms plus an untyped bucket, 263 question and 204 answer families, row-level records and downloads.
- **Ask the Knowledge Base**, RAG chat over the 288-page taxonomy knowledge base (`data/kb_pages.json`, built by `src/web/build_kb_wiki.py` from the GPT-5-mini comment corpus and the GPT-5.6 Luna taxonomy consolidation; the taxonomy is a single-model pilot, taxonomy v0, provisional pending human validation). Uses `gemini-embedding-001` (build-time) and `gemini-3.5-flash` (generation). Retrieval is hybrid: cosine similarity plus keyword and intent boosts, running fully in the browser. Production routes through the Cloudflare Worker proxy; on localhost a dev key in `localStorage` calls the Gemini API directly. Cites video IDs and comment IDs from the underlying corpus.
- **Videos & Comments**, searchable, filterable browser over the 404 Q&A videos and their 16,872 collected comment threads from `data/raw_videos.json`, with video metadata and full comment threads.
- **Validation Set**, the 200-comment human-annotated subset (20 per category), validating the original GPT-5-mini classification, sourced from `data/processed/qualtrics_comments.csv`, with every label attached: category, themes, topic / sub-topic, Q&A excerpts and summaries, and reply counts.
- **About**, static page with authors, citation, code & data links, acknowledgments, and contact.

## Architecture

Vanilla React 18 (CDN) + Tailwind CSS (CDN) + Babel standalone for in-browser JSX. No build step. PapaParse handles CSVs; native `fetch` handles JSON. Embeddings are pre-computed and shipped as a static JSON file; cosine similarity runs in the browser.

```
electriai-webapp/
├── index.html                    # Shell, tab nav, root mount, CDN script tags
├── README.md                     # This file
├── data/                         # JSON exports built by the research repo's src/web builders
│   ├── comments.json
│   ├── categories.json
│   ├── summary_stats.json
│   ├── theme_dictionary.json
│   ├── qa_taxonomy.json          # taxonomy summary stats (src/web/export_qa_data.py)
│   ├── qa_records.json           # row-level taxonomy records (src/web/export_qa_data.py)
│   ├── raw_videos.json           # 404 Q&A videos + comment threads (src/web/build_web_raw_videos.py)
│   ├── kb_pages.json             # taxonomy knowledge base (src/web/build_kb_wiki.py)
│   ├── kb_embeddings.json        # (src/web/compute_kb_embeddings.py)
│   ├── kb_chunks.json            # embedded chunks (src/web/compute_kb_embeddings.py)
│   └── taxonomy_figures.json     # Findings taxonomy figures (src/web/build_web_taxonomy_figures.py)
├── figures/                      # PNG/SVG/HTML figure artifacts copied from notebooks
│   ├── knowledge_bottleneck_bubble.svg
│   ├── theme_dictionary_frequency.svg
│   ├── transcript_topics_treemap_views.svg
│   └── data_collection_comment_analysis.svg
├── js/
│   ├── utils.js                  # Small shared helpers
│   ├── components.js             # Shared UI primitives (Chip, Card, modal overlay)
│   ├── research.js               # Findings tab (taxonomy + legacy figures, schema)
│   ├── qa.js                     # Questions & Answers tab (taxonomy explorer)
│   ├── chat.js                   # Ask the Knowledge Base (RAG)
│   ├── rawdata.js                # Videos & Comments tab
│   ├── comments.js               # Validation Set tab (comment explorer)
│   ├── about.js                  # About tab
│   └── app.js                    # Root component, tab routing, data loaders
└── worker/
    ├── worker.js                 # Cloudflare Worker: /api/embed, /api/generate, CORS, rate limit
    └── wrangler.toml             # Worker deploy config
```

## Local development

The site requires HTTP serving (`file://` breaks `fetch`).

```powershell
cd electriai-webapp
python -m http.server 8000
# Open http://localhost:8000
```

Or use VS Code's Live Server extension, or `npx http-server`.

All tabs except Ask the Knowledge Base work with no extra setup; the Ask the Knowledge Base tab needs a Gemini key or the deployed Worker proxy.

### Gemini dev key for Ask the Knowledge Base

Paste a Google AI Studio key into `localStorage` once, then reload:

```js
localStorage.setItem('GEMINI_DEV_KEY', '<your-key>'); location.reload();
```

The frontend will call the Gemini API directly from the browser. The key never leaves your machine. **Do not commit a key. Do not enable this path on a deployed site**, once the Cloudflare Worker is in place (see "Deploying"), the Worker holds the key as a secret and the browser stops needing one.

## Refreshing the data after notebook updates

All JSON under `data/` is generated from notebook outputs in the separate ElectriAI Research repo, which lives beside this one during development (`../ElectriAI_Research`). The question taxonomy comes from its `notebooks/09_Question_Taxonomy_Extraction.ipynb` and `notebooks/10_Question_Consolidation.ipynb`. After re-running the notebooks, regenerate the webapp data from the research repo root (the builders locate this repo via `WEB_APP_DIR` in `src/paths.py`):

```powershell
cd ..\ElectriAI_Research
py -3 -m src.web.export_data                # old-pipeline exports
py -3 -m src.web.build_web_taxonomy_figures
py -3 -m src.web.export_qa_data
py -3 -m src.web.build_web_raw_videos
py -3 -m src.web.build_kb_wiki              # taxonomy knowledge base -> kb_pages.json
py -3 -m src.web.compute_kb_embeddings      # needs the Gemini key or the Worker proxy
```

`export_data` writes the legacy JSON in `data/` and copies figure assets into `figures/`. `build_web_taxonomy_figures` exports the Findings tab taxonomy figures. `export_qa_data` exports the Questions & Answers taxonomy summary and records. `build_web_raw_videos` exports the 404 Q&A videos and their comment threads. `build_kb_wiki` compiles the 288-page taxonomy knowledge base from `taxonomy/` and `Final_Analysis.csv`. `compute_kb_embeddings` computes one Gemini embedding per page chunk (H2 boundaries) and writes `kb_embeddings.json` + `kb_chunks.json`.

Commit the resulting JSON. The site reads everything from static files at load time, so no rebuild is needed beyond a redeploy.

## Deploying

The site is two pieces: a static front-end (Cloudflare Pages) and a Worker that proxies Gemini calls (Cloudflare Workers).

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

Note the deployed URL (e.g. `https://electriai-proxy.<account>.workers.dev`) and ensure it appears as `GEMINI_WORKER_BASE` in `web_app/js/app.js`.

### 2. Pages

Connect this repo to Cloudflare Pages with:

- Build command: **None**
- Build output directory: `/`
- Root directory: `web_app`

Once the Pages domain is final, add it to `ALLOWED_ORIGINS` in `web_app/worker/worker.js` and redeploy the Worker.

## Citation

If you reference this dataset or chatbot, please cite the underlying ElectriAI Research paper (preprint pending).

## Licence

Code released under the MIT Licence. Dataset (CSV/JSON) released under CC BY 4.0, please attribute the ElectriAI Research paper when reusing.
