import React from 'react';

export default function Simulator() {
  return (
    <div className="simulator-page">
      <div className="page-header">
        <h1 className="page-title">Simulator</h1>
        <p className="page-subtitle">
          Change how often batch refreshes and see what real-time would change.
        </p>
      </div>
      <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>
          Refresh Interval and Customer Inspector tabs will be implemented in Stage D.
        </p>
      </div>
    </div>
  );
}
