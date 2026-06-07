import type { DbPool } from '../db/pool';
import type {
  VisitPlanningSessionId, VisitPlanningStop,
  VisitMode, VisitHorizon, CustomerProfile,
} from '../db/repositories/visit-planning-types';
import { createStop } from '../db/repositories/visit-planning-stops';
import { updateSession } from '../db/repositories/visit-planning-sessions';
import {
  calcValoreCliente, calcScoreTotal, calcProbabilitaRiordino,
  normalizePercentile,
} from './visit-scoring-service';
import { deduplicateByStudio, estimateTravelMinutes } from './visit-planner';
import { isHolidayForCity } from '../db/repositories/municipal-holidays';
import { toVrpStop, solomonI1Insertion, twoOptLocalSearch } from './visit-vrptw-solver';
import { getPreferences } from '../db/repositories/customer-visit-preferences';

export type BuildCandidatesOptions = {
  zoneFilter?: Array<{ zona: string; prov: string }>;
  excludeSourceIds?: string[];
};

// Mappa prefisso CAP (prime 2 cifre) → codice provincia italiano
const CAP_PREFIX_TO_PROV: Record<number, string> = {
  0: 'RM', 1: 'RM', 2: 'RM', 3: 'RM', 4: 'LT', 5: 'TR', 6: 'PG',
  7: 'SS', 8: 'NU', 9: 'CA',
  10: 'TO', 11: 'AO', 12: 'CN', 13: 'VC', 14: 'AT', 15: 'AL',
  16: 'GE', 17: 'SV', 18: 'IM', 19: 'SP',
  20: 'MI', 21: 'VA', 22: 'CO', 23: 'SO', 24: 'BG', 25: 'BS',
  26: 'CR', 27: 'PV', 28: 'NO', 29: 'PC',
  30: 'VE', 31: 'TV', 32: 'BL', 33: 'UD', 34: 'TS',
  35: 'PD', 36: 'VI', 37: 'VR', 38: 'TN', 39: 'BZ',
  40: 'BO', 41: 'MO', 42: 'RE', 43: 'PR', 44: 'FE',
  45: 'RO', 46: 'MN', 47: 'FC', 48: 'RA',
  50: 'FI', 51: 'PT', 52: 'AR', 53: 'SI', 54: 'MS',
  55: 'LU', 56: 'PI', 57: 'LI', 58: 'GR', 59: 'PO',
  60: 'AN', 61: 'PU', 62: 'MC', 63: 'AP', 64: 'TE',
  65: 'PE', 66: 'CH', 67: 'AQ', 68: 'IS',
  70: 'BA', 71: 'FG', 72: 'BR', 73: 'LE', 74: 'TA', 75: 'MT', 76: 'BT',
  80: 'NA', 81: 'CE', 82: 'BN', 83: 'AV', 84: 'SA', 85: 'PZ',
  86: 'CB', 87: 'CS', 88: 'CZ', 89: 'RC',
  90: 'PA', 91: 'TP', 92: 'AG', 93: 'CL', 94: 'EN',
  95: 'CT', 96: 'SR', 97: 'RG', 98: 'ME',
};

function capToProv(cap: string | null): string | null {
  if (!cap) return null;
  const digits = cap.trim().replace(/\D/g, '');
  if (digits.length < 4) return null;
  const prefix = parseInt(digits.substring(0, 2), 10);
  return CAP_PREFIX_TO_PROV[prefix] ?? null;
}

const MAX_STOPS: Record<VisitHorizon, number> = { day: 8, week: 40 };

type ScoredProfile = {
  profile: CustomerProfile;
  score: number;
  breakdown: Record<string, number>;
  daysSinceLastOrder: number | null;
  valore: number;
};

