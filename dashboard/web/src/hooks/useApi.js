import { useState, useEffect, useCallback, useRef } from 'react';

const memoryCache = new Map();

/**
 * useApi(url, options)
 * Fetches JSON from `url` with in-memory caching keyed by url.
 */
export function useApi(url, options = {}) {
  const { skip = false, ttl = 60000 } = options;
  const [data, setData] = useState(() => (url && memoryCache.has(url) ? memoryCache.get(url).data : null));
  const [loading, setLoading] = useState(() => (url && !memoryCache.has(url) && !skip));
  const [error, setError] = useState(null);

  const activeUrlRef = useRef(url);
  activeUrlRef.current = url;

  const executeFetch = useCallback(async (forced = false) => {
    if (!url || skip) return;

    const cached = memoryCache.get(url);
    const now = Date.now();

    if (!forced && cached && now - cached.timestamp < ttl) {
      setData(cached.data);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`API error: HTTP ${res.status} for ${url}`);
      }
      const json = await res.json();
      if (activeUrlRef.current === url) {
        memoryCache.set(url, { data: json, timestamp: Date.now() });
        setData(json);
        setLoading(false);
      }
    } catch (err) {
      if (activeUrlRef.current === url) {
        setError(err);
        setLoading(false);
      }
    }
  }, [url, skip, ttl]);

  useEffect(() => {
    executeFetch();
  }, [executeFetch]);

  const refetch = useCallback(() => {
    return executeFetch(true);
  }, [executeFetch]);

  return { data, loading, error, refetch };
}

export function clearApiCache() {
  memoryCache.clear();
}
