# Dashboard spec: "Is Real-Time Worth It?"

Audience: professors at a seminar. Purpose: walk through the whole experiment, and let the
audience play with it (sliders, clicks) instead of reading tables. Everything shown must come from
the API. **No hard-coded result numbers anywhere in the UI.**

## Stack (fixed)
React 18 + Vite (JavaScript), Recharts for charts, plain CSS (no UI kit). Dev server on port 5173,
proxying `/api` to `http://localhost:8000` (the Python API, already written, do not change it).

## Look
Match the seminar slides: cream background `#FBF6EC`, black text, gold accent `#E3B95B`,
brown `#7A4E24` for headings and the "real-time" series, gold `#E3B95B` for "batch" series,
thin gold frame/cards, Inter font. Large, readable type (it will be projected). Desktop 1920x1080 first.
Series colours must be consistent everywhere: batch hourly / daily / weekly = three shades of gold-tan
(light to dark), real-time = dark brown.

## Global controls (top bar, on every page)
- Page tabs: Overview, Simulation, Live Replay, Who Benefits.
- **Model toggle** (`variant`): `base` = "Primary model", `age` = "Follow-up: with elapsed-time input".
  Labels come from `/api/meta` -> `variant_labels`. Every page re-fetches on change.
- Small caption under the toggle: "Primary = designed before results were seen. Follow-up = added afterwards."

## Page 1: Overview  (`GET /api/overview`, `GET /api/meta`)
- Dataset strip from `meta.dataset`: customers, purchases, span, test period, number of test examples.
- Four clickable pipeline cards (batch hourly / daily / weekly / real-time) showing Top-1, Top-3,
  CLV error (GBP), median staleness (format sensibly: "13 ms", "30 min", "11 h", "4.4 days"),
  compute (`inferences`, `seconds`, `compute_vs_hourly`). Clicking a card highlights it and shows its
  per-segment Top-1 and latency in a side panel.
- Baseline comparison: bar chart Top-1 of baseline vs LSTM vs Transformer (`overview.baseline`,
  `overview.models[arch].mean_std.top1` = [mean, std]; draw std as error bars).
- "Is the difference real?" panel from `overview.significance` (per batch pipeline:
  `top1_gain_points` = [estimate, ci_low, ci_high], `mae_gain_pounds` likewise). Draw a forest plot:
  point + horizontal CI line, vertical zero line, label "real-time better" on the right of zero.
  A row whose CI crosses zero is drawn grey with the text "not distinguishable from zero".
- Cost panel: bar chart of `seconds` per pipeline, and a line saying how many times more compute
  real-time used than hourly batch (`compute_vs_hourly`). Footnote from `kafka_check`: processing ms
  median and end-to-end ms median of the real Kafka+Redis pipeline, and that its predictions matched
  the offline ones (`max_abs_score_diff_vs_offline`).
- A plain-language "What this shows" box. Its sentences must be generated from the data
  (e.g. "Real-time vs weekly batch: +0.3 points Top-1, 95% range -0.2 to +0.9") and must never claim
  a win when the CI crosses zero.

## Page 2: Simulation  (`GET /api/interval`, `/api/customers`, `/api/customer/{id}`, `/api/customer/{id}/at`)
Left half, **Interval explorer**
- Slider "Batch refresh interval" 0.25 to 336 hours (log-scale feel; show snap marks at 1 h, 24 h,
  168 h and a readable label like "every 6 hours"). Debounce ~400 ms, show a loading shimmer
  (first call per value can take a few seconds, repeats are cached).
- On change call `/api/interval?hours=..&variant=..`; show batch vs real-time side by side:
  Top-1, Top-3, CLV error, median and 95th-percentile staleness, inferences, estimated CPU seconds.
  Show deltas (real-time minus batch) with sign and colour (neutral grey if tiny: |Top-1 delta| < 0.5 pt).
- "Sweep" button: calls the API for [1, 3, 6, 12, 24, 48, 72, 120, 168, 336] hours one after another
  (progress bar) and draws three small line charts against interval: Top-1, staleness, compute,
  with the real-time value as a dashed horizontal line.

Right half, **Customer inspector**
- Customer list (`/api/customers`, filters: segment chips 1-4, search box, "most active in test
  period" default sort). Click a row to select.
- For the selected customer (`/api/customer/{id}`): timeline chart of purchases (x = time, y = category,
  dot size = amount; test period shaded).
- **Time slider** across the test period (`meta.dataset.test_start_ts` .. `test_end_ts`, snapping to the
  customer's own purchase times with prev/next buttons "jump to next purchase"). It drives
  `/api/customer/{id}/at?ts=..&hours=<interval slider>&variant=..`.
- Result panel: two columns "Batch (last ran <time>, <n> h ago)" and "Real-time (now)". Each shows the
  top-3 predicted categories as horizontal probability bars and predicted CLV in GBP. Below: list of
  `purchases_missed_by_batch` (highlight: "batch has not seen these yet"), and `next_purchase` (what the
  customer actually bought next, when). Badge each column "correct (top-1)" / "in top-3" / "wrong".
  If `next_purchase` is null say "no later purchase in the data".

## Page 3: Live Replay  (`GET /api/replay` once, then everything client-side)
- Play / pause / reset, speed slider 1 to 500 events per second, and a progress bar over the 4,188
  events with the current dataset time shown.
- Left: live event feed (latest ~12 events: time, customer, bought category, amount, and the
  prediction the real-time pipeline made right after it, with confidence).
- Right: live counters
  * events processed, real-time inferences, estimated CPU seconds (events x `unit_costs_seconds.stream_s_per_event_full`)
  * "if this were hourly batch": estimated CPU seconds for the same period (take
    `overview.pipelines.batch_hourly.inferences` x `unit_costs_seconds.batch_s_per_inference`, scaled by progress)
  * running hit rate of real-time predictions: when a customer's next event arrives, check whether the
    stored prediction for that customer equals the category actually bought
  * sparkline of `processing_ms` and `end_to_end_ms`.
- Optional toggle "show only segment N".
- The replay data is from the primary model only; when the follow-up toggle is on, show a note saying so.

## Page 4: Who Benefits  (`GET /api/overview`, `GET /api/hybrid`)
- Grouped bar chart: Top-1 by purchase-frequency segment (x = segment 1..4 from `top1_by_segment`),
  one bar per pipeline. Click a segment: show the real-time minus weekly-batch gap and the
  number of customers; link "inspect customers in this segment" which opens Simulation with the
  segment filter applied.
- **Hybrid explorer**: slider "Serve the top X% most frequent buyers in real time" 0..100, select
  "everyone else is on: hourly / daily / weekly batch". Calls `/api/hybrid`. Show Top-1, CLV error,
  and estimated CPU seconds next to "all real-time" and "all batch" reference lines
  (`all_realtime_cpu_seconds`, `all_batch_cpu_seconds`). Sweep button for X = 0,10,...,100 draws
  accuracy-vs-compute curve (x = CPU seconds, y = Top-1) with the slider position marked.

## Behaviour and quality bar
- Every request has loading and error states; if the API is down show "Start the API:
  `uvicorn dashboard.api.main:app --port 8000`".
- Never invent numbers; format GBP as "GBP 2,203" or with the pound sign, percentages with one decimal.
- All charts have axis labels and units. Tooltips on hover.
- No layout shift while loading. No horizontal scroll at 1366 px width.
- Keep the code simple and readable: one file per page under `src/pages`, shared pieces in
  `src/components`, API calls in `src/api.js`, formatters in `src/format.js`.
