import React, { useState, useEffect } from 'react';
import TopBar from './components/TopBar';
import Overview from './pages/Overview';
import Simulation from './pages/Simulation';
import LiveReplay from './pages/LiveReplay';
import WhoBenefits from './pages/WhoBenefits';
import ApiError from './components/ApiError';
import { fetchMeta } from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [variant, setVariant] = useState('base');
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState(null);

  const loadMeta = async () => {
    setLoadingMeta(true);
    setMetaError(null);
    try {
      const data = await fetchMeta();
      setMeta(data);
    } catch (err) {
      console.error('Failed to load API meta:', err);
      setMetaError(err);
    } finally {
      setLoadingMeta(false);
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  return (
    <div className="dashboard-app">
      <TopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        variant={variant}
        setVariant={setVariant}
        variantLabels={meta?.variant_labels}
      />

      <main className="dashboard-main-content">
        {metaError && (
          <div className="page-container">
            <ApiError error={metaError} onRetry={loadMeta} />
          </div>
        )}

        {!metaError && activeTab === 'overview' && (
          <Overview variant={variant} meta={meta} />
        )}

        {!metaError && activeTab === 'simulation' && (
          <Simulation variant={variant} meta={meta} />
        )}

        {!metaError && activeTab === 'replay' && (
          <LiveReplay variant={variant} meta={meta} />
        )}

        {!metaError && activeTab === 'benefits' && (
          <WhoBenefits variant={variant} meta={meta} />
        )}
      </main>
    </div>
  );
}
