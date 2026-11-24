import React from 'react';
import KpiTile from './KpiTile';
import Accordion from './Accordion';
import { formatGbp, formatNumber, formatPct, formatSeconds, formatStaleness } from '../lib/format';

export default function PipelineCard({
  title,
  cadenceLabel,
  borderColor,
  pipeline = {},
}) {
  return (
    <div
      className="pipeline-card"
      style={{ borderTop: `4px solid ${borderColor}` }}
    >
      <div className="pipeline-card-header">
        <h3 className="pipeline-card-title">{title}</h3>
        <span className="pipeline-card-cadence">{cadenceLabel}</span>
      </div>

      <div className="pipeline-kpi-rows">
        <KpiTile
          tooltipTerm="Top-1 accuracy"
          label="Top-1 accuracy"
          value={formatPct(pipeline.top1)}
        />
        <KpiTile
          tooltipTerm="CLV error (MAE)"
          label="CLV error (MAE)"
          value={formatGbp(pipeline.clv_mae)}
        />
        <KpiTile
          tooltipTerm="Staleness"
          label="Median staleness"
          value={formatStaleness(pipeline.staleness_hours_median)}
        />
        <KpiTile
          tooltipTerm="Model compute"
          label="Model compute"
          value={formatSeconds(pipeline.seconds)}
        />
      </div>

      <Accordion title="More detail">
        <KpiTile
          compact
          tooltipTerm="Top-3 accuracy"
          label="Top-3 accuracy"
          value={formatPct(pipeline.top3)}
        />
        <KpiTile
          compact
          label="95th % staleness"
          value={formatStaleness(pipeline.staleness_hours_p95)}
        />
        <KpiTile
          compact
          label="Inferences"
          value={formatNumber(pipeline.inferences)}
        />
        <KpiTile
          compact
          label="Macro F1"
          value={pipeline.f1 != null ? `${(pipeline.f1 * 100).toFixed(1)}%` : '—'}
        />
        <KpiTile
          compact
          label="No-history fallbacks"
          value={pipeline.no_history_fallbacks ?? 0}
        />
      </Accordion>
    </div>
  );
}
