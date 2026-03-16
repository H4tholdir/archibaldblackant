CREATE TABLE agents.customer_addresses (
  id               SERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL,
  customer_profile TEXT NOT NULL,
  tipo             TEXT NOT NULL,
  nome             TEXT,
  via              TEXT,
  cap              TEXT,
  citta            TEXT,
  contea           TEXT,
  stato            TEXT,
  id_regione       TEXT,
  contra           TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (customer_profile, user_id)
    REFERENCES agents.customers(customer_profile, user_id)
    ON DELETE CASCADE
);

CREATE INDEX ON agents.customer_addresses (user_id, customer_profile);

ALTER TABLE agents.customers
  ADD COLUMN addresses_synced_at TIMESTAMPTZ DEFAULT NULL;
