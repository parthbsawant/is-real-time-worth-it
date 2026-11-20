import React, { useState } from 'react';

export default function ForestPlot({ significance }) {
  const [metric, setMetric] = useState('top1'); // 'top1' or 'mae'

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

  // SVG coordinate configuration
  const width = 640;
  const height = 190;
  const plotLeft = 145;
  const plotRight = 445;
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
        <div className="metric-toggle-group">
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

      <div className="forest-plot-svg-container">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="forest-plot-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Background guide zones */}
          <rect
            x={plotLeft}
            y="26"
            width={Math.max(0, zeroX - plotLeft)}
            height="115"
            fill="rgba(227, 185, 91, 0.05)"
          />
          <rect
            x={zeroX}
            y="26"
            width={Math.max(0, plotRight - zeroX)}
            height="115"
            fill="rgba(122, 78, 36, 0.06)"
          />

          {/* Directional labels at top */}
          <text
            x={plotLeft + 8}
            y="18"
            className="forest-guide-text batch-better"
            textAnchor="start"
          >
            ← Batch better
          </text>
          <text
            x={zeroX + 8}
            y="18"
            className="forest-guide-text realtime-better"
            textAnchor="start"
          >
            Real-time better →
          </text>

          {/* Vertical Zero Reference Line */}
          <line
            x1={zeroX}
            y1="24"
            x2={zeroX}
            y2="142"
            stroke="#7A4E24"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text x={zeroX} y="156" className="forest-zero-label" textAnchor="middle">
            0
          </text>

          {/* Rows */}
          {rows.map((row, idx) => {
            const y = 48 + idx * 38;
            const xEst = toX(row.estimate);
            const xLow = toX(row.ciLow);
            const xHigh = toX(row.ciHigh);
            const isGrey = row.crossesZero;
            const strokeColor = isGrey ? '#8C8C8C' : '#7A4E24';
            const fillColor = isGrey ? '#8C8C8C' : '#7A4E24';

            const unit = metric === 'top1' ? 'pt' : '£';
            const formattedEst = `${row.estimate >= 0 ? '+' : ''}${row.estimate.toFixed(1)} ${unit}`;
            const formattedCi = `[${row.ciLow.toFixed(1)}, ${row.ciHigh.toFixed(1)}]`;

            return (
              <g key={row.key} className={`forest-row ${isGrey ? 'greyed' : 'significant'}`}>
                {/* Row Label */}
                <text x="12" y={y + 4} className="forest-row-label">
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

                {/* Estimate Point */}
                <circle
                  cx={xEst}
                  cy={y}
                  r="5"
                  fill={fillColor}
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />

                {/* Numerical / Status Annotation */}
                <text x={plotRight + 12} y={y - 2} className="forest-val-text">
                  {formattedEst} <tspan className="forest-ci-text">{formattedCi}</tspan>
                </text>

                {isGrey ? (
                  <text x={plotRight + 12} y={y + 12} className="forest-status-pill grey">
                    not distinguishable from zero
                  </text>
                ) : (
                  <text x={plotRight + 12} y={y + 12} className="forest-status-pill sig">
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
            stroke="rgba(122, 78, 36, 0.3)"
            strokeWidth="1"
          />
        </svg>
      </div>

      <div className="forest-plot-footer">
        <p className="forest-note">
          {metric === 'top1'
            ? 'Points represent Top-1 percentage point differences (Real-Time minus Batch). Horizontal bars depict the 95% bootstrap confidence interval. Intervals crossing the vertical zero line indicate no statistically detectable benefit.'
            : 'Points represent CLV Mean Absolute Error differences (positive indicates Real-Time achieved lower error).'}
        </p>
      </div>
    </div>
  );
}
