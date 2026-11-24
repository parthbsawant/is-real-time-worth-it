import React, { useState } from 'react';
import { formatCiVal, formatCurrencySigned } from '../lib/format';
import { THEME } from '../lib/constants';

export default function ForestPlot({ significance, activeMetric, onMetricChange }) {
  // If controlled from parent via activeMetric, use it; otherwise internal state
  const [internalMetric, setInternalMetric] = useState('top1'); // 'top1' or 'mae'
  const metric = activeMetric !== undefined ? activeMetric : internalMetric;
  const setMetric = onMetricChange || setInternalMetric;

  if (!significance) {
    return <div className="forest-plot-empty">No significance data available.</div>;
  }

  const pipelines = [
    { key: 'batch_hourly', label: 'vs Hourly Batch' },
    { key: 'batch_daily', label: 'vs Daily Batch' },
    { key: 'batch_weekly', label: 'vs Weekly Batch' },
  ];

  const rows = pipelines.map(({ key, label }) => {
    const data = significance[key];
    const points = metric === 'top1' ? data?.top1_gain_points : data?.mae_gain_pounds;
    const [estimate = 0, ciLow = 0, ciHigh = 0] = points || [0, 0, 0];
    const pValue = metric === 'top1' ? data?.p_top1_realtime_better : data?.p_mae_realtime_better;
    // CI crosses zero if low <= 0 and high >= 0
    const crossesZero = ciLow <= 0 && ciHigh >= 0;
    return {
      key,
      label,
      estimate,
      ciLow,
      ciHigh,
      crossesZero,
      pValue,
    };
  });

  // Calculate X-axis bounds with padding
  const allValues = rows.flatMap((r) => [r.ciLow, r.ciHigh, r.estimate, 0]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;
  const padding = range * 0.15;
  const domainMin = minVal - padding;
  const domainMax = maxVal + padding;
  const totalDomain = domainMax - domainMin;

  // SVG coordinate configuration - wide enough for clear labels and no clipping
  const width = 680;
  const height = 190;
  const plotLeft = 145;
  const plotRight = 435;
  const plotWidth = plotRight - plotLeft;

  function toX(val) {
    return plotLeft + ((val - domainMin) / totalDomain) * plotWidth;
  }

  const zeroX = toX(0);

  return (
    <div className="forest-plot-card">
      <div className="forest-plot-header">
        <div className="forest-plot-title-group">
          <h3 className="card-title">Is the difference real?</h3>
          <span className="card-subtitle">
            95% bootstrap confidence intervals for Real-Time gain over batch
          </span>
        </div>
        <div className="metric-toggle-group" role="group" aria-label="Significance metric toggle">
          <button
            type="button"
            className={`metric-toggle-btn ${metric === 'top1' ? 'active' : ''}`}
            onClick={() => setMetric('top1')}
          >
            Top-1 Gain (pt)
          </button>
          <button
            type="button"
            className={`metric-toggle-btn ${metric === 'mae' ? 'active' : ''}`}
            onClick={() => setMetric('mae')}
          >
            CLV MAE Gain (£)
          </button>
        </div>
      </div>

      <p className="forest-how-to-read">
        How to read this: A dot right of the line means real-time is better. If the bar touches the line, it could be chance.
      </p>

      <div className="forest-plot-svg-container">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="forest-plot-svg"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Forest plot showing 95% confidence intervals"
        >
          {/* Background guide zones */}
          <rect
            x={plotLeft}
            y="26"
            width={Math.max(0, zeroX - plotLeft)}
            height="115"
            fill="rgba(148, 163, 184, 0.08)"
          />
          <rect
            x={zeroX}
            y="26"
            width={Math.max(0, plotRight - zeroX)}
            height="115"
            fill="rgba(13, 148, 136, 0.08)"
          />

          {/* Directional labels at top - anchored to opposite ends so they never overlap */}
          <text
            x={plotLeft}
            y="18"
            className="forest-guide-text batch-better"
            textAnchor="start"
            fill={THEME.muted}
            fontSize="14"
            fontWeight="500"
          >
            ← Batch better
          </text>
          <text
            x={plotRight}
            y="18"
            className="forest-guide-text realtime-better"
            textAnchor="end"
            fill={THEME.realtimeText}
            fontSize="14"
            fontWeight="600"
          >
            Real-time better →
          </text>

          {/* Vertical Zero Reference Line */}
          <line
            x1={zeroX}
            y1="24"
            x2={zeroX}
            y2="142"
            stroke={THEME.muted}
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text
            x={zeroX}
            y="156"
            className="forest-zero-label"
            textAnchor="middle"
            fill={THEME.text}
            fontSize="14"
            fontWeight="500"
          >
            0
          </text>

          {/* Rows */}
          {rows.map((row, idx) => {
            const y = 48 + idx * 38;
            const xEst = toX(row.estimate);
            const xLow = toX(row.ciLow);
            const xHigh = toX(row.ciHigh);
            const isGrey = row.crossesZero;
            const strokeColor = isGrey ? THEME.muted : THEME.realtime;
            const fillColor = isGrey ? THEME.muted : THEME.realtime;

            const formattedEst = metric === 'top1'
              ? `${formatCiVal(row.estimate, 2, true)} pt`
              : formatCurrencySigned(row.estimate, 2);
            const formattedCi = metric === 'top1'
              ? `[${formatCiVal(row.ciLow, 2, true)}, ${formatCiVal(row.ciHigh, 2, true)}]`
              : `[${formatCurrencySigned(row.ciLow, 2)}, ${formatCurrencySigned(row.ciHigh, 2)}]`;

            return (
              <g key={row.key} className={`forest-row ${isGrey ? 'greyed' : 'significant'}`}>
                {/* Row Label */}
                <text
                  x="12"
                  y={y + 5}
                  className="forest-row-label"
                  fill={THEME.text}
                  fontSize="14"
                  fontWeight="600"
                >
                  {row.label}
                </text>

                {/* CI horizontal line */}
                <line
                  x1={xLow}
                  y1={y}
                  x2={xHigh}
                  y2={y}
                  stroke={strokeColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Left and Right CI Tick Caps */}
                <line
                  x1={xLow}
                  y1={y - 5}
                  x2={xLow}
                  y2={y + 5}
                  stroke={strokeColor}
                  strokeWidth="2"
                />
                <line
                  x1={xHigh}
                  y1={y - 5}
                  x2={xHigh}
                  y2={y + 5}
                  stroke={strokeColor}
                  strokeWidth="2"
                />

                {/* Estimate Point (Real-Time dot) */}
                <circle
                  cx={xEst}
                  cy={y}
                  r="5"
                  fill={fillColor}
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />

                {/* Numerical Annotation */}
                <text
                  x={plotRight + 12}
                  y={y - 2}
                  className="forest-val-text"
                  fill={THEME.text}
                  fontSize="14"
                  fontWeight="600"
                >
                  {formattedEst}{' '}
                  <tspan fill={THEME.muted} fontWeight="400" fontSize="14">
                    {formattedCi}
                  </tspan>
                </text>

                {/* Status Annotation */}
                {isGrey ? (
                  <text
                    x={plotRight + 12}
                    y={y + 13}
                    className="forest-status-pill grey"
                    fill={THEME.muted}
                    fontSize="14"
                  >
                    not distinguishable from zero
                  </text>
                ) : (
                  <text
                    x={plotRight + 12}
                    y={y + 13}
                    className="forest-status-pill sig"
                    fill={THEME.realtimeText}
                    fontSize="14"
                    fontWeight="600"
                  >
                    statistically significant
                  </text>
                )}
              </g>
            );
          })}

          {/* Bottom X-axis line */}
          <line
            x1={plotLeft}
            y1="142"
            x2={plotRight}
            y2="142"
            stroke={THEME.border}
            strokeWidth="1"
          />
        </svg>
      </div>

      <div className="forest-plot-footer">
        <p className="forest-note">
          {metric === 'top1'
            ? 'Points show Top-1 percentage point differences (Real-Time minus Batch) with 95% bootstrap confidence intervals. Intervals spanning zero indicate no statistically detectable accuracy benefit.'
            : 'Points show CLV Mean Absolute Error differences (positive indicates Real-Time achieved lower error by that amount in £).'}
        </p>
      </div>
    </div>
  );
}
