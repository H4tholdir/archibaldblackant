-- Miglioramenti alle condizioni obiettivo:
-- deadline: scadenza opzionale per condizioni temporanee
-- percent_revenue_rate: per condizioni di tipo percent_revenue (es. 0.005 = 0.5% del fatturato sopra soglia)
ALTER TABLE agents.bonus_conditions
  ADD COLUMN IF NOT EXISTS deadline DATE,
  ADD COLUMN IF NOT EXISTS percent_revenue_rate DOUBLE PRECISION;
