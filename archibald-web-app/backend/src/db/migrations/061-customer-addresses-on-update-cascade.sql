-- Migration 061: Add ON UPDATE CASCADE to customer_addresses FK
--
-- updateCustomerErpId() updates customers.erp_id from TEMP-{ts} to the real ERP ID.
-- Without ON UPDATE CASCADE the FK prevents this update while customer_addresses rows
-- still reference the old TEMP erp_id, causing a FK violation error.
--
-- Strategy: find and drop the existing FK (name may differ depending on whether
-- PostgreSQL auto-renamed it after migration 041's RENAME COLUMN), then re-add it
-- with both ON DELETE CASCADE and ON UPDATE CASCADE.

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'agents.customer_addresses'::regclass
    AND contype = 'f'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE agents.customer_addresses DROP CONSTRAINT %I',
      v_constraint
    );
  END IF;
END;
$$;

ALTER TABLE agents.customer_addresses
  ADD CONSTRAINT customer_addresses_erp_id_user_id_fkey
    FOREIGN KEY (erp_id, user_id)
    REFERENCES agents.customers(erp_id, user_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
