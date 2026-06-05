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
import { deduplicateByStudio, nearestNeighborSort, estimateTravelMinutes } from './visit-planner';
import { isHolidayForCity } from '../db/repositories/municipal-holidays';

const MAX_STOPS: Record<VisitHorizon, number> = { day: 15, week: 40 };

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
): Promise<ScoredProfile[]> {

  const { rows: customers } = await pool.query(
    `SELECT c.erp_id, c.name, c.city, c.street, c.postal_code,
            c.last_order_date,
            g.lat, g.lng, g.quality AS geo_quality
     FROM agents.customers c
     LEFT JOIN agents.customer_geo_status g
       ON g.user_id = c.user_id AND g.source_type = 'archibald' AND g.source_id = c.erp_id
     WHERE c.user_id = $1
       AND c.is_distributor = FALSE
       AND c.deleted_at IS NULL`,
    [userId],
  );

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

    return { erpId: c.erp_id as string, name: c.name as string, city: c.city as string,
             lat, lng, valore, daysSinceLastOrder, riordino, urgenza, penalitaDati };
  });

  const filtered = rawScored.filter(
    s => s.valore > 0 || (s.daysSinceLastOrder != null && s.daysSinceLastOrder <= 365),
  );

  const filteredValori = filtered.map(s => s.valore);

  const profiled: ScoredProfile[] = filtered.map(s => {
    const valoreNorm = normalizePercentile(s.valore, filteredValori);
    const breakdown = {
      valore: valoreNorm, riordino: s.riordino, urgenza: s.urgenza,
      zona: 0.5, crossSell: 0, promozioni: 0,
      rischioClosure: 0, penalitaDati: s.penalitaDati,
    };
    const profile: CustomerProfile = {
      sourceType: 'archibald', sourceId: s.erpId, displayName: s.name,
      street: null, postalCode: null, city: s.city, province: null,
      phone: null, email: null, vatNumber: null,
      lat: s.lat, lng: s.lng,
      geoQuality: s.lat != null ? 'geocoded' : 'unknown',
      isDistributor: false,
      matchedSources: [{ type: 'archibald', id: s.erpId, name: s.name }],
    };
    return {
      profile,
      score: calcScoreTotal(breakdown, mode),
      breakdown,
      daysSinceLastOrder: s.daysSinceLastOrder,
      valore: s.valore,
    };
  });

  const deduped = deduplicateByStudio(profiled.map(p => p.profile));
  const dedupedIds = new Set(deduped.map(p => p.sourceId));
  return profiled
    .filter(p => dedupedIds.has(p.profile.sourceId))
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
): Promise<VisitPlanningStop[]> {
  const maxStops = MAX_STOPS[horizon];
  const candidates = await buildCandidates(pool, userId, mode);
  if (candidates.length === 0) return [];

  const preFiltered = candidates.slice(0, maxStops * 3);
  const sorted = nearestNeighborSort(
    preFiltered.map(c => ({ profile: c.profile, score: c.score, locked: false })),
    { lat: startLat, lng: startLng },
  );
  const final = sorted.slice(0, maxStops);

  const stops: VisitPlanningStop[] = [];
  let prevLat = startLat;
  let prevLng = startLng;
  // Map precalcolata: evita O(n²) con candidates.find nel loop
  const candidateMap = new Map(candidates.map(d => [d.profile.sourceId, d]));

  for (let i = 0; i < final.length; i++) {
    const c = final[i];
    const data = candidateMap.get(c.profile.sourceId)!;

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

    const travelMins = estimateTravelMinutes(prevLat, prevLng, c.profile.lat, c.profile.lng);

    const stop = await createStop(pool, sessionId, userId, {
      sourceType: 'archibald',
      sourceId: c.profile.sourceId,
      displayName: c.profile.displayName,
      stopDate,
      status: 'suggested',
      visitMinutes: 30,
      sequence: i + 1,
      scoreTotal: c.score,
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

    // Controlla se stopDate è festivo per la città del cliente (fail-silent)
    if (c.profile.city) {
      try {
        const stopDateObj = new Date(stopDate + 'T00:00:00Z');
        const month = stopDateObj.getUTCMonth() + 1;
        const day   = stopDateObj.getUTCDate();
        const holiday = await isHolidayForCity(pool, userId, c.profile.city, month, day);
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
    prevLat = c.profile.lat;
    prevLng = c.profile.lng;
  }

  await updateSession(pool, userId, sessionId, {
    status: 'planned',
    generatedAt: new Date().toISOString(),
  });

  return stops;
}
