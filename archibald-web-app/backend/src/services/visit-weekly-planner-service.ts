import type { DbPool } from '../db/pool';
import type {
  VisitPlanningSessionId, VisitPlanningStop,
  VisitMode, CustomerProfile,
} from '../db/repositories/visit-planning-types';
import { createStop } from '../db/repositories/visit-planning-stops';
import { updateSession } from '../db/repositories/visit-planning-sessions';
import { buildCandidates } from './visit-generate-service';
import { nearestNeighborSort } from './visit-planner';

type ScoredProfile = {
  profile: CustomerProfile;
  score: number;
  breakdown: Record<string, number>;
  daysSinceLastOrder: number | null;
  valore: number;
};

// Raggruppa candidati per zona commerciale: zona+prov > prov > città
export function groupCandidatesByZone(
  candidates: ScoredProfile[],
): Map<string, ScoredProfile[]> {
  const groups = new Map<string, ScoredProfile[]>();
  for (const c of candidates) {
    const zona = c.profile.zona;
    const prov = c.profile.province;
    const city = (c.profile.city ?? 'UNKNOWN').toUpperCase().trim() || 'UNKNOWN';

    // Chiave di raggruppamento: zona+prov > prov > city
    const key = (zona && zona !== '0' && zona !== '100' && prov)
      ? `Z${zona}_${prov}`
      : prov
      ? `P_${prov}`
      : city;

    const existing = groups.get(key) ?? [];
    existing.push(c);
    groups.set(key, existing);
  }
  return groups;
}

// Calcola il prossimo giorno lavorativo (lun-ven) da una data
function nextWorkDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

const MAX_WEEK_DAYS      = 5;
const MAX_WEEK_CANDIDATES = MAX_WEEK_DAYS * 10; // 50 totali (10 per giorno)

// Assegna i cluster ai giorni lavorativi partendo da startDate.
// Limita a MAX_WEEK_DAYS giorni: unisce i cluster in eccesso nell'ultimo giorno.
export function assignClustersToWeekDays(
  clusters: Map<string, ScoredProfile[]>,
  startDate: string,
): Map<string, ScoredProfile[]> {
  const sorted = [...clusters.entries()]
    .map(([city, profs]) => ({
      city,
      profs,
      totalScore: profs.reduce((sum, p) => sum + p.score, 0),
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  const result = new Map<string, ScoredProfile[]>();
  let currentDate = new Date(startDate + 'T00:00:00Z');

  // Se startDate è sab/dom, avanza al prossimo lavorativo
  if (currentDate.getUTCDay() === 0) {
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  } else if (currentDate.getUTCDay() === 6) {
    currentDate.setUTCDate(currentDate.getUTCDate() + 2);
  }

  // Massimo MAX_WEEK_DAYS giorni: i cluster oltre il limite vengono ignorati
  // (i candidati sono già ordinati per score, quindi i migliori vengono prima)
  let dayCount = 0;
  for (const { profs } of sorted) {
    if (dayCount >= MAX_WEEK_DAYS) break;
    const dateStr = currentDate.toISOString().slice(0, 10);
    result.set(dateStr, profs);
    currentDate = nextWorkDay(currentDate);
    dayCount++;
  }

  return result;
}

// Genera distribuzione settimanale: crea stop raggruppate per zona/giorno
export async function generateWeeklyDistribution(
  pool: DbPool,
  userId: string,
  sessionId: VisitPlanningSessionId,
  mode: VisitMode,
  startDate: string,
  startLat: number | null,
  startLng: number | null,
): Promise<VisitPlanningStop[]> {
  const allCandidates = await buildCandidates(pool, userId, mode);
  if (allCandidates.length === 0) return [];

  // Cap: solo i top MAX_WEEK_CANDIDATES per score → max 50 stop settimanali
  const candidates = allCandidates.slice(0, MAX_WEEK_CANDIDATES);
  const groups = groupCandidatesByZone(candidates);
  const dayAssignments = assignClustersToWeekDays(groups, startDate);

  const allStops: VisitPlanningStop[] = [];
  let globalSeq = 1;

  for (const [stopDate, dayCandidates] of dayAssignments) {
    // Ordina per nearest-neighbor per ogni giorno
    const sorted = nearestNeighborSort(
      dayCandidates.map(c => ({ profile: c.profile, score: c.score, locked: false })),
      { lat: startLat, lng: startLng },
    );

    for (const c of sorted.slice(0, 10)) { // max 10 clienti per giorno
      const reasons = [`Zona ${c.profile.city ?? '?'} — ${stopDate}`];
      const stop = await createStop(pool, sessionId, userId, {
        sourceType:            c.profile.sourceType,
        sourceId:              c.profile.sourceId,
        displayName:           c.profile.displayName,
        stopDate,
        status:                'suggested',
        visitMinutes:          30,
        sequence:              globalSeq++,
        scoreTotal:            c.score,
        recommendationReasons: reasons,
      });
      allStops.push(stop);
    }
  }

  await updateSession(pool, userId, sessionId, {
    status:      'planned',
    generatedAt: new Date().toISOString(),
  });

  return allStops;
}