export async function buildCandidates(
  pool: DbPool,
  userId: string,
  mode: VisitMode,
  options?: BuildCandidatesOptions,
): Promise<ScoredProfile[]> {

  const zoneFilter  = options?.zoneFilter;
  const excludeIds  = options?.excludeSourceIds ?? [];

  let customersQuery = `
    SELECT c.erp_id, c.name, c.city, c.street, c.postal_code, c.county,
           c.last_order_date,
           COALESCE(g.lat, c.geo_latitude)  AS lat,
           COALESCE(g.lng, c.geo_longitude) AS lng,
           CASE
             WHEN g.lat IS NOT NULL THEN g.quality
             WHEN c.geo_latitude IS NOT NULL THEN 'geocoded'
             ELSE 'unknown'
           END AS geo_quality
    FROM agents.customers c
    LEFT JOIN agents.customer_geo_status g
      ON g.user_id = c.user_id AND g.source_type = 'archibald' AND g.source_id = c.erp_id`;

  if (zoneFilter && zoneFilter.length > 0) {
    customersQuery += `
    JOIN system.city_zone_map czm
      ON REPLACE(czm.city_normalized, ' ', '') = REPLACE(UPPER(TRIM(c.city)), ' ', '')`;
  }

  customersQuery += `
    WHERE c.user_id = $1
      AND c.is_distributor = FALSE
      AND c.deleted_at IS NULL`;

  if (zoneFilter && zoneFilter.length > 0) {
    const zoneConds = zoneFilter.map((_, i) =>
      `(czm.zona = $${i * 2 + 2} AND czm.prov = $${i * 2 + 3})`
    ).join(' OR ');
    customersQuery += ` AND (${zoneConds})`;
  }

  const zoneParams = zoneFilter ? zoneFilter.flatMap(z => [z.zona, z.prov]) : [];
  const { rows: customers } = await pool.query(customersQuery, [userId, ...zoneParams]);

  const { rows: fresisTotals } = await pool.query(
    `SELECT customer_id AS erp_id,
            ROUND((SUM(target_total_with_vat) / 1.22)::numeric, 2) AS total_imponibile,
            COUNT(*)::text AS n_docs,
            MAX(created_at) AS ultimo_doc,
            json_agg(json_build_object(
              'archibaldOrderId', archibald_order_id,
              'targetTotalWithVat', target_total_with_vat
            )) AS records
     FROM agents.fresis_history
     WHERE user_id = $1
       AND target_total_with_vat > 0
       AND customer_id IS NOT NULL
     GROUP BY customer_id`,
    [userId],
  );

  const { rows: archTotals } = await pool.query(
    `SELECT c.erp_id,
            json_agg(json_build_object(
              'orderId', o.id,
              'totalAmount', o.total_amount,
              'creationDate', o.creation_date
            )) AS records,
            MAX(o.creation_date) AS ultimo_ordine
     FROM agents.order_records o
     JOIN agents.customers c
       ON c.account_num = o.customer_account_num AND c.user_id = o.user_id
     WHERE o.user_id = $1
       -- Account di servizio Fresis da escludere (55.261=Fresis Soc Coop, 55.217=Xx Fresis)
       AND o.customer_account_num NOT IN ('1002328', '049421')
     GROUP BY c.erp_id`,
    [userId],
  );

  const fresisMap = new Map(fresisTotals.map(r => [r.erp_id as string, r]));
  const archMap   = new Map(archTotals.map(r => [r.erp_id as string, r]));

  // Query 4: sub_clients Arca senza match Archibald
  let arcaQuery = `
    SELECT sc.codice, sc.ragione_sociale, sc.localita, sc.prov,
           sc.indirizzo, sc.cap, sc.zona,
           sc.lat, sc.lng
    FROM shared.sub_clients sc
    WHERE NOT EXISTS (
      SELECT 1 FROM shared.sub_client_customer_matches m
      WHERE m.sub_client_codice = sc.codice
    )
    AND sc.localita IS NOT NULL AND sc.localita != ''`;

  const arcaZoneParams: string[] = [];
  if (zoneFilter && zoneFilter.length > 0) {
    const arcaConds = zoneFilter.map((_, i) =>
      `(sc.zona = $${i * 2 + 1} AND sc.prov = $${i * 2 + 2})`
    ).join(' OR ');
    arcaQuery += ` AND (${arcaConds})`;
    arcaZoneParams.push(...zoneFilter.flatMap(z => [z.zona, z.prov]));
  }

  const { rows: arcaSubClients } = await pool.query(
    arcaQuery,
    arcaZoneParams.length > 0 ? arcaZoneParams : undefined,
  );

  // Query 5: aggregazione fresis per sub_client_codice (solo Arca puri)
  const { rows: arcaFresisTotals } = await pool.query(
    `SELECT fh.sub_client_codice AS codice,
            ROUND((SUM(fh.target_total_with_vat) / 1.22)::numeric, 2) AS valore,
            COUNT(*)::text AS n_docs,
            MAX(fh.created_at) AS ultimo_doc,
            json_agg(json_build_object(
              'archibaldOrderId', fh.archibald_order_id,
              'targetTotalWithVat', fh.target_total_with_vat
            )) AS records
     FROM agents.fresis_history fh
     WHERE fh.user_id = $1
       AND fh.target_total_with_vat > 0
       AND NOT EXISTS (
         SELECT 1 FROM shared.sub_client_customer_matches m
         WHERE m.sub_client_codice = fh.sub_client_codice
       )
     GROUP BY fh.sub_client_codice`,
    [userId],
  );

  const arcaFresisMap = new Map(arcaFresisTotals.map(r => [r.codice as string, r]));

  // Query 6: clienti saltati negli ultimi 90 giorni → bonus urgenza
  const { rows: skipHistory } = await pool.query(
    `SELECT vps.source_type, vps.source_id, COUNT(*) AS times_skipped
     FROM agents.visit_planning_stops vps
     JOIN agents.visit_planning_sessions vss ON vss.id = vps.session_id
     WHERE vss.user_id = $1
       AND vps.status = 'skipped'
       AND vps.updated_at >= NOW() - INTERVAL '90 days'
     GROUP BY vps.source_type, vps.source_id`,
    [userId],
  );
  // Chiave: "sourceType:sourceId" → numero di volte saltato
  const skipMap = new Map(
    skipHistory.map(r => [`${r.source_type as string}:${r.source_id as string}`, Number(r.times_skipped)])
  );

  // Carica city_zone_map per lookup zona: (city_norm, prov) → zona
  const { rows: zoneMapRows } = await pool.query(
    'SELECT city_normalized, prov, zona FROM system.city_zone_map',
  );
  const zoneMap = new Map(
    zoneMapRows.map(r => [`${r.city_normalized as string}|${r.prov as string}`, r.zona as string])
  );

  const rawScored = customers.map(c => {
    const fd = fresisMap.get(c.erp_id as string);
    const ad = archMap.get(c.erp_id as string);

    const fresisRecords: Array<{ archibaldOrderId: string | null; targetTotalWithVat: number }> =
      Array.isArray(fd?.records) ? fd!.records as any : [];
    const archRecords: Array<{ orderId: string; totalAmount: string }> =
      Array.isArray(ad?.records) ? ad!.records as any : [];

    const valore = calcValoreCliente(fresisRecords, archRecords);

    const lastStr = fd?.ultimo_doc ?? ad?.ultimo_ordine ?? c.last_order_date;
    const daysSinceLastOrder = lastStr
      ? Math.floor((Date.now() - new Date(lastStr as string).getTime()) / 86400000)
      : null;

    const nDocs = fd ? parseInt(fd.n_docs as string, 10) : 0;
    // Approssimazione: ciclo medio = età_ultimo_doc / n_doc * 1.2 (margine).
    // Impreciso per storico lungo — v2 userà (max_date - min_date) / (nDocs-1)
    const avgCycleDays = (nDocs >= 3 && daysSinceLastOrder != null)
      ? Math.round(daysSinceLastOrder / nDocs * 1.2)
      : null;

    const riordino = calcProbabilitaRiordino({ daysSinceLastOrder, avgCycleDays });
    const urgenza = daysSinceLastOrder != null ? Math.min(daysSinceLastOrder / 180, 1) : 0.3;
    const lat = c.lat != null ? parseFloat(c.lat as string) : null;
    const lng = c.lng != null ? parseFloat(c.lng as string) : null;
    const penalitaDati = lat == null ? 0.05 : 0;

    const prov = (c.county as string | null) ?? capToProv(c.postal_code as string | null);
    const cityNorm = ((c.city as string) ?? '').toUpperCase().trim();
    const zona = prov ? (zoneMap.get(`${cityNorm}|${prov}`) ?? null) : null;

    return { erpId: c.erp_id as string, name: c.name as string, city: c.city as string,
             lat, lng, valore, daysSinceLastOrder, riordino, urgenza, penalitaDati,
             prov, zona };
  });

  const filtered = rawScored.filter(
    s => s.valore > 0 || (s.daysSinceLastOrder != null && s.daysSinceLastOrder <= 365),
  );

  const filteredValori = filtered.map(s => s.valore);

  const profiled: ScoredProfile[] = filtered.map(s => {
    const valoreNorm = normalizePercentile(s.valore, filteredValori);
    const skipBonus = Math.min((skipMap.get(`archibald:${s.erpId}`) ?? 0) * 0.15, 0.45);
    const breakdown = {
      valore: valoreNorm, riordino: s.riordino, urgenza: Math.min(s.urgenza + skipBonus, 1.0),
      zona: 0.5, crossSell: 0, promozioni: 0,
      rischioClosure: 0, penalitaDati: s.penalitaDati,
    };
    const profile: CustomerProfile = {
      sourceType: 'archibald', sourceId: s.erpId, displayName: s.name,
      street: null, postalCode: null, city: s.city, province: s.prov,
      phone: null, email: null, vatNumber: null,
      lat: s.lat, lng: s.lng,
      geoQuality: s.lat != null ? 'geocoded' : 'unknown',
      isDistributor: false,
      matchedSources: [{ type: 'archibald', id: s.erpId, name: s.name }],
      zona: s.zona,
    };
    return {
      profile,
      score: calcScoreTotal(breakdown, mode),
      breakdown,
      daysSinceLastOrder: s.daysSinceLastOrder,
      valore: s.valore,
    };
  });

  // Normalizzazione combinata: includi valori Arca nella distribuzione percentile
  const arcaValori: number[] = arcaSubClients
    .map(sc => {
      const fd = arcaFresisMap.get(sc.codice as string);
      if (!fd) return 0;
      const fresisRecords = Array.isArray(fd.records) ? fd.records as Array<{ archibaldOrderId: string | null; targetTotalWithVat: number }> : [];
      return calcValoreCliente(fresisRecords, []);
    })
    .filter(v => v > 0);

  const allValoriForNorm = [...filteredValori, ...arcaValori];

  const arcaProfiled: ScoredProfile[] = arcaSubClients
    .filter(sc => arcaFresisMap.has(sc.codice as string))
    .reduce<ScoredProfile[]>((acc, sc) => {
      const fd = arcaFresisMap.get(sc.codice as string)!;
      const fresisRecords = Array.isArray(fd.records) ? fd.records as Array<{ archibaldOrderId: string | null; targetTotalWithVat: number }> : [];
      const valore = calcValoreCliente(fresisRecords, []);
      if (valore <= 0) return acc;

      const lastStr = fd.ultimo_doc;
      const daysSinceLastOrder = lastStr
        ? Math.floor((Date.now() - new Date(lastStr as string).getTime()) / 86400000)
        : null;

      const nDocs = parseInt(fd.n_docs as string, 10);
      const avgCycleDays = (nDocs >= 3 && daysSinceLastOrder != null)
        ? Math.round(daysSinceLastOrder / nDocs * 1.2)
        : null;

      const riordino = calcProbabilitaRiordino({ daysSinceLastOrder, avgCycleDays });
      const urgenza  = daysSinceLastOrder != null ? Math.min(daysSinceLastOrder / 180, 1) : 0.3;
      const valoreNorm = normalizePercentile(valore, allValoriForNorm);

      const skipBonus = Math.min((skipMap.get(`arca:${sc.codice as string}`) ?? 0) * 0.15, 0.45);
      const breakdown = {
        valore: valoreNorm, riordino, urgenza: Math.min(urgenza + skipBonus, 1.0),
        zona: 0.5, crossSell: 0, promozioni: 0,
        rischioClosure: 0, penalitaDati: 0.02,
      };

      const profile: CustomerProfile = {
        sourceType: 'arca', sourceId: sc.codice as string,
        displayName: sc.ragione_sociale as string,
        street: sc.indirizzo as string | null,
        postalCode: sc.cap as string | null,
        city: sc.localita as string,
        province: sc.prov as string | null,
        phone: null, email: null, vatNumber: null,
        lat:  sc.lat  != null ? parseFloat(sc.lat  as string) : null,
        lng:  sc.lng  != null ? parseFloat(sc.lng  as string) : null,
        geoQuality: sc.lat != null ? 'geocoded' : 'unknown',
        isDistributor: false,
        matchedSources: [{ type: 'arca', id: sc.codice as string, name: sc.ragione_sociale as string }],
        zona: sc.zona as string | null,
      };

      acc.push({ profile, score: calcScoreTotal(breakdown, mode), breakdown, daysSinceLastOrder, valore });
      return acc;
    }, []);

  // Combina Archibald + Arca puri, poi deduplica
  const allProfiled = [...profiled, ...arcaProfiled];
  const deduped = deduplicateByStudio(allProfiled.map(p => p.profile));
  const dedupedIds = new Set(deduped.map(p => p.sourceId));
  const excluded   = new Set(excludeIds);
  return allProfiled
    .filter(p => dedupedIds.has(p.profile.sourceId) && !excluded.has(p.profile.sourceId))
    .sort((a, b) => b.score - a.score);
}

