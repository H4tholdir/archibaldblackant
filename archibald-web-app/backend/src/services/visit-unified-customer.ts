import type { DbPool } from '../db/pool';
import type { CustomerProfile, CustomerSourceType, GeoQuality } from '../db/repositories/visit-planning-types';

// Risolve source type e ID da stringa composita.
// 'arca:C00602' → { sourceType: 'arca', sourceId: 'C00602' }
// '55.374'      → { sourceType: 'archibald', sourceId: '55.374' }
export function resolveCustomerIdentity(id: string): { sourceType: CustomerSourceType; sourceId: string } {
  if (id.startsWith('arca:')) return { sourceType: 'arca', sourceId: id.slice(5) };
  if (/^\d+\.\d{3}$/.test(id)) return { sourceType: 'archibald', sourceId: id };
  throw new Error(`Cannot resolve customer identity from: ${id}`);
}

export async function buildCustomerProfile(
  pool: DbPool,
  userId: string,
  sourceType: CustomerSourceType,
  sourceId: string,
): Promise<CustomerProfile | null> {
  if (sourceType === 'archibald') {
    const { rows } = await pool.query(
      `SELECT erp_id, name, street, postal_code, city, phone, email,
              vat_number, is_distributor
       FROM agents.customers
       WHERE user_id = $1 AND erp_id = $2 AND deleted_at IS NULL`,
      [userId, sourceId],
    );
    if (!rows[0]) return null;
    const c = rows[0];

    const geo = await _getGeo(pool, userId, 'archibald', sourceId);
    const matchedArcaSources = await _getArcaMatches(pool, sourceId);

    return {
      sourceType: 'archibald',
      sourceId: c.erp_id,
      displayName: c.name,
      street: c.street,
      postalCode: c.postal_code,
      city: c.city,
      province: null,
      phone: c.phone,
      email: c.email,
      vatNumber: c.vat_number,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      geoQuality: geo?.quality ?? 'unknown',
      isDistributor: c.is_distributor,
      matchedSources: [
        { type: 'archibald', id: c.erp_id, name: c.name },
        ...matchedArcaSources,
      ],
    };
  }

  // sourceType === 'arca'
  const { rows } = await pool.query(
    `SELECT codice, ragione_sociale, indirizzo, cap, localita, prov,
            telefono, email, partita_iva
     FROM shared.sub_clients
     WHERE codice = $1`,
    [sourceId],
  );
  if (!rows[0]) return null;
  const sc = rows[0];

  const geo = await _getGeo(pool, userId, 'arca', sourceId);
  const matchedArchSources = await _getArchibaldMatches(pool, userId, sourceId);

  return {
    sourceType: 'arca',
    sourceId: sc.codice,
    displayName: sc.ragione_sociale,
    street: sc.indirizzo,
    postalCode: sc.cap,
    city: sc.localita,
    province: sc.prov,
    phone: sc.telefono,
    email: sc.email,
    vatNumber: sc.partita_iva,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    geoQuality: geo?.quality ?? 'unknown',
    isDistributor: false,
    matchedSources: [
      { type: 'arca', id: sc.codice, name: sc.ragione_sociale },
      ...matchedArchSources,
    ],
  };
}

async function _getGeo(pool: DbPool, userId: string, sourceType: CustomerSourceType, sourceId: string) {
  const { rows } = await pool.query(
    `SELECT lat, lng, quality FROM agents.customer_geo_status
     WHERE user_id=$1 AND source_type=$2 AND source_id=$3`,
    [userId, sourceType, sourceId],
  );
  if (!rows[0]) return null;
  return {
    lat: rows[0].lat != null ? parseFloat(rows[0].lat) : null,
    lng: rows[0].lng != null ? parseFloat(rows[0].lng) : null,
    quality: rows[0].quality as GeoQuality,
  };
}

async function _getArcaMatches(pool: DbPool, erpId: string) {
  const { rows } = await pool.query(
    `SELECT m.sub_client_codice AS id, sc.ragione_sociale AS name
     FROM shared.sub_client_customer_matches m
     LEFT JOIN shared.sub_clients sc ON sc.codice = m.sub_client_codice
     WHERE m.customer_profile_id = $1`,
    [erpId],
  );
  return rows.map(r => ({ type: 'arca' as CustomerSourceType, id: r.id, name: r.name }));
}

async function _getArchibaldMatches(pool: DbPool, userId: string, arcaCodice: string) {
  const { rows } = await pool.query(
    `SELECT m.customer_profile_id AS id, c.name
     FROM shared.sub_client_customer_matches m
     LEFT JOIN agents.customers c ON c.erp_id = m.customer_profile_id AND c.user_id = $1
     WHERE m.sub_client_codice = $2`,
    [userId, arcaCodice],
  );
  return rows.map(r => ({ type: 'archibald' as CustomerSourceType, id: r.id, name: r.name }));
}
