import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ErrorBar,
  Cell,
} from 'recharts';
import { PIPELINE_META, ORDERED_PIPELINES } from '../constants';
import {
  formatGbp,
  formatPct,
  formatNumber,
  formatStaleness,
  formatLatency,
  formatSeconds,
  formatDateShort,
} from '../format';
import { fetchOverview, fetchMeta } from '../api';
import ApiError from '../components/ApiError';
import ForestPlot from '../components/ForestPlot';

export default function Overview({ variant, meta: initialMeta }) {
  const [meta, setMeta] = useState(initialMeta || null);
  const [overview, setOverview] = useState(null);
  const [selectedPipelineKey, setSelectedPipelineKey] = useState('streaming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [metaData, overviewData] = await Promise.all([
        meta ? Promise.resolve(meta) : fetchMeta(),
        fetchOverview(variant),
      ]);
      if (!meta) setMeta(metaData);
      setOverview(overviewData);
    } catch (err) {
      console.error('Failed to load overview data:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [variant]);

  if (loading && !overview) {
    return (
      <div className="page-container page-overview">
        <div className="loading-state-container">
          <div className="loading-spinner" />
          <p className="loading-text">Loading seminar results for {variant === 'age' ? 'follow-up' : 'primary'} model...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container page-overview">
        <ApiError error={error} onRetry={loadData} />
      </div>
    );
  }

  const pipelines = overview?.pipelines || {};
  const baseline = overview?.baseline || {};
  const models = overview?.models || {};
  const significance = overview?.significance || {};
  const kafka = overview?.kafka_check || {};
  const dataset = meta?.dataset || {};
  const segmentsMeta = meta?.segments || {};

  const selectedPipeline = pipelines[selectedPipelineKey] || pipelines['streaming'] || {};
  const selectedMeta = PIPELINE_META[selectedPipelineKey] || PIPELINE_META['streaming'];

  // Baseline Comparison Chart Data
  const baselineChartData = [
    {
      name: 'Baseline (Global Prior)',
      top1: Number(((baseline.top1 || 0) * 100).toFixed(1)),
      std: 0,
      fill: '#B8860B',
    },
    {
      name: 'LSTM',
      top1: Number(((models?.lstm?.mean_std?.top1?.[0] || 0) * 100).toFixed(1)),
      std: Number(((models?.lstm?.mean_std?.top1?.[1] || 0) * 100).toFixed(2)),
      fill: '#966324',
    },
    {
      name: 'Transformer (Primary)',
      top1: Number(((models?.transformer?.mean_std?.top1?.[0] || 0) * 100).toFixed(1)),
      std: Number(((models?.transformer?.mean_std?.top1?.[1] || 0) * 100).toFixed(2)),
      fill: '#7A4E24',
    },
  ];

  // Cost Panel Chart Data
  const costChartData = ORDERED_PIPELINES.map((key) => {
    const p = pipelines[key] || {};
    const m = PIPELINE_META[key] || {};
    return {
      key,
      name: m.shortLabel || key,
      seconds: Number((p.seconds || 0).toFixed(3)),
      fill: m.color,
      compute_vs_hourly: p.compute_vs_hourly,
    };
  });

  // Plain-language "What this shows" dynamically generated from the data
  const whatThisShowsSentences = [];
  if (significance) {
    const weeklySig = significance.batch_weekly?.top1_gain_points;
    if (weeklySig) {
      const [est, low, high] = weeklySig;
      const crossesZero = low <= 0 && high >= 0;
      const sign = est > 0 ? '+' : '';
      const lowSign = low > 0 ? '+' : '';
      const highSign = high > 0 ? '+' : '';
      if (crossesZero) {
        whatThisShowsSentences.push(
          `Real-time vs weekly batch: ${sign}${est.toFixed(1)} points Top-1, 95% range ${lowSign}${low.toFixed(1)} to ${highSign}${high.toFixed(1)}. Because this range spans zero, the difference is not distinguishable from zero.`
        );
      } else {
        whatThisShowsSentences.push(
          `Real-time vs weekly batch: ${sign}${est.toFixed(1)} points Top-1, 95% range ${lowSign}${low.toFixed(1)} to ${highSign}${high.toFixed(1)}, showing a statistically significant change.`
        );
      }
    }

    const hourlySig = significance.batch_hourly?.top1_gain_points;
    if (hourlySig) {
      const [est, low, high] = hourlySig;
      const crossesZero = low <= 0 && high >= 0;
      const sign = est > 0 ? '+' : '';
      const lowSign = low > 0 ? '+' : '';
      const highSign = high > 0 ? '+' : '';
      if (crossesZero) {
        whatThisShowsSentences.push(
          `Real-time vs hourly batch: ${sign}${est.toFixed(1)} points Top-1 (95% range ${lowSign}${low.toFixed(1)} to ${highSign}${high.toFixed(1)}), also not distinguishable from zero.`
        );
      } else {
        whatThisShowsSentences.push(
          `Real-time vs hourly batch: ${sign}${est.toFixed(1)} points Top-1 (95% range ${lowSign}${low.toFixed(1)} to ${highSign}${high.toFixed(1)}).`
        );
      }
    }

    if (pipelines.streaming && pipelines.batch_hourly) {
      const mult = pipelines.streaming.compute_vs_hourly || 0;
      whatThisShowsSentences.push(
        `Compute trade-off: Real-time required ${mult.toFixed(1)}× more compute than hourly batch (${formatSeconds(pipelines.streaming.seconds)} vs ${formatSeconds(pipelines.batch_hourly.seconds)}).`
      );
    }

    const allCrossZero = [
      significance.batch_hourly?.top1_gain_points,
      significance.batch_daily?.top1_gain_points,
      significance.batch_weekly?.top1_gain_points,
    ].every((pts) => pts && pts[1] <= 0 && pts[2] >= 0);

    if (allCrossZero) {
      whatThisShowsSentences.push(
        `Conclusion: Continuous real-time updates provided no statistically measurable accuracy advantage over batch pipelines on this workload, despite a substantial compute premium.`
      );
    }
  }

  return (
    <div className="page-container page-overview">
      {/* 1. Dataset Strip */}
      <section className="dataset-strip" aria-label="Dataset Overview">
        <div className="dataset-stat">
          <span className="dataset-label">Customers</span>
          <strong className="dataset-value">{formatNumber(dataset.customers)}</strong>
        </div>
        <div className="dataset-divider" />
        <div className="dataset-stat">
          <span className="dataset-label">Total Purchases</span>
          <strong className="dataset-value">{formatNumber(dataset.purchases)}</strong>
        </div>
        <div className="dataset-divider" />
        <div className="dataset-stat">
          <span className="dataset-label">Dataset Span</span>
          <strong className="dataset-value">
            {formatDateShort(dataset.span_start)} — {formatDateShort(dataset.span_end)}
          </strong>
        </div>
        <div className="dataset-divider" />
        <div className="dataset-stat">
          <span className="dataset-label">Test Period</span>
          <strong className="dataset-value">
            {dataset.test_start} to {dataset.test_end} ({formatNumber(dataset.test_period_purchases)} events)
          </strong>
        </div>
        <div className="dataset-divider" />
        <div className="dataset-stat">
          <span className="dataset-label">Test Examples</span>
          <strong className="dataset-value">{formatNumber(dataset.examples?.test)}</strong>
        </div>
      </section>

      {/* 2. Pipeline Cards & Side Panel */}
      <section className="pipelines-section">
        <div className="section-header">
          <h2 className="section-title">Pipeline Comparison</h2>
          <span className="section-subtitle">
            Measured accuracy, staleness, and compute cost across 4 serving architectures. Click a card to inspect.
          </span>
        </div>

        <div className="pipelines-grid-with-sidebar">
          <div className="pipeline-cards-row">
            {ORDERED_PIPELINES.map((key) => {
              const p = pipelines[key] || {};
              const metaInfo = PIPELINE_META[key] || {};
              const isSelected = selectedPipelineKey === key;
              return (
                <div
                  key={key}
                  className={`pipeline-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedPipelineKey(key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedPipelineKey(key);
                    }
                  }}
                  style={{
                    borderColor: isSelected ? metaInfo.color : 'rgba(227, 185, 91, 0.4)',
                  }}
                >
                  <div className="card-top-header" style={{ borderLeftColor: metaInfo.color }}>
                    <div className="pipeline-name-group">
                      <span className="pipeline-title">{metaInfo.label}</span>
                      <span className="pipeline-type-tag">{metaInfo.type === 'realtime' ? 'Continuous' : 'Periodic'}</span>
                    </div>
                    {isSelected && <span className="active-badge">Active</span>}
                  </div>

                  <div className="pipeline-metrics-grid">
                    <div className="metric-cell">
                      <span className="metric-label">Top-1 Accuracy</span>
                      <strong className="metric-value primary-acc">{formatPct(p.top1)}</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-label">Top-3 Accuracy</span>
                      <strong className="metric-value">{formatPct(p.top3)}</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-label">CLV Error (MAE)</span>
                      <strong className="metric-value">{formatGbp(p.clv_mae)}</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-label">Median Staleness</span>
                      <strong className="metric-value staleness-val">
                        {formatStaleness(p.staleness_hours_median, kafka)}
                      </strong>
                    </div>
                  </div>

                  <div className="pipeline-compute-footer">
                    <div className="compute-stat">
                      <span className="compute-label">Inferences:</span>
                      <span className="compute-val">{formatNumber(p.inferences)}</span>
                    </div>
                    <div className="compute-stat">
                      <span className="compute-label">CPU:</span>
                      <span className="compute-val">{formatSeconds(p.seconds)}</span>
                    </div>
                    <div className="compute-stat">
                      <span className="compute-label">Cost vs 1h:</span>
                      <span className="compute-val multiplier">
                        {p.compute_vs_hourly != null ? `${p.compute_vs_hourly.toFixed(1)}×` : '1.0×'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Side Panel for Clicked Pipeline */}
          <aside className="pipeline-side-panel">
            <div className="side-panel-header" style={{ borderLeftColor: selectedMeta.color }}>
              <div className="side-panel-title-wrapper">
                <span className="side-panel-eyebrow">Detailed Breakdown</span>
                <h3 className="side-panel-title">{selectedMeta.label}</h3>
              </div>
              <span className="side-panel-badge" style={{ backgroundColor: selectedMeta.color }}>
                {selectedMeta.shortLabel}
              </span>
            </div>

            <div className="side-panel-section">
              <h4 className="side-section-heading">Per-Segment Top-1 Accuracy</h4>
              <p className="side-section-desc">By customer purchase-frequency quartile:</p>
              <div className="segment-breakdown-list">
                {[1, 2, 3, 4].map((seg) => {
                  const segVal = selectedPipeline.top1_by_segment?.[seg] ?? selectedPipeline.top1_by_segment?.[String(seg)];
                  const segMeta = segmentsMeta[String(seg)] || { label: `Quartile ${seg}` };
                  return (
                    <div key={seg} className="segment-row">
                      <div className="segment-row-info">
                        <span className="segment-name">Q{seg}: {segMeta.label.split('(')[0].trim()}</span>
                        <strong className="segment-val">{formatPct(segVal)}</strong>
                      </div>
                      <div className="segment-bar-track">
                        <div
                          className="segment-bar-fill"
                          style={{
                            width: `${Math.min(100, (segVal || 0) * 200)}%`,
                            backgroundColor: selectedMeta.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="side-panel-section">
              <h4 className="side-section-heading">Latency & Reliability</h4>
              <div className="latency-stats-grid">
                <div className="latency-stat-box">
                  <span className="latency-label">Median Latency</span>
                  <strong className="latency-val">{formatLatency(selectedPipeline.latency_ms_median)}</strong>
                </div>
                <div className="latency-stat-box">
                  <span className="latency-label">95th % Latency</span>
                  <strong className="latency-val">{formatLatency(selectedPipeline.latency_ms_p95)}</strong>
                </div>
                <div className="latency-stat-box">
                  <span className="latency-label">Fallback Cold Starts</span>
                  <strong className="latency-val">{selectedPipeline.no_history_fallbacks ?? 0}</strong>
                </div>
                <div className="latency-stat-box">
                  <span className="latency-label">P95 Staleness</span>
                  <strong className="latency-val">{formatStaleness(selectedPipeline.staleness_hours_p95, kafka)}</strong>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* 3. Baseline comparison & Significance */}
      <div className="grid-two-cols">
        {/* Baseline Comparison Bar Chart */}
        <div className="card-box">
          <div className="card-box-header">
            <div>
              <h3 className="card-title">Model Architecture vs Prior</h3>
              <span className="card-subtitle">
                Top-1 accuracy (%) of heuristic baseline vs LSTM vs Transformer with ±1 std error bars
              </span>
            </div>
          </div>

          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={baselineChartData}
                margin={{ top: 25, right: 25, left: 10, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(122, 78, 36, 0.12)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#1E1E1E', fontSize: 13, fontWeight: 500 }}
                  interval={0}
                />
                <YAxis
                  domain={[0, 48]}
                  unit="%"
                  tick={{ fill: '#1E1E1E', fontSize: 12 }}
                  label={{
                    value: 'Top-1 Accuracy (%)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 12,
                    fill: '#7A4E24',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                />
                <Tooltip
                  formatter={(value, name, item) => {
                    const std = item.payload.std;
                    return [`${value}% ${std ? `(±${std}%)` : ''}`, 'Top-1 Accuracy'];
                  }}
                  contentStyle={{
                    backgroundColor: '#FBF6EC',
                    borderColor: '#E3B95B',
                    borderRadius: 6,
                    color: '#1E1E1E',
                  }}
                />
                <Bar dataKey="top1" radius={[4, 4, 0, 0]}>
                  {baselineChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                  <ErrorBar dataKey="std" width={8} strokeWidth={2} stroke="#1A1A1A" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="card-caption">
            Both neural models substantially outperform the global frequency baseline (~33.8%), with LSTM and Transformer achieving comparable Top-1 (~39.5%).
          </p>
        </div>

        {/* Forest Plot: "Is the difference real?" */}
        <ForestPlot significance={significance} />
      </div>

      {/* 4. Cost Panel & Plain Language "What this shows" */}
      <div className="grid-two-cols">
        {/* Cost Panel */}
        <div className="card-box">
          <div className="card-box-header">
            <div>
              <h3 className="card-title">Compute Cost by Pipeline</h3>
              <span className="card-subtitle">
                Total CPU inference seconds required to evaluate the test period
              </span>
            </div>
          </div>

          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={costChartData} margin={{ top: 20, right: 25, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(122, 78, 36, 0.12)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#1E1E1E', fontSize: 13, fontWeight: 500 }}
                />
                <YAxis
                  unit="s"
                  tick={{ fill: '#1E1E1E', fontSize: 12 }}
                  label={{
                    value: 'CPU Seconds (s)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 12,
                    fill: '#7A4E24',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                />
                <Tooltip
                  formatter={(val, name, item) => [
                    `${val} seconds (${item.payload.compute_vs_hourly.toFixed(1)}× hourly)`,
                    'CPU Compute',
                  ]}
                  contentStyle={{
                    backgroundColor: '#FBF6EC',
                    borderColor: '#E3B95B',
                    borderRadius: 6,
                    color: '#1E1E1E',
                  }}
                />
                <Bar dataKey="seconds" radius={[4, 4, 0, 0]}>
                  {costChartData.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="compute-highlight-callout">
            <span className="highlight-icon">⚡</span>
            <span className="highlight-text">
              Real-time used{' '}
              <strong>
                {pipelines.streaming?.compute_vs_hourly != null
                  ? `${pipelines.streaming.compute_vs_hourly.toFixed(1)}×`
                  : '—'}
              </strong>{' '}
              more compute than hourly batch ({formatSeconds(pipelines.streaming?.seconds)} vs{' '}
              {formatSeconds(pipelines.batch_hourly?.seconds)}).
            </span>
          </div>

          {kafka && (
            <div className="kafka-footnote">
              <span className="footnote-tag">Kafka + Redis Deployment:</span>
              <span className="footnote-text">
                Live stream consumer measured median processing time of{' '}
                <strong>{kafka.processing_ms_median != null ? `${kafka.processing_ms_median.toFixed(1)} ms` : '—'}</strong>{' '}
                and median end-to-end latency of{' '}
                <strong>{kafka.end_to_end_ms_median != null ? `${kafka.end_to_end_ms_median.toFixed(1)} ms` : '—'}</strong>.
                Max absolute score difference vs offline: {kafka.max_abs_score_diff_vs_offline != null ? kafka.max_abs_score_diff_vs_offline.toExponential(2) : '0'} (100% Top-1 offline agreement).
              </span>
            </div>
          )}
        </div>

        {/* What this shows Box */}
        <div className="card-box what-this-shows-card">
          <div className="card-box-header">
            <div>
              <h3 className="card-title">What this shows</h3>
              <span className="card-subtitle">Synthesized findings directly generated from measured data</span>
            </div>
            <span className="data-driven-badge">Data-Driven</span>
          </div>

          <div className="what-this-shows-body">
            <ul className="conclusions-list">
              {whatThisShowsSentences.map((sentence, index) => (
                <li key={index} className="conclusion-item">
                  <span className="conclusion-bullet">▸</span>
                  <span className="conclusion-text">{sentence}</span>
                </li>
              ))}
            </ul>

            <div className="seminar-takeaway-box">
              <span className="takeaway-badge">Seminar Key Takeaway</span>
              <p className="takeaway-text">
                For customer next-category recommendation, purchase events occur on the order of weeks and months rather than seconds. Serving inferences continuously on every transaction adds immense compute and operational complexity without delivering a measurable freshness advantage over batched hourly or daily runs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