export async function generateVisitRoute(
  pool: DbPool,
  userId: string,
  sessionId: VisitPlanningSessionId,
  mode: VisitMode,
  horizon: VisitHorizon,
  startLat: number | null,
  startLng: number | null,
  stopDate: string,
  options?: BuildCandidatesOptions,
): Promise<VisitPlanningStop[]> {
  const maxStops = MAX_STOPS[horizon];
  const candidates = await buildCandidates(pool, userId, mode, options);
  if (candidates.length === 0) return [];

  const preFiltered = candidates.slice(0, maxStops * 3);

  // Carica preferenze time windows per i candidati pre-filtrati
  const prefsMap = new Map<string, Awaited<ReturnType<typeof getPreferences>>>();
  for (const c of preFiltered) {
    try {
      const prefs = await getPreferences(pool, userId, 'archibald', c.profile.sourceId);
      if (prefs) prefsMap.set(c.profile.sourceId, prefs);
    } catch {
      // Default TW usato se mancano preferenze
    }
  }

  // Costruisci VrpStop[] con time windows reali
  const vrpStops = preFiltered.map(c =>
    toVrpStop(c.profile, c.score, prefsMap.get(c.profile.sourceId) ?? null)
  );

  // VRPTW: Solomon I1 insertion + 2-opt
  const depot = { lat: startLat, lng: startLng };
  const departureTime = 480; // 08:00 default
  const vrpRoute = twoOptLocalSearch(
    solomonI1Insertion(vrpStops, depot, departureTime),
    depot,
    departureTime,
  );

  const final = vrpRoute.stops.slice(0, maxStops);
  const vrpArrivals = vrpRoute.arrivals;

  const stops: VisitPlanningStop[] = [];
  let prevLat = startLat;
  let prevLng = startLng;
  // Map precalcolata: evita O(n²) con candidates.find nel loop
  const candidateMap = new Map(candidates.map(d => [d.profile.sourceId, d]));

  for (let i = 0; i < final.length; i++) {
    const vrpStop = final[i];
    const data = candidateMap.get(vrpStop.sourceId);
    if (!data) continue; // skip se non trovato nella map

    const reasons: string[] = [];
    if (data.daysSinceLastOrder != null) {
      if (data.daysSinceLastOrder <= 30)
        reasons.push(`Ordine recente (${data.daysSinceLastOrder}gg fa)`);
      else if (data.daysSinceLastOrder <= 90)
        reasons.push(`Ultimo ordine ${data.daysSinceLastOrder} giorni fa`);
      else
        reasons.push(`Dormiente: ${data.daysSinceLastOrder}gg senza ordini`);
    }
    if (data.valore > 5000)        reasons.push('Cliente alto valore');
    else if (data.valore > 1000)   reasons.push('Cliente buon valore');
    if (data.breakdown.riordino >= 0.7) reasons.push('Alta probabilità riordino');

    const travelMins = estimateTravelMinutes(prevLat, prevLng, vrpStop.lat, vrpStop.lng);

    const stop = await createStop(pool, sessionId, userId, {
      sourceType: data.profile.sourceType,
      sourceId:   vrpStop.sourceId,
      displayName: vrpStop.displayName,
      stopDate,
      status:     'suggested',
      visitMinutes: vrpStop.serviceDuration,
      sequence:   i + 1,
      scoreTotal: vrpStop.score,
      scoreBreakdownJson: data.breakdown as Record<string, number>,
      recommendationReasons: reasons,
      alerts: [],
    });

    if (travelMins != null) {
      await pool.query(
        `UPDATE agents.visit_planning_stops
         SET travel_minutes_from_previous = $1, updated_at = NOW()
         WHERE id = $2`,
        [travelMins, stop.id],
      );
    }

    // Aggiorna estimatedArrival/Departure dal VRPTW
    const arrivalMin = vrpArrivals[i];
    if (arrivalMin != null) {
      const stopDateObj   = new Date(stopDate + 'T00:00:00Z');
      const arrivalDate   = new Date(stopDateObj);
      arrivalDate.setUTCHours(Math.floor(arrivalMin / 60), Math.round(arrivalMin % 60), 0, 0);
      const departureDate = new Date(arrivalDate.getTime() + vrpStop.serviceDuration * 60000);
      await pool.query(
        `UPDATE agents.visit_planning_stops
         SET estimated_arrival = $1, estimated_departure = $2, updated_at = NOW()
         WHERE id = $3`,
        [arrivalDate.toISOString(), departureDate.toISOString(), stop.id],
      );
    }

    // Controlla se stopDate è festivo per la città del cliente (fail-silent)
    if (data.profile.city) {
      try {
        const stopDateObj = new Date(stopDate + 'T00:00:00Z');
        const month = stopDateObj.getUTCMonth() + 1;
        const day   = stopDateObj.getUTCDate();
        const holiday = await isHolidayForCity(pool, userId, data.profile.city, month, day);
        if (holiday.isHoliday) {
          await pool.query(
            `UPDATE agents.visit_planning_stops
             SET alerts = array_append(alerts, $1), updated_at = NOW()
             WHERE id = $2`,
            [`⚠️ Possibile chiusura: ${holiday.name ?? 'Festa patronale'}`, stop.id],
          );
        }
      } catch {
        // Non blocca la generazione
      }
    }

    stops.push(stop);
    prevLat = vrpStop.lat;
    prevLng = vrpStop.lng;
  }

  await updateSession(pool, userId, sessionId, {
    status: 'planned',
    generatedAt: new Date().toISOString(),
  });

  return stops;
}
