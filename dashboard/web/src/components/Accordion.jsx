import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function Accordion({
  title = 'More detail',
  defaultOpen = false,
  children,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`accordion-wrapper ${className}`}>
      <button
        type="button"
        className="accordion-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <span className="accordion-title">{title}</span>
        <ChevronDown
          size={18}
          className={`accordion-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>
      {isOpen && <div className="accordion-content">{children}</div>}
    </div>
  );
}
