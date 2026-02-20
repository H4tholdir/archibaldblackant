-- Migration 008: FT counter table for progressive invoice numbering
CREATE TABLE IF NOT EXISTS agents.ft_counter (
  esercizio TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (esercizio, user_id)
);
