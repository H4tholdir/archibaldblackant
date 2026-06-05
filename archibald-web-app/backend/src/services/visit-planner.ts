import type { CustomerProfile } from '../db/repositories/visit-planning-types';

// Distanza Haversine in km
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Stima minuti di viaggio: 50 km/h media urbana/extraurbana
export function estimateTravelMinutes(
  fromLat: number | null, fromLng: number | null,
  toLat: number | null, toLng: number | null,
): number | null {
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) return null;
  const km = distanceKm(fromLat, fromLng, toLat, toLng);
  return Math.round((km / 50) * 60);
}

// Rimuove duplicati studio: se un cliente Arca ha un match Archibald confermato
// e quell'Archibald è già tra i candidati, mantieni solo l'Archibald.
export function deduplicateByStudio(
  candidates: CustomerProfile[],
): CustomerProfile[] {
  const archibaldIds = new Set(
    candidates
      .filter(c => c.sourceType === 'archibald')
      .map(c => c.sourceId),
  );

  return candidates.filter(c => {
    if (c.sourceType !== 'arca') return true;
    // Un cliente Arca viene escluso se uno dei suoi match Archibald è già nei candidati
    const hasArchMatch = c.matchedSources.some(
      s => s.type === 'archibald' && archibaldIds.has(s.id),
    );
    return !hasArchMatch;
  });
}

type ScoredCandidate = {
  profile: CustomerProfile;
  score: number;
  locked: boolean;
};

type StartPoint = { lat: number | null; lng: number | null };

// Nearest-neighbor pesato da score:
// 1. Le tappe locked restano in posizione fissa
// 2. Per il resto: score * 0.6 + prossimità * 0.4
export function nearestNeighborSort(
  candidates: ScoredCandidate[],
  startPoint: StartPoint,
): ScoredCandidate[] {
  const locked = candidates.filter(c => c.locked);
  const free   = candidates.filter(c => !c.locked);

  const sorted: ScoredCandidate[] = [];
  let currentLat = startPoint.lat;
  let currentLng = startPoint.lng;

  const remaining = [...free];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const proximityScore = (() => {
        if (currentLat == null || currentLng == null) return 0.5;
        if (c.profile.lat == null || c.profile.lng == null) return 0.3;
        const km = distanceKm(currentLat, currentLng, c.profile.lat, c.profile.lng);
        return Math.max(0, 1 - km / 100); // normalizza su 100km
      })();
      const combined = c.score * 0.6 + proximityScore * 0.4;
      if (combined > bestScore) { bestScore = combined; bestIdx = i; }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    sorted.push(chosen);
    currentLat = chosen.profile.lat;
    currentLng = chosen.profile.lng;
  }

  // Reintegra le locked nelle loro posizioni originali
  const result = [...sorted];
  for (const l of locked) {
    const origIdx = candidates.indexOf(l);
    result.splice(Math.min(origIdx, result.length), 0, l);
  }

  return result;
}
