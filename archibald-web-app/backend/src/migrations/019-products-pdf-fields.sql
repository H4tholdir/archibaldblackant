-- Migration 019: Add Products PDF Fields, Remove Images
-- Phase 19-01: PDF Parser Enhancement & Node.js Integration (Products)
-- Description: Add all 26+ PDF fields from 8-page cycles, remove image management

-- ========================================
-- STEP 1: Remove image columns from products table
-- ========================================
-- Note: SQLite doesn't support DROP COLUMN directly until 3.35+
-- For VPS deployment, use ALTER TABLE DROP COLUMN if SQLite >= 3.35
-- Otherwise, recreate table without image columns

-- Check SQLite version: SELECT sqlite_version();
-- If >= 3.35.0:
-- ALTER TABLE products DROP COLUMN imageUrl;
-- ALTER TABLE products DROP COLUMN imageLocalPath;
-- ALTER TABLE products DROP COLUMN imageDownloadedAt;

-- If < 3.35.0, use table recreation method (see below)

-- ========================================
-- STEP 2: Add new PDF fields (Pages 4-8)
-- ========================================

-- Page 4 fields
ALTER TABLE products ADD COLUMN figure TEXT;
ALTER TABLE products ADD COLUMN bulkArticleId TEXT;
ALTER TABLE products ADD COLUMN legPackage TEXT;

-- Page 5 fields
ALTER TABLE products ADD COLUMN size TEXT;
ALTER TABLE products ADD COLUMN configurationId TEXT;
ALTER TABLE products ADD COLUMN createdBy TEXT;
ALTER TABLE products ADD COLUMN createdDate TEXT;
ALTER TABLE products ADD COLUMN dataAreaId TEXT;

-- Page 6 fields
ALTER TABLE products ADD COLUMN defaultQty TEXT;
ALTER TABLE products ADD COLUMN displayProductNumber TEXT;
ALTER TABLE products ADD COLUMN totalAbsoluteDiscount TEXT;
ALTER TABLE products ADD COLUMN productId TEXT;

-- Page 7 fields
ALTER TABLE products ADD COLUMN lineDiscount TEXT;
ALTER TABLE products ADD COLUMN modifiedBy TEXT;
ALTER TABLE products ADD COLUMN modifiedDatetime TEXT;
ALTER TABLE products ADD COLUMN orderableArticle TEXT;

-- Page 8 fields
ALTER TABLE products ADD COLUMN purchPrice TEXT;
ALTER TABLE products ADD COLUMN pcsStandardConfigurationId TEXT;
ALTER TABLE products ADD COLUMN standardQty TEXT;
ALTER TABLE products ADD COLUMN stopped TEXT;
ALTER TABLE products ADD COLUMN unitId TEXT;

-- ========================================
-- STEP 3: Drop image-related index
-- ========================================
DROP INDEX IF EXISTS idx_product_imageLocalPath;

-- ========================================
-- Alternative: Table Recreation (for SQLite < 3.35)
-- ========================================
-- If DROP COLUMN not supported, uncomment and use this approach:

/*
BEGIN TRANSACTION;

-- Create new table with updated schema
CREATE TABLE products_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  groupCode TEXT,
  searchName TEXT,
  priceUnit TEXT,
  productGroupId TEXT,
  productGroupDescription TEXT,
  packageContent TEXT,
  minQty REAL,
  multipleQty REAL,
  maxQty REAL,

  -- New Page 4 fields
  figure TEXT,
  bulkArticleId TEXT,
  legPackage TEXT,

  -- New Page 5 fields
  size TEXT,
  configurationId TEXT,
  createdBy TEXT,
  createdDate TEXT,
  dataAreaId TEXT,

  -- New Page 6 fields
  defaultQty TEXT,
  displayProductNumber TEXT,
  totalAbsoluteDiscount TEXT,
  productId TEXT,

  -- New Page 7 fields
  lineDiscount TEXT,
  modifiedBy TEXT,
  modifiedDatetime TEXT,
  orderableArticle TEXT,

  -- New Page 8 fields
  purchPrice TEXT,
  pcsStandardConfigurationId TEXT,
  standardQty TEXT,
  stopped TEXT,
  unitId TEXT,

  -- Existing fields
  price REAL,
  hash TEXT NOT NULL,
  lastSync INTEGER NOT NULL,
  createdAt INTEGER DEFAULT (strftime('%s', 'now')),
  updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Copy data from old table (exclude image columns)
INSERT INTO products_new (
  id, name, description, groupCode, searchName, priceUnit,
  productGroupId, productGroupDescription, packageContent,
  minQty, multipleQty, maxQty, price, hash, lastSync,
  createdAt, updatedAt
)
SELECT
  id, name, description, groupCode, searchName, priceUnit,
  productGroupId, productGroupDescription, packageContent,
  minQty, multipleQty, maxQty, price, hash, lastSync,
  createdAt, updatedAt
FROM products;

-- Drop old table
DROP TABLE products;

-- Rename new table
ALTER TABLE products_new RENAME TO products;

-- Recreate indexes (exclude image index)
CREATE INDEX idx_product_name ON products(name);
CREATE INDEX idx_product_search ON products(searchName);
CREATE INDEX idx_product_hash ON products(hash);
CREATE INDEX idx_product_lastSync ON products(lastSync);
CREATE INDEX idx_product_groupCode ON products(groupCode);

COMMIT;
*/

-- ========================================
-- Verification Queries
-- ========================================
-- Run these after migration to verify:

-- Check table structure:
-- PRAGMA table_info(products);

-- Count products:
-- SELECT COUNT(*) FROM products;

-- Sample new fields:
-- SELECT id, name, figure, size, purchPrice FROM products LIMIT 5;
