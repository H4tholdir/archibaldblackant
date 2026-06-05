import { describe, test, expect } from 'vitest';
import { groupCandidatesByZone, assignClustersToWeekDays } from './visit-weekly-planner-service';
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

describe('groupCandidatesByZone', () => {
  test('raggruppa profili per città normalizzata quando zona e prov sono assenti', () => {
    const profiles = [
      { profile: makeProfile('1', 'Napoli'), score: 0.8, breakdown: {}, daysSinceLastOrder: null, valore: 1000 },
      { profile: makeProfile('2', 'napoli'), score: 0.6, breakdown: {}, daysSinceLastOrder: null, valore: 800 },
      { profile: makeProfile('3', 'Salerno'), score: 0.9, breakdown: {}, daysSinceLastOrder: null, valore: 1200 },
    ];
    const groups = groupCandidatesByZone(profiles);
    expect(groups.size).toBe(2);
    expect(groups.get('NAPOLI')?.length).toBe(2);
    expect(groups.get('SALERNO')?.length).toBe(1);
  });

  test('città null va in gruppo UNKNOWN quando zona e prov sono assenti', () => {
    const profiles = [
      { profile: makeProfile('1', null as any), score: 0.5, breakdown: {}, daysSinceLastOrder: null, valore: 500 },
    ];
    const groups = groupCandidatesByZone(profiles);
    expect(groups.has('UNKNOWN')).toBe(true);
  });

  test('raggruppa per zona+prov quando entrambi sono presenti e zona significativa', () => {
    const profileWithZona = (id: string, city: string, zona: string, prov: string) => ({
      ...makeProfile(id, city),
      province: prov,
      zona,
    });
    const profiles = [
      { profile: profileWithZona('1', 'Napoli',  '8', 'NA'), score: 0.8, breakdown: {}, daysSinceLastOrder: null, valore: 1000 },
      { profile: profileWithZona('2', 'Salerno', '8', 'SA'), score: 0.7, breakdown: {}, daysSinceLastOrder: null, valore: 800 },
      { profile: profileWithZona('3', 'Caserta', '8', 'CE'), score: 0.6, breakdown: {}, daysSinceLastOrder: null, valore: 600 },
    ];
    const groups = groupCandidatesByZone(profiles);
    // Ogni cliente è in una provincia diversa → chiavi distinte Z8_NA, Z8_SA, Z8_CE
    expect(groups.size).toBe(3);
    expect(groups.has('Z8_NA')).toBe(true);
    expect(groups.has('Z8_SA')).toBe(true);
    expect(groups.has('Z8_CE')).toBe(true);
  });

  test('zona 0 fa fallback a prov', () => {
    const profile = { ...makeProfile('1', 'Roma'), province: 'RM', zona: '0' };
    const profiles = [
      { profile, score: 0.5, breakdown: {}, daysSinceLastOrder: null, valore: 500 },
    ];
    const groups = groupCandidatesByZone(profiles);
    expect(groups.has('P_RM')).toBe(true);
    expect(groups.has('Z0_RM')).toBe(false);
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
