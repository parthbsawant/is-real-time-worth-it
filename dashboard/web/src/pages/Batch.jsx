import React from 'react';

export default function Batch() {
  return (
    <div className="batch-page">
      <div className="page-header">
        <h1 className="page-title">Batch Processing</h1>
        <p className="page-subtitle">
          Predictions are computed on a schedule and stored. Between runs they get older.
        </p>
      </div>
      <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>
          Batch Processing content will be implemented in Stage B.
        </p>
      </div>
    </div>
  );
}
