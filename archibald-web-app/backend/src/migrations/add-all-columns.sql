-- Migration: Add all 20 Order List columns + 11 DDT columns
-- Date: 2026-01-16
-- Phase: 11-05 Unified Scraping

-- Add missing Order List columns (10 columns)
ALTER TABLE orders ADD COLUMN remainingSalesFinancial TEXT;
ALTER TABLE orders ADD COLUMN salesStatus TEXT;
ALTER TABLE orders ADD COLUMN orderType TEXT;
ALTER TABLE orders ADD COLUMN documentStatus TEXT;
ALTER TABLE orders ADD COLUMN salesOrigin TEXT;
ALTER TABLE orders ADD COLUMN transferStatus TEXT;
ALTER TABLE orders ADD COLUMN transferDate TEXT;
ALTER TABLE orders ADD COLUMN completionDate TEXT;
ALTER TABLE orders ADD COLUMN discountPercent TEXT;
ALTER TABLE orders ADD COLUMN grossAmount TEXT;
ALTER TABLE orders ADD COLUMN totalAmount TEXT;

-- Add missing DDT columns (7 columns)
ALTER TABLE orders ADD COLUMN ddtId TEXT;
ALTER TABLE orders ADD COLUMN ddtDeliveryDate TEXT;
ALTER TABLE orders ADD COLUMN ddtOrderNumber TEXT;
ALTER TABLE orders ADD COLUMN ddtCustomerAccount TEXT;
ALTER TABLE orders ADD COLUMN ddtSalesName TEXT;
ALTER TABLE orders ADD COLUMN ddtDeliveryName TEXT;
ALTER TABLE orders ADD COLUMN deliveryTerms TEXT;
ALTER TABLE orders ADD COLUMN deliveryMethod TEXT;
ALTER TABLE orders ADD COLUMN deliveryCity TEXT;
