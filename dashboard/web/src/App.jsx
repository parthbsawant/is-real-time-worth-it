import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { VariantProvider } from './context/VariantContext';
import AppShell from './components/AppShell';
import Home from './pages/Home';
import Batch from './pages/Batch';
import RealTime from './pages/RealTime';
import Simulator from './pages/Simulator';
import Evidence from './pages/Evidence';

export default function App() {
  return (
    <VariantProvider>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/batch" element={<Batch />} />
            <Route path="/realtime" element={<RealTime />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/evidence" element={<Evidence />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </HashRouter>
    </VariantProvider>
  );
}
