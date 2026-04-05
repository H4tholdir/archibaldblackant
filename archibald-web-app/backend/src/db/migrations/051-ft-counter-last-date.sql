-- Migration 051: Add last_date to agents.ft_counter for chronological date ordering
ALTER TABLE agents.ft_counter ADD COLUMN IF NOT EXISTS last_date DATE;
