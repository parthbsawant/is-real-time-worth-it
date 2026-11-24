# Dashboard V2 — simple, one-idea-per-page front end

Replaces the single congested page (tabs + dense Overview) with a **home dashboard + 4 focused pages**.
The Python API (`dashboard/api/main.py`) and everything outside `dashboard/web/` stay **unchanged**.
Audience: professors watching a live demo on a projector. Goal: each page makes ONE point, readable from the back of a room.

## 0. Rules that fix "congested"
1. One main message per page. Maximum 3 sections per page, maximum 2 charts per page.
2. Big type: base text 18px, section titles 28px, page titles 40px, KPI numbers 44-52px, table text 17px. Never below 14px (except footnotes at 13px).
3. Lots of white space: cards have 28px padding, 24-32px gaps, content centred, max width 1280px. No horizontal scroll at 1366 px width.
4. At most 4 KPI tiles in a row. Secondary numbers (p95, F1, RMSE, inferences) go in a collapsed "More detail" accordion, closed by default.
5. Text blocks: max 3 lines each. Plain English; every technical word has a "?" tooltip (definitions in section 8).
6. Keep the cream / gold / brown theme: bg #FBF6EC, card #FFFFFF, gold #E3B95B, brown #7A4E24, text #1E1E1E, muted #685D52.
   Series colours: hourly #E5BE65, daily #C89437, weekly #966324, real-time #7A4E24. Font: Inter.
7. All numbers come from the API. All conclusion/verdict sentences are generated from API data (never typed in), and must work for both variants.
8. Currency is GBP (£). Percentages 1 decimal. Intervals 2 decimals, never "-0.00" (use the existing `formatCiVal`).
9. Every page has loading skeletons and a friendly error card (reuse `ApiError`): "Start the API: uvicorn dashboard.api.main:app --port 8000" with a Retry button.

## 1. Routes (React Router, `HashRouter` so refresh/back always work)
| Route | Page | Purpose |
|---|---|---|
| `/` | Dashboard (home) | Final conclusion + 4 big cards linking to the pages |
| `/batch` | Batch Processing | Hourly / daily / weekly pipelines |
| `/realtime` | Real-Time Processing | Kafka + Redis pipeline and a live replay |
| `/simulator` | Simulator | Interval slider and customer inspector (2 tabs) |
| `/evidence` | Evidence | Is the difference real? Who benefits? |

Keyboard shortcuts (ignored while typing in an input): `H` or `Esc` = home, `1` batch, `2` real-time, `3` simulator, `4` evidence.
Install: `npm i react-router-dom lucide-react` (lucide for icons). Keep react 18, vite 5, recharts.

## 2. Global layout (every page)
- Slim top bar (64px): left = "← Dashboard" button (hidden on home) + small app name; right = **model toggle** (segmented control, labels from `/api/meta.variant_labels`: "Primary model" / "Follow-up: with elapsed-time input").
- The toggle is global (React context `VariantContext`), remembered in `localStorage` (wrap in try/catch), and every page refetches when it changes.
- Page header under the bar: page title (40px), one-line subtitle (18px, muted).
- No other navigation. The only way between pages is the home cards, the "← Dashboard" button and keyboard shortcuts.

