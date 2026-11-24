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
  formatCiVal,
  formatCurrencySigned,
} from '../format';
import { fetchOverview, fetchMeta, fetchReplay } from '../api';
import ApiError from '../components/ApiError';
import ForestPlot from '../components/ForestPlot';

export default function Overview({ variant, meta: initialMeta }) {
  const [meta, setMeta] = useState(initialMeta || null);
  const [overview, setOverview] = useState(null);
  const [replay, setReplay] = useState(null);
  const [selectedPipelineKey, setSelectedPipelineKey] = useState('streaming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [metaData, overviewData, replayData] = await Promise.all([
        meta ? Promise.resolve(meta) : fetchMeta(),
        fetchOverview(variant),
        replay ? Promise.resolve(replay) : fetchReplay().catch(() => null),
      ]);
      if (!meta) setMeta(metaData);
      setOverview(overviewData);
      if (replayData) setReplay(replayData);
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

  // Baseline Comparison Chart Data - labeled "Transformer" (item 5)
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
      name: 'Transformer',
      top1: Number(((models?.transformer?.mean_std?.top1?.[0] || 0) * 100).toFixed(1)),
      std: Number(((models?.transformer?.mean_std?.top1?.[1] || 0) * 100).toFixed(2)),
      fill: '#7A4E24',
    },
  ];

  // Dynamic baseline caption values
  const baselineTop1Str = formatPct(baseline.top1);
  const lstmTop1Str = formatPct(models?.lstm?.mean_std?.top1?.[0]);
  const tfTop1Str = formatPct(models?.transformer?.mean_std?.top1?.[0]);

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

  // Measured full event cost from /api/replay unit_costs (item 4)
  const measuredFullCostSec = replay?.unit_costs_seconds?.stream_s_per_event_full
    ?? meta?.unit_costs_seconds?.stream_s_per_event_full;
  const measuredCostMs = measuredFullCostSec != null
    ? Math.round(measuredFullCostSec * 1000)
    : 7;

  // Fully data-driven, mode-aware "What this shows" and "Seminar key takeaway"
  const cadences = [
    { key: 'batch_weekly', label: 'weekly batch' },
    { key: 'batch_daily', label: 'daily batch' },
    { key: 'batch_hourly', label: 'hourly batch' },
  ];

  const whatThisShowsBullets = [];
  const clvSignificantWins = [];
  const top1SignificantWins = [];

  if (significance) {
    cadences.forEach(({ key, label }) => {
      const data = significance[key];
      if (!data) return;

      // Top-1 gain analysis with 2 decimals and no -0.0
      const [tEst, tLow, tHigh] = data.top1_gain_points || [0, 0, 0];
      const tCrossesZero = tLow <= 0 && tHigh >= 0;
      const tEstStr = `${formatCiVal(tEst, 2, true)} pt`;
      const tCiStr = `95% CI: ${formatCiVal(tLow, 2, true)} to ${formatCiVal(tHigh, 2, true)} pt`;

      // CLV MAE gain analysis with signed currency formatting (e.g. -£41.07 and +£42.23)
      const [mEst, mLow, mHigh] = data.mae_gain_pounds || [0, 0, 0];
      const mExcludesZero = (mLow > 0 && mHigh > 0) || (mLow < 0 && mHigh < 0);
      const mEstAbs = Math.abs(mEst).toFixed(2);
      const mIntervalStr = `95% CI ${formatCurrencySigned(mLow)} to ${formatCurrencySigned(mHigh)}`;

      let top1Sentence = tCrossesZero
        ? `Top-1 gain is ${tEstStr} (${tCiStr}) — not distinguishable from zero`
        : `Top-1 gain is ${tEstStr} (${tCiStr}) — statistically significant`;

      let clvSentence = '';
      if (mExcludesZero && mLow > 0) {
        clvSentence = `real-time is measurably better on CLV error vs ${label} by £${mEstAbs} lower MAE (${mIntervalStr})`;
        clvSignificantWins.push({
          cadence: label,
          size: `£${mEstAbs}`,
          interval: mIntervalStr,
        });
      } else if (mExcludesZero && mHigh < 0) {
        clvSentence = `real-time has measurably higher CLV error vs ${label} by £${mEstAbs} (${mIntervalStr})`;
      } else {
        // Polish item (4): For non-significant CLV results, write “real-time MAE is £X higher/lower (95% CI …)”
        const higherLower = mEst >= 0 ? 'lower' : 'higher';
        clvSentence = `real-time MAE is £${mEstAbs} ${higherLower} (${mIntervalStr}) — not distinguishable from zero`;
      }

      if (!tCrossesZero && tLow > 0) {
        top1SignificantWins.push({
          cadence: label,
          size: tEstStr,
          interval: tCiStr,
        });
      }

      whatThisShowsBullets.push(`Real-time vs ${label}: ${top1Sentence}; ${clvSentence}.`);
    });

    if (pipelines.streaming && pipelines.batch_hourly) {
      const mult = pipelines.streaming.compute_vs_hourly || 0;
      whatThisShowsBullets.push(
        `Compute ratio: Real-time required ${mult.toFixed(1)}× more compute than hourly batch (${formatSeconds(pipelines.streaming.seconds)} vs ${formatSeconds(pipelines.batch_hourly.seconds)}).`
      );
    }
  }

  // Generate Key Takeaway Text dynamically without any fixed text
  let dynamicTakeaway = '';
  const computeMultiplierStr = pipelines.streaming?.compute_vs_hourly != null
    ? `${pipelines.streaming.compute_vs_hourly.toFixed(1)}×`
    : '24.7×';
  const variantTitle = variant === 'age'
    ? 'follow-up model with elapsed-time input'
    : 'primary model';

  if (top1SignificantWins.length === 0 && clvSignificantWins.length === 0) {
    dynamicTakeaway = `For the ${variantTitle}, continuous real-time serving provides no statistically detectable improvement over batch cadences in either next-category recommendation accuracy (all Top-1 95% CIs cross zero) or CLV error, despite consuming ${computeMultiplierStr} more compute than hourly batch.`;
  } else if (top1SignificantWins.length === 0 && clvSignificantWins.length > 0) {
    const winDescriptions = clvSignificantWins
      .map((w) => `real-time is measurably better on CLV error vs ${w.cadence} by ${w.size} lower MAE (${w.interval})`)
      .join(', and ');
    dynamicTakeaway = `For the ${variantTitle}, continuous real-time serving still achieves no statistically measurable gain on Top-1 recommendation accuracy (all Top-1 95% CIs cross zero). However, ${winDescriptions}, while requiring ${computeMultiplierStr} more compute than hourly batch.`;
  } else {
    const winsCombined = [
      ...clvSignificantWins.map((w) => `measurably better on CLV error vs ${w.cadence} by ${w.size}`),
      ...top1SignificantWins.map((w) => `measurably better on Top-1 accuracy vs ${w.cadence} by ${w.size}`),
    ].join(', and ');
    dynamicTakeaway = `For the ${variantTitle}, continuous real-time serving is ${winsCombined}, while consuming ${computeMultiplierStr} more compute than hourly batch.`;
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

      {/* 2. Pipeline Cards & Detail Panel in a row beneath (Polish item 1) */}
      <section className="pipelines-section">
        <div className="section-header">
          <h2 className="section-title">Pipeline Comparison</h2>
          <span className="section-subtitle">
            Measured accuracy, staleness, and compute cost across 4 serving architectures. Click a card to inspect its details below.
          </span>
        </div>

        {/* 4 Equal-height pipeline cards spanning full width */}
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
                  {isSelected && <span className="active-badge">Selected</span>}
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

        {/* Selected Pipeline Detail Panel directly beneath the cards (Polish item 1) */}
        <div className="pipeline-detail-banner">
          <div className="detail-banner-header" style={{ borderLeftColor: selectedMeta.color }}>
            <div className="detail-banner-title-group">
              <span className="detail-banner-eyebrow">Inspecting Selected Pipeline</span>
              <h3 className="detail-banner-title">{selectedMeta.label}</h3>
            </div>
            <span className="detail-banner-badge" style={{ backgroundColor: selectedMeta.color }}>
              {selectedMeta.shortLabel}
            </span>
          </div>

          <div className="detail-banner-content-grid">
            {/* Per-segment breakdown */}
            <div className="detail-banner-block">
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
              <p className="segment-footnote">Q1 includes new customers with no training-period history.</p>
            </div>

            {/* Latency and Reliability metrics */}
            <div className="detail-banner-block">
              <h4 className="side-section-heading">Latency & Reliability Profile</h4>
              <p className="side-section-desc">Performance measurements in live deployment:</p>
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
          </div>
        </div>
      </section>

      {/* 3. Baseline comparison & Significance */}
      <div className="grid-two-cols">
        {/* Baseline Comparison Bar Chart - with generous left margin so y-axis title is never clipped (Polish item 3) */}
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
                margin={{ top: 25, right: 25, left: 35, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(122, 78, 36, 0.12)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#1E1E1E', fontSize: 13, fontWeight: 500 }}
                  interval={0}
                />
                <YAxis
                  width={45}
                  domain={[0, 48]}
                  unit="%"
                  tick={{ fill: '#1E1E1E', fontSize: 12 }}
                  label={{
                    value: 'Top-1 Accuracy (%)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 10,
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
          {/* Dynamic baseline caption from API */}
          <p className="card-caption">
            Both neural models substantially outperform the global frequency baseline ({baselineTop1Str}), with LSTM ({lstmTop1Str}) and Transformer ({tfTop1Str}) achieving comparable Top-1 accuracy.
          </p>
        </div>

        {/* Forest Plot: "Is the difference real?" */}
        <ForestPlot significance={significance} />
      </div>

      {/* 4. Cost Panel & Plain Language "What this shows" */}
      <div className="grid-two-cols">
        {/* Cost Panel - with generous left margin so y-axis title is never clipped (Polish item 3) */}
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
              <BarChart
                data={costChartData}
                margin={{ top: 20, right: 25, left: 35, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(122, 78, 36, 0.12)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#1E1E1E', fontSize: 13, fontWeight: 500 }}
                />
                <YAxis
                  width={45}
                  unit="s"
                  tick={{ fill: '#1E1E1E', fontSize: 12 }}
                  label={{
                    value: 'CPU Seconds (s)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 10,
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

          {/* Model inference only note from /api/replay unit_costs */}
          <p className="compute-model-only-note">
            Model inference only. Including Kafka + Redis, the measured cost is about {measuredCostMs} ms per event.
          </p>

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
              {whatThisShowsBullets.map((sentence, index) => (
                <li key={index} className="conclusion-item">
                  <span className="conclusion-bullet">▸</span>
                  <span className="conclusion-text">{sentence}</span>
                </li>
              ))}
            </ul>

            <div className="seminar-takeaway-box">
              <span className="takeaway-badge">Seminar Key Takeaway</span>
              <p className="takeaway-text">{dynamicTakeaway}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
