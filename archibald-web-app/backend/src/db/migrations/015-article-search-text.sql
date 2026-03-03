-- Add article_search_text column for global search support
ALTER TABLE agents.order_records
ADD COLUMN IF NOT EXISTS article_search_text TEXT;

-- Backfill from existing order_articles
UPDATE agents.order_records o
SET article_search_text = sub.search_text
FROM (
  SELECT order_id, user_id,
    string_agg(article_code || ' ' || COALESCE(article_description, ''), ' | ' ORDER BY id) AS search_text
  FROM agents.order_articles
  GROUP BY order_id, user_id
) sub
WHERE o.id = sub.order_id AND o.user_id = sub.user_id;
