export const PIPELINE_META = {
  batch_hourly: {
    key: 'batch_hourly',
    label: 'Batch Hourly',
    shortLabel: 'Hourly',
    color: '#CBD5E1', // --hourly
    type: 'batch',
    description: 'Recomputed every 1 hour',
  },
  batch_daily: {
    key: 'batch_daily',
    label: 'Batch Daily',
    shortLabel: 'Daily',
    color: '#94A3B8', // --daily
    type: 'batch',
    description: 'Recomputed every 24 hours',
  },
  batch_weekly: {
    key: 'batch_weekly',
    label: 'Batch Weekly',
    shortLabel: 'Weekly',
    color: '#64748B', // --weekly
    type: 'batch',
    description: 'Recomputed every 7 days',
  },
  streaming: {
    key: 'streaming',
    label: 'Real-Time (Streaming)',
    shortLabel: 'Real-Time',
    color: '#0D9488', // --realtime
    type: 'realtime',
    description: 'Recomputed on every single event',
  },
};

export const ORDERED_PIPELINES = ['batch_hourly', 'batch_daily', 'batch_weekly', 'streaming'];

export const THEME = {
  bg: '#F6F7F8',
  card: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  primary: '#0F172A',
  onPrimary: '#F6F7F8',
  accent: '#2DD4BF',
  border: '#E2E5EA',
  hourly: '#CBD5E1',
  daily: '#94A3B8',
  weekly: '#64748B',
  realtime: '#0D9488',
  realtimeText: '#0F766E',
  focusRing: '#0D9488',
  status: {
    correct: { text: '#166534', bg: '#DCFCE7' },
    top3: { text: '#854D0E', bg: '#FEF9C3' },
    wrong: { text: '#991B1B', bg: '#FEE2E2' },
    neutral: { text: '#374151', bg: '#E2E5EA' },
  },
};
