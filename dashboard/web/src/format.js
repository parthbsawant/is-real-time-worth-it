export function formatGbp(val) {
  if (val == null || isNaN(val)) return '—';
  return `£${Math.round(val).toLocaleString()}`;
}

export function formatPct(val, decimals = 1) {
  if (val == null || isNaN(val)) return '—';
  return `${(val * 100).toFixed(decimals)}%`;
}

export function formatPoints(val, decimals = 1, showSign = true) {
  if (val == null || isNaN(val)) return '—';
  const sign = showSign && val > 0 ? '+' : '';
  return `${sign}${val.toFixed(decimals)} pt`;
}

export function formatNumber(val, decimals = 0) {
  if (val == null || isNaN(val)) return '—';
  if (decimals === 0) return Math.round(val).toLocaleString();
  return Number(val).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatStaleness(hours, kafkaCheck = null) {
  if (hours == null || isNaN(hours)) return '—';
  if (hours <= 0) {
    if (kafkaCheck && kafkaCheck.end_to_end_ms_median != null) {
      return `${Math.round(kafkaCheck.end_to_end_ms_median)} ms`;
    }
    return '13 ms';
  }
  if (hours >= 24) {
    const days = hours / 24;
    return `${days.toFixed(1)} days`;
  }
  if (hours >= 1) {
    return `${hours.toFixed(1)} h`;
  }
  const mins = Math.round(hours * 60);
  return `${mins} min`;
}

export function formatLatency(ms) {
  if (ms == null || isNaN(ms)) return '—';
  if (ms < 0.1) {
    return `${ms.toFixed(3)} ms`;
  }
  if (ms < 1) {
    return `${ms.toFixed(2)} ms`;
  }
  return `${ms.toFixed(2)} ms`;
}

export function formatSeconds(sec) {
  if (sec == null || isNaN(sec)) return '—';
  if (sec < 0.01) return `${(sec * 1000).toFixed(1)} ms`;
  if (sec < 1) return `${sec.toFixed(2)} s`;
  return `${sec.toFixed(2)} s`;
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  return dateStr.split(' ')[0];
}
