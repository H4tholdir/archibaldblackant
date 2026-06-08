import type { DbPool } from '../db/pool';
import { logger } from '../logger';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT    = 'Formicanera/1.0 (francesco.formicola@live.it)';
const RATE_LIMIT_MS = 1100;

export function stripHouseNumber(street: string): string {
  // Rimuove il numero civico finale (es. ", 36A" / ",10" / " 10" / " 36/A")
  // Non tocca numeri in mezzo al nome della via (es. "Via 4 Novembre, 12" → "Via 4 Novembre")
  return street.replace(/,?\s*\b\d+[A-Za-z\/]*\s*$/, '').trim();
}

export async function geocodeWithFallback(
  street: string | null,
  postalCode: string | null,
  city: string | null,
): Promise<{ lat: number; lng: number; quality: 'geocoded' | 'geocoded_approx' } | null> {
  // Livello 1: indirizzo completo
  const full = buildAddressString(street, postalCode, city);
  if (full) {
    await sleep(RATE_LIMIT_MS);
    const coords = await geocodeAddress(full);
    if (coords) return { ...coords, quality: 'geocoded' };
  }

  // Livello 2: via senza civico (solo se lo stripping produce una stringa diversa)
  if (street) {
    const stripped = stripHouseNumber(street);
    if (stripped !== street) {
      const withStripped = buildAddressString(stripped, postalCode, city);
      if (withStripped && withStripped !== full) {
        await sleep(RATE_LIMIT_MS);
        const coords = await geocodeAddress(withStripped);
        if (coords) return { ...coords, quality: 'geocoded' };
      }
    }
  }

  // Livello 3: sola città (posizione approssimativa)
  if (city?.trim()) {
    await sleep(RATE_LIMIT_MS);
    const coords = await geocodeAddress(city.trim());
    if (coords) return { ...coords, quality: 'geocoded_approx' };
  }

  return null;
}

export function buildAddressString(
  street: string | null,
  postalCode: string | null,
  city: string | null,
): string | null {
  const parts = [
    street?.trim() || null,
    [postalCode?.trim(), city?.trim()].filter(Boolean).join(' ') || null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

export function buildArcaAddressString(
  indirizzo: string | null,
  cap: string | null,
  localita: string | null,
): string | null {
  if (!localita?.trim()) return null;
  const parts = [
    indirizzo?.trim() || null,
    [cap?.trim(), localita.trim()].filter(Boolean).join(' '),
  ].filter(Boolean);
  return parts.join(', ');
}

export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(address)}&countrycodes=it`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'it' },
    });
    if (!res.ok) return null;
    const results = await res.json() as Array<{ lat: string; lon: string }>;
    if (!results.length) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch {
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export type BackfillResult = {
  archibaldProcessed: number;
  archibaldSucceeded: number;
  arcaProcessed:      number;
  arcaSucceeded:      number;
};

async function backfillArchibald(pool: DbPool, userId: string): Promise<{ processed: number; succeeded: number }> {
  const { rows: missing } = await pool.query<{
    erp_id: string; street: string | null; postal_code: string | null; city: string | null;
  }>(
    `SELECT c.erp_id, c.street, c.postal_code, c.city
     FROM agents.customers c
     WHERE c.user_id = $1
       AND c.deleted_at IS NULL
       AND c.is_distributor = FALSE
       AND NOT EXISTS (
         SELECT 1 FROM agents.customer_geo_status g
         WHERE g.user_id = c.user_id
           AND g.source_type = 'archibald'
           AND g.source_id = c.erp_id
           AND (
             g.quality IN ('geocoded', 'manually_confirmed', 'geocoded_approx')
             OR (g.quality = 'failed' AND g.updated_at > NOW() - INTERVAL '7 days')
           )
       )
     ORDER BY c.erp_id
     LIMIT 500`,
    [userId],
  );

  let succeeded = 0;
  for (const row of missing) {
    if (!row.city?.trim()) {
      await pool.query(
        `INSERT INTO agents.customer_geo_status
           (user_id, source_type, source_id, lat, lng, quality, provider, geocoded_at, updated_at)
         VALUES ($1,'archibald',$2,NULL,NULL,'failed','nominatim',NOW(),NOW())
         ON CONFLICT (user_id, source_type, source_id) DO NOTHING`,
        [userId, row.erp_id],
      );
      continue;
    }

    const result = await geocodeWithFallback(row.street, row.postal_code, row.city);

    await pool.query(
      `INSERT INTO agents.customer_geo_status
         (user_id, source_type, source_id, lat, lng, normalized_address, quality, provider, geocoded_at, updated_at)
       VALUES ($1,'archibald',$2,$3,$4,$5,$6,'nominatim',NOW(),NOW())
       ON CONFLICT (user_id, source_type, source_id)
       DO UPDATE SET lat=EXCLUDED.lat, lng=EXCLUDED.lng,
         normalized_address=EXCLUDED.normalized_address,
         quality=EXCLUDED.quality, geocoded_at=NOW(), updated_at=NOW()`,
      [userId, row.erp_id, result?.lat ?? null, result?.lng ?? null,
       buildAddressString(row.street, row.postal_code, row.city),
       result?.quality ?? 'failed'],
    );

    if (result) succeeded++;
  }
  return { processed: missing.length, succeeded };
}

async function backfillArca(pool: DbPool): Promise<{ processed: number; succeeded: number }> {
  const { rows: missing } = await pool.query<{
    codice: string; indirizzo: string | null; cap: string | null; localita: string | null;
  }>(
    `SELECT codice, indirizzo, cap, localita
     FROM shared.sub_clients
     WHERE lat IS NULL
       AND hidden = FALSE
       AND (geocoding_failed_at IS NULL OR geocoding_failed_at < NOW() - INTERVAL '7 days')
     ORDER BY codice
     LIMIT 500`,
  );

  let succeeded = 0;
  for (const row of missing) {
    if (!row.localita?.trim()) {
      await pool.query(
        'UPDATE shared.sub_clients SET geocoding_failed_at=NOW() WHERE codice=$1',
        [row.codice],
      );
      continue;
    }

    const result = await geocodeWithFallback(row.indirizzo, row.cap, row.localita);

    if (result) {
      await pool.query(
        'UPDATE shared.sub_clients SET lat=$1, lng=$2, geo_quality=$3, geocoding_failed_at=NULL WHERE codice=$4',
        [result.lat, result.lng, result.quality, row.codice],
      );
      succeeded++;
    } else {
      await pool.query(
        'UPDATE shared.sub_clients SET geocoding_failed_at=NOW() WHERE codice=$1',
        [row.codice],
      );
    }
  }
  return { processed: missing.length, succeeded };
}

export async function runGeocodingBackfill(
  pool: DbPool,
  userId: string,
): Promise<BackfillResult> {
  logger.info('Geocoding backfill avviato', { userId });

  const arch = await backfillArchibald(pool, userId);
  logger.info('Backfill Archibald completato', arch);

  const arca = await backfillArca(pool);
  logger.info('Backfill Arca completato', arca);

  return {
    archibaldProcessed: arch.processed,
    archibaldSucceeded: arch.succeeded,
    arcaProcessed:      arca.processed,
    arcaSucceeded:      arca.succeeded,
  };
}
