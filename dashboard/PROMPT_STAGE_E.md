# Stage E: Evidence page + cleanup + final checks

Read `dashboard/SPEC_V2.md` first (section 0 rules and tokens, section 7 Evidence, section 9 files, section 10 checklist). Work ONLY inside `dashboard/web/`. Do NOT run any git command. Use only the Slate & Teal tokens (no gold, no hard-coded colours). Never render an object as a React child.

## Part 1: build `src/pages/Evidence.jsx` (+ `src/styles/evidence.css`)
Follow SPEC_V2 section 7: three stacked sections.
1. **Is the difference real?** Reuse `components/ForestPlot.jsx` but restyle it with the tokens (real-time dots `--realtime`, intervals crossing zero grey with "not distinguishable from zero", dashed zero line, font >= 14px). Metric switch Top-1 gain (pt) | CLV error gain (GBP). "How to read this" line. Below it the generated bullets from `lib/conclusion.js`. Data: `overview.significance` for the current variant.
2. **Who benefits?** Table Q1 to Q4 (daily batch Top-1, real-time Top-1, difference, grey "within noise" chip) from `overview.pipelines.batch_daily.top1_by_segment` and `.streaming.top1_by_segment`, with the footnote from the spec. Then the hybrid slider (0 to 100 %, default 25, debounce 300 ms, small Hourly/Daily/Weekly select) calling `GET /api/hybrid?top_pct=&batch=&variant=`: three tiles (Top-1 with muted all-batch / all-real-time values; Model compute using `est_cpu_seconds_model_only` vs `all_realtime_cpu_seconds_model_only`; Share of purchase events handled in real time using `share_of_events_served_realtime`), muted line "incl. Kafka + Redis: {est_cpu_seconds} s", and a generated caption. The caption must only state what the numbers show.
3. **The models:** small bar chart baseline vs LSTM vs Transformer, Top-1 with error bars (mean and std over 3 seeds from `overview.models`), y-axis from 0, generated caption from the data. Label the bar "Transformer", not "(Primary)".

## Part 2: compute-estimate caption
Where the Simulator and the Evidence hybrid tiles show "Model compute", add a small muted caption: "Estimated from the measured cost per model run. The Batch and Real-Time pages show the measured totals." Do not change any numbers.

## Part 3: cleanup (port before delete)
1. Merge the two constants files into `src/lib/constants.js` (keep the V2 `PIPELINE_META` fields `cadence` and the longer `description`; keep `THEME`), change every import (`Batch.jsx`, `simulator/IntervalTab.jsx`, `simulator/CustomerTab.jsx`) to `../lib/constants` / `../../lib/constants`, then delete `src/constants.js`.
2. Merge `src/format.js` into `src/lib/format.js` (keep every function used by any page, including `formatCiVal` and `formatCurrencySigned`), fix imports, delete `src/format.js`.
3. Use `grep -rn` to confirm nothing imports them, then delete: `pages/Overview.jsx`, `pages/Simulation.jsx`, `pages/LiveReplay.jsx`, `pages/WhoBenefits.jsx`, `components/IntervalExplorer.jsx`, `components/CustomerInspector.jsx`, `components/TopBar.jsx`, and the old `src/index.css` (make sure `main.jsx` imports `styles/tokens.css`, `styles/base.css` and each page css instead). Keep `api.js`.
4. Home nav cards, the top bar and keyboard shortcuts (H / Esc, 1-4) must reach all four pages including Evidence.

## Part 4: run SPEC_V2 section 10 for BOTH variants and report each line as pass or fail
- Home generated conclusion wording differs between Primary and Follow-up as specified.
- Every page fits 1366x768 without horizontal scroll, at most two screen-heights tall, no text under 14px.
- Primary Top-1 39.0 / 38.9 / 38.8 / 39.1; Follow-up 40.3 / 40.3 / 40.1 / 40.6; real-time CPU 5.40 s (24.7x) Primary, 5.13 s (23.9x) Follow-up (Real-Time page).
- Evidence expected values, Primary: Top-1 gain vs hourly / daily / weekly +0.11 / +0.18 / +0.32 pt (all intervals cross zero). Follow-up CLV gain vs hourly / daily / weekly GBP 23.6 / 87.1 / 159.7, only daily and weekly intervals exclude zero. Segment table (Primary), daily vs real-time: Q1 36.5 / 36.3, Q2 36.3 / 36.3, Q3 43.3 / 43.7, Q4 38.9 / 39.2. Hybrid at 25 % with daily batch (Primary): Top-1 39.07 %, model compute 2.63 s vs 5.40 s, 46.6 % of events in real time. Models: baseline 33.8 %, LSTM 39.6 %, Transformer 39.5 %.
- Toggle changes all pages; Back works; no red console errors; `npm run build` has zero errors; `grep -rniE "7A4E24|E3B95B|FBF6EC|C89437|E5BE65|966324|FFF8E7" dashboard/web/src` returns nothing.

Report: files created, modified and deleted; the numbers observed; the pass/fail list; anything you could not follow. Do not run git.
