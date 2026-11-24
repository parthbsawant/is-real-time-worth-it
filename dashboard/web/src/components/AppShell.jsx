import React, { useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useVariant } from '../context/VariantContext';
import { ArrowLeft } from 'lucide-react';

export default function AppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { variant, setVariant, variantLabels } = useVariant();
  const isHome = location.pathname === '/' || location.pathname === '';

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is inside an input, textarea, select or contenteditable
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
        return;
      }

      const key = e.key;
      if (key === 'Escape' || key === 'h' || key === 'H') {
        navigate('/');
      } else if (key === '1') {
        navigate('/batch');
      } else if (key === '2') {
        navigate('/realtime');
      } else if (key === '3') {
        navigate('/simulator');
      } else if (key === '4') {
        navigate('/evidence');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="topbar-left">
          {!isHome && (
            <Link to="/" className="btn-back-dashboard" title="Return to Dashboard (H or Esc)">
              <ArrowLeft size={16} />
              <span>Dashboard</span>
              <span className="kbd-hint">Esc</span>
            </Link>
          )}
          <span className="topbar-app-name">Is Real-Time Worth It?</span>
        </div>

        <div className="topbar-right">
          <div className="model-toggle-wrapper">
            <span className="model-toggle-label">Model:</span>
            <div className="model-segmented-control" role="group" aria-label="Model variant toggle">
              <button
                type="button"
                className={`model-segmented-btn ${variant === 'base' ? 'active' : ''}`}
                onClick={() => setVariant('base')}
              >
                {variantLabels?.base || 'Primary model'}
              </button>
              <button
                type="button"
                className={`model-segmented-btn ${variant === 'age' ? 'active' : ''}`}
                onClick={() => setVariant('age')}
              >
                {variantLabels?.age || 'Follow-up: with elapsed-time input'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
