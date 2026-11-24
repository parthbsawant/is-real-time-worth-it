export const PIPELINE_META = {
  batch_hourly: {
    key: 'batch_hourly',
    label: 'Batch Hourly',
    shortLabel: 'Hourly',
    color: '#E5BE65', // light gold-tan
    type: 'batch',
    cadence: 'every 1 hour',
    description: 'Predictions recomputed on a schedule every 1 hour.',
  },
  batch_daily: {
    key: 'batch_daily',
    label: 'Batch Daily',
    shortLabel: 'Daily',
    color: '#C89437', // medium gold-tan
    type: 'batch',
    cadence: 'every 24 hours',
    description: 'Predictions recomputed on a schedule every 24 hours.',
  },
  batch_weekly: {
    key: 'batch_weekly',
    label: 'Batch Weekly',
    shortLabel: 'Weekly',
    color: '#966324', // dark gold-tan / bronze
    type: 'batch',
    cadence: 'every 7 days',
    description: 'Predictions recomputed on a schedule every 7 days.',
  },
  streaming: {
    key: 'streaming',
    label: 'Real-Time Processing',
    shortLabel: 'Real-Time',
    color: '#7A4E24', // dark brown
    type: 'realtime',
    cadence: 'continuous',
    description: 'Kafka + Redis: prediction updates on every purchase.',
  },
};

export const ORDERED_PIPELINES = ['batch_hourly', 'batch_daily', 'batch_weekly', 'streaming'];

export const THEME = {
  bgCream: '#FBF6EC',
  cardBg: '#FFFFFF',
  goldAccent: '#E3B95B',
  goldBorder: 'rgba(227, 185, 91, 0.45)',
  goldBorderStrong: '#E3B95B',
  brownHeadings: '#7A4E24',
  textDark: '#1E1E1E',
  textMuted: '#685D52',
};
