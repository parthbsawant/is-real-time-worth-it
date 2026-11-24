import { useState, useEffect, useRef, useTransition } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { Play, Loader2 } from 'lucide-react';
import { fetchInterval } from '../../api';
import KpiTile from '../../components/KpiTile';
import Accordion from '../../components/Accordion';
import { formatPct, formatGbp, formatNumber, formatStaleness, formatCiVal, formatCurrencySigned } from '../../lib/format';
import { THEME } from '../../lib/constants';

const MIN_HOURS = 0.25;
const MAX_HOURS = 336;
const SWEEP_INTERVALS = [1, 3, 6, 12, 24, 48, 72, 120, 168, 336];

function hoursToPos(h) {
  return (Math.log(h / MIN_HOURS) / Math.log(MAX_HOURS / MIN_HOURS)) * 1000;
}

function posToHours(pos) {
  const raw = MIN_HOURS * Math.pow(MAX_HOURS / MIN_HOURS, pos / 1000);
  if (raw < 1) return Math.round(raw * 4) / 4;
  if (raw < 12) return Math.round(raw * 2) / 2;
  if (raw < 48) return Math.round(raw);
  if (raw < 120) return Math.round(raw / 6) * 6;
  if (Math.abs(raw - 168) < 15) return 168;
  if (raw < 240) return Math.round(raw / 12) * 12;
  return Math.round(raw / 24) * 24;
}

function formatHoursHuman(h) {
  if (h < 1) {
    const mins = Math.round(h * 60);
    return `${mins} minutes`;
  }
  if (h === 1) return '1 hour';
  if (h === 24) return '24 hours (Daily)';
  if (h === 72) return '3 days (72 h)';
  if (h === 168) return '7 days (Weekly)';
  if (h === 336) return '14 days (Fortnightly)';
  if (h < 24) return `${h} hours`;
  return `${(h / 24).toFixed(1)} days (${h} h)`;
}

