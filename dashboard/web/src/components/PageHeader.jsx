import React from 'react';

export default function PageHeader({ title, subtitle, meta, children }) {
  return (
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
      {meta && <p className="page-meta-strip">{meta}</p>}
      {children}
    </div>
  );
}
