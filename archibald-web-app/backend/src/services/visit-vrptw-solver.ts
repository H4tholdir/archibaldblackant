import type { CustomerProfile } from '../db/repositories/visit-planning-types';

export type VrpStop = {
  sourceId:        string;
  displayName:     string;
  lat:             number | null;
  lng:             number | null;
  score:           number;
  timeWindowStart: number; // minuti da mezzanotte (es. 480 = 08:00)
  timeWindowEnd:   number; // minuti da mezzanotte (es. 1080 = 18:00)
  serviceDuration: number; // minuti visita
};

export type VrpRoute = {
  stops:     VrpStop[];
  arrivals:  number[]; // tempo di arrivo per ogni stop (minuti da mezzanotte)
  totalTime: number;   // tempo totale del giro (minuti)
  feasible:  boolean;
};

type Depot = { lat: number | null; lng: number | null };

const SPEED_KMH = 50;

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function travelMin(
  fromLat: number | null, fromLng: number | null,
  toLat:   number | null, toLng:   number | null,
): number {
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) return 30;
  return (distanceKm(fromLat, fromLng, toLat, toLng) / SPEED_KMH) * 60;
}

// Calcola arrivi per una sequenza di stop a partire da un orario di partenza
function computeArrivals(
  stops: VrpStop[],
  depot: Depot,
  departureTime: number,
): { arrivals: number[]; totalTime: number; feasible: boolean } {
  const arrivals: number[] = [];
  let currentTime = departureTime;
  let currentLat  = depot.lat;
  let currentLng  = depot.lng;
  let feasible    = true;

  for (const stop of stops) {
    const travel  = travelMin(currentLat, currentLng, stop.lat, stop.lng);
    let   arrival = currentTime + travel;
    if (arrival < stop.timeWindowStart) arrival = stop.timeWindowStart;
    if (arrival > stop.timeWindowEnd)   feasible = false;
    arrivals.push(arrival);
    currentTime = arrival + stop.serviceDuration;
    currentLat  = stop.lat;
    currentLng  = stop.lng;
  }

  return { arrivals, totalTime: currentTime - departureTime, feasible };
}

// Solomon I1: inserisce il candidato che massimizza (score - costo_inserimento)
export function solomonI1Insertion(
  candidates: VrpStop[],
  depot: Depot,
  departureTime: number,
): VrpRoute {
  if (candidates.length === 0) {
    return { stops: [], arrivals: [], totalTime: 0, feasible: true };
  }

  const route: VrpStop[] = [];
  const remaining = [...candidates];

  while (remaining.length > 0) {
    let bestIdx      = -1;
    let bestScore    = -Infinity;
    let bestPosition = 0;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];

      for (let pos = 0; pos <= route.length; pos++) {
        const trial = [...route.slice(0, pos), cand, ...route.slice(pos)];
        const { feasible: trialFeasible } = computeArrivals(trial, depot, departureTime);
        if (!trialFeasible) continue;

        const prevLat = pos === 0 ? depot.lat : route[pos - 1].lat;
        const prevLng = pos === 0 ? depot.lng : route[pos - 1].lng;
        const nextLat = pos < route.length ? route[pos].lat : null;
        const nextLng = pos < route.length ? route[pos].lng : null;

        const insertCost =
          travelMin(prevLat, prevLng, cand.lat, cand.lng) +
          travelMin(cand.lat, cand.lng, nextLat, nextLng) -
          travelMin(prevLat, prevLng, nextLat, nextLng);

        const combined = cand.score * 0.7 - (insertCost / 60) * 0.3;

        if (combined > bestScore) {
          bestScore    = combined;
          bestIdx      = i;
          bestPosition = pos;
        }
      }
    }

    if (bestIdx === -1) break; // nessun candidato inseribile
    const chosen = remaining.splice(bestIdx, 1)[0];
    route.splice(bestPosition, 0, chosen);
  }

  const { arrivals, totalTime, feasible } = computeArrivals(route, depot, departureTime);
  return { stops: route, arrivals, totalTime, feasible };
}

// 2-opt local search: inversioni di sotto-sequenza che migliorano totalTime senza violare TW
export function twoOptLocalSearch(
  route: VrpRoute,
  depot: Depot,
  departureTime = 480,
): VrpRoute {
  if (route.stops.length < 3) return route;

  let best     = route;
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 0; i < best.stops.length - 1 && !improved; i++) {
      for (let j = i + 1; j < best.stops.length && !improved; j++) {
        const newStops = [
          ...best.stops.slice(0, i),
          ...best.stops.slice(i, j + 1).reverse(),
          ...best.stops.slice(j + 1),
        ];
        const trial = computeArrivals(newStops, depot, departureTime);
        if (trial.feasible && trial.totalTime < best.totalTime - 0.01) {
          best     = { stops: newStops, arrivals: trial.arrivals, totalTime: trial.totalTime, feasible: true };
          improved = true;
        }
      }
    }
  }

  return best;
}

// Converte CustomerProfile + preferenze opzionali in VrpStop
export function toVrpStop(
  profile: CustomerProfile,
  score: number,
  prefs: { typicalVisitMinutes?: number; preferredTimeStart?: string | null; preferredTimeEnd?: string | null } | null,
): VrpStop {
  const parseTime = (t: string | null | undefined, def: number): number => {
    if (!t) return def;
    const parts = t.split(':');
    if (parts.length < 2) return def;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  };

  return {
    sourceId:        profile.sourceId,
    displayName:     profile.displayName,
    lat:             profile.lat,
    lng:             profile.lng,
    score,
    timeWindowStart: parseTime(prefs?.preferredTimeStart, 480),  // default 08:00
    timeWindowEnd:   parseTime(prefs?.preferredTimeEnd,   1080), // default 18:00
    serviceDuration: prefs?.typicalVisitMinutes ?? 30,
  };
}
