-- Add special_bonuses and bonus_conditions tables for agent bonus/premium system.
-- special_bonuses: one-off special prizes or bonuses an agent received
-- bonus_conditions: goal conditions that track progress toward bonuses (budget-based or manual)

CREATE TABLE IF NOT EXISTS agents.special_bonuses (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  amount      DOUBLE PRECISION NOT NULL,
  received_at DATE NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_special_bonuses_user
  ON agents.special_bonuses(user_id);

CREATE TABLE IF NOT EXISTS agents.bonus_conditions (
  id               SERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  reward_amount    DOUBLE PRECISION NOT NULL,
  condition_type   TEXT NOT NULL CHECK (condition_type IN ('budget', 'manual')),
  budget_threshold DOUBLE PRECISION,
  is_achieved      BOOLEAN NOT NULL DEFAULT FALSE,
  achieved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bonus_conditions_user
  ON agents.bonus_conditions(user_id);
