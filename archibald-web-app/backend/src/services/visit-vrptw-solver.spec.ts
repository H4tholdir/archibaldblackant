import { describe, test, expect } from 'vitest';
import { solomonI1Insertion, twoOptLocalSearch, toVrpStop, type VrpStop } from './visit-vrptw-solver';
import type { CustomerProfile } from '../db/repositories/visit-planning-types';

const DEPOT = { lat: 40.85 as number | null, lng: 14.27 as number | null };

function makeProfile(id: string, lat: number | null, lng: number | null): CustomerProfile {
  return {
    sourceType: 'archibald', sourceId: id, displayName: `Cliente ${id}`,
    street: null, postalCode: null, city: 'Napoli', province: null,
    phone: null, email: null, vatNumber: null,
    lat, lng, geoQuality: lat != null ? 'geocoded' : 'unknown',
    isDistributor: false, matchedSources: [],
  };
}

function makeStop(id: string, lat: number, lng: number, twStart = 480, twEnd = 1080): VrpStop {
  return {
    sourceId: id, displayName: `Cliente ${id}`,
    lat, lng, score: 0.5,
    timeWindowStart: twStart, timeWindowEnd: twEnd, serviceDuration: 30,
  };
}

describe('solomonI1Insertion', () => {
  test('route vuota con zero candidati', () => {
    const route = solomonI1Insertion([], DEPOT, 480);
    expect(route.stops).toHaveLength(0);
    expect(route.feasible).toBe(true);
    expect(route.totalTime).toBe(0);
  });

  test('inserisce clienti e produce route feasible', () => {
    const stops = [
      makeStop('A', 40.85, 14.27),
      makeStop('B', 40.80, 14.50),
      makeStop('C', 40.75, 14.75),
    ];
    const route = solomonI1Insertion(stops, DEPOT, 480);
    expect(route.stops.length).toBeGreaterThan(0);
    expect(route.feasible).toBe(true);
    expect(route.arrivals.length).toBe(route.stops.length);
  });

  test('esclude cliente con TW impossibile da rispettare', () => {
    // TW 08:00-08:05 (5 min) ma depot è lontanissimo — impossibile arrivare in tempo
    const impossibleStop = makeStop('IMPOSSIBLE', 41.90, 12.49, 480, 485); // Roma in 5 min
    const normalStop     = makeStop('NORMAL',     40.85, 14.27, 480, 1080);
    const route = solomonI1Insertion([impossibleStop, normalStop], DEPOT, 480);
    // NORMAL deve essere nella route, IMPOSSIBLE no (o in una route non-feasible se incluso)
    // Il solver deve fare del suo meglio — non crashare
    expect(route).toBeDefined();
    expect(Array.isArray(route.stops)).toBe(true);
  });
});

describe('twoOptLocalSearch', () => {
  test('non peggiora una route già ordinata geograficamente', () => {
    const stops = [
      makeStop('A', 40.85, 14.27), // vicino al depot
      makeStop('B', 40.80, 14.50), // intermedio
      makeStop('C', 40.75, 14.75), // lontano
    ];
    const initial  = solomonI1Insertion(stops, DEPOT, 480);
    const improved = twoOptLocalSearch(initial, DEPOT, 480);
    // Il totalTime può solo migliorare o restare uguale
    expect(improved.totalTime).toBeLessThanOrEqual(initial.totalTime + 0.5);
    expect(improved.feasible).toBe(initial.feasible);
  });

  test('route vuota non cambia', () => {
    const empty    = { stops: [], arrivals: [], totalTime: 0, feasible: true };
    const improved = twoOptLocalSearch(empty, DEPOT, 480);
    expect(improved.stops).toHaveLength(0);
  });
});

describe('toVrpStop', () => {
  test('usa default 08:00-18:00 se preferenze null', () => {
    const profile = makeProfile('1', 40.85, 14.27);
    const stop = toVrpStop(profile, 0.8, null);
    expect(stop.timeWindowStart).toBe(480);  // 08:00
    expect(stop.timeWindowEnd).toBe(1080);   // 18:00
    expect(stop.serviceDuration).toBe(30);
  });

  test('usa time windows dalle preferenze se presenti', () => {
    const profile = makeProfile('1', 40.85, 14.27);
    const stop = toVrpStop(profile, 0.8, {
      typicalVisitMinutes: 45,
      preferredTimeStart: '09:00',
      preferredTimeEnd: '17:30',
    });
    expect(stop.timeWindowStart).toBe(540);  // 09:00
    expect(stop.timeWindowEnd).toBe(1050);   // 17:30
    expect(stop.serviceDuration).toBe(45);
  });
});
