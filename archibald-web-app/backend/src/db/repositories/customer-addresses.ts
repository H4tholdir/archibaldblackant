import type { DbPool } from '../pool';

type CustomerAddress = {
  id: number;
  userId: string;
  erpId: string;
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
  erp_id: string;
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
    erpId: row.erp_id,
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
  erpId: string,
): Promise<CustomerAddress[]> {
  const { rows } = await pool.query<CustomerAddressRow>(
    `SELECT id, user_id, erp_id, tipo, nome, via, cap, citta, contea, stato, id_regione, contra
     FROM agents.customer_addresses
     WHERE user_id = $1 AND erp_id = $2
     ORDER BY id ASC`,
    [userId, erpId],
  );
  return rows.map(mapRowToCustomerAddress);
}

async function upsertAddressesForCustomer(
  pool: DbPool,
  userId: string,
  erpId: string,
  addresses: AltAddress[],
): Promise<void> {
  await pool.withTransaction(async (tx) => {
    await tx.query(
      'DELETE FROM agents.customer_addresses WHERE user_id = $1 AND erp_id = $2',
      [userId, erpId],
    );
    for (const addr of addresses) {
      await tx.query(
        `INSERT INTO agents.customer_addresses
           (user_id, erp_id, tipo, nome, via, cap, citta, contea, stato, id_regione, contra)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId, erpId,
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
    `SELECT id, user_id, erp_id, tipo, nome, via, cap, citta, contea, stato, id_regione, contra
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
): Promise<Array<{ erp_id: string; name: string }>> {
  const { rows } = await pool.query<{ erp_id: string; name: string }>(
    `SELECT erp_id, name
     FROM agents.customers
     WHERE user_id = $1
       AND (addresses_synced_at IS NULL
            OR addresses_synced_at < NOW() - INTERVAL '24 hours')
     ORDER BY CASE WHEN addresses_synced_at IS NULL THEN 0 ELSE 1 END, name ASC
     LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

async function setAddressesSyncedAt(
  pool: DbPool,
  userId: string,
  erpId: string,
): Promise<void> {
  await pool.query(
    'UPDATE agents.customers SET addresses_synced_at = NOW() WHERE erp_id = $1 AND user_id = $2',
    [erpId, userId],
  );
}

async function addAddress(
  pool: DbPool,
  userId: string,
  erpId: string,
  address: AltAddress,
): Promise<CustomerAddress> {
  const { rows } = await pool.query<CustomerAddressRow>(
    `INSERT INTO agents.customer_addresses
       (user_id, erp_id, tipo, nome, via, cap, citta, contea, stato, id_regione, contra)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, user_id, erp_id, tipo, nome, via, cap, citta, contea, stato, id_regione, contra`,
    [
      userId, erpId,
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
     RETURNING id, user_id, erp_id, tipo, nome, via, cap, citta, contea, stato, id_regione, contra`,
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
