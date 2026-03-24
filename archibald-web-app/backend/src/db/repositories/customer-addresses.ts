import type { DbPool } from '../pool';

type CustomerAddress = {
  id: number;
  userId: string;
  customerProfile: string;
  tipo: string;
  nome: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  contea: string | null;
  stato: string | null;
  idRegione: string | null;
  contra: string | null;
};

type AltAddress = {
  tipo: string;
  nome: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  contea: string | null;
  stato: string | null;
  idRegione: string | null;
  contra: string | null;
};

type CustomerAddressRow = {
  id: number;
  user_id: string;
  customer_profile: string;
  tipo: string;
  nome: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  contea: string | null;
  stato: string | null;
  id_regione: string | null;
  contra: string | null;
};

function mapRowToCustomerAddress(row: CustomerAddressRow): CustomerAddress {
  return {
    id: row.id,
    userId: row.user_id,
    customerProfile: row.customer_profile,
    tipo: row.tipo,
    nome: row.nome,
    via: row.via,
    cap: row.cap,
    citta: row.citta,
    contea: row.contea,
    stato: row.stato,
    idRegione: row.id_regione,
    contra: row.contra,
  };
}

async function getAddressesByCustomer(
  pool: DbPool,
  userId: string,
  customerProfile: string,
): Promise<CustomerAddress[]> {
  const { rows } = await pool.query<CustomerAddressRow>(
    `SELECT id, user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra
     FROM agents.customer_addresses
     WHERE user_id = $1 AND customer_profile = $2
     ORDER BY id ASC`,
    [userId, customerProfile],
  );
  return rows.map(mapRowToCustomerAddress);
}

async function upsertAddressesForCustomer(
  pool: DbPool,
  userId: string,
  customerProfile: string,
  addresses: AltAddress[],
): Promise<void> {
  await pool.withTransaction(async (tx) => {
    await tx.query(
      'DELETE FROM agents.customer_addresses WHERE user_id = $1 AND customer_profile = $2',
      [userId, customerProfile],
    );
    for (const addr of addresses) {
      await tx.query(
        `INSERT INTO agents.customer_addresses
           (user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId, customerProfile,
          addr.tipo, addr.nome, addr.via, addr.cap, addr.citta,
          addr.contea, addr.stato, addr.idRegione, addr.contra,
        ],
      );
    }
  });
}

async function getAddressById(
  pool: DbPool,
  userId: string,
  id: number,
): Promise<CustomerAddress | null> {
  const { rows } = await pool.query<CustomerAddressRow>(
    `SELECT id, user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra
     FROM agents.customer_addresses
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows[0] ? mapRowToCustomerAddress(rows[0]) : null;
}

async function getCustomersNeedingAddressSync(
  pool: DbPool,
  userId: string,
  limit: number,
): Promise<Array<{ customer_profile: string; name: string }>> {
  const { rows } = await pool.query<{ customer_profile: string; name: string }>(
    `SELECT customer_profile, name
     FROM agents.customers
     WHERE user_id = $1
       AND (addresses_synced_at IS NULL
            OR addresses_synced_at < NOW() - INTERVAL '7 days')
     ORDER BY CASE WHEN addresses_synced_at IS NULL THEN 0 ELSE 1 END, name ASC
     LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

async function setAddressesSyncedAt(
  pool: DbPool,
  userId: string,
  customerProfile: string,
): Promise<void> {
  await pool.query(
    'UPDATE agents.customers SET addresses_synced_at = NOW() WHERE customer_profile = $1 AND user_id = $2',
    [customerProfile, userId],
  );
}

async function addAddress(
  pool: DbPool,
  userId: string,
  customerProfile: string,
  address: AltAddress,
): Promise<CustomerAddress> {
  const { rows } = await pool.query<CustomerAddressRow>(
    `INSERT INTO agents.customer_addresses
       (user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra`,
    [
      userId, customerProfile,
      address.tipo, address.nome, address.via, address.cap, address.citta,
      address.contea, address.stato, address.idRegione, address.contra,
    ],
  );
  return mapRowToCustomerAddress(rows[0]);
}

async function updateAddress(
  pool: DbPool,
  userId: string,
  id: number,
  address: AltAddress,
): Promise<CustomerAddress | null> {
  const { rows } = await pool.query<CustomerAddressRow>(
    `UPDATE agents.customer_addresses
     SET tipo = $3, nome = $4, via = $5, cap = $6, citta = $7,
         contea = $8, stato = $9, id_regione = $10, contra = $11,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra`,
    [
      id, userId,
      address.tipo, address.nome, address.via, address.cap, address.citta,
      address.contea, address.stato, address.idRegione, address.contra,
    ],
  );
  return rows[0] ? mapRowToCustomerAddress(rows[0]) : null;
}

async function deleteAddress(
  pool: DbPool,
  userId: string,
  id: number,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM agents.customer_addresses WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return (rowCount ?? 0) > 0;
}

export {
  getAddressesByCustomer,
  upsertAddressesForCustomer,
  getAddressById,
  getCustomersNeedingAddressSync,
  setAddressesSyncedAt,
  addAddress,
  updateAddress,
  deleteAddress,
  type CustomerAddress,
  type AltAddress,
  type CustomerAddressRow,
};
