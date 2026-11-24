# Stage D: Simulator page + polish

Read `dashboard/SPEC_V2.md` first (design rules, section 0 tokens, section 6 Simulator). Work ONLY inside `dashboard/web/`. Do NOT run any git command. Use only the Slate & Teal tokens in `src/styles/tokens.css` (no gold, no hard-coded colours).

## Part 1: build `src/pages/Simulator.jsx` (+ `src/styles/simulator.css`)
Follow SPEC_V2 section 6 exactly: two tabs (Refresh interval | Customer), numbered steps, plain labels.
- Theme change: wherever the spec says "dashed gold line" (batch last ran) use a dashed `--primary` line; the selected-time line stays solid `--accent`.
- Refresh interval tab: log slider 0.25 h to 336 h with snap buttons, debounce 400 ms, call `GET /api/interval?hours=&variant=`; keep the previous result dimmed with "Running the model..." while loading, never blank. Two result cards (Batch / Real-time) with 4 rows: Top-1, CLV error, Median staleness, Model compute (`est_cpu_seconds`). Accordion "More detail": Top-3, p95 staleness, inferences, and a muted row "incl. Kafka + Redis" from `est_cpu_seconds_full`. Difference chips (grey "within noise" when |Top-1 diff| < 0.5 pt). "Run sweep" button over [1,3,6,12,24,48,72,120,168,336] h with progress bar, one line chart + metric switch, real-time as a dashed horizontal line, Top-1 axis starting at 0 with the note "axis starts at 0".
- Customer tab: customer search + 8 chips from `/api/customers?limit=8`; one timeline strip from `/api/customer/{id}` (5px dots, shaded test window, selected-time line, batch-last-ran dashed line); time slider + Previous/Next purchase buttons; Hourly/Daily/Weekly selector (default Daily); two comparison columns from `/api/customer/{id}/at?ts=&hours=&variant=` (top-3 probability bars, predicted 90-day spend, Correct / In top 3 / Wrong badge, "Purchases the batch has not seen yet" banner, "What they actually bought next"). If `batch` or `streaming` is null show "Not enough purchase history at this moment".
- Every API value must be rendered as text/number. Never render an object as a React child (known bug: `meta.dataset.examples` is an object; use `meta.dataset.examples.test`).
- Respect the global Primary / Follow-up toggle for all calls.

## Part 2: polish (small fixes)
1. Add a per-page error boundary around every route in `App.jsx` (friendly card "This page hit a problem. Reload or go back to the Dashboard", top bar stays visible).
2. `RealTime.jsx`: remove the unused `React` import, `formatSeconds` import and `replayLoading` variable (lint clean). Format counts with thousands separators in the footnote (2,649 and 2,828). Give the "Dataset test window" label the normal body font, not monospace.
3. `Batch.jsx` / `batch.css`: chart y-axis title must not overlap tick labels (add left margin), legend text colour `--text` with a small swatch, flow-strip boxes equal height.

## Checks before you report
- `npm run build` with zero errors.
- `grep -rniE "7A4E24|E3B95B|FBF6EC|C89437|E5BE65|966324|FFF8E7" dashboard/web/src` returns nothing.
- Primary model at 24 h: batch 38.9% / GBP 2,200 / 11.1 h / 0.21 s; real-time 39.1% / GBP 2,201 / 13 ms / 5.40 s. At 1 h: 39.0% / GBP 2,203 / 3,794 inferences. At 168 h: 38.8% / GBP 2,175 / 3,402 inferences. Test Follow-up as well.
- Customer 14096, 22 Nov 2011: both pipelines identical; with the 168 h (Weekly) setting a difference appears.
- Report: files changed, numbers observed, anything in the spec you could not follow. Do not run git.
