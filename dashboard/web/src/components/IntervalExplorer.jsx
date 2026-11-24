import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  formatPct,
  formatGbp,
  formatNumber,
  formatSeconds,
  formatStaleness,
  formatCiVal,
} from '../format';
import { fetchInterval } from '../api';

const SWEEP_INTERVALS = [1, 3, 6, 12, 24, 48, 72, 120, 168, 336];

// Helper to format hours into readable label
function formatIntervalLabel(hours) {
  if (hours < 1) {
    return `every ${Math.round(hours * 60)} minutes`;
  }
  if (hours === 1) return 'every 1 hour (Hourly)';
  if (hours === 24) return 'every 24 hours (Daily)';
  if (hours === 168) return 'every 168 hours (Weekly)';
  if (hours === 336) return 'every 336 hours (Fortnightly)';
  if (hours < 24) return `every ${hours} hours`;
  return `every ${(hours / 24).toFixed(1)} days (${hours} h)`;
}

// Log-scale conversion for smooth slider
// 0.25h to 336h
function hoursToSliderPos(h) {
  const minH = 0.25;
  const maxH = 336;
  return (Math.log(h / minH) / Math.log(maxH / minH)) * 1000;
}

function sliderPosToHours(pos) {
  const minH = 0.25;
  const maxH = 336;
  const raw = minH * Math.pow(maxH / minH, pos / 1000);
  if (raw < 1) return Math.round(raw * 4) / 4;
  if (raw < 12) return Math.round(raw * 2) / 2;
  if (raw < 48) return Math.round(raw);
  if (raw < 120) return Math.round(raw / 6) * 6;
  if (Math.abs(raw - 168) < 15) return 168;
  if (raw < 240) return Math.round(raw / 12) * 12;
  return Math.round(raw / 24) * 24;
}

