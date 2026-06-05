import { describe, test, expect } from 'vitest';
import { groupCandidatesByCity, assignClustersToWeekDays } from './visit-weekly-planner-service';
import type { CustomerProfile } from '../db/repositories/visit-planning-types';

function makeProfile(id: string, city: string): CustomerProfile {
  return {
    sourceType: 'archibald', sourceId: id, displayName: `Cliente ${id}`,
    street: null, postalCode: null, city, province: null,
    phone: null, email: null, vatNumber: null,
    lat: null, lng: null, geoQuality: 'unknown',
    isDistributor: false, matchedSources: [],
  };
}

describe('groupCandidatesByCity', () => {
  test('raggruppa profili per città normalizzata', () => {
    const profiles = [
      { profile: makeProfile('1', 'Napoli'), score: 0.8, breakdown: {}, daysSinceLastOrder: null, valore: 1000 },
      { profile: makeProfile('2', 'napoli'), score: 0.6, breakdown: {}, daysSinceLastOrder: null, valore: 800 },
      { profile: makeProfile('3', 'Salerno'), score: 0.9, breakdown: {}, daysSinceLastOrder: null, valore: 1200 },
    ];
    const groups = groupCandidatesByCity(profiles);
    expect(groups.size).toBe(2);
    expect(groups.get('NAPOLI')?.length).toBe(2);
    expect(groups.get('SALERNO')?.length).toBe(1);
  });

  test('città null va in gruppo UNKNOWN', () => {
    const profiles = [
      { profile: makeProfile('1', null as any), score: 0.5, breakdown: {}, daysSinceLastOrder: null, valore: 500 },
    ];
    const groups = groupCandidatesByCity(profiles);
    expect(groups.has('UNKNOWN')).toBe(true);
  });
});

describe('assignClustersToWeekDays', () => {
  test('assegna i cluster ai giorni lavorativi da startDate (lunedì)', () => {
    const startDate = '2026-06-09'; // lunedì
    const clusters = new Map([
      ['NAPOLI',  [{ profile: makeProfile('1', 'Napoli'),  score: 0.8, breakdown: {}, daysSinceLastOrder: null, valore: 1000 }]],
      ['SALERNO', [{ profile: makeProfile('2', 'Salerno'), score: 0.7, breakdown: {}, daysSinceLastOrder: null, valore: 800  }]],
      ['POTENZA', [{ profile: makeProfile('3', 'Potenza'), score: 0.6, breakdown: {}, daysSinceLastOrder: null, valore: 600  }]],
    ]);
    const result = assignClustersToWeekDays(clusters, startDate);
    expect(result.size).toBe(3);
    expect(result.has('2026-06-09')).toBe(true); // lun
    expect(result.has('2026-06-10')).toBe(true); // mar
    expect(result.has('2026-06-11')).toBe(true); // mer
  });

  test('salta sabato e domenica', () => {
    const startDate = '2026-06-05'; // venerdì
    const clusters = new Map([
      ['NAPOLI',  [{ profile: makeProfile('1', 'Napoli'),  score: 0.8, breakdown: {}, daysSinceLastOrder: null, valore: 1000 }]],
      ['SALERNO', [{ profile: makeProfile('2', 'Salerno'), score: 0.7, breakdown: {}, daysSinceLastOrder: null, valore: 800  }]],
    ]);
    const result = assignClustersToWeekDays(clusters, startDate);
    expect(result.has('2026-06-05')).toBe(true);  // ven
    expect(result.has('2026-06-08')).toBe(true);  // lun (dopo il weekend)
    expect(result.has('2026-06-06')).toBe(false); // sab
    expect(result.has('2026-06-07')).toBe(false); // dom
  });
});
