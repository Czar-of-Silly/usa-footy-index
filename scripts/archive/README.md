# Archive

Files here are kept for reference only and are **not** part of the deployed site or the pipeline.

- `index.dev.html`, `index.dev.backup.html`, `root-index.html` — older copies of the app. The live source is `public/index.html` (or `src/` after the Phase 5 build step).
- `build.js` — the abandoned pre-Phase-5 build script that read `index.dev.html`. Superseded by `npm run build`.
- `try-harder.js`, `test-sofa-via-scraperapi.js`, `sofa-proxy-worker.js` — Sofascore experiments. Sofascore blocks CI; market values now come from the Transfermarkt dataset with a local cache.
