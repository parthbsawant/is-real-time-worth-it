import React from 'react';
import { Link } from 'react-router-dom';
import { useVariant } from '../context/VariantContext';
import { useApi } from '../hooks/useApi';
import { buildConclusion } from '../lib/conclusion';
import { formatNumber, formatPct, formatStaleness } from '../lib/format';
import ApiError from '../components/ApiError';
import Tooltip from '../components/Tooltip';
import { Clock, Zap, Sliders, BarChart3, ArrowRight } from 'lucide-react';
import '../styles/home.css';

export default function Home() {
  const { variant } = useVariant();
  const { data: meta, error: metaError, refetch: refetchMeta } = useApi('/api/meta');
  const { data: overview, loading: overviewLoading, error: overviewError, refetch: refetchOverview } = useApi(
    `/api/overview?variant=${variant}`
  );

  const error = metaError || overviewError;
  const handleRetry = () => {
    if (metaError) refetchMeta();
    if (overviewError) refetchOverview();
  };

  if (error) {
    return <ApiError error={error} onRetry={handleRetry} />;
  }

  if (overviewLoading && !overview) {
    return (
      <div className="home-page">
        <div className="loading-state-container">
          <div className="loading-spinner" />
          <p className="loading-text">Loading seminar results...</p>
        </div>
      </div>
    );
  }

  const dataset = meta?.dataset || {};
  const pipelines = overview?.pipelines || {};
  const conclusion = buildConclusion(overview, variant, meta?.unit_costs_seconds);

  // Nav card statistics calculations
  const hourly = pipelines.batch_hourly || {};
  const daily = pipelines.batch_daily || {};
  const weekly = pipelines.batch_weekly || {};
  const rt = pipelines.streaming || {};

  const batchTop1s = [hourly.top1, daily.top1, weekly.top1].filter((v) => v != null);
  const minBatchTop1 = batchTop1s.length ? Math.min(...batchTop1s) : 0.388;
  const maxBatchTop1 = batchTop1s.length ? Math.max(...batchTop1s) : 0.390;

  const hourlyStalenessStr = formatStaleness(hourly.staleness_hours_median) || '29 min';
  const weeklyStalenessStr = formatStaleness(weekly.staleness_hours_median) || '4.4 days';
  const batchStalenessRange = `${hourlyStalenessStr} to ${weeklyStalenessStr}`;

  const rtTop1Str = formatPct(rt.top1 || 0.391);
  const rtStalenessStr = formatStaleness(rt.staleness_hours_median, overview?.kafka_check) || '13 ms';

  return (
    <div className="home-page">
      {/* 1. Title Block */}
      <section className="home-title-block">
        <h1 className="home-main-title">Is Real-Time Worth It?</h1>
        <p className="home-subtitle">
          Freshness vs cost in next-purchase and customer-value prediction
        </p>
        <p className="home-meta-line">
          {formatNumber(dataset.customers || 2142)} customers ·{' '}
          {formatNumber(dataset.purchases || 29192)} purchases · test period{' '}
          {dataset.test_start || '2011-09-26'} to {dataset.test_end || '2011-12-09'}
        </p>
      </section>

      {/* 2. Final Conclusion Card */}
      <section className="conclusion-card" aria-label="Final Conclusion">
        <span className="conclusion-label">FINAL CONCLUSION</span>
        <h2 className="conclusion-headline">{conclusion.headline}</h2>

        <div className="conclusion-tiles-grid">
          {/* Tile 1: Accuracy */}
          <div className="conclusion-tile">
            <div className="tile-header-group">
              <span className="tile-topic">
                <Tooltip term="Top-1 accuracy">Accuracy</Tooltip>
              </span>
              <span className="tile-compare-target">Real-Time vs Daily</span>
            </div>
            <strong className="tile-kpi-val">{conclusion.dailyTop1Delta.text}</strong>
            <span className="tile-caption">{conclusion.dailyTop1Delta.caption}</span>
          </div>

          {/* Tile 2: Freshness */}
          <div className="conclusion-tile">
            <div className="tile-header-group">
              <span className="tile-topic">
                <Tooltip term="Staleness">Freshness</Tooltip>
              </span>
              <span className="tile-compare-target">Median Staleness</span>
            </div>
            <strong className="tile-kpi-val">{conclusion.dailyFreshness.text}</strong>
            <span className="tile-caption">instant vs 11-hour delay</span>
          </div>

          {/* Tile 3: Cost */}
          <div className="conclusion-tile">
            <div className="tile-header-group">
              <span className="tile-topic">
                <Tooltip term="Model compute">Cost</Tooltip>
              </span>
              <span className="tile-compare-target">vs Hourly Batch</span>
            </div>
            <strong className="tile-kpi-val">{conclusion.cost.multText}</strong>
            <span className="tile-caption">{conclusion.cost.caption}</span>
          </div>
        </div>

        <p className="conclusion-takeaway-paragraph">{conclusion.takeaway}</p>
      </section>

      {/* 3. Four Navigation Cards */}
      <section className="nav-cards-grid" aria-label="Explore the findings">
        {/* Card 1: Batch */}
        <Link to="/batch" className="nav-card" title="Explore Batch Processing (Press 1)">
          <div className="nav-card-top">
            <div className="nav-card-icon-title">
              <div className="nav-card-icon">
                <Clock size={24} />
              </div>
              <h3 className="nav-card-title">Batch Processing</h3>
            </div>
            <span className="nav-card-kbd">1</span>
          </div>
          <p className="nav-card-desc">
            Predictions recomputed on a schedule: hourly, daily, weekly.
          </p>
          <div className="nav-card-chips">
            <span className="stat-chip">
              Top-1 {formatPct(minBatchTop1)}–{formatPct(maxBatchTop1)}
            </span>
            <span className="stat-chip">Staleness {batchStalenessRange}</span>
          </div>
          <div className="nav-card-bottom">
            <span>Open</span>
            <ArrowRight size={16} />
          </div>
        </Link>

        {/* Card 2: Real-Time */}
        <Link to="/realtime" className="nav-card" title="Explore Real-Time Processing (Press 2)">
          <div className="nav-card-top">
            <div className="nav-card-icon-title">
              <div className="nav-card-icon">
                <Zap size={24} />
              </div>
              <h3 className="nav-card-title">Real-Time Processing</h3>
            </div>
            <span className="nav-card-kbd">2</span>
          </div>
          <p className="nav-card-desc">
            Kafka + Redis: the prediction updates on every purchase.
          </p>
          <div className="nav-card-chips">
            <span className="stat-chip">Top-1 {rtTop1Str}</span>
            <span className="stat-chip">Staleness {rtStalenessStr}</span>
          </div>
          <div className="nav-card-bottom">
            <span>Open</span>
            <ArrowRight size={16} />
          </div>
        </Link>

        {/* Card 3: Simulator */}
        <Link to="/simulator" className="nav-card" title="Open Interactive Simulator (Press 3)">
          <div className="nav-card-top">
            <div className="nav-card-icon-title">
              <div className="nav-card-icon">
                <Sliders size={24} />
              </div>
              <h3 className="nav-card-title">Simulator</h3>
            </div>
            <span className="nav-card-kbd">3</span>
          </div>
          <p className="nav-card-desc">
            Move the refresh interval. Inspect any customer.
          </p>
          <div className="nav-card-chips">
            <span className="stat-chip">15 min to 14 days</span>
            <span className="stat-chip">
              {formatNumber(dataset.customers || 2142)} customers
            </span>
          </div>
          <div className="nav-card-bottom">
            <span>Open</span>
            <ArrowRight size={16} />
          </div>
        </Link>

        {/* Card 4: Evidence */}
        <Link to="/evidence" className="nav-card" title="View Statistical Evidence (Press 4)">
          <div className="nav-card-top">
            <div className="nav-card-icon-title">
              <div className="nav-card-icon">
                <BarChart3 size={24} />
              </div>
              <h3 className="nav-card-title">Evidence</h3>
            </div>
            <span className="nav-card-kbd">4</span>
          </div>
          <p className="nav-card-desc">
            Is the difference real? Who benefits?
          </p>
          <div className="nav-card-chips">
            <span className="stat-chip">95% intervals</span>
            <span className="stat-chip">Hybrid strategy</span>
          </div>
          <div className="nav-card-bottom">
            <span>Open</span>
            <ArrowRight size={16} />
          </div>
        </Link>
      </section>

      {/* 4. Footer */}
      <footer className="home-footer">
        Primary model = designed before results were seen. Follow-up = added afterwards.
      </footer>
    </div>
  );
}
