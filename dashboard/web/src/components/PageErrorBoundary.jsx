import React, { Component } from 'react';
import { Link } from 'react-router-dom';

export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Page error caught by PageErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center', maxWidth: 640, margin: '40px auto' }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--primary)', marginBottom: 12 }}>
            This page hit a problem.
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 16, marginBottom: 24, lineHeight: 1.5 }}>
            An unexpected error occurred while rendering this view.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
            <button
              type="button"
              className="btn-ctrl btn-primary-ctrl"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <Link
              to="/"
              className="btn-ctrl btn-secondary-ctrl"
              onClick={() => this.setState({ hasError: false })}
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
