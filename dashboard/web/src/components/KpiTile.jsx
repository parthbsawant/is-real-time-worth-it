import React from 'react';
import Tooltip from './Tooltip';

export default function KpiTile({
  label,
  tooltipTerm,
  value,
  caption,
  compact = false,
  className = '',
}) {
  const renderedLabel = tooltipTerm ? (
    <Tooltip term={tooltipTerm}>{label || tooltipTerm}</Tooltip>
  ) : (
    label
  );

  if (compact) {
    return (
      <div className={`kpi-row-compact ${className}`}>
        <span className="kpi-compact-label">{renderedLabel}</span>
        <strong className="kpi-compact-val">{value}</strong>
      </div>
    );
  }

  return (
    <div className={`kpi-row ${className}`}>
      <span className="kpi-row-label">{renderedLabel}</span>
      <div className="kpi-row-val-group">
        <strong className="kpi-row-val">{value}</strong>
        {caption && <span className="kpi-row-caption">{caption}</span>}
      </div>
    </div>
  );
}
