import React, { useState, useRef, useEffect } from 'react';
import { GLOSSARY } from '../lib/glossary';

export default function Tooltip({ term, text, children }) {
  const [visible, setVisible] = useState(false);
  const def = text || (term ? GLOSSARY[term] : '') || '';
  const triggerRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (visible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 6,
        left: Math.max(10, Math.min(window.innerWidth - 290, rect.left + window.scrollX - 40)),
      });
    }
  }, [visible]);

  if (!def) {
    return children || term || null;
  }

  return (
    <span
      ref={triggerRef}
      className="term-with-tooltip"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      tabIndex={0}
      role="button"
      aria-label={`Definition for ${term || 'term'}`}
    >
      {children || term}
      <span className="tooltip-trigger-icon" aria-hidden="true">
        ?
      </span>
      {visible && (
        <span
          className="tooltip-popover"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            position: 'absolute',
          }}
          role="tooltip"
        >
          {def}
        </span>
      )}
    </span>
  );
}
