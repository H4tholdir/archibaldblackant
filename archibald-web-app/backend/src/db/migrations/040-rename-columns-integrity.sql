-- Migration 040: rename columns for naming coherence
--
-- 1. order_records: remaining_sales_financial → order_description
--    PURCHORDERFORMNUM in ERP is the order description/note, not a financial value
--
-- 2. order_records: ddt_total → ddt_quantity
--    QTY in DDT ListView is the item count, not a monetary total
--
-- 3. customers: customer_profile → erp_id
--    This column stores ERP's numeric internal ID (e.g. 55261),
--    not the ACCOUNTNUM which ERP calls "Profilo Cliente"
--
-- 4. customers: internal_id → account_num
--    This column stores ERP's ACCOUNTNUM (e.g. 1002328),
--    which is the "Profilo Cliente" in ERP terminology
--
-- 5. order_records: customer_profile_id → customer_account_num
--    This column stores the ACCOUNTNUM of the customer (joins to customers.account_num)

ALTER TABLE agents.order_records
  RENAME COLUMN remaining_sales_financial TO order_description;

ALTER TABLE agents.order_records
  RENAME COLUMN ddt_total TO ddt_quantity;

ALTER TABLE agents.customers
  RENAME COLUMN customer_profile TO erp_id;

ALTER TABLE agents.customers
  RENAME COLUMN internal_id TO account_num;

ALTER TABLE agents.order_records
  RENAME COLUMN customer_profile_id TO customer_account_num;
