export async function fetchMeta() {
  const res = await fetch('/api/meta');
  if (!res.ok) {
    throw new Error(`Failed to load metadata (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchOverview(variant = 'base') {
  const res = await fetch(`/api/overview?variant=${encodeURIComponent(variant)}`);
  if (!res.ok) {
    throw new Error(`Failed to load overview data (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchInterval(hours = 24, variant = 'base') {
  const res = await fetch(`/api/interval?hours=${encodeURIComponent(hours)}&variant=${encodeURIComponent(variant)}`);
  if (!res.ok) {
    throw new Error(`Failed to load interval data (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchCustomers(segment = 0, q = '', limit = 50, offset = 0) {
  const params = new URLSearchParams();
  if (segment) params.set('segment', segment);
  if (q) params.set('q', q);
  params.set('limit', limit);
  params.set('offset', offset);
  const res = await fetch(`/api/customers?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to load customers (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchCustomer(cid) {
  const res = await fetch(`/api/customer/${encodeURIComponent(cid)}`);
  if (!res.ok) {
    throw new Error(`Failed to load customer ${cid} (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchCustomerAt(cid, ts, hours = 24, variant = 'base') {
  const params = new URLSearchParams({
    ts,
    hours,
    variant,
  });
  const res = await fetch(`/api/customer/${encodeURIComponent(cid)}/at?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to load customer snapshot (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchReplay() {
  const res = await fetch('/api/replay');
  if (!res.ok) {
    throw new Error(`Failed to load replay events (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchHybrid(topPct = 25, batch = 'batch_daily', variant = 'base') {
  const params = new URLSearchParams({
    top_pct: topPct,
    batch,
    variant,
  });
  const res = await fetch(`/api/hybrid?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to load hybrid strategy evaluation (HTTP ${res.status})`);
  }
  return res.json();
}
