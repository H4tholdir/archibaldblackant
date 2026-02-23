-- Migration 007: FT counter table for sequential invoice numbering per user per fiscal year

CREATE TABLE IF NOT EXISTS agents.ft_counter (
  esercizio   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (esercizio, user_id)
);
