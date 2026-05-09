-- Migration 084: Drop redundant unique index on (order_number, user_id)
--
-- The existing UNIQUE INDEX `idx_agents_orders_number_user` on
-- (order_number, user_id) was used as the ON CONFLICT target in order-sync.ts.
-- This caused a critical data-loss bug: draft orders ("Giornale") in the ERP have
-- order_number = '' (empty string), so multiple draft orders for the same agent
-- collided on the unique index and silently overwrote each other in upsert.
--
-- Resolution: drop the unique index. The PRIMARY KEY of agents.order_records is
-- already (id, user_id) — the ERP internal id (es. '54.416', '54385') is always
-- present and unique per ERP record. order-sync.ts now uses ON CONFLICT (id, user_id)
-- which is satisfied by the existing PK. No new index needed.
--
-- A non-unique index on order_number can be useful for lookup performance, so we
-- recreate it as a non-unique index.

DROP INDEX IF EXISTS agents.idx_agents_orders_number_user;

CREATE INDEX IF NOT EXISTS idx_agents_orders_number_user
  ON agents.order_records (order_number, user_id);