export default function IntervalTab({ variant = 'base' }) {
  const [hours, setHours] = useState(24);
  const [sliderPos, setSliderPos] = useState(() => hoursToPos(24));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Sweep state
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepProgress, setSweepProgress] = useState(0);
  const [sweepResults, setSweepResults] = useState(null);
  const [metricKey, setMetricKey] = useState('top1'); // 'top1' | 'staleness' | 'cpu'

  const debounceRef = useRef(null);

  // Fetch interval data debounced by 400ms
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetchInterval(hours, variant);
        setData(res);
      } catch (err) {
        console.error('Failed to fetch interval:', err);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [hours, variant]);

  const handleSliderChange = (e) => {
    const pos = Number(e.target.value);
    setSliderPos(pos);
    const newHours = posToHours(pos);
    startTransition(() => {
      setHours(newHours);
    });
  };

  const handleSnapClick = (snapH) => {
    setHours(snapH);
    setSliderPos(hoursToPos(snapH));
  };

  const runSweep = async () => {
    setIsSweeping(true);
    setSweepProgress(0);
    const accumulated = [];

    for (let i = 0; i < SWEEP_INTERVALS.length; i++) {
      const h = SWEEP_INTERVALS[i];
      try {
        const res = await fetchInterval(h, variant);
        accumulated.push({
          hours: h,
          hoursLabel: `${h}h`,
          batchTop1: Number((res.batch.top1 * 100).toFixed(2)),
          rtTop1: Number((res.streaming.top1 * 100).toFixed(2)),
          batchStaleness: Number(res.batch.staleness_hours_median.toFixed(2)),
          rtStaleness: 0.01, // 13ms in hours
          batchCpu: Number(res.batch.est_cpu_seconds.toFixed(2)),
          rtCpu: Number(res.streaming.est_cpu_seconds.toFixed(2)),
        });
      } catch (err) {
        console.error('Error sweeping interval', h, err);
      }
      setSweepProgress(Math.round(((i + 1) / SWEEP_INTERVALS.length) * 100));
    }

    setSweepResults(accumulated);
    setIsSweeping(false);
  };

  const batch = data?.batch || {};
  const rt = data?.streaming || {};

  // Differences
  const top1Diff = (rt.top1 != null && batch.top1 != null) ? (rt.top1 - batch.top1) * 100 : 0;
  const isTop1WithinNoise = Math.abs(top1Diff) < 0.5;

  const clvDiff = (batch.clv_mae != null && rt.clv_mae != null) ? (batch.clv_mae - rt.clv_mae) : 0;
  const computeMult = (rt.est_cpu_seconds && batch.est_cpu_seconds)
    ? (rt.est_cpu_seconds / batch.est_cpu_seconds).toFixed(1)
    : '25.0';

  return (
    <div className="sim-tab-content">
      {/* 1. Big Slider Card */}
      <section className="interval-control-card" aria-label="Refresh interval control">
        <div className="interval-header-row">
          <h3 className="interval-big-label">Batch refreshes every {formatHoursHuman(hours)}</h3>
          {loading && (
            <span className="interval-status-badge">
              <Loader2 size={16} className="animate-spin" />
              Running the model...
            </span>
          )}
        </div>

        <div className="interval-slider-container">
          <div className="interval-slider-track">
            <input
              type="range"
              min="0"
              max="1000"
              value={sliderPos}
              onChange={handleSliderChange}
              className="interval-slider-input"
              aria-label="Batch refresh interval log slider"
            />
          </div>

          {/* Snap Buttons */}
          <div className="interval-snap-buttons" role="group" aria-label="Snap interval buttons">
            {[
              { h: 1, label: '1 h' },
              { h: 6, label: '6 h' },
              { h: 24, label: '24 h' },
              { h: 72, label: '3 days' },
              { h: 168, label: '7 days' },
              { h: 336, label: '14 days' },
            ].map(({ h: snapH, label }) => (
              <button
                key={snapH}
                type="button"
                className={`btn-snap ${hours === snapH ? 'active' : ''}`}
                onClick={() => handleSnapClick(snapH)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Two Big Result Cards Side by Side */}
      <section
        className="sim-results-grid"
        style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s ease' }}
        aria-label="Simulation comparison results"
      >
        {/* Card 1: Batch */}
        <div className="sim-result-card" style={{ borderTop: `4px solid ${THEME.daily}` }}>
          <div className="sim-result-header">
            <h4 className="sim-result-title">Batch (every {formatHoursHuman(hours)})</h4>
            <span className="sim-result-badge">Scheduled Refresh</span>
          </div>

          <div className="pipeline-kpi-rows">
            <KpiTile
              tooltipTerm="Top-1 accuracy"
              label="Top-1 accuracy"
              value={formatPct(batch.top1)}
            />
            <KpiTile
              tooltipTerm="CLV error (MAE)"
              label="CLV error (MAE)"
              value={formatGbp(batch.clv_mae)}
            />
            <KpiTile
              tooltipTerm="Staleness"
              label="Median staleness"
              value={formatStaleness(batch.staleness_hours_median)}
            />
            <KpiTile
              tooltipTerm="Model compute"
              label="Model compute"
              value={batch.est_cpu_seconds != null ? `${batch.est_cpu_seconds.toFixed(2)} s` : '—'}
              caption="Estimated from the measured cost per model run. The Batch and Real-Time pages show the measured totals."
            />
          </div>

          <Accordion title="More detail">
            <KpiTile
              compact
              tooltipTerm="Top-3 accuracy"
              label="Top-3 accuracy"
              value={formatPct(batch.top3)}
            />
            <KpiTile
              compact
              label="95th % staleness"
              value={formatStaleness(batch.staleness_hours_p95)}
            />
            <KpiTile
              compact
              label="Inferences"
              value={formatNumber(batch.inferences)}
            />
            {batch.est_cpu_seconds_full != null && (
              <KpiTile
                compact
                label="incl. Kafka + Redis"
                value={`${batch.est_cpu_seconds_full.toFixed(2)} s`}
              />
            )}
          </Accordion>
        </div>

        {/* Card 2: Real-time */}
        <div className="sim-result-card" style={{ borderTop: `4px solid ${THEME.realtime}` }}>
          <div className="sim-result-header">
            <h4 className="sim-result-title">Real-Time</h4>
            <span className="sim-result-badge">Continuous Serving</span>
          </div>

          <div className="pipeline-kpi-rows">
            <KpiTile
              tooltipTerm="Top-1 accuracy"
              label="Top-1 accuracy"
              value={formatPct(rt.top1)}
            />
            <KpiTile
              tooltipTerm="CLV error (MAE)"
              label="CLV error (MAE)"
              value={formatGbp(rt.clv_mae)}
            />
            <KpiTile
              tooltipTerm="Staleness"
              label="Median staleness"
              value={formatStaleness(0)}
            />
            <KpiTile
              tooltipTerm="Model compute"
              label="Model compute"
              value={rt.est_cpu_seconds != null ? `${rt.est_cpu_seconds.toFixed(2)} s` : '—'}
              caption="Estimated from the measured cost per model run. The Batch and Real-Time pages show the measured totals."
            />
          </div>

          <Accordion title="More detail">
            <KpiTile
              compact
              tooltipTerm="Top-3 accuracy"
              label="Top-3 accuracy"
              value={formatPct(rt.top3)}
            />
            <KpiTile
              compact
              label="95th % staleness"
              value={formatStaleness(0)}
            />
            <KpiTile
              compact
              label="Inferences"
              value={formatNumber(rt.inferences)}
            />
            {rt.est_cpu_seconds_full != null && (
              <KpiTile
                compact
                label="incl. Kafka + Redis"
                value={`${rt.est_cpu_seconds_full.toFixed(2)} s`}
              />
            )}
          </Accordion>
        </div>
      </section>

      {/* 3. Difference Strip */}
      <section className="sim-diff-strip-card" aria-label="Performance differences">
        <div className="sim-diff-chips-row">
          <div className={`sim-diff-chip ${isTop1WithinNoise ? 'diff-chip-neutral' : 'diff-chip-highlight'}`}>
            <span>Top-1 {formatCiVal(top1Diff, 2, true)} pt</span>
            {isTop1WithinNoise && <span className="diff-chip-tag">(within noise)</span>}
          </div>

          <div className="sim-diff-chip diff-chip-highlight">
            <span>CLV error {formatCurrencySigned(clvDiff, 2)}</span>
          </div>

          <div className="sim-diff-chip diff-chip-highlight">
            <span>Compute {computeMult}x</span>
          </div>
        </div>

        <p className="sim-diff-caption">See the Evidence page for 95% intervals.</p>
      </section>

      {/* 4. Sweep Section */}
      <section className="sim-sweep-card" aria-label="Interval sweep exploration">
        <div className="sim-sweep-header">
          <div className="sim-sweep-title-group">
            <h3 className="sim-sweep-title">Interval Sweep (1 h to 14 days)</h3>
            <p className="sim-sweep-subtitle">
              Evaluate accuracy and compute across 10 batch cadences side-by-side with continuous serving
            </p>
          </div>

          <div className="sim-sweep-controls">
            {sweepResults && (
              <div className="metric-segmented-control" role="group" aria-label="Sweep chart metric selector">
                <button
                  type="button"
                  className={`metric-segmented-btn ${metricKey === 'top1' ? 'active' : ''}`}
                  onClick={() => setMetricKey('top1')}
                >
                  Top-1 Accuracy
                </button>
                <button
                  type="button"
                  className={`metric-segmented-btn ${metricKey === 'staleness' ? 'active' : ''}`}
                  onClick={() => setMetricKey('staleness')}
                >
                  Median Staleness
                </button>
                <button
                  type="button"
                  className={`metric-segmented-btn ${metricKey === 'cpu' ? 'active' : ''}`}
                  onClick={() => setMetricKey('cpu')}
                >
                  CPU Seconds
                </button>
              </div>
            )}

            <button
              type="button"
              className="btn-ctrl btn-primary-ctrl"
              onClick={runSweep}
              disabled={isSweeping}
            >
              {isSweeping ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              <span>{isSweeping ? `Sweeping (${sweepProgress}%)` : sweepResults ? 'Re-run Sweep' : 'Run Sweep'}</span>
            </button>
          </div>
        </div>

        {isSweeping && (
          <div className="sweep-progress-container">
            <span>Evaluating cadence {Math.ceil((sweepProgress / 100) * SWEEP_INTERVALS.length)} of 10...</span>
            <div className="sweep-progress-bar-track">
              <div
                className="sweep-progress-bar-fill"
                style={{ width: `${sweepProgress}%` }}
              />
            </div>
            <span>{sweepProgress}%</span>
          </div>
        )}

        {sweepResults && (
          <div>
            <div className="sweep-chart-wrapper">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={sweepResults}
                  margin={{ top: 20, right: 30, left: 60, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E5EA" vertical={false} />
                  <XAxis
                    dataKey="hoursLabel"
                    tick={{ fill: '#111827', fontSize: 14, fontWeight: 600 }}
                  />
                  <YAxis
                    domain={metricKey === 'top1' ? [0, 50] : [0, 'auto']}
                    tick={{ fill: '#6B7280', fontSize: 13 }}
                    unit={metricKey === 'top1' ? '%' : metricKey === 'staleness' ? ' h' : ' s'}
                    label={{
                      value: metricKey === 'top1' ? 'Top-1 Accuracy (%)' : metricKey === 'staleness' ? 'Staleness (hours)' : 'CPU Seconds (s)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 10,
                      fill: '#0F172A',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E5EA',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
                      fontSize: '14px',
                      color: '#111827',
                    }}
                    formatter={(val, name) => [
                      metricKey === 'top1' ? `${val}%` : metricKey === 'staleness' ? `${val} h` : `${val} s`,
                      name,
                    ]}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '12px', fontSize: '14px', fontWeight: 600, color: '#111827' }}
                  />
                  <Line
                    type="monotone"
                    dataKey={metricKey === 'top1' ? 'batchTop1' : metricKey === 'staleness' ? 'batchStaleness' : 'batchCpu'}
                    name="Batch"
                    stroke={THEME.primary}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: THEME.primary }}
                  />
                  <Line
                    type="monotone"
                    dataKey={metricKey === 'top1' ? 'rtTop1' : metricKey === 'staleness' ? 'rtStaleness' : 'rtCpu'}
                    name="Real-Time"
                    stroke={THEME.realtime}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {metricKey === 'top1' && (
              <p className="sweep-chart-note">axis starts at 0</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
