-- Migration: Create warehouse_boxes table
-- Purpose: Dedicated table for warehouse boxes (previously virtual)
-- Date: 2026-02-03

-- Create warehouse_boxes table
CREATE TABLE IF NOT EXISTS warehouse_boxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_warehouse_boxes_user ON warehouse_boxes(user_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_boxes_name ON warehouse_boxes(name);

-- Populate with existing boxes from warehouse_items
INSERT OR IGNORE INTO warehouse_boxes (user_id, name, created_at, updated_at)
SELECT DISTINCT
  user_id,
  box_name,
  MIN(uploaded_at) as created_at,
  MAX(uploaded_at) as updated_at
FROM warehouse_items
GROUP BY user_id, box_name;

-- Add foreign key constraint to warehouse_items (optional - can be done later)
-- Note: SQLite doesn't support adding FK constraints to existing tables easily
-- So we document the relationship but don't enforce it at DB level yet
