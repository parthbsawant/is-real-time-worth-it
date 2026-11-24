import { useState } from 'react';
import { useVariant } from '../context/VariantContext';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import ApiError from '../components/ApiError';
import IntervalTab from './simulator/IntervalTab';
import CustomerTab from './simulator/CustomerTab';
import '../styles/simulator.css';

export default function Simulator() {
  const { variant } = useVariant();
  const { data: meta, error: metaError, refetch: refetchMeta } = useApi('/api/meta');
  const [activeTab, setActiveTab] = useState('interval'); // 'interval' | 'customer'

  if (metaError) {
    return <ApiError error={metaError} onRetry={refetchMeta} />;
  }

  return (
    <div className="simulator-page">
      <PageHeader
        title="Simulator"
        subtitle="Change how often batch refreshes and see what real-time would change."
      />

      {/* Tabs Segmented Control */}
      <div className="sim-tabs-wrapper">
        <div className="sim-tabs-control" role="tablist" aria-label="Simulator modes">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'interval'}
            className={`sim-tab-btn ${activeTab === 'interval' ? 'active' : ''}`}
            onClick={() => setActiveTab('interval')}
          >
            Refresh interval
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'customer'}
            className={`sim-tab-btn ${activeTab === 'customer' ? 'active' : ''}`}
            onClick={() => setActiveTab('customer')}
          >
            Customer
          </button>
        </div>
      </div>

      {/* Active Tab View */}
      {activeTab === 'interval' ? (
        <IntervalTab variant={variant} />
      ) : (
        <CustomerTab variant={variant} meta={meta} />
      )}
    </div>
  );
}
