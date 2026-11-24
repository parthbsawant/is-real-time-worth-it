You are redesigning the React front end of a seminar dashboard. Work ONLY inside `dashboard/web/`. Do not touch `dashboard/api/`, `src/`, `results/`, or any other folder. Run NO git commands.

The current UI is one congested page. Replace it with a simple home dashboard plus four focused pages. The complete design is in `dashboard/SPEC_V2.md` — read it fully before writing any code, and follow it exactly (routes, layout rules, page contents, data fields, expected numbers, acceptance checklist). The Python API is finished and tested; use it as is. Interactive docs: http://localhost:8000/docs (API runs on port 8000; Vite proxies /api).

Key requirements in one paragraph: a Home page (`/`) with a generated FINAL CONCLUSION card and four big clickable cards leading to Batch Processing (`/batch`), Real-Time Processing (`/realtime`), Simulator (`/simulator`, two tabs: refresh interval and customer) and Evidence (`/evidence`). Big type, lots of white space, one message per page, max 2 charts per page, secondary numbers hidden in "More detail" accordions. Keep the cream/gold/brown theme. The Primary/Follow-up model toggle is global and every page must work for both. All conclusion text is generated from API data, never hard-coded. Reuse (port) the existing logic in `src/pages/Overview.jsx`, `src/format.js`, `src/components/ForestPlot.jsx` and `src/api.js`; do not delete an old file until its replacement works.

Work in 5 stages. After each stage run `npm run build` (must be error-free), then STOP and tell me what you did, which files changed, and what I should check. Wait for me to say "continue" before the next stage.

STAGE A — Foundation + Home. `npm i react-router-dom lucide-react`. HashRouter with the 5 routes (the 4 other pages as empty placeholders with a title). AppShell with slim top bar ("← Dashboard" button, global model toggle via VariantContext persisted in localStorage with try/catch), keyboard shortcuts (H/Esc, 1-4), design tokens in `src/styles/tokens.css` and `base.css` (replace the 1,900-line `index.css`; keep it until Stage E if needed), `hooks/useApi.js` with cache, `lib/conclusion.js` ported from Overview.jsx, `lib/glossary.js` with `Tooltip` component, and the finished Home page exactly as in SPEC_V2 section 3. Check: Home shows the headline and three tiles for both variants, 4 nav cards work by click and keyboard.

STAGE B — Batch Processing page (SPEC_V2 section 4).

STAGE C — Real-Time Processing page including the live replay panel (SPEC_V2 section 5). The replay must run smoothly at 500 events/second (update React state in batches, not once per event; keep running statistics incrementally).

STAGE D — Simulator page with both tabs (SPEC_V2 section 6). Handle slow `/api/interval` calls (debounce 400 ms, show "Running the model…", keep the previous result dimmed). Handle customers with too little history gracefully.

STAGE E — Evidence page (SPEC_V2 section 7), then cleanup: delete the old pages/components and old `index.css`, check every page at 1366x768, run the SPEC_V2 section 10 checklist for both variants, and report any item that fails.

Never invent numbers. If an API field you need is missing, tell me instead of guessing. Keep the code simple and readable: small components, no heavy abstractions.
