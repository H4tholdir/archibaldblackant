-- 030-ghost-articles.sql
ALTER TABLE agents.order_articles
  ADD COLUMN IF NOT EXISTS is_ghost BOOLEAN NOT NULL DEFAULT FALSE;
