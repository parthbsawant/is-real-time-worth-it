import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { VariantProvider } from './context/VariantContext';
import AppShell from './components/AppShell';
import PageErrorBoundary from './components/PageErrorBoundary';
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
            <Route
              path="/"
              element={
                <PageErrorBoundary>
                  <Home />
                </PageErrorBoundary>
              }
            />
            <Route
              path="/batch"
              element={
                <PageErrorBoundary>
                  <Batch />
                </PageErrorBoundary>
              }
            />
            <Route
              path="/realtime"
              element={
                <PageErrorBoundary>
                  <RealTime />
                </PageErrorBoundary>
              }
            />
            <Route
              path="/simulator"
              element={
                <PageErrorBoundary>
                  <Simulator />
                </PageErrorBoundary>
              }
            />
            <Route
              path="/evidence"
              element={
                <PageErrorBoundary>
                  <Evidence />
                </PageErrorBoundary>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </HashRouter>
    </VariantProvider>
  );
}
