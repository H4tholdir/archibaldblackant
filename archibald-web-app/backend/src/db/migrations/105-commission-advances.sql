-- Anticipi extra provvigioni richiesti dall'agente.
-- Questi vengono scalati dal conguaglio di fine anno
-- (separati dal monthly_advance fisso mensile).
CREATE TABLE IF NOT EXISTS agents.commission_advances (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  amount      DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  description TEXT,
  advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_advances_user ON agents.commission_advances(user_id);
