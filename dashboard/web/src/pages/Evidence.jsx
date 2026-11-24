import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  ErrorBar,
} from 'recharts';
import { useVariant } from '../context/VariantContext';
import { useApi } from '../hooks/useApi';
import { fetchOverview, fetchMeta, fetchHybrid } from '../api';
import { buildConclusion } from '../lib/conclusion';
import { formatPct, formatNumber, formatCiVal } from '../lib/format';
import { THEME } from '../lib/constants';
import PageHeader from '../components/PageHeader';
import ApiError from '../components/ApiError';
import ForestPlot from '../components/ForestPlot';
import Tooltip from '../components/Tooltip';
import '../styles/evidence.css';

export default function Evidence() {
  const { variant } = useVariant();
  const { data: overview, loading: overviewLoading, error: overviewError, refetch: refetchOverview } = useApi(
    () => fetchOverview(variant),
    [variant]
  );
  const { data: meta } = useApi(fetchMeta, []);

  // Hybrid strategy state
  const [topPct, setTopPct] = useState(25);
  const [selectedBatch, setSelectedBatch] = useState('batch_daily');
  const [hybridData, setHybridData] = useState(null);
  const [hybridLoading, setHybridLoading] = useState(false);
  const hybridDebounceRef = useRef(null);

  // Forest plot metric state
  const [forestMetric, setForestMetric] = useState('top1'); // 'top1' | 'mae'

  // Debounced hybrid fetch
  useEffect(() => {
    if (hybridDebounceRef.current) {
      clearTimeout(hybridDebounceRef.current);
    }

    setHybridLoading(true);
    hybridDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetchHybrid(topPct, selectedBatch, variant);
        setHybridData(res);
      } catch (err) {
        console.error('Failed to load hybrid strategy data:', err);
      } finally {
        setHybridLoading(false);
      }
    }, 300);

    return () => {
      if (hybridDebounceRef.current) clearTimeout(hybridDebounceRef.current);
    };
  }, [topPct, selectedBatch, variant]);

  if (overviewLoading && !overview) {
    return (
      <div className="evidence-page">
        <PageHeader
          title="Evidence"
          subtitle="Are the differences real, and who gains from real-time?"
        />
        <div className="evidence-section-card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>Loading evidence data...</p>
        </div>
      </div>
    );
  }

  if (overviewError) {
    return (
      <div className="evidence-page">
        <PageHeader
          title="Evidence"
          subtitle="Are the differences real, and who gains from real-time?"
        />
        <ApiError error={overviewError} onRetry={refetchOverview} />
      </div>
    );
  }

  const pipelines = overview?.pipelines || {};
  const batchDaily = pipelines.batch_daily || {};
  const streaming = pipelines.streaming || {};
  const significance = overview?.significance || {};
  const models = overview?.models || {};
  const baseline = overview?.baseline || {};

  // Conclusion bullets from significance tests
  const conclusion = buildConclusion(overview, variant, meta?.unit_costs_seconds);

  // Segment Table Data (Q1 to Q4)
  const segments = [
    { key: '1', label: 'Rarest buyers (quartile 1)' },
    { key: '2', label: 'Quartile 2' },
    { key: '3', label: 'Quartile 3' },
    { key: '4', label: 'Most frequent buyers (quartile 4)' },
  ];

  const dailySegments = batchDaily.top1_by_segment || {};
  const rtSegments = streaming.top1_by_segment || {};

  // Hybrid batch pipeline reference
  const currentBatchPipeline = pipelines[selectedBatch] || batchDaily;
  const allBatchTop1 = currentBatchPipeline.top1;
  const allRtTop1 = streaming.top1;

  // Batch cadence label map
  const batchLabels = {
    batch_hourly: 'hourly batch',
    batch_daily: 'daily batch',
    batch_weekly: 'weekly batch',
  };
  const selectedBatchLabel = batchLabels[selectedBatch] || 'daily batch';

  // Section 3: Model Comparison Data
  const baselineTop1 = baseline.top1 || models?.baseline?.top1 || 0.3380;
  const lstmMean = models?.lstm?.mean_std?.top1?.[0] || 0.3959;
  const lstmStd = models?.lstm?.mean_std?.top1?.[1] || 0.0013;
  const tfMean = models?.transformer?.mean_std?.top1?.[0] || 0.3951;
  const tfStd = models?.transformer?.mean_std?.top1?.[1] || 0.0032;

  const modelChartData = [
    {
      name: 'Baseline (prior)',
      top1: Number((baselineTop1 * 100).toFixed(1)),
      std: 0,
      fill: THEME.hourly,
    },
    {
      name: 'LSTM',
      top1: Number((lstmMean * 100).toFixed(1)),
      std: Number((lstmStd * 100).toFixed(2)),
      fill: THEME.daily,
    },
    {
      name: 'Transformer',
      top1: Number((tfMean * 100).toFixed(1)),
      std: Number((tfStd * 100).toFixed(2)),
      fill: THEME.realtime,
    },
  ];

  return (
    <div className="evidence-page">
      <PageHeader
        title="Evidence"
        subtitle="Are the differences real, and who gains from real-time?"
      />

      {/* 1. Is the difference real? */}
      <section className="evidence-section-card" aria-label="Statistical significance tests">
        <ForestPlot
          significance={significance}
          activeMetric={forestMetric}
          onMetricChange={setForestMetric}
        />

        {conclusion.bullets && conclusion.bullets.length > 0 && (
          <div className="evidence-bullets-card">
            <h4 className="evidence-bullets-title">Statistical Significance Findings</h4>
            <ul className="evidence-bullets-list">
              {conclusion.bullets.map((bullet, idx) => (
                <li key={idx} className="evidence-bullet-item">
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 2. Who benefits? */}
      <section className="evidence-section-card" aria-label="Customer frequency breakdown and hybrid strategy">
        <div className="evidence-section-header">
          <div className="evidence-section-title-group">
            <h3 className="evidence-section-title">Who benefits?</h3>
            <span className="evidence-section-subtitle">
              Next-purchase accuracy broken down by customer purchase frequency
            </span>
          </div>
        </div>

        {/* Segment Table */}
        <div className="evidence-table-wrapper">
          <table className="evidence-table">
            <thead>
              <tr>
                <th>Customer group</th>
                <th>Daily batch Top-1</th>
                <th>Real-time Top-1</th>
                <th>Difference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {segments.map(({ key, label }) => {
                const dailyVal = dailySegments[key];
                const rtVal = rtSegments[key];
                const diff = (rtVal != null && dailyVal != null) ? (rtVal - dailyVal) * 100 : 0;
                const isWithinNoise = Math.abs(diff) < 0.5;

                return (
                  <tr key={key}>
                    <td className="segment-name">{label}</td>
                    <td className="segment-val">{formatPct(dailyVal)}</td>
                    <td className="segment-val">{formatPct(rtVal)}</td>
                    <td className="segment-val">{formatCiVal(diff, 1, true)} pt</td>
                    <td>
                      <span className={`status-badge ${isWithinNoise ? 'status-neutral' : 'status-sig'}`}>
                        within noise
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="evidence-footnote">
          Groups are quartiles of past purchase frequency; each has a few hundred test examples. Q1 also contains new customers with no training-period history.
        </p>

        {/* Hybrid Strategy */}
        <div className="hybrid-strategy-box">
          <div className="hybrid-header-row">
            <h4 className="hybrid-title">
              Serve the top {topPct}% most frequent buyers in real time, everyone else from {selectedBatchLabel}
            </h4>
            <div className="hybrid-batch-select-group">
              <span>Batch cadence:</span>
              <div className="hybrid-batch-btns" role="group" aria-label="Select batch schedule for hybrid serving">
                <button
                  type="button"
                  className={`hybrid-batch-btn ${selectedBatch === 'batch_hourly' ? 'active' : ''}`}
                  onClick={() => setSelectedBatch('batch_hourly')}
                >
                  Hourly
                </button>
                <button
                  type="button"
                  className={`hybrid-batch-btn ${selectedBatch === 'batch_daily' ? 'active' : ''}`}
                  onClick={() => setSelectedBatch('batch_daily')}
                >
                  Daily
                </button>
                <button
                  type="button"
                  className={`hybrid-batch-btn ${selectedBatch === 'batch_weekly' ? 'active' : ''}`}
                  onClick={() => setSelectedBatch('batch_weekly')}
                >
                  Weekly
                </button>
              </div>
            </div>
          </div>

          <div className="hybrid-slider-container">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={topPct}
              onChange={(e) => setTopPct(Number(e.target.value))}
              className="hybrid-slider-input"
              aria-label="Percentage of top frequent buyers served in real time"
            />
            <div className="hybrid-snap-row">
              {[0, 10, 25, 50, 100].map((snapVal) => (
                <button
                  key={snapVal}
                  type="button"
                  className={`hybrid-snap-btn ${topPct === snapVal ? 'active' : ''}`}
                  onClick={() => setTopPct(snapVal)}
                >
                  {snapVal}%
                </button>
              ))}
            </div>
          </div>

          {/* Three Tiles */}
          <div className="hybrid-tiles-grid" style={{ opacity: hybridLoading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
            {/* Tile 1: Top-1 */}
            <div className="hybrid-tile-card">
              <span className="hybrid-tile-label">
                <Tooltip term="Top-1 accuracy">Top-1 accuracy</Tooltip>
              </span>
              <strong className="hybrid-tile-value">
                {hybridData?.top1 != null ? formatPct(hybridData.top1, 2) : '—'}
              </strong>
              <span className="hybrid-tile-caption">
                all-batch {allBatchTop1 != null ? formatPct(allBatchTop1, 2) : '—'}, all-real-time{' '}
                {allRtTop1 != null ? formatPct(allRtTop1, 2) : '—'}
              </span>
            </div>

            {/* Tile 2: Model compute */}
            <div className="hybrid-tile-card">
              <span className="hybrid-tile-label">
                <Tooltip term="Model compute">Model compute</Tooltip>
              </span>
              <strong className="hybrid-tile-value">
                {hybridData?.est_cpu_seconds_model_only != null
                  ? `${hybridData.est_cpu_seconds_model_only.toFixed(2)} s`
                  : '—'}
              </strong>
              <span className="hybrid-tile-caption">
                all-real-time{' '}
                {hybridData?.all_realtime_cpu_seconds_model_only != null
                  ? `${hybridData.all_realtime_cpu_seconds_model_only.toFixed(2)} s`
                  : '—'}
              </span>
              <span className="hybrid-tile-note">
                Estimated from the measured cost per model run. The Batch and Real-Time pages show the measured totals.
              </span>
            </div>

            {/* Tile 3: Share of events */}
            <div className="hybrid-tile-card">
              <span className="hybrid-tile-label">
                Share of purchase events in real time
              </span>
              <strong className="hybrid-tile-value">
                {hybridData?.share_of_events_served_realtime != null
                  ? formatPct(hybridData.share_of_events_served_realtime, 1)
                  : '—'}
              </strong>
              <span className="hybrid-tile-caption">
                {formatNumber(hybridData?.customers_realtime || 0)} customers
              </span>
            </div>
          </div>

          {/* Muted Kafka + Redis line */}
          <p className="hybrid-muted-line">
            incl. Kafka + Redis:{' '}
            {hybridData?.est_cpu_seconds != null ? `${hybridData.est_cpu_seconds.toFixed(2)} s` : '—'}
          </p>

          {/* Generated caption */}
          {hybridData && (
            <p className="hybrid-caption">
              At {topPct}%: Top-1 {formatPct(hybridData.top1, 2)} (all-batch {formatPct(allBatchTop1, 2)}, all-real-time{' '}
              {formatPct(allRtTop1, 2)}) for {hybridData.est_cpu_seconds_model_only?.toFixed(2)} s of model compute (all-real-time{' '}
              {hybridData.all_realtime_cpu_seconds_model_only?.toFixed(2)} s).
            </p>
          )}
        </div>
      </section>

      {/* 3. The models */}
      <section className="evidence-section-card" aria-label="Model architecture comparison">
        <div className="evidence-section-header">
          <div className="evidence-section-title-group">
            <h3 className="evidence-section-title">The models</h3>
            <span className="evidence-section-subtitle">
              Top-1 accuracy comparison across architectures (mean ± std over 3 seeds)
            </span>
          </div>
        </div>

        <div className="models-chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={modelChartData}
              margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text)', fontSize: 14 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                domain={[0, 50]}
                ticks={[0, 10, 20, 30, 40, 50]}
                unit="%"
                tick={{ fill: 'var(--muted)', fontSize: 14 }}
                axisLine={false}
                tickLine={false}
              />
              <RechartsTooltip
                formatter={(val, name, item) => [
                  `${val}% ${item.payload.std > 0 ? `(±${item.payload.std}%)` : ''}`,
                  'Top-1 Accuracy',
                ]}
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  borderColor: 'var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  fontSize: 14,
                }}
              />
              <Bar dataKey="top1" radius={[4, 4, 0, 0]}>
                {modelChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
                <ErrorBar dataKey="std" width={10} strokeWidth={2} stroke="var(--primary)" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="models-caption">
          Both neural models beat the frequency baseline ({formatPct(baselineTop1)}); LSTM {formatPct(lstmMean)}, Transformer {formatPct(tfMean)}.
        </p>
      </section>
    </div>
  );
}
