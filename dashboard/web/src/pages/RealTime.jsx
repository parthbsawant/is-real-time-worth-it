import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Play, Pause, RotateCcw, Check, X, Minus, Info } from 'lucide-react';
import { useVariant } from '../context/VariantContext';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import ApiError from '../components/ApiError';
import Tooltip from '../components/Tooltip';
import { formatGbp, formatPct, formatStaleness, formatSeconds } from '../lib/format';
import '../styles/realtime.css';

function binaryInsert(arr, val) {
  let low = 0;
  let high = arr.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (arr[mid] < val) low = mid + 1;
    else high = mid;
  }
  arr.splice(low, 0, val);
}

function getMedian(sortedArr) {
  const len = sortedArr.length;
  if (len === 0) return 0;
  const mid = len >>> 1;
  return len % 2 === 1 ? sortedArr[mid] : (sortedArr[mid - 1] + sortedArr[mid]) / 2;
}

export default function RealTime() {
  const { variant } = useVariant();
  const { data: overview, loading: overviewLoading, error: overviewError, refetch: refetchOverview } = useApi(
    `/api/overview?variant=${variant}`
  );
  const { data: meta, error: metaError, refetch: refetchMeta } = useApi('/api/meta');
  const { data: replayData, loading: replayLoading, error: replayError, refetch: refetchReplay } = useApi(
    '/api/replay'
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(100); // 5, 25, 100, 500

  // Mutable simulator reference
  const simRef = useRef({
    index: 0,
    storedPredictions: new Map(), // customer_id -> predicted_next
    ticks: 0,
    evals: 0,
    sortedProcMs: [],
    sortedE2eMs: [],
    recentEvents: [],
    lastRafTime: null,
    subEventAccumulator: 0,
  });

  // State updated in batches once per animation frame
  const [simState, setSimState] = useState({
    index: 0,
    evals: 0,
    ticks: 0,
    top1: null,
    medianProcMs: 0,
    medianE2eMs: 0,
    recentEvents: [],
    currentTime: '',
  });

  const error = overviewError || metaError || replayError;
  const handleRetryAll = () => {
    if (overviewError) refetchOverview();
    if (metaError) refetchMeta();
    if (replayError) refetchReplay();
  };

  // Replay animation loop
  useEffect(() => {
    if (!isPlaying) {
      simRef.current.lastRafTime = null;
      return;
    }

    const events = replayData?.events;
    if (!events || !events.length) return;

    // Auto-restart if already at completion
    if (simRef.current.index >= events.length) {
      simRef.current.index = 0;
      simRef.current.storedPredictions.clear();
      simRef.current.ticks = 0;
      simRef.current.evals = 0;
      simRef.current.sortedProcMs = [];
      simRef.current.sortedE2eMs = [];
      simRef.current.recentEvents = [];
      simRef.current.subEventAccumulator = 0;
      simRef.current.lastRafTime = null;
    }

    let rafId;

    const step = (timestamp) => {
      if (simRef.current.lastRafTime == null) {
        simRef.current.lastRafTime = timestamp;
        rafId = requestAnimationFrame(step);
        return;
      }

      // Delta time capped to 100ms to prevent huge jumps if tab was backgrounded
      const dt = Math.min((timestamp - simRef.current.lastRafTime) / 1000, 0.1);
      simRef.current.lastRafTime = timestamp;

      simRef.current.subEventAccumulator += dt * speed;
      const count = Math.floor(simRef.current.subEventAccumulator);

      if (count > 0) {
        simRef.current.subEventAccumulator -= count;
        const startIdx = simRef.current.index;
        const endIdx = Math.min(startIdx + count, events.length);

        for (let i = startIdx; i < endIdx; i++) {
          const ev = events[i];
          const cid = ev.customer_id;
          let evalStatus = 'first'; // 'correct' | 'wrong' | 'first'

          // Check if customer already has a stored prediction from prior purchase
          if (simRef.current.storedPredictions.has(cid)) {
            const prevPred = simRef.current.storedPredictions.get(cid);
            simRef.current.evals += 1;
            if (prevPred === ev.bought) {
              simRef.current.ticks += 1;
              evalStatus = 'correct';
            } else {
              evalStatus = 'wrong';
            }
          }

          // Store current prediction for customer's next purchase
          simRef.current.storedPredictions.set(cid, ev.predicted_next);

          // Incremental median maintaining
          binaryInsert(simRef.current.sortedProcMs, ev.processing_ms);
          binaryInsert(simRef.current.sortedE2eMs, ev.end_to_end_ms);

          // Append to recent feed (keep 10 newest items)
          simRef.current.recentEvents.unshift({
            ...ev,
            evalStatus,
          });
          if (simRef.current.recentEvents.length > 10) {
            simRef.current.recentEvents.pop();
          }
        }

        simRef.current.index = endIdx;

        // Batch update React state once per frame
        setSimState({
          index: endIdx,
          evals: simRef.current.evals,
          ticks: simRef.current.ticks,
          top1: simRef.current.evals > 0 ? simRef.current.ticks / simRef.current.evals : null,
          medianProcMs: getMedian(simRef.current.sortedProcMs),
          medianE2eMs: getMedian(simRef.current.sortedE2eMs),
          recentEvents: [...simRef.current.recentEvents],
          currentTime: endIdx > 0 ? events[endIdx - 1].time : '',
        });

        if (endIdx >= events.length) {
          setIsPlaying(false);
          return;
        }
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, speed, replayData]);

  const handleTogglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleRestart = () => {
    setIsPlaying(false);
    simRef.current.index = 0;
    simRef.current.storedPredictions.clear();
    simRef.current.ticks = 0;
    simRef.current.evals = 0;
    simRef.current.sortedProcMs = [];
    simRef.current.sortedE2eMs = [];
    simRef.current.recentEvents = [];
    simRef.current.subEventAccumulator = 0;
    simRef.current.lastRafTime = null;

    setSimState({
      index: 0,
      evals: 0,
      ticks: 0,
      top1: null,
      medianProcMs: 0,
      medianE2eMs: 0,
      recentEvents: [],
      currentTime: '',
    });
  };

  if (error) {
    return <ApiError error={error} onRetry={handleRetryAll} />;
  }

  if (overviewLoading && !overview) {
    return (
      <div className="realtime-page">
        <PageHeader
          title="Real-Time Processing"
          subtitle="Every purchase updates the customer's prediction immediately."
        />
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>Loading real-time architecture data...</p>
        </div>
      </div>
    );
  }

  const pipelines = overview?.pipelines || {};
  const streaming = pipelines.streaming || {};
  const daily = pipelines.batch_daily || {};
  const kafkaCheck = overview?.kafka_check || {};
  const unitCosts = meta?.unit_costs_seconds || {};
  const totalEvents = replayData?.count || 4188;

  // Measured numbers for pipeline strip
  const procMedian = kafkaCheck.processing_ms_median != null ? kafkaCheck.processing_ms_median.toFixed(1) : '6.3';
  const e2eMedian = kafkaCheck.end_to_end_ms_median != null ? kafkaCheck.end_to_end_ms_median.toFixed(1) : '13.3';
  const scoreDiffFormatted = kafkaCheck.max_abs_score_diff_vs_offline != null
    ? kafkaCheck.max_abs_score_diff_vs_offline.toExponential(1)
    : '1.6e-6';

  // Cost overhead line
  const streamFullCostMs = unitCosts.stream_s_per_event_full != null
    ? (unitCosts.stream_s_per_event_full * 1000).toFixed(1)
    : (kafkaCheck.consumer?.cpu_seconds ? (kafkaCheck.consumer.cpu_seconds / 4188 * 1000).toFixed(1) : '7.2');

  const progressPct = totalEvents > 0 ? Math.min(100, (simState.index / totalEvents) * 100) : 0;

  return (
    <div className="realtime-page">
      <PageHeader
        title="Real-Time Processing"
        subtitle="Every purchase updates the customer's prediction immediately."
      />

      {/* Section 1: Pipeline Strip */}
      <section className="rt-pipeline-card" aria-label="Streaming pipeline architecture">
        <div className="rt-strip-boxes">
          <div className="rt-strip-box">
            <span className="rt-box-tag">Input</span>
            <h4 className="rt-box-title">Purchase</h4>
            <span className="rt-box-desc">Event created</span>
          </div>
          <div className="rt-strip-arrow" aria-hidden="true">
            <ArrowRight size={20} />
          </div>

          <div className="rt-strip-box">
            <span className="rt-box-tag">Broker</span>
            <h4 className="rt-box-title">Kafka</h4>
            <span className="rt-box-desc">Ordered per customer</span>
          </div>
          <div className="rt-strip-arrow" aria-hidden="true">
            <ArrowRight size={20} />
          </div>

          <div className="rt-strip-box">
            <span className="rt-box-tag">Worker</span>
            <h4 className="rt-box-title">Consumer</h4>
            <span className="rt-box-desc">Event dequeued</span>
          </div>
          <div className="rt-strip-arrow" aria-hidden="true">
            <ArrowRight size={20} />
          </div>

          <div className="rt-strip-box">
            <span className="rt-box-tag">Inference</span>
            <h4 className="rt-box-title">Model</h4>
            <span className="rt-box-desc">Predicts category & CLV</span>
          </div>
          <div className="rt-strip-arrow" aria-hidden="true">
            <ArrowRight size={20} />
          </div>

          <div className="rt-strip-box">
            <span className="rt-box-tag">Storage</span>
            <h4 className="rt-box-title">Redis</h4>
            <span className="rt-box-desc">Last 20 purchases + prediction</span>
          </div>
        </div>

        <div className="rt-strip-meta">
          median processing {procMedian} ms · median end-to-end {e2eMedian} ms · 0 differences vs offline predictions (max score difference {scoreDiffFormatted})
        </div>
      </section>

      {/* Section 2: 4 Offline KPI Tiles */}
      <section className="rt-kpi-card" aria-label="Offline streaming test-set evaluation">
        <div className="rt-kpi-header">
          <h3 className="rt-kpi-title">Offline Test-Set Evaluation</h3>
          <span className="rt-kpi-eval-tag">Evaluated on {meta?.dataset?.examples?.test || 2828} test examples</span>
        </div>

        <div className="rt-kpi-grid">
          <div className="rt-kpi-tile">
            <span className="rt-kpi-tile-label">
              <Tooltip term="Top-1 accuracy">Top-1 accuracy</Tooltip>
            </span>
            <strong className="rt-kpi-tile-val">{formatPct(streaming.top1)}</strong>
            <span className="rt-kpi-tile-caption">offline test set</span>
          </div>

          <div className="rt-kpi-tile">
            <span className="rt-kpi-tile-label">
              <Tooltip term="CLV error (MAE)">CLV error (MAE)</Tooltip>
            </span>
            <strong className="rt-kpi-tile-val">{formatGbp(streaming.clv_mae)}</strong>
            <span className="rt-kpi-tile-caption">90-day spend error</span>
          </div>

          <div className="rt-kpi-tile">
            <span className="rt-kpi-tile-label">
              <Tooltip term="Staleness">Median staleness</Tooltip>
            </span>
            <strong className="rt-kpi-tile-val">{formatStaleness(0, kafkaCheck)}</strong>
            <span className="rt-kpi-tile-caption">end-to-end delay</span>
          </div>

          <div className="rt-kpi-tile">
            <span className="rt-kpi-tile-label">
              <Tooltip term="Model compute">Model compute</Tooltip>
            </span>
            <strong className="rt-kpi-tile-val">
              {streaming.seconds != null ? `${streaming.seconds.toFixed(2)} s` : '—'}
            </strong>
            <span className="rt-kpi-tile-caption">
              {streaming.compute_vs_hourly != null ? `${streaming.compute_vs_hourly.toFixed(1)}x hourly` : '25x hourly'}
            </span>
          </div>
        </div>

        <p className="rt-kpi-muted-note">
          Including Kafka + Redis overhead the measured cost is about {streamFullCostMs} ms per event.
        </p>
      </section>

      {/* Section 3: Live Replay Panel */}
      <section className="rt-replay-card" aria-label="Live stream replay demo">
        <div className="rt-replay-header">
          <div className="rt-replay-title-group">
            <h3 className="rt-replay-title">Live Stream Replay</h3>
            <p className="rt-replay-subtitle">
              Interactive replay of all {totalEvents.toLocaleString()} production events with immediate accuracy evaluation
            </p>
          </div>
          <span className="rt-model-badge">
            <Info size={14} />
            Replay uses the Primary model
          </span>
        </div>

        {/* Controls */}
        <div className="rt-controls-panel">
          <div className="rt-controls-row">
            <div className="rt-playback-btns">
              <button
                type="button"
                className="btn-ctrl btn-primary-ctrl"
                onClick={handleTogglePlay}
                aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                <span>{isPlaying ? 'Pause' : simState.index >= totalEvents ? 'Play Again' : 'Play'}</span>
              </button>

              <button
                type="button"
                className="btn-ctrl btn-secondary-ctrl"
                onClick={handleRestart}
                aria-label="Restart replay"
              >
                <RotateCcw size={16} />
                <span>Restart</span>
              </button>
            </div>

            <div className="rt-speed-selector">
              <span className="rt-speed-label">Speed:</span>
              <div className="rt-speed-segmented" role="group" aria-label="Replay speed">
                {[5, 25, 100, 500].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`rt-speed-btn ${speed === s ? 'active' : ''}`}
                    onClick={() => setSpeed(s)}
                  >
                    {s} /s
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Progress bar with simulated date/time */}
          <div className="rt-progress-wrapper">
            <div className="rt-progress-track">
              <div
                className="rt-progress-bar"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="rt-progress-labels">
              <span>{progressPct.toFixed(1)}% complete</span>
              <span className="rt-progress-date">
                {simState.currentTime ? `Simulated time: ${simState.currentTime}` : 'Dataset test window'}
              </span>
            </div>
          </div>
        </div>

        {/* Four Live Counters */}
        <div className="rt-counters-grid">
          <div className="rt-counter-tile">
            <span className="rt-counter-label">Events Processed</span>
            <strong className="rt-counter-val">
              {simState.index.toLocaleString()} / {totalEvents.toLocaleString()}
            </strong>
          </div>

          <div className="rt-counter-tile">
            <span className="rt-counter-label">
              <Tooltip term="Top-1 accuracy">Live Top-1</Tooltip>
            </span>
            <strong className="rt-counter-val highlight">
              {simState.top1 != null ? `${(simState.top1 * 100).toFixed(1)}%` : '—'}
            </strong>
          </div>

          <div className="rt-counter-tile">
            <span className="rt-counter-label">Median Processing</span>
            <strong className="rt-counter-val">
              {simState.medianProcMs > 0 ? `${simState.medianProcMs.toFixed(1)} ms` : '—'}
            </strong>
          </div>

          <div className="rt-counter-tile">
            <span className="rt-counter-label">Median End-to-End</span>
            <strong className="rt-counter-val">
              {simState.medianE2eMs > 0 ? `${simState.medianE2eMs.toFixed(1)} ms` : '—'}
            </strong>
          </div>
        </div>

        {/* Live Feed Table */}
        <div className="rt-feed-wrapper">
          <h4 className="rt-feed-title">Live Feed (Last 10 Events)</h4>
          <div className="rt-table-container">
            <table className="rt-table">
              <thead>
                <tr>
                  <th>Prior Guess</th>
                  <th>Time</th>
                  <th>Customer</th>
                  <th>Bought</th>
                  <th>£</th>
                  <th>Predicted Next</th>
                  <th>Confidence</th>
                  <th>ms</th>
                </tr>
              </thead>
              <tbody>
                {simState.recentEvents.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0' }}>
                      Click <strong>Play</strong> to start streaming production events
                    </td>
                  </tr>
                ) : (
                  simState.recentEvents.map((ev) => (
                    <tr key={ev.event_id}>
                      <td>
                        {ev.evalStatus === 'correct' && (
                          <span className="status-badge status-badge-correct">
                            <Check size={14} /> Correct
                          </span>
                        )}
                        {ev.evalStatus === 'wrong' && (
                          <span className="status-badge status-badge-wrong">
                            <X size={14} /> Wrong
                          </span>
                        )}
                        {ev.evalStatus === 'first' && (
                          <span className="status-badge status-badge-first">
                            <Minus size={12} /> First
                          </span>
                        )}
                      </td>
                      <td>{ev.time}</td>
                      <td>#{ev.customer_id}</td>
                      <td className="rt-category-name">{ev.bought.replace(/_/g, ' ')}</td>
                      <td>{formatGbp(ev.amount, 2)}</td>
                      <td className="rt-category-name">{ev.predicted_next.replace(/_/g, ' ')}</td>
                      <td className="rt-conf-pill">{formatPct(ev.confidence)}</td>
                      <td>{ev.end_to_end_ms.toFixed(1)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footnote */}
        <p className="rt-footnote">
          Live Top-1 is measured on replayed events that have a later purchase ({kafkaCheck.events_with_a_later_purchase || 2649}); the final value should be about {formatPct(kafkaCheck.live_top1 || 0.332)}. The Top-1 above comes from the {meta?.dataset?.examples?.test || 2828} test examples, a different set, so the two numbers differ.
        </p>
      </section>

      {/* Section 4: Data-Driven Line */}
      <section className="rt-conclusion-callout" aria-label="Real-time vs batch takeaway">
        <p className="rt-conclusion-text">
          Real-time keeps predictions about {Math.round(kafkaCheck.end_to_end_ms_median || 13)} ms old, versus {formatStaleness(daily.staleness_hours_median)} for daily batch.
        </p>
      </section>
    </div>
  );
}
