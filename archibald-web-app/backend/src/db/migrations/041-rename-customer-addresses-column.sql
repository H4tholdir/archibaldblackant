-- Migration 041: rename customer_addresses.customer_profile → erp_id
--
-- Migration 040 renamed agents.customers.customer_profile to erp_id,
-- but the customer_addresses table was missed. The application code already
-- uses erp_id everywhere, causing "column erp_id does not exist" errors
-- in address sync operations.

ALTER TABLE agents.customer_addresses
  RENAME COLUMN customer_profile TO erp_id;
