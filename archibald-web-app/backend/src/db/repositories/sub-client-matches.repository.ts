import type { DbPool } from '../pool.js';

type MatchResult = {
  customerProfileIds: string[];
  subClientCodices: string[];
  skipModal: boolean;
};

async function getMatchesForSubClient(pool: DbPool, userId: string, codice: string): Promise<MatchResult> {
  const [custRows, subRows, prefRow] = await Promise.all([
    pool.query<{ customer_profile_id: string }>(
      `SELECT customer_profile_id FROM shared.sub_client_customer_matches WHERE sub_client_codice = $1`,
      [codice],
    ),
    pool.query<{ other_codice: string }>(
      `SELECT
         CASE WHEN sub_client_codice_a = $1 THEN sub_client_codice_b ELSE sub_client_codice_a END AS other_codice
       FROM shared.sub_client_sub_client_matches
       WHERE sub_client_codice_a = $1 OR sub_client_codice_b = $1`,
      [codice],
    ),
    pool.query<{ skip_matching_modal: boolean }>(
      `SELECT skip_matching_modal FROM shared.sub_client_history_prefs
       WHERE user_id = $1 AND entity_type = 'subclient' AND entity_id = $2`,
      [userId, codice],
    ),
  ]);

  return {
    customerProfileIds: custRows.rows.map((r) => r.customer_profile_id),
    subClientCodices: subRows.rows.map((r) => r.other_codice),
    skipModal: prefRow.rows[0]?.skip_matching_modal ?? false,
  };
}

async function getMatchesForCustomer(pool: DbPool, userId: string, customerProfileId: string): Promise<MatchResult> {
  const [subRows, prefRow] = await Promise.all([
    pool.query<{ sub_client_codice: string }>(
      `SELECT sub_client_codice FROM shared.sub_client_customer_matches WHERE customer_profile_id = $1`,
      [customerProfileId],
    ),
    pool.query<{ skip_matching_modal: boolean }>(
      `SELECT skip_matching_modal FROM shared.sub_client_history_prefs
       WHERE user_id = $1 AND entity_type = 'customer' AND entity_id = $2`,
      [userId, customerProfileId],
    ),
  ]);

  return {
    customerProfileIds: [customerProfileId],
    subClientCodices: subRows.rows.map((r) => r.sub_client_codice),
    skipModal: prefRow.rows[0]?.skip_matching_modal ?? false,
  };
}

async function addCustomerMatch(pool: DbPool, codice: string, customerProfileId: string): Promise<void> {
  await pool.query(
    `INSERT INTO shared.sub_client_customer_matches (sub_client_codice, customer_profile_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [codice, customerProfileId],
  );
}

async function removeCustomerMatch(pool: DbPool, codice: string, customerProfileId: string): Promise<void> {
  await pool.query(
    `DELETE FROM shared.sub_client_customer_matches WHERE sub_client_codice = $1 AND customer_profile_id = $2`,
    [codice, customerProfileId],
  );
}

function canonicalize(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function addSubClientMatch(pool: DbPool, codiceA: string, codiceB: string): Promise<void> {
  const [a, b] = canonicalize(codiceA, codiceB);
  await pool.query(
    `INSERT INTO shared.sub_client_sub_client_matches (sub_client_codice_a, sub_client_codice_b)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [a, b],
  );
}

async function removeSubClientMatch(pool: DbPool, codiceA: string, codiceB: string): Promise<void> {
  const [a, b] = canonicalize(codiceA, codiceB);
  await pool.query(
    `DELETE FROM shared.sub_client_sub_client_matches WHERE sub_client_codice_a = $1 AND sub_client_codice_b = $2`,
    [a, b],
  );
}

async function upsertSkipModal(
  pool: DbPool,
  userId: string,
  entityType: 'subclient' | 'customer',
  entityId: string,
  skip: boolean,
): Promise<void> {
  await pool.query(
    `INSERT INTO shared.sub_client_history_prefs (user_id, entity_type, entity_id, skip_matching_modal)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, entity_type, entity_id) DO UPDATE SET skip_matching_modal = EXCLUDED.skip_matching_modal`,
    [userId, entityType, entityId, skip],
  );
}

export {
  getMatchesForSubClient, getMatchesForCustomer,
  addCustomerMatch, removeCustomerMatch,
  addSubClientMatch, removeSubClientMatch,
  upsertSkipModal,
  type MatchResult,
};
