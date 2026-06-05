import { describe, test, expect } from 'vitest';
import {
  deduplicateByStudio,
  nearestNeighborSort,
  estimateTravelMinutes,
} from './visit-planner';
import type { CustomerProfile } from '../db/repositories/visit-planning-types';

function makeProfile(id: string, lat: number | null, lng: number | null, extra: Partial<CustomerProfile> = {}): CustomerProfile {
  return {
    sourceType: 'archibald', sourceId: id,
    displayName: `Cliente ${id}`,
    street: 'Via Test 1', postalCode: '80100', city: 'Napoli',
    province: 'NA', phone: null, email: null, vatNumber: null,
    lat, lng, geoQuality: lat != null ? 'geocoded' : 'unknown',
    isDistributor: false, matchedSources: [],
    ...extra,
  };
}

describe('deduplicateByStudio', () => {
  test('rimuove il duplicato Arca quando esiste già Archibald confermato', () => {
    const archibaldCustomer = makeProfile('55.374', 40.85, 14.27);
    const arcaCustomer: CustomerProfile = {
      ...makeProfile('C00602', 40.85, 14.27),
      sourceType: 'arca', sourceId: 'C00602',
      matchedSources: [
        { type: 'arca', id: 'C00602', name: 'Lab. Rossi' },
        { type: 'archibald', id: '55.374', name: 'Dr. Rossi' },
      ],
    };

    const candidates = [archibaldCustomer, arcaCustomer];
    const result = deduplicateByStudio(candidates);

    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe('55.374');
  });

  test('mantiene clienti Arca senza match Archibald', () => {
    const arcaOnly: CustomerProfile = {
      ...makeProfile('C00999', 40.85, 14.27),
      sourceType: 'arca', sourceId: 'C00999',
      matchedSources: [{ type: 'arca', id: 'C00999', name: 'Studio Senza Match' }],
    };
    const result = deduplicateByStudio([arcaOnly]);
    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe('C00999');
  });

  test('mantiene entrambi se nessun match confermato tra loro', () => {
    const a = makeProfile('55.374', 40.85, 14.27);
    const b: CustomerProfile = { ...makeProfile('C00001', 40.86, 14.28), sourceType: 'arca', sourceId: 'C00001', matchedSources: [] };
    const result = deduplicateByStudio([a, b]);
    expect(result).toHaveLength(2);
  });
});

describe('estimateTravelMinutes', () => {
  test('ritorna null se mancano coordinate', () => {
    expect(estimateTravelMinutes(null, null, 40.85, 14.27)).toBeNull();
  });

  test('stima tempo plausibile tra Napoli e Salerno (~50km → ~45-60 min)', () => {
    const mins = estimateTravelMinutes(40.85, 14.27, 40.67, 14.75);
    expect(mins).not.toBeNull();
    expect(mins!).toBeGreaterThan(30);
    expect(mins!).toBeLessThan(90);
  });
});

describe('nearestNeighborSort', () => {
  test('con tappe locked rimangono in posizione', () => {
    const profiles: Array<{ profile: CustomerProfile; score: number; locked: boolean }> = [
      { profile: makeProfile('A', 40.85, 14.27), score: 0.9, locked: true  },
      { profile: makeProfile('B', 40.70, 14.75), score: 0.5, locked: false },
      { profile: makeProfile('C', 40.80, 14.30), score: 0.7, locked: false },
    ];
    const sorted = nearestNeighborSort(profiles, { lat: 40.90, lng: 14.20 });
    // A è locked e deve restare primo
    expect(sorted[0].profile.sourceId).toBe('A');
  });
});
