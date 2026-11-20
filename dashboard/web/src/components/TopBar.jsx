import React from 'react';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'replay', label: 'Live Replay' },
  { id: 'benefits', label: 'Who Benefits' },
];

export default function TopBar({
  activeTab,
  setActiveTab,
  variant,
  setVariant,
  variantLabels = {
    base: 'Primary model',
    age: 'Follow-up: with elapsed-time input',
  },
}) {
  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <div className="seminar-title-group">
          <h1 className="seminar-title">Is Real-Time Worth It?</h1>
          <span className="seminar-subtitle">Freshness vs Cost in Sequential Recommendation</span>
        </div>

        <nav className="top-bar-nav" aria-label="Dashboard pages">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="top-bar-right">
        <div className="model-toggle-container">
          <div className="model-toggle-wrapper">
            <label htmlFor="model-variant-select" className="model-toggle-label">
              Model:
            </label>
            <div className="segmented-control" role="group" aria-label="Model variant toggle">
              <button
                type="button"
                className={`segmented-btn ${variant === 'base' ? 'active' : ''}`}
                onClick={() => setVariant('base')}
              >
                {variantLabels.base || 'Primary model'}
              </button>
              <button
                type="button"
                className={`segmented-btn ${variant === 'age' ? 'active' : ''}`}
                onClick={() => setVariant('age')}
              >
                {variantLabels.age || 'Follow-up: with elapsed-time input'}
              </button>
            </div>
          </div>
          <p className="model-toggle-caption">
            Primary = designed before results were seen. Follow-up = added afterwards.
          </p>
        </div>
      </div>
    </header>
  );
}
