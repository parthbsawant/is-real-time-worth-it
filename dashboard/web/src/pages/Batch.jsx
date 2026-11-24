import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  LabelList,
} from 'recharts';
import { ArrowRight } from 'lucide-react';
import { useVariant } from '../context/VariantContext';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import PipelineCard from '../components/PipelineCard';
import ApiError from '../components/ApiError';
import { THEME } from '../lib/constants';
import { formatStaleness } from '../lib/format';
import '../styles/batch.css';

export default function Batch() {
  const { variant } = useVariant();
  const { data: overview, loading, error, refetch } = useApi(
    `/api/overview?variant=${variant}`
  );

  if (error) {
    return <ApiError error={error} onRetry={refetch} />;
  }

  if (loading && !overview) {
    return (
      <div className="batch-page">
        <PageHeader
          title="Batch Processing"
          subtitle="Predictions are computed on a schedule and stored. Between runs they get older."
        />
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>Loading batch pipeline data...</p>
        </div>
      </div>
    );
  }

  const pipelines = overview?.pipelines || {};
  const hourly = pipelines.batch_hourly || {};
  const daily = pipelines.batch_daily || {};
  const weekly = pipelines.batch_weekly || {};

  // Section 3: Staleness Chart Data
  const chartData = [
    {
      name: 'Hourly',
      median: hourly.staleness_hours_median != null ? Number(hourly.staleness_hours_median.toFixed(2)) : 0,
      p95: hourly.staleness_hours_p95 != null ? Number(hourly.staleness_hours_p95.toFixed(2)) : 0,
    },
    {
      name: 'Daily',
      median: daily.staleness_hours_median != null ? Number(daily.staleness_hours_median.toFixed(2)) : 0,
      p95: daily.staleness_hours_p95 != null ? Number(daily.staleness_hours_p95.toFixed(2)) : 0,
    },
    {
      name: 'Weekly',
      median: weekly.staleness_hours_median != null ? Number(weekly.staleness_hours_median.toFixed(2)) : 0,
      p95: weekly.staleness_hours_p95 != null ? Number(weekly.staleness_hours_p95.toFixed(2)) : 0,
    },
  ];

  // Section 4: Data-Driven Spread Sentences
  const top1s = [hourly.top1, daily.top1, weekly.top1].filter((v) => v != null);
  const maxTop1 = top1s.length ? Math.max(...top1s) : 0;
  const minTop1 = top1s.length ? Math.min(...top1s) : 0;
  const top1SpreadNum = (maxTop1 - minTop1) * 100;
  const top1Spread = top1SpreadNum.toFixed(1);

  const clvs = [hourly.clv_mae, daily.clv_mae, weekly.clv_mae].filter((v) => v != null);
  const maxClv = clvs.length ? Math.max(...clvs) : 0;
  const minClv = clvs.length ? Math.min(...clvs) : 0;
  const clvSpread = Math.round(maxClv - minClv).toLocaleString();

  const sentenceA = `Top-1 spread across the three cadences is ${top1Spread} pt; CLV error spread is £${clvSpread}.`;

  let sentenceB = '';
  if (top1SpreadNum < 1.0) {
    sentenceB = 'Accuracy barely changes, but predictions get much older.';
  }
  if (
    weekly.clv_mae != null &&
    hourly.clv_mae != null &&
    weekly.clv_mae - hourly.clv_mae > 50
  ) {
    sentenceB = sentenceB
      ? `${sentenceB} CLV error rises as predictions get older.`
      : 'CLV error rises as predictions get older.';
  }

  return (
    <div className="batch-page">
      <PageHeader
        title="Batch Processing"
        subtitle="Predictions are computed on a schedule and stored. Between runs they get older."
      />

      {/* Section 1: Flow Strip */}
      <section className="flow-strip-container" aria-label="How batch processing works">
        <div className="flow-box">
          <span className="flow-step-tag">Step 1</span>
          <h4 className="flow-step-title">Purchases arrive</h4>
        </div>
        <div className="flow-arrow" aria-hidden="true">
          <ArrowRight size={22} />
        </div>

        <div className="flow-box">
          <span className="flow-step-tag">Step 2</span>
          <h4 className="flow-step-title">Wait for the next scheduled run</h4>
        </div>
        <div className="flow-arrow" aria-hidden="true">
          <ArrowRight size={22} />
        </div>

        <div className="flow-box">
          <span className="flow-step-tag">Step 3</span>
          <h4 className="flow-step-title">Recompute for customers who bought</h4>
        </div>
        <div className="flow-arrow" aria-hidden="true">
          <ArrowRight size={22} />
        </div>

        <div className="flow-box">
          <span className="flow-step-tag">Step 4</span>
          <h4 className="flow-step-title">Store predictions</h4>
        </div>
      </section>

      {/* Section 2: Three Cadence Cards */}
      <section className="cadence-grid" aria-label="Batch pipelines comparison">
        <PipelineCard
          title="Hourly Batch"
          cadenceLabel="every 1 hour"
          borderColor={THEME.hourly}
          pipeline={hourly}
        />
        <PipelineCard
          title="Daily Batch"
          cadenceLabel="every 24 hours"
          borderColor={THEME.daily}
          pipeline={daily}
        />
        <PipelineCard
          title="Weekly Batch"
          cadenceLabel="every 7 days"
          borderColor={THEME.weekly}
          pipeline={weekly}
        />
      </section>

      {/* Section 3: Staleness Chart & Section 4: Sentences */}
      <section className="batch-chart-card" aria-label="Prediction staleness chart">
        <div className="batch-chart-header">
          <h3 className="batch-chart-title">How old is the prediction when it is used?</h3>
          <p className="batch-chart-subtitle">
            Median and 95th-percentile staleness by batch cadence (measured over test period)
          </p>
        </div>

        <div className="batch-chart-wrapper">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={chartData}
              margin={{ top: 28, right: 30, left: 65, bottom: 15 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E5EA" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#111827', fontSize: 15, fontWeight: 600 }}
                tickLine={false}
              />
              <YAxis
                domain={[0, (dataMax) => Math.ceil(dataMax * 1.18)]}
                tick={{ fill: '#6B7280', fontSize: 14 }}
                unit=" h"
                label={{
                  value: 'Staleness (hours)',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 10,
                  fill: '#0F172A',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              />
              <RechartsTooltip
                formatter={(val, name) => [
                  `${Number(val).toFixed(2)} h (${formatStaleness(val)})`,
                  name,
                ]}
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#E2E5EA',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
                  fontSize: '14px',
                  color: '#111827',
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="rect"
                iconSize={10}
                wrapperStyle={{ paddingBottom: '12px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}
              />
              <Bar
                dataKey="median"
                name="Median staleness"
                fill={THEME.weekly}
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="median"
                  position="top"
                  formatter={(val) => formatStaleness(val)}
                  style={{ fill: '#111827', fontSize: 13, fontWeight: 700 }}
                  offset={6}
                />
              </Bar>
              <Bar
                dataKey="p95"
                name="95th-percentile staleness"
                fill={THEME.hourly}
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="p95"
                  position="top"
                  formatter={(val) => formatStaleness(val)}
                  style={{ fill: '#111827', fontSize: 13, fontWeight: 700 }}
                  offset={6}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Section 4: Two Generated Sentences */}
        <div className="batch-conclusion-callout">
          <p className="batch-conclusion-line-a">{sentenceA}</p>
          {sentenceB && <p className="batch-conclusion-line-b">{sentenceB}</p>}
        </div>
      </section>
    </div>
  );
}
