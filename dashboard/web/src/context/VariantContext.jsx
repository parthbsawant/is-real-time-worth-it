import React, { createContext, useContext, useState, useEffect } from 'react';

const VariantContext = createContext();

const STORAGE_KEY = 'dashboard_variant_v2';

export function VariantProvider({ children }) {
  const [variant, setVariantState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'base' || saved === 'age') {
        return saved;
      }
    } catch (e) {
      // localStorage unavailable or security blocked
    }
    return 'base';
  });

  const [variantLabels, setVariantLabels] = useState({
    base: 'Primary model',
    age: 'Follow-up: with elapsed-time input',
  });

  // Load variant labels from /api/meta once
  useEffect(() => {
    let active = true;
    fetch('/api/meta')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.variant_labels) {
          setVariantLabels(data.variant_labels);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const setVariant = (newVariant) => {
    setVariantState(newVariant);
    try {
      localStorage.setItem(STORAGE_KEY, newVariant);
    } catch (e) {
      // ignore localStorage write errors
    }
  };

  return (
    <VariantContext.Provider
      value={{
        variant,
        setVariant,
        variantLabels,
      }}
    >
      {children}
    </VariantContext.Provider>
  );
}

export function useVariant() {
  const ctx = useContext(VariantContext);
  if (!ctx) {
    throw new Error('useVariant must be used within a VariantProvider');
  }
  return ctx;
}

export default VariantContext;
