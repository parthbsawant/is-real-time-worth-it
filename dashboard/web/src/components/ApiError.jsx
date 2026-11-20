import React from 'react';

export default function ApiError({ error, onRetry }) {
  return (
    <div className="api-error-card">
      <div className="api-error-icon">⚠️</div>
      <div className="api-error-content">
        <h3 className="api-error-title">API Connection Unavailable</h3>
        <p className="api-error-desc">
          Could not communicate with the Python backend server ({error?.message || 'Network error'}).
        </p>
        <div className="api-error-command-box">
          <span className="api-error-label">Start the API:</span>
          <code>uvicorn dashboard.api.main:app --port 8000</code>
        </div>
        {onRetry && (
          <button className="btn-retry" onClick={onRetry}>
            ↻ Retry Connection
          </button>
        )}
      </div>
    </div>
  );
}