export default function IntervalExplorer({
  variant,
  hours,
  setHours,
}) {
  const [sliderPos, setSliderPos] = useState(() => hoursToSliderPos(hours || 24));
  const [currentHours, setCurrentHours] = useState(hours || 24);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Sweep state
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepProgress, setSweepProgress] = useState(0);
  const [sweepData, setSweepData] = useState(null);

  const debounceTimerRef = useRef(null);

  // Fetch interval data when currentHours or variant changes (debounced ~400ms)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetchInterval(currentHours, variant);
        setData(res);
        if (setHours) setHours(currentHours);
      } catch (err) {
        console.error('Failed to load interval data:', err);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [currentHours, variant]);

  const handleSliderChange = (e) => {
    const pos = Number(e.target.value);
    setSliderPos(pos);
    const newHours = sliderPosToHours(pos);
    setCurrentHours(newHours);
  };

  const handleSnap = (snapHours) => {
    setCurrentHours(snapHours);
    setSliderPos(hoursToSliderPos(snapHours));
  };

  // Run the sweep across all 10 intervals
  const runSweep = async () => {
    setIsSweeping(true);
    setSweepProgress(0);
    const results = [];

    for (let i = 0; i < SWEEP_INTERVALS.length; i++) {
      const h = SWEEP_INTERVALS[i];
      try {
        const res = await fetchInterval(h, variant);
        results.push({
          hours: h,
          label: h < 24 ? `${h}h` : `${(h / 24).toFixed(0)}d`,
          top1: Number((res.batch.top1 * 100).toFixed(2)),
          top3: Number((res.batch.top3 * 100).toFixed(2)),
          staleness: Number(res.batch.staleness_hours_median.toFixed(1)),
          compute: Number(res.batch.est_cpu_seconds.toFixed(2)),
          rtTop1: Number((res.streaming.top1 * 100).toFixed(2)),
          rtStaleness: Number(res.streaming.staleness_hours_median.toFixed(1)),
          rtCompute: Number(res.streaming.est_cpu_seconds.toFixed(2)),
        });
      } catch (e) {
        console.error(`Sweep failed for ${h}h`, e);
      }
      setSweepProgress(i + 1);
    }

    setSweepData(results);
    setIsSweeping(false);
  };

  const batch = data?.batch || {};
  const streaming = data?.streaming || {};

  // Deltas (Real-Time minus Batch)
  const top1Delta = ((streaming.top1 || 0) - (batch.top1 || 0)) * 100;
  const top3Delta = ((streaming.top3 || 0) - (batch.top3 || 0)) * 100;
  const clvDelta = (streaming.clv_mae || 0) - (batch.clv_mae || 0); // lower is better
  const stalenessDelta = (streaming.staleness_hours_median || 0) - (batch.staleness_hours_median || 0);
  const p95StalenessDelta = (streaming.staleness_hours_p95 || 0) - (batch.staleness_hours_p95 || 0);
  const inferencesDelta = (streaming.inferences || 0) - (batch.inferences || 0);
  const cpuDelta = (streaming.est_cpu_seconds || 0) - (batch.est_cpu_seconds || 0);

  // Formatting Top-1 delta with grey if tiny (|Top-1 delta| < 0.5 pt)
  const isTop1Tiny = Math.abs(top1Delta) < 0.5;
  const top1DeltaClass = isTop1Tiny
    ? 'delta-neutral'
    : top1Delta > 0
    ? 'delta-positive'
    : 'delta-negative';

  return (
    <div className="interval-explorer-panel">
      <div className="panel-header">
        <h3 className="card-title">Interval Explorer</h3>
        <span className="card-subtitle">
          Simulate batch refresh intervals from 15 min to 14 days next to continuous real-time
        </span>
      </div>

      {/* 1. Interval Slider with Log-Scale Feel */}
      <div className="slider-control-card">
        <div className="slider-label-row">
          <span className="slider-field-title">Batch Refresh Interval:</span>
          <span className="slider-value-badge">{formatIntervalLabel(currentHours)}</span>
        </div>

        <input
          type="range"
          min="0"
          max="1000"
          value={sliderPos}
          onChange={handleSliderChange}
          className="interval-range-slider"
          aria-label="Batch refresh interval slider"
        />

        {/* Snap marks */}
        <div className="snap-marks-row">
          <button
            type="button"
            className={`snap-btn ${currentHours === 1 ? 'active' : ''}`}
            onClick={() => handleSnap(1)}
          >
            1 h (Hourly)
          </button>
          <button
            type="button"
            className={`snap-btn ${currentHours === 6 ? 'active' : ''}`}
            onClick={() => handleSnap(6)}
          >
            6 h
          </button>
          <button
            type="button"
            className={`snap-btn ${currentHours === 24 ? 'active' : ''}`}
            onClick={() => handleSnap(24)}
          >
            24 h (Daily)
          </button>
          <button
            type="button"
            className={`snap-btn ${currentHours === 72 ? 'active' : ''}`}
            onClick={() => handleSnap(72)}
          >
            72 h (3d)
          </button>
          <button
            type="button"
            className={`snap-btn ${currentHours === 168 ? 'active' : ''}`}
            onClick={() => handleSnap(168)}
          >
            168 h (Weekly)
          </button>
          <button
            type="button"
            className={`snap-btn ${currentHours === 336 ? 'active' : ''}`}
            onClick={() => handleSnap(336)}
          >
            336 h (2w)
          </button>
        </div>
      </div>

      {/* 2. Side-by-Side Batch vs Real-Time Comparison Table */}
      <div className={`comparison-container ${loading ? 'loading-shimmer' : ''}`}>
        <div className="comparison-table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th className="col-metric">Metric</th>
                <th className="col-batch">Batch ({formatIntervalLabel(currentHours).split(' ')[1] || `${currentHours}h`})</th>
                <th className="col-rt">Real-Time (Continuous)</th>
                <th className="col-delta">Delta (RT − Batch)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="row-title">Top-1 Accuracy</td>
                <td className="val-batch">{formatPct(batch.top1)}</td>
                <td className="val-rt highlight">{formatPct(streaming.top1)}</td>
                <td className={`val-delta ${top1DeltaClass}`}>
                  <span className="delta-pill">
                    {top1Delta >= 0 ? '+' : ''}{top1Delta.toFixed(2)} pt
                    {isTop1Tiny && <span className="delta-subtext"> (neutral: &lt;0.5pt)</span>}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="row-title">Top-3 Accuracy</td>
                <td className="val-batch">{formatPct(batch.top3)}</td>
                <td className="val-rt">{formatPct(streaming.top3)}</td>
                <td className="val-delta">
                  <span className="delta-pill neutral">
                    {top3Delta >= 0 ? '+' : ''}{top3Delta.toFixed(2)} pt
                  </span>
                </td>
              </tr>
              <tr>
                <td className="row-title">CLV Error (MAE)</td>
                <td className="val-batch">{formatGbp(batch.clv_mae)}</td>
                <td className="val-rt">{formatGbp(streaming.clv_mae)}</td>
                <td className="val-delta">
                  <span className="delta-pill neutral">
                    {clvDelta >= 0 ? '+' : '-'}£{Math.abs(clvDelta).toFixed(2)}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="row-title">Median Staleness</td>
                <td className="val-batch">{formatStaleness(batch.staleness_hours_median)}</td>
                <td className="val-rt">{formatStaleness(streaming.staleness_hours_median)}</td>
                <td className="val-delta">
                  <span className="delta-pill">
                    {stalenessDelta <= 0 ? '-' : '+'}{Math.abs(stalenessDelta).toFixed(1)} h
                  </span>
                </td>
              </tr>
              <tr>
                <td className="row-title">95th % Staleness</td>
                <td className="val-batch">{formatStaleness(batch.staleness_hours_p95)}</td>
                <td className="val-rt">{formatStaleness(streaming.staleness_hours_p95)}</td>
                <td className="val-delta">
                  <span className="delta-pill">
                    {p95StalenessDelta <= 0 ? '-' : '+'}{Math.abs(p95StalenessDelta).toFixed(1)} h
                  </span>
                </td>
              </tr>
              <tr>
                <td className="row-title">Total Inferences</td>
                <td className="val-batch">{formatNumber(batch.inferences)}</td>
                <td className="val-rt">{formatNumber(streaming.inferences)}</td>
                <td className="val-delta">
                  <span className="delta-pill">
                    {inferencesDelta >= 0 ? '+' : ''}{formatNumber(inferencesDelta)}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="row-title">Est. CPU Seconds</td>
                <td className="val-batch">{formatSeconds(batch.est_cpu_seconds)}</td>
                <td className="val-rt">{formatSeconds(streaming.est_cpu_seconds)}</td>
                <td className="val-delta">
                  <span className="delta-pill multiplier">
                    {(
                      (streaming.est_cpu_seconds || 0) /
                      Math.max(batch.est_cpu_seconds || 0.001, 0.001)
                    ).toFixed(1)}× compute
                  </span>
                </td>
              </tr>
              {/* Second muted row: incl. Kafka + Redis (streaming only) */}
              <tr className="row-muted">
                <td className="row-title muted">incl. Kafka + Redis (streaming only)</td>
                <td className="val-batch muted">—</td>
                <td className="val-rt muted">{formatSeconds(streaming.est_cpu_seconds_full)}</td>
                <td className="val-delta">
                  {streaming.est_cpu_seconds_full != null && batch.est_cpu_seconds != null ? (
                    <span className="delta-pill multiplier muted">
                      {(
                        streaming.est_cpu_seconds_full /
                        Math.max(batch.est_cpu_seconds, 0.001)
                      ).toFixed(1)}× compute
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="comparison-table-caption">
          95% confidence intervals are on the Overview page.
        </p>
      </div>

      {/* 3. Sweep Button & Charts */}
      <div className="sweep-section">
        <div className="sweep-header-row">
          <div className="sweep-title-group">
            <h4 className="side-section-heading">Sweep Across Intervals</h4>
            <span className="side-section-desc">
              Evaluate [1, 3, 6, 12, 24, 48, 72, 120, 168, 336] hours sequentially
            </span>
          </div>

          <button
            type="button"
            className="btn-sweep"
            onClick={runSweep}
            disabled={isSweeping}
          >
            {isSweeping
              ? `Sweeping (${sweepProgress}/${SWEEP_INTERVALS.length})...`
              : '⚡ Run Interval Sweep'}
          </button>
        </div>

        {isSweeping && (
          <div className="sweep-progress-container">
            <div className="sweep-progress-bar">
              <div
                className="sweep-progress-fill"
                style={{
                  width: `${(sweepProgress / SWEEP_INTERVALS.length) * 100}%`,
                }}
              />
            </div>
            <span className="sweep-progress-text">
              Evaluating {SWEEP_INTERVALS[sweepProgress - 1] || SWEEP_INTERVALS[0]}h interval ({sweepProgress}/{SWEEP_INTERVALS.length})...
            </span>
          </div>
        )}

        {sweepData && (
          <div className="sweep-charts-grid">
            {/* Chart 1: Top-1 vs Interval */}
            <div className="sweep-chart-box">
              <div className="sweep-chart-header">
                <span className="sweep-chart-title">Top-1 Accuracy (%)</span>
                <span className="sweep-chart-legend">
                  <span className="legend-batch">— Batch</span>
                  <span className="legend-rt">--- Real-Time</span>
                </span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={sweepData} margin={{ top: 10, right: 15, left: 25, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(122, 78, 36, 0.1)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis width={40} domain={[35, 42]} unit="%" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val, name) => [`${val}%`, name === 'top1' ? 'Batch Top-1' : 'RT Top-1']}
                    contentStyle={{ backgroundColor: '#FBF6EC', borderColor: '#E3B95B', fontSize: 12 }}
                  />
                  <ReferenceLine
                    y={sweepData[0]?.rtTop1}
                    stroke="#7A4E24"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="top1"
                    stroke="#C89437"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#C89437' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Staleness vs Interval */}
            <div className="sweep-chart-box">
              <div className="sweep-chart-header">
                <span className="sweep-chart-title">Median Staleness (hours)</span>
                <span className="sweep-chart-legend">
                  <span className="legend-batch">— Batch</span>
                  <span className="legend-rt">--- Real-Time (0h)</span>
                </span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={sweepData} margin={{ top: 10, right: 15, left: 25, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(122, 78, 36, 0.1)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis width={40} unit="h" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val, name) => [`${val} h`, name === 'staleness' ? 'Batch Staleness' : 'RT Staleness']}
                    contentStyle={{ backgroundColor: '#FBF6EC', borderColor: '#E3B95B', fontSize: 12 }}
                  />
                  <ReferenceLine y={0} stroke="#7A4E24" strokeDasharray="4 4" strokeWidth={1.5} />
                  <Line
                    type="monotone"
                    dataKey="staleness"
                    stroke="#C89437"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#C89437' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 3: Compute vs Interval */}
            <div className="sweep-chart-box">
              <div className="sweep-chart-header">
                <span className="sweep-chart-title">Compute (CPU seconds)</span>
                <span className="sweep-chart-legend">
                  <span className="legend-batch">— Batch</span>
                  <span className="legend-rt">--- Real-Time</span>
                </span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={sweepData} margin={{ top: 10, right: 15, left: 25, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(122, 78, 36, 0.1)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis width={40} unit="s" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val, name) => [`${val} s`, name === 'compute' ? 'Batch CPU' : 'RT CPU']}
                    contentStyle={{ backgroundColor: '#FBF6EC', borderColor: '#E3B95B', fontSize: 12 }}
                  />
                  <ReferenceLine
                    y={sweepData[0]?.rtCompute}
                    stroke="#7A4E24"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="compute"
                    stroke="#C89437"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#C89437' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
