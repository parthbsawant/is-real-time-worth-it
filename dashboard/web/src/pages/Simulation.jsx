import React, { useState } from 'react';
import IntervalExplorer from '../components/IntervalExplorer';
import CustomerInspector from '../components/CustomerInspector';

export default function Simulation({ variant, meta }) {
  const [hours, setHours] = useState(24);

  return (
    <div className="page-container page-simulation">
      <div className="simulation-layout-grid">
        {/* Left Half: Interval Explorer */}
        <div className="simulation-col left-col">
          <IntervalExplorer
            variant={variant}
            hours={hours}
            setHours={setHours}
          />
        </div>

        {/* Right Half: Customer Inspector */}
        <div className="simulation-col right-col">
          <CustomerInspector
            meta={meta}
            variant={variant}
            hours={hours}
          />
        </div>
      </div>
    </div>
  );
}
