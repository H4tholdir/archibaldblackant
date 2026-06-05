import type { DbPool } from '../pool';
import type { CustomerGeoStatus, CustomerSourceType, GeoQuality } from './visit-planning-types';

export type UpsertGeoInput = {
  userId: string; sourceType: CustomerSourceType; sourceId: string;
  lat: number; lng: number; quality: GeoQuality;
  normalizedAddress?: string; provider?: string;
};

export async function upsertGeoStatus(pool: DbPool, input: UpsertGeoInput): Promise<void> {
  await pool.query(
    `INSERT INTO agents.customer_geo_status
       (user_id,source_type,source_id,lat,lng,normalized_address,quality,provider,geocoded_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
     ON CONFLICT (user_id,source_type,source_id) DO UPDATE SET
       lat=EXCLUDED.lat, lng=EXCLUDED.lng,
       normalized_address=EXCLUDED.normalized_address,
       quality=EXCLUDED.quality, provider=EXCLUDED.provider,
       geocoded_at=NOW(), updated_at=NOW()`,
    [input.userId, input.sourceType, input.sourceId, input.lat, input.lng,
     input.normalizedAddress ?? null, input.quality, input.provider ?? null],
  );
}

export async function getGeoStatus(
  pool: DbPool, userId: string, sourceType: CustomerSourceType, sourceId: string,
): Promise<CustomerGeoStatus | null> {
  const { rows } = await pool.query(
    `SELECT * FROM agents.customer_geo_status
     WHERE user_id=$1 AND source_type=$2 AND source_id=$3`,
    [userId, sourceType, sourceId],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    userId: r.user_id, sourceType: r.source_type, sourceId: r.source_id,
    lat: r.lat != null ? parseFloat(r.lat) : null,
    lng: r.lng != null ? parseFloat(r.lng) : null,
    normalizedAddress: r.normalized_address, quality: r.quality,
    provider: r.provider, geocodedAt: r.geocoded_at?.toISOString() ?? null,
    manuallyConfirmedAt: r.manually_confirmed_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export type MissingGeoCustomer = {
  sourceType: CustomerSourceType; sourceId: string;
  name: string; street: string | null; postalCode: string | null; city: string | null;
};

export async function listMissingGeo(
  pool: DbPool, userId: string, limit: number,
): Promise<MissingGeoCustomer[]> {
  const { rows } = await pool.query(
    `SELECT 'archibald' AS source_type, c.erp_id AS source_id,
            c.name, c.street, c.postal_code, c.city
     FROM agents.customers c
     WHERE c.user_id = $1
       AND c.is_distributor = FALSE
       AND c.city IS NOT NULL AND c.city != ''
       AND NOT EXISTS (
         SELECT 1 FROM agents.customer_geo_status g
         WHERE g.user_id = c.user_id
           AND g.source_type = 'archibald'
           AND g.source_id = c.erp_id
           AND g.quality IN ('geocoded','manually_confirmed')
       )
     ORDER BY c.name
     LIMIT $2`,
    [userId, limit],
  );
  return rows.map(r => ({
    sourceType: r.source_type as CustomerSourceType,
    sourceId: r.source_id,
    name: r.name,
    street: r.street,
    postalCode: r.postal_code,
    city: r.city,
  }));
}