## 3. Home — `/`
Top to bottom, nothing else:
1. **Title block**: "Is Real-Time Worth It?" / subtitle "Freshness vs cost in next-purchase and customer-value prediction". Small muted line: "{customers} customers · {purchases} purchases · test period {test_start} to {test_end}" from `/api/meta`.
2. **Final conclusion card** (full width, dark brown #7A4E24 background, cream text):
   - label `FINAL CONCLUSION` (gold, small caps)
   - headline (28px, generated): see 3.1
   - three KPI tiles inside it (real-time vs **daily batch**, labelled as such):
     - Accuracy: "39.1% vs 38.9%" (Top-1, real-time vs daily) + caption "within noise" or "significantly better", from the 95% interval `significance[variant].batch_daily.top1_gain_points`
     - Freshness: "13 ms vs 11.1 h" median staleness
     - Cost: "25x compute" = `pipelines.streaming.compute_vs_hourly`, caption "5.40 s vs 0.22 s of model inference"
   - below the tiles, the full generated takeaway paragraph (3.2), 17px.
3. **Four navigation cards** in a 2x2 grid (1x4 stack under 900px). Whole card is a link (keyboard focusable, hover lift, "Open ->" at the bottom). Each: icon, title, one-line description, two live stat chips.
   - **Batch Processing** — "Predictions recomputed on a schedule: hourly, daily, weekly." Chips: "Top-1 {min}-{max}%" across the three batch pipelines; "Staleness 29 min to 4.4 days".
   - **Real-Time Processing** — "Kafka + Redis: the prediction updates on every purchase." Chips: "Top-1 39.1%"; "Staleness 13 ms".
   - **Simulator** — "Move the refresh interval. Inspect any customer." Chips: "15 min to 14 days"; "{customers} customers".
   - **Evidence** — "Is the difference real? Who benefits?" Chips: "95% intervals"; "Hybrid strategy".
4. Footer (muted, 14px): "Primary model = designed before results were seen. Follow-up = added afterwards." Both variants are always reported.

### 3.1 Headline rules (generated, per variant, from `/api/overview?variant=` -> `significance`)
Let sig = significance[variant]; a cadence "wins" on CLV if its `mae_gain_pounds` interval is entirely > 0, on Top-1 if `top1_gain_points` interval entirely > 0.
- No wins at all -> "Real-time is not worth it here: it is no more accurate than batch but costs about {x}x the compute."
- CLV wins only -> "Real-time does not improve next-purchase accuracy, but it predicts customer value measurably better than {cadences}, at about {x}x the compute."
- Top-1 wins -> "Real-time is measurably more accurate than {cadences}, at about {x}x the compute."
### 3.2 Takeaway paragraph
Port the existing generation logic from `src/pages/Overview.jsx` (the `dynamicTakeaway` and "What this shows" code) into a pure function `src/lib/conclusion.js`:
`buildConclusion(overview, variant, unitCosts) -> { headline, takeaway, bullets[], wins: {clv:[], top1:[]} }`. Home uses headline + takeaway; other pages reuse `bullets`.
Expected: Primary model -> no wins. Follow-up model -> CLV wins vs daily (£87.10, CI £23.18 to £150.63) and weekly (£159.71, CI £81.74 to £238.70), no Top-1 win, no win vs hourly.

## 4. Batch Processing — `/batch`
Subtitle: "Predictions are computed on a schedule and stored. Between runs they get older."
1. **How it works strip** (single row of 4 small boxes with arrows): `Purchases arrive` -> `Wait for the next scheduled run` -> `Recompute for customers who bought` -> `Store predictions`. Static, simple.
2. **Three cadence cards side by side** (Hourly, Daily, Weekly), identical layout, data from `/api/overview?variant=`.pipelines.batch_*:
   - title + "every 1 hour / 24 hours / 7 days"
   - 4 KPI rows: Top-1 accuracy, CLV error (MAE, £), Median staleness (use `formatStaleness`), Model compute (CPU seconds)
   - accordion "More detail": Top-3, p95 staleness, inferences, F1, no-history fallbacks.
3. **One chart: "How old is the prediction when it is used?"** Bar chart, x = Hourly/Daily/Weekly, bars = median staleness (hours), plus p95 as a lighter bar. Caption: "Accuracy barely changes, but predictions get much older." (only show this caption if the max Top-1 spread across cadences is < 1 pt; otherwise generate a neutral caption).
4. A single data-driven line below: "Top-1 spread across the three cadences is {x} pt; CLV error spread is £{y}." (Follow-up model: CLV error visibly rises with staleness — the line must say so when CLV MAE of weekly > hourly.)

Expected Primary: Top-1 39.0 / 38.9 / 38.8; CLV MAE £2,203 / £2,200 / £2,175; staleness 29 min / 11.1 h / 4.4 days; CPU 0.22 / 0.22 / 0.19 s.
Expected Follow-up: Top-1 40.3 / 40.3 / 40.1; CLV MAE £2,168 / £2,232 / £2,304.

## 5. Real-Time Processing — `/realtime`
Subtitle: "Every purchase updates the customer's prediction immediately."
1. **Pipeline strip** (static diagram, 5 boxes with arrows): `Purchase` -> `Kafka (ordered per customer)` -> `Consumer` -> `Model` -> `Redis (last 20 purchases + latest prediction)`. Under it, measured numbers from `overview.kafka_check`: "median processing {processing_ms_median} ms · median end-to-end {end_to_end_ms_median} ms · 0 differences vs offline predictions (max score difference {max_abs_score_diff_vs_offline})".
2. **4 KPI tiles** (offline test-set evaluation, `pipelines.streaming`): Top-1, CLV error (MAE £), Staleness (`formatStaleness(0, kafka)` -> ~13 ms), Model compute: "{seconds} s ({compute_vs_hourly}x hourly)". Muted line: "Including Kafka + Redis overhead the measured cost is about {unit_costs.stream_s_per_event_full*1000, 1 decimal} ms per event."
3. **Live replay panel** (the demo piece). Data: `/api/replay` (4,188 events, always the Primary model — show a small badge "Replay uses the Primary model" and ignore the toggle here).
   - Controls: Play/Pause, Restart, speed select (5, 25, 100, 500 events per second), progress bar with the simulated date/time of the current event.
   - Four live counters: Events processed (n / 4,188), Live Top-1 (running), Median processing ms (running), Median end-to-end ms (running).
   - Live feed: table of the last 10 events, newest on top: Time | Customer | Bought | £ | Predicted next | Confidence | ms. When an event arrives for a customer who already has a stored prediction, mark that earlier prediction: green tick if its `predicted_next` equals the category just bought, grey cross otherwise. Running Top-1 = ticks / (ticks + crosses).
   - Footnote: "Live Top-1 is measured on replayed events that have a later purchase ({kafka_check.events_with_a_later_purchase}); the final value should be about {kafka_check.live_top1 as %}. The Top-1 above comes from the {meta.examples.test} test examples, a different set, so the two numbers differ." (Small differences from same-timestamp purchases are fine.)
4. Data-driven line: "Real-time keeps predictions about {median e2e} ms old, versus {x} for daily batch."

## 6. Simulator — `/simulator`
Subtitle: "Change how often batch refreshes and see what real-time would change." Two tabs (segmented control at the top): **Refresh interval** | **Customer**.

### 6.1 Refresh interval tab
1. **Big slider**, log scale 0.25 h to 336 h, 52px tall track, with snap buttons below: 1 h, 6 h, 24 h, 3 days, 7 days, 14 days. Big label: "Batch refreshes every {x}". Debounce 400 ms; `GET /api/interval?hours=&variant=` (first call per value can take a few seconds: show "Running the model..." and keep the previous result dimmed, never blank).
2. **Two big result cards** side by side: "Batch (every {x})" and "Real-time". Rows (4 only): Top-1, CLV error (£ MAE), Median staleness, Model compute (CPU s, use `est_cpu_seconds`). Accordion "More detail": Top-3, p95 staleness, inferences, `est_cpu_seconds_full` ("incl. Kafka + Redis").
3. **Difference strip** between/below the cards: chips "Top-1 {+0.18 pt}", "CLV error {+£1.34}", "Compute {x}x". Colour: grey when |Top-1 diff| < 0.5 pt (label "within noise"), never green/red for tiny differences. Caption: "See the Evidence page for 95% intervals."
4. **Sweep**: button "Run sweep" -> evaluates [1,3,6,12,24,48,72,120,168,336] h sequentially with a progress bar, then ONE line chart with a metric switch (Top-1 / Median staleness / CPU seconds), real-time as a dashed horizontal line. Top-1 y-axis 0 to 50 (flat lines are the honest message; add the note "axis starts at 0").
Expected at 24 h (Primary): batch 38.9% / £2,200 / 11.1 h / 0.21 s; real-time 39.1% / £2,201 / 13 ms / 5.40 s. At 1 h: batch 39.0% / £2,203 / 3,794 inferences. At 168 h: 38.8% / £2,175 / 3,402 inferences.

### 6.2 Customer tab
Step-by-step layout, numbered steps:
1. **Pick a customer**: search box (customer id) + 8 suggestion chips (the most active customers: `GET /api/customers?limit=8`). Segment filter chips Q1-Q4 optional (small). Show "Customer #14911 · segment Q4 · 77 purchases in the test period".
2. **Pick a moment**: ONE simple timeline (not 14 rows): a horizontal strip of the customer's purchases as fixed-size 5px dots (`GET /api/customer/{id}`), shaded test window, a solid vertical line for "selected time", a dashed gold line for "batch last ran". Under it a time slider over the test window plus `Previous purchase` / `Next purchase` buttons that snap to the customer's test-period purchases. Batch refresh selector next to it: Hourly / Daily / Weekly (default Daily).
3. **Compare**: two columns from `GET /api/customer/{id}/at?ts=&hours=&variant=`:
   - Batch: "Last ran {batch_last_run_time} ({batch_age_hours} h ago)", top-3 categories as horizontal probability bars, "Predicted spend, next 90 days: £{predicted_clv}", status badge.
   - Real-time: "Includes everything up to {at_time}", same layout.
   - Status badge from `top1_correct` / `top3_correct` ("Correct", "In top 3", "Wrong"), or "No later purchase in the data" when `next_purchase` is null.
   - Banner "Purchases the batch has not seen yet" listing `purchases_missed_by_batch`, or "Batch is up to date" when empty.
   - Line "What they actually bought next: {category} on {time} (£{amount}, one order)". Label CLV as 90-day spend and the order amount as one order; they are different quantities.
   - If `batch` or `streaming` is null: show "Not enough purchase history at this moment" (friendly, no crash).
Demo example: customer 14096, time 22 Nov 2011: both pipelines identical (batch up to date). Use the 168 h batch setting to see a difference.

## 7. Evidence — `/evidence`
Subtitle: "Are the differences real, and who gains from real-time?" Three stacked sections.
1. **Is the difference real?** Existing `ForestPlot` (keep the component, fix label anchoring as already done) for real-time vs hourly / daily / weekly. Switch: Top-1 gain (pt) | CLV error gain (£). Intervals that cross zero are grey and say "not distinguishable from zero". One-line "How to read this": "A dot right of the line means real-time is better. If the bar touches the line, it could be chance." Below it the generated `bullets` from `conclusion.js`.
2. **Who benefits?** Table, one row per customer group Q1 (rarest buyers) to Q4 (most frequent): Top-1 daily batch | Top-1 real-time | Difference (pt). Data `overview.pipelines.batch_daily.top1_by_segment` and `.streaming.top1_by_segment`. Differences are small; grey chip "within noise". Footnote: "Groups are quartiles of past purchase frequency; each has a few hundred test examples. Q1 also contains new customers with no training-period history." Then the **hybrid slider**: "Serve the top {X}% most frequent buyers in real time, everyone else from daily batch" (`GET /api/hybrid?top_pct=&batch=batch_daily&variant=`, debounce 300 ms, a small batch select Hourly/Daily/Weekly). Show 3 tiles: Top-1 (vs all-batch and all-real-time in muted text), Model compute (`est_cpu_seconds_model_only` vs `all_realtime_cpu_seconds_model_only`), Share of purchase events handled in real time (`share_of_events_served_realtime`). Muted line: "incl. Kafka + Redis: {est_cpu_seconds} s". Generated caption e.g. "At 25%: Top-1 39.07% (all-batch 38.93%, all-real-time 39.11%) for 2.63 s of model compute (all-real-time 5.40 s)." Do not claim a benefit that the numbers do not show.
3. **The models** (small): bar chart baseline (global prior) vs LSTM vs Transformer, Top-1 with error bars (`overview.models`, mean and std over 3 seeds), y-axis from 0. Caption generated from data: "Both neural models beat the frequency baseline ({baseline}%); LSTM {x}%, Transformer {y}%." Bar label "Transformer", not "(Primary)". In Follow-up mode use the same `overview.models` returned for that variant.

## 8. Glossary tooltips (`src/lib/glossary.js`, shown on "?" hover/focus)
- Top-1 accuracy: how often the model's first guess for the next product category is right.
- Top-3 accuracy: how often the real next category is among the model's top three guesses.
- CLV: customer lifetime value, here the amount a customer spends in the next 90 days.
- CLV error (MAE): the average size of the mistake in predicted spend, in pounds. Lower is better.
- Staleness: how old the information behind a prediction is when the prediction is used.
- Model compute: CPU time spent running the model to produce all predictions for the test period.
- Batch: predictions recomputed on a schedule and stored. Real-time: recomputed on every purchase.
- 95% interval: the range the true difference is very likely in. If it includes zero, the difference could be chance.
- Quartile group: customers split into four equal groups by how often they bought before (Q1 rarest, Q4 most frequent).

## 9. Files
```
dashboard/web/src/
  main.jsx, App.jsx            (HashRouter, routes, layout, keyboard shortcuts)
  api.js                       (keep; add nothing that changes the API)
  context/VariantContext.jsx
  hooks/useApi.js              (fetch + in-memory cache keyed by URL + loading/error state)
  lib/format.js (moved), constants.js (moved), conclusion.js, glossary.js
  components/ AppShell, PageHeader, KpiTile, PipelineCard, NavCard, Takeaway, Tooltip, Accordion, Skeleton, ApiError, ForestPlot
  pages/ Home.jsx, Batch.jsx, RealTime.jsx, Simulator.jsx (IntervalTab.jsx, CustomerTab.jsx), Evidence.jsx
  styles/ tokens.css, base.css, + one small css file per page (replace the 1,900-line index.css)
```
Port logic, do not delete anything before its replacement works. At the very end delete: `Overview.jsx`, `Simulation.jsx`, `LiveReplay.jsx`, `WhoBenefits.jsx`, `IntervalExplorer.jsx`, `CustomerInspector.jsx`, `TopBar.jsx`, old `index.css`.

## 10. Acceptance checklist (run for BOTH variants)
- Home shows the generated conclusion; Primary -> "not worth it" wording; Follow-up -> CLV wins vs daily and weekly, none vs hourly.
- Every page fits a 1366x768 screen without horizontal scroll, at most two screen-heights tall, no text under 14px.
- Numbers match: Primary Top-1 39.0 / 38.9 / 38.8 / 39.1; Follow-up 40.3 / 40.3 / 40.1 / 40.6; real-time CPU 5.40 s (24.7x) Primary, 5.13 s (23.9x) Follow-up.
- Toggle changes all pages; browser Back works; shortcuts work; no red console errors; `npm run build` has zero errors.
