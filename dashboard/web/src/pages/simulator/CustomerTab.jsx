import { useState, useEffect, useRef } from 'react';
import { Search, ChevronLeft, ChevronRight, Check, X, Award, AlertCircle, Info } from 'lucide-react';
import { fetchCustomers, fetchCustomer, fetchCustomerAt } from '../../api';
import { formatGbp, formatPct } from '../../lib/format';
import { THEME } from '../../constants';

export default function CustomerTab({ variant = 'base', meta = null }) {
  const [suggestionCustomers, setSuggestionCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('14911');
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState(0); // 0 = all

  // Customer detailed data
  const [customerData, setCustomerData] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);

  // Time & snapshot state
  const testStartTs = meta?.dataset?.test_start_ts || 1316995200;
  const testEndTs = meta?.dataset?.test_end_ts || 1323434940;
  const [currentTs, setCurrentTs] = useState(testStartTs);
  const [batchHours, setBatchHours] = useState(24); // 1, 24, 168

  // Snapshot response from /api/customer/{id}/at
  const [atData, setAtData] = useState(null);
  const [atLoading, setAtLoading] = useState(false);

  // Timeline hover
  const [hoveredDot, setHoveredDot] = useState(null);

  // Load top 8 active customers on mount
  useEffect(() => {
    let active = true;
    fetchCustomers(0, '', 8, 0)
      .then((res) => {
        if (active && res?.rows) {
          setSuggestionCustomers(res.rows);
        }
      })
      .catch((err) => console.error('Failed to load suggestion customers:', err));

    return () => {
      active = false;
    };
  }, []);

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
          // Snap to first test purchase
          setCurrentTs(testPurchases[0].ts);
        } else {
          setCurrentTs(testStartTs);
        }
      })
      .catch((err) => console.error('Failed to load customer:', err))
      .finally(() => {
        if (active) setCustomerLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCustomerId, testStartTs]);

  // Load snapshot when currentTs, batchHours, or variant changes (debounced ~150ms)
  useEffect(() => {
    if (!selectedCustomerId || !currentTs) return;
    let active = true;
    setAtLoading(true);

    const timer = setTimeout(() => {
      fetchCustomerAt(selectedCustomerId, currentTs, batchHours, variant)
        .then((res) => {
          if (active) setAtData(res);
        })
        .catch((err) => console.error('Failed to load customer snapshot:', err))
        .finally(() => {
          if (active) setAtLoading(false);
        });
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedCustomerId, currentTs, batchHours, variant]);

  const allPurchases = customerData?.purchases || [];
  const testPurchases = allPurchases.filter((p) => p.in_test_period);

  // Timeline geometry
  const minTs = allPurchases.length > 0 ? Math.min(allPurchases[0].ts, testStartTs) : testStartTs;
  const maxTs = testEndTs;
  const timeSpan = Math.max(1, maxTs - minTs);

  const getX = (ts) => {
    const clamped = Math.max(minTs, Math.min(maxTs, ts));
    return ((clamped - minTs) / timeSpan) * 100;
  };

  // Nav snap to prev/next purchase in test period
  const handlePrevPurchase = () => {
    if (!testPurchases.length) return;
    const prev = [...testPurchases].reverse().find((p) => p.ts < currentTs);
    if (prev) setCurrentTs(prev.ts);
    else setCurrentTs(testPurchases[0].ts);
  };

  const handleNextPurchase = () => {
    if (!testPurchases.length) return;
    const next = testPurchases.find((p) => p.ts > currentTs);
    if (next) setCurrentTs(next.ts);
    else setCurrentTs(testPurchases[testPurchases.length - 1].ts);
  };

  const batchSnapshot = atData?.batch;
  const streamingSnapshot = atData?.streaming;
  const missedPurchases = atData?.purchases_missed_by_batch || [];
  const nextPurchase = atData?.next_purchase;

  return (
    <div className="sim-tab-content">
      {/* Step 1: Pick a customer */}
      <section className="customer-step-card" aria-label="Step 1: Pick a customer">
        <h3 className="step-heading">1. Pick a customer</h3>

        <div className="customer-search-row">
          <div className="customer-search-box">
            <Search size={18} color="var(--muted)" />
            <input
              type="text"
              placeholder="Enter customer ID (e.g. 14096)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  setSelectedCustomerId(searchQuery.trim());
                }
              }}
              className="customer-search-input"
              aria-label="Search customer ID"
            />
          </div>

          <div className="customer-chips-row" role="group" aria-label="Top active customer suggestions">
            <span style={{ fontSize: '13.5px', color: 'var(--muted)', fontWeight: 600 }}>Most active:</span>
            {suggestionCustomers.map((c) => (
              <button
                key={c.customer_id}
                type="button"
                className={`customer-chip-btn ${selectedCustomerId === c.customer_id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedCustomerId(c.customer_id);
                  setSearchQuery('');
                }}
              >
                #{c.customer_id} ({c.n_test_purchases} orders)
              </button>
            ))}
            {/* Direct button for demo customer 14096 */}
            <button
              type="button"
              className={`customer-chip-btn ${selectedCustomerId === '14096' ? 'active' : ''}`}
              onClick={() => {
                setSelectedCustomerId('14096');
                setSearchQuery('');
              }}
            >
              #14096 (Demo)
            </button>
          </div>
        </div>

        {customerData && (
          <div className="customer-summary-pill">
            Customer #{selectedCustomerId} · segment Q{customerData.segment} · {testPurchases.length} purchases in the test period
          </div>
        )}
      </section>

      {/* Step 2: Pick a moment */}
      <section className="customer-step-card" aria-label="Step 2: Pick a moment">
        <h3 className="step-heading">2. Pick a moment</h3>

        {/* Timeline SVG */}
        <div className="timeline-strip-container">
          <svg className="timeline-svg" viewBox="0 0 1000 84" preserveAspectRatio="none">
            {/* Shaded test window */}
            <rect
              x={getX(testStartTs) * 10}
              y={0}
              width={(getX(testEndTs) - getX(testStartTs)) * 10}
              height={84}
              fill="rgba(15, 23, 42, 0.05)"
            />

            {/* Test window boundary label */}
            <text
              x={getX(testStartTs) * 10 + 6}
              y={18}
              fill="var(--muted)"
              fontSize="11"
              fontWeight="700"
            >
              TEST PERIOD START
            </text>

            {/* Batch last ran vertical dashed line */}
            {atData?.batch_last_run && (
              <line
                x1={getX(atData.batch_last_run) * 10}
                y1={0}
                x2={getX(atData.batch_last_run) * 10}
                y2={84}
                stroke={THEME.primary}
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            )}

            {/* Selected time vertical solid line */}
            <line
              x1={getX(currentTs) * 10}
              y1={0}
              x2={getX(currentTs) * 10}
              y2={84}
              stroke={THEME.accent}
              strokeWidth={3}
            />

            {/* Customer purchases 5px dots */}
            {allPurchases.map((p, idx) => {
              const cx = getX(p.ts) * 10;
              const isTest = p.in_test_period;
              const isSelected = Math.abs(p.ts - currentTs) < 300;

              return (
                <circle
                  key={idx}
                  cx={cx}
                  cy={50}
                  r={isSelected ? 6 : 5}
                  fill={isTest ? THEME.primary : THEME.muted}
                  stroke={isSelected ? THEME.accent : '#FFFFFF'}
                  strokeWidth={isSelected ? 2 : 1}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setCurrentTs(p.ts)}
                  onMouseEnter={() => setHoveredDot(p)}
                  onMouseLeave={() => setHoveredDot(null)}
                />
              );
            })}
          </svg>
        </div>

        {/* Hover info tooltip */}
        {hoveredDot && (
          <div style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 600 }}>
            Purchase: {hoveredDot.time} · {hoveredDot.category.replace(/_/g, ' ')} · £{hoveredDot.amount.toFixed(2)}
          </div>
        )}

        {/* Timeline Controls */}
        <div className="timeline-controls-row">
          <div className="timeline-slider-group">
            <input
              type="range"
              min={testStartTs}
              max={testEndTs}
              value={currentTs}
              onChange={(e) => setCurrentTs(Number(e.target.value))}
              className="timeline-slider-input"
              aria-label="Timestamp slider"
            />
          </div>

          <div className="timeline-nav-btns">
            <button
              type="button"
              className="btn-nav-purchase"
              onClick={handlePrevPurchase}
              disabled={!testPurchases.length || currentTs <= testPurchases[0].ts}
            >
              <ChevronLeft size={16} />
              <span>Previous purchase</span>
            </button>

            <button
              type="button"
              className="btn-nav-purchase"
              onClick={handleNextPurchase}
              disabled={!testPurchases.length || currentTs >= testPurchases[testPurchases.length - 1].ts}
            >
              <span>Next purchase</span>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Batch cadence selector */}
          <div className="cadence-select-group">
            <span style={{ fontSize: '13.5px', color: 'var(--muted)', fontWeight: 600 }}>Batch interval:</span>
            <div className="metric-segmented-control" role="group" aria-label="Cadence selector">
              {[
                { h: 1, label: 'Hourly (1 h)' },
                { h: 24, label: 'Daily (24 h)' },
                { h: 168, label: 'Weekly (168 h)' },
              ].map(({ h, label }) => (
                <button
                  key={h}
                  type="button"
                  className={`metric-segmented-btn ${batchHours === h ? 'active' : ''}`}
                  onClick={() => setBatchHours(h)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {atData && (
          <div style={{ display: 'flex', gap: 20, fontSize: '13.5px', color: 'var(--muted)' }}>
            <span>Selected time: <strong style={{ color: 'var(--primary)' }}>{atData.at_time}</strong></span>
            <span>Batch last ran: <strong style={{ color: 'var(--primary)' }}>{atData.batch_last_run_time} ({atData.batch_age_hours} h ago)</strong></span>
          </div>
        )}
      </section>

      {/* Step 3: Compare pipelines */}
      <section className="customer-step-card" aria-label="Step 3: Compare pipelines at this moment">
        <h3 className="step-heading">3. Compare pipelines at this moment</h3>

        {(!batchSnapshot && !streamingSnapshot) ? (
          <div className="card" style={{ padding: '36px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', fontSize: '16px' }}>
              Not enough purchase history at this moment to generate an inference.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Two Comparison Columns */}
            <div className="compare-columns-grid">
              {/* Batch Column */}
              <div className="compare-column-card">
                <div className="compare-column-header">
                  <div className="compare-col-title-group">
                    <h4 className="compare-col-title">Batch ({batchHours === 1 ? 'Hourly' : batchHours === 24 ? 'Daily' : 'Weekly'})</h4>
                    <span className="compare-col-subtitle">
                      Last ran {atData?.batch_last_run_time} ({atData?.batch_age_hours} h ago)
                    </span>
                  </div>

                  {batchSnapshot && (
                    <div>
                      {nextPurchase == null ? (
                        <span className="status-badge status-badge-first">No later purchase</span>
                      ) : batchSnapshot.top1_correct ? (
                        <span className="status-badge status-badge-correct">
                          <Check size={14} /> Correct
                        </span>
                      ) : batchSnapshot.top3_correct ? (
                        <span className="status-badge status-badge-wrong" style={{ backgroundColor: 'var(--badge-top3-bg)', color: 'var(--badge-top3-text)' }}>
                          <Award size={14} /> In top 3
                        </span>
                      ) : (
                        <span className="status-badge status-badge-wrong">
                          <X size={14} /> Wrong
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {batchSnapshot ? (
                  <>
                    <div className="prob-bars-list">
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Top-3 Predicted Categories
                      </span>
                      {batchSnapshot.top.map((item, i) => (
                        <div key={i} className="prob-bar-row">
                          <div className="prob-bar-label-line">
                            <span className="prob-bar-cat">{item.category.replace(/_/g, ' ')}</span>
                            <span className="prob-bar-pct">{formatPct(item.probability)}</span>
                          </div>
                          <div className="prob-bar-track">
                            <div
                              className="prob-bar-fill"
                              style={{ width: `${Math.min(100, item.probability * 250)}%`, backgroundColor: THEME.daily }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="predicted-spend-line">
                      Predicted spend, next 90 days: {formatGbp(batchSnapshot.predicted_clv)}
                    </div>
                  </>
                ) : (
                  <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Not enough history for batch.</p>
                )}
              </div>

              {/* Real-Time Column */}
              <div className="compare-column-card">
                <div className="compare-column-header">
                  <div className="compare-col-title-group">
                    <h4 className="compare-col-title">Real-Time</h4>
                    <span className="compare-col-subtitle">
                      Includes everything up to {atData?.at_time}
                    </span>
                  </div>

                  {streamingSnapshot && (
                    <div>
                      {nextPurchase == null ? (
                        <span className="status-badge status-badge-first">No later purchase</span>
                      ) : streamingSnapshot.top1_correct ? (
                        <span className="status-badge status-badge-correct">
                          <Check size={14} /> Correct
                        </span>
                      ) : streamingSnapshot.top3_correct ? (
                        <span className="status-badge status-badge-wrong" style={{ backgroundColor: 'var(--badge-top3-bg)', color: 'var(--badge-top3-text)' }}>
                          <Award size={14} /> In top 3
                        </span>
                      ) : (
                        <span className="status-badge status-badge-wrong">
                          <X size={14} /> Wrong
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {streamingSnapshot ? (
                  <>
                    <div className="prob-bars-list">
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Top-3 Predicted Categories
                      </span>
                      {streamingSnapshot.top.map((item, i) => (
                        <div key={i} className="prob-bar-row">
                          <div className="prob-bar-label-line">
                            <span className="prob-bar-cat">{item.category.replace(/_/g, ' ')}</span>
                            <span className="prob-bar-pct">{formatPct(item.probability)}</span>
                          </div>
                          <div className="prob-bar-track">
                            <div
                              className="prob-bar-fill"
                              style={{ width: `${Math.min(100, item.probability * 250)}%`, backgroundColor: THEME.realtime }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="predicted-spend-line">
                      Predicted spend, next 90 days: {formatGbp(streamingSnapshot.predicted_clv)}
                    </div>
                  </>
                ) : (
                  <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Not enough history for real-time.</p>
                )}
              </div>
            </div>

            {/* Missed purchases banner */}
            <div className="missed-purchases-banner">
              {missedPurchases.length > 0 ? (
                <>
                  <div className="missed-banner-title">
                    Purchases the batch has not seen yet ({missedPurchases.length}):
                  </div>
                  <div className="missed-purchases-list">
                    {missedPurchases.map((mp, idx) => (
                      <span key={idx} className="missed-purchase-chip">
                        {mp.time} · {mp.category.replace(/_/g, ' ')} · £{mp.amount.toFixed(2)}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: '14px', fontWeight: 600 }}>
                  Batch is up to date (no purchases between {atData?.batch_last_run_time} and {atData?.at_time})
                </div>
              )}
            </div>

            {/* Ground truth line */}
            <div className="actual-next-purchase-card">
              {nextPurchase ? (
                <span>
                  What they actually bought next: <strong>{nextPurchase.category.replace(/_/g, ' ')}</strong> on <strong>{nextPurchase.time}</strong> (£{nextPurchase.amount.toFixed(2)}, one order)
                </span>
              ) : (
                <span style={{ color: 'var(--muted)' }}>
                  No subsequent purchase in the dataset for this customer.
                </span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
