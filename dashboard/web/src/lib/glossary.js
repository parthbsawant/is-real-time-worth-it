export const GLOSSARY = {
  'Top-1 accuracy': "How often the model's first guess for the next product category is right.",
  'Top-3 accuracy': "How often the real next category is among the model's top three guesses.",
  'CLV': 'Customer lifetime value, here the amount a customer spends in the next 90 days.',
  'CLV error (MAE)': 'The average size of the mistake in predicted spend, in pounds. Lower is better.',
  'Staleness': 'How old the information behind a prediction is when the prediction is used.',
  'Model compute': 'CPU time spent running the model to produce all predictions for the test period.',
  'Batch': 'Predictions recomputed on a schedule and stored.',
  'Real-time': 'Predictions recomputed on every purchase immediately.',
  '95% interval': 'The range the true difference is very likely in. If it includes zero, the difference could be chance.',
  'Quartile group': 'Customers split into four equal groups by how often they bought before (Q1 rarest, Q4 most frequent).',
};

export default GLOSSARY;
