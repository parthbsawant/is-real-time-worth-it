import React, { useState, useEffect } from 'react';
import {
  formatGbp,
  formatPct,
} from '../format';
import { fetchCustomers, fetchCustomer, fetchCustomerAt } from '../api';

function formatCategory(cat) {
  if (!cat) return '—';
  return cat
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function CustomerInspector({
  meta,
  variant,
  hours = 24,
}) {
  const [segmentFilter, setSegmentFilter] = useState(0); // 0 = all
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerData, setCustomerData] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);

  // Time slider state
  const testStartTs = meta?.dataset?.test_start_ts || 1316995200;
  const testEndTs = meta?.dataset?.test_end_ts || 1323434940;
  const [currentTs, setCurrentTs] = useState(testStartTs);
  const [atData, setAtData] = useState(null);
  const [atLoading, setAtLoading] = useState(false);

  // Hover tooltip on timeline
  const [hoveredPurchase, setHoveredPurchase] = useState(null);

  // Load customer list on segment / query change
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetchCustomers(segmentFilter, searchQuery, 60, 0);
        if (!active) return;
        setCustomers(res.rows || []);
        if (res.rows && res.rows.length > 0) {
          if (!selectedCustomerId || !res.rows.find((r) => r.customer_id === selectedCustomerId)) {
            setSelectedCustomerId(res.rows[0].customer_id);
          }
        }
      } catch (err) {
        console.error('Failed to load customers:', err);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [segmentFilter, searchQuery]);

  // Load customer details when selectedCustomerId changes
  useEffect(() => {
    if (!selectedCustomerId) return;
    let active = true;
    setCustomerLoading(true);

    fetchCustomer(selectedCustomerId)
      .then((data) => {
        if (!active) return;
        setCustomerData(data);
        const testPurchases = (data.purchases || []).filter((p) => p.in_test_period);
        if (testPurchases.length > 0) {
          setCurrentTs(testPurchases[0].ts);
        } else {
          setCurrentTs(testStartTs);
        }
      })
      .catch((err) => {
        console.error('Failed to load customer:', err);
      })
      .finally(() => {
        if (active) setCustomerLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCustomerId]);

  // Fetch /api/customer/{id}/at when currentTs, hours, or variant change
  useEffect(() => {
    if (!selectedCustomerId || !currentTs) return;
    let active = true;
    setAtLoading(true);

    const timer = setTimeout(() => {
      fetchCustomerAt(selectedCustomerId, currentTs, hours, variant)
        .then((res) => {
          if (active) setAtData(res);
        })
        .catch((err) => {
          console.error('Failed to load customer at ts:', err);
        })
        .finally(() => {
          if (active) setAtLoading(false);
        });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedCustomerId, currentTs, hours, variant]);

  // Jump to next or previous purchase
  const testPurchases = (customerData?.purchases || []).filter((p) => p.in_test_period);

  const handlePrevPurchase = () => {
    if (!testPurchases.length) return;
    const prev = [...testPurchases].reverse().find((p) => p.ts < currentTs);
    if (prev) {
      setCurrentTs(prev.ts);
    } else {
      setCurrentTs(testPurchases[0].ts);
    }
  };

  const handleNextPurchase = () => {
    if (!testPurchases.length) return;
    const next = testPurchases.find((p) => p.ts > currentTs);
    if (next) {
      setCurrentTs(next.ts);
    } else {
      setCurrentTs(testPurchases[testPurchases.length - 1].ts);
    }
  };

  // Timeline SVG calculations
  const categories = meta?.categories || [
    'home_decor',
    'kitchen_dining',
    'stationery',
    'toys_games',
    'gifts_cards',
    'bags_accessories',
    'lighting_candles',
    'garden_outdoor',
    'seasonal_christmas',
    'storage_organizers',
    'jewellery',
    'textiles_linens',
    'party_supplies',
    'other',
  ];

  // SVG Dimensions & Margins
  // padLeft increased to 170px so category labels are completely unclipped (Fix 1)
  const svgWidth = 740;
  const svgHeight = 220;
  const padLeft = 170;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 20;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const minTime = customerData?.purchases?.[0]?.ts
    ? Math.min(customerData.purchases[0].ts, testStartTs - 30 * 86400)
    : testStartTs - 60 * 86400;
  const maxTime = testEndTs;
  const timeSpan = maxTime - minTime || 1;

  function toX(ts) {
    return padLeft + ((ts - minTime) / timeSpan) * plotW;
  }

  function toY(cat) {
    const idx = categories.indexOf(cat);
    const validIdx = idx >= 0 ? idx : categories.length - 1;
    return padTop + (validIdx / (categories.length - 1)) * plotH;
  }

  const testStartX = toX(testStartTs);
  const testEndX = toX(testEndTs);
  const currentCursorX = toX(currentTs);

  const batchPred = atData?.batch;
  const rtPred = atData?.streaming;
  const missedPurchases = atData?.purchases_missed_by_batch || [];
  const nextPurchase = atData?.next_purchase;

  // Maximum purchase amount for radius calculation
  const maxPurchaseAmt = Math.max(
    ...(customerData?.purchases || []).map((p) => p.amount || 0),
    100
  );
  const maxSqrtAmt = Math.sqrt(maxPurchaseAmt);

  return (
    <div className="customer-inspector-panel">
      <div className="panel-header">
        <h3 className="card-title">Customer Inspector</h3>
        <span className="card-subtitle">
          Trace individual purchase trajectories and inspect model predictions at any timestamp
        </span>
      </div>

      {/* 1. Filters & Customer Selection Table */}
      <div className="customer-filter-toolbar">
        <div className="segment-chips-group">
          <span className="filter-chips-label">Segment:</span>
          {[0, 1, 2, 3, 4].map((seg) => (
            <button
              key={seg}
              type="button"
              className={`segment-chip ${segmentFilter === seg ? 'active' : ''}`}
              onClick={() => setSegmentFilter(seg)}
            >
              {seg === 0 ? 'All' : `Q${seg}`}
            </button>
          ))}
        </div>

        <div className="search-box-wrapper">
          <input
            type="text"
            className="customer-search-input"
            placeholder="Search Customer ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Scrollable Customer List Table */}
      <div className="customer-list-table-wrapper">
        <table className="customer-list-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Segment</th>
              <th>Test Purchases</th>
              <th>Total Purchases</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const isSelected = c.customer_id === selectedCustomerId;
              return (
                <tr
                  key={c.customer_id}
                  className={`customer-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedCustomerId(c.customer_id)}
                >
                  <td className="cust-id">
                    <strong>#{c.customer_id}</strong>
                  </td>
                  <td>Q{c.segment}</td>
                  <td>{c.n_test_purchases}</td>
                  <td>{c.n_total_purchases}</td>
                  <td>
                    {isSelected ? (
                      <span className="cust-badge selected">Active</span>
                    ) : (
                      <span className="cust-badge select-action">Select</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 2. Timeline Chart of Selected Customer Purchases */}
      {selectedCustomerId && (
        <div className="customer-timeline-card">
          <div className="timeline-header-row">
            <div className="timeline-title-group">
              <span className="timeline-eyebrow">Purchase History</span>
              <h4 className="timeline-title">
                Customer #{selectedCustomerId} — Segment Q{customerData?.segment || '—'}
              </h4>
            </div>
            <div className="timeline-legend">
              <span className="legend-dot train-dot">● Training</span>
              <span className="legend-dot test-dot">● Test Period</span>
              <span className="legend-shaded">■ Test Window</span>
            </div>
          </div>

          <div className="timeline-svg-wrapper">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="customer-timeline-svg"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Shaded test period region */}
              <rect
                x={testStartX}
                y={padTop}
                width={Math.max(0, testEndX - testStartX)}
                height={plotH}
                fill="rgba(227, 185, 91, 0.18)"
                stroke="rgba(227, 185, 91, 0.5)"
                strokeDasharray="3 3"
              />

              {/* "Test Window" label placed cleanly INSIDE plot area (Fix 1) */}
              <text
                x={testStartX + 8}
                y={padTop + 13}
                fill="#7A4E24"
                fontSize="10"
                fontWeight="700"
              >
                Test Window
              </text>

              {/* Category horizontal grid lines & labels with ample left margin (Fix 1) */}
              {categories.map((cat) => {
                const y = toY(cat);
                return (
                  <g key={cat}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={svgWidth - padRight}
                      y2={y}
                      stroke="rgba(122, 78, 36, 0.08)"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 10}
                      y={y + 3.5}
                      textAnchor="end"
                      fill="#6B5E52"
                      fontSize="10"
                      fontWeight="500"
                    >
                      {formatCategory(cat)}
                    </text>
                  </g>
                );
              })}

              {/* Selected Time (ts) vertical cursor line */}
              <line
                x1={currentCursorX}
                y1={padTop}
                x2={currentCursorX}
                y2={svgHeight - padBottom}
                stroke="#7A4E24"
                strokeWidth="2"
                strokeDasharray="4 3"
              />

              {/* "Selected Time" label moved INSIDE the plot area at the bottom (Fix 1) */}
              <g transform={`translate(${currentCursorX}, ${svgHeight - padBottom - 14})`}>
                <rect
                  x="-38"
                  y="0"
                  width="76"
                  height="14"
                  rx="3"
                  fill="#FBF6EC"
                  stroke="#7A4E24"
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="10.5"
                  textAnchor="middle"
                  fill="#7A4E24"
                  fontSize="9.5"
                  fontWeight="700"
                >
                  Selected Time
                </text>
              </g>

              {/* Purchase Dots: capped radius 3–7px, ~60% opacity (Fix 1) */}
              {(customerData?.purchases || []).map((p, idx) => {
                const cx = toX(p.ts);
                const cy = toY(p.category);
                // Radius capped strictly between 3 and 7 px, scaled by sqrt(amount)
                const sqrtAmt = Math.sqrt(Math.max(0, p.amount || 0));
                const radius = 3 + Math.min(4, (sqrtAmt / Math.max(1, maxSqrtAmt)) * 4);
                const isTest = p.in_test_period;
                const dotColor = isTest ? '#7A4E24' : '#C89437';

                return (
                  <circle
                    key={idx}
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={dotColor}
                    opacity="0.6"
                    stroke="#FFFFFF"
                    strokeWidth="1"
                    className="timeline-purchase-dot"
                    onMouseEnter={() => setHoveredPurchase(p)}
                    onMouseLeave={() => setHoveredPurchase(null)}
                  />
                );
              })}
            </svg>

            {hoveredPurchase && (
              <div className="timeline-tooltip">
                <strong>{formatCategory(hoveredPurchase.category)}</strong>
                <span>Date: {hoveredPurchase.time}</span>
                <span>Amount: {formatGbp(hoveredPurchase.amount, 2)}</span>
                <span>Period: {hoveredPurchase.in_test_period ? 'Test' : 'Training'}</span>
              </div>
            )}
          </div>

          {/* 3. Time Slider across the Test Period */}
          <div className="time-slider-container">
            <div className="time-slider-header">
              <span className="time-slider-title">Evaluation Time Slider:</span>
              <strong className="time-slider-val">{atData?.at_time || '—'}</strong>
            </div>

            <div className="time-slider-controls">
              <button
                type="button"
                className="btn-jump"
                onClick={handlePrevPurchase}
                title="Jump to previous purchase in test period"
              >
                ◀ Jump to prev purchase
              </button>

              <input
                type="range"
                min={testStartTs}
                max={testEndTs}
                value={currentTs}
                onChange={(e) => setCurrentTs(Number(e.target.value))}
                className="time-slider-range"
              />

              <button
                type="button"
                className="btn-jump"
                onClick={handleNextPurchase}
                title="Jump to next purchase in test period"
              >
                Jump to next purchase ▶
              </button>
            </div>
            <span className="time-slider-hint">
              {testPurchases.length} purchases by this customer in test period. Click jump buttons to snap to purchase times.
            </span>
          </div>

          {/* 4. Result Panel: Batch vs Real-time Side by Side */}
          <div className={`at-result-panel ${atLoading ? 'loading-shimmer' : ''}`}>
            <div className="at-columns-grid">
              {/* Batch Column */}
              <div className="at-column batch-col">
                <div className="at-col-header">
                  <div>
                    <h5 className="at-col-title">Batch Model State</h5>
                    <span className="at-col-sub">
                      Last ran {atData?.batch_last_run_time || '—'} ({atData?.batch_age_hours || 0} h ago)
                    </span>
                  </div>

                  {nextPurchase ? (
                    batchPred?.top1_correct ? (
                      <span className="pred-badge correct-top1">✓ correct (top-1)</span>
                    ) : batchPred?.top3_correct ? (
                      <span className="pred-badge in-top3">✓ in top-3</span>
                    ) : (
                      <span className="pred-badge wrong">✕ wrong</span>
                    )
                  ) : (
                    <span className="pred-badge no-next">no later purchase in the data</span>
                  )}
                </div>

                <div className="top-predictions-box">
                  <span className="predictions-heading">Top-3 Predicted Categories:</span>
                  {(batchPred?.top || []).map((t, idx) => (
                    <div key={idx} className="pred-row">
                      <div className="pred-info">
                        <span className="pred-cat">{formatCategory(t.category)}</span>
                        <strong className="pred-prob">{formatPct(t.probability)}</strong>
                      </div>
                      <div className="pred-bar-track">
                        <div
                          className="pred-bar-fill batch"
                          style={{ width: `${Math.min(100, t.probability * 100 * 2.5)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="predicted-clv-row">
                  <span className="clv-label">Predicted CLV:</span>
                  <strong className="clv-val">{formatGbp(batchPred?.predicted_clv)}</strong>
                </div>
              </div>

              {/* Real-Time Column */}
              <div className="at-column rt-col">
                <div className="at-col-header">
                  <div>
                    <h5 className="at-col-title">Real-Time Model State</h5>
                    <span className="at-col-sub">Now (incorporates all purchases up to {atData?.at_time || '—'})</span>
                  </div>

                  {nextPurchase ? (
                    rtPred?.top1_correct ? (
                      <span className="pred-badge correct-top1">✓ correct (top-1)</span>
                    ) : rtPred?.top3_correct ? (
                      <span className="pred-badge in-top3">✓ in top-3</span>
                    ) : (
                      <span className="pred-badge wrong">✕ wrong</span>
                    )
                  ) : (
                    <span className="pred-badge no-next">no later purchase in the data</span>
                  )}
                </div>

                <div className="top-predictions-box">
                  <span className="predictions-heading">Top-3 Predicted Categories:</span>
                  {(rtPred?.top || []).map((t, idx) => (
                    <div key={idx} className="pred-row">
                      <div className="pred-info">
                        <span className="pred-cat">{formatCategory(t.category)}</span>
                        <strong className="pred-prob">{formatPct(t.probability)}</strong>
                      </div>
                      <div className="pred-bar-track">
                        <div
                          className="pred-bar-fill realtime"
                          style={{ width: `${Math.min(100, t.probability * 100 * 2.5)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="predicted-clv-row">
                  <span className="clv-label">Predicted CLV:</span>
                  <strong className="clv-val">{formatGbp(rtPred?.predicted_clv)}</strong>
                </div>
              </div>
            </div>

            {/* Below columns: Purchases missed by batch & Next actual purchase */}
            <div className="at-footer-details">
              {/* Missed purchases by batch */}
              <div className="missed-purchases-block">
                <div className="missed-header">
                  <span className="missed-title">Purchases missed by batch:</span>
                  <span className="missed-highlight">batch has not seen these yet</span>
                </div>
                {missedPurchases.length > 0 ? (
                  <ul className="missed-list">
                    {missedPurchases.map((m, idx) => (
                      <li key={idx} className="missed-item">
                        <span className="missed-time">[{m.time}]</span>
                        <span className="missed-cat">{formatCategory(m.category)}</span>
                        <span className="missed-amt">{formatGbp(m.amount, 2)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="missed-empty">None (batch model is currently synchronized with customer history).</p>
                )}
              </div>

              {/* Next purchase */}
              <div className="next-purchase-block">
                <span className="next-title">Actual Next Purchase:</span>
                {nextPurchase ? (
                  <div className="next-purchase-info">
                    <strong className="next-cat">{formatCategory(nextPurchase.category)}</strong>
                    <span className="next-meta">
                      on {nextPurchase.time} ({formatGbp(nextPurchase.amount, 2)})
                    </span>
                  </div>
                ) : (
                  <span className="next-none">no later purchase in the data</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
