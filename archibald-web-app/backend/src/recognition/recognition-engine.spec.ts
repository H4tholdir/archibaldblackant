import { describe, expect, test, vi } from 'vitest';
import { buildRecognitionResult, runRecognitionPipeline, resolveShankType, SHAPE_SYNONYMS } from './recognition-engine';
import type { LookupRow } from '../db/repositories/instrument-features';

const BASE_FEATURES = {
  shape_family: 'round', material: 'diamond_diao',
  grit_ring_color: 'green', shank_type: 'fg' as const,
  shank_length_category: 'short' as const,
  head_shank_ratio: 0.625, confidence: 0.95,
};

function row(id: string, size: number): LookupRow {
  return { product_id: id, head_size_mm: size, shank_type: 'fg', name: `Product ${id}`, image_url: null };
}

describe('buildRecognitionResult', () => {
  test('returns match when exactly 1 candidate and confidence ≥ 0.9', () => {
    const result = buildRecognitionResult([row('KP6801.314.016', 1.6)], BASE_FEATURES, 1.6);
    expect(result.state).toBe('match');
    if (result.state === 'match') {
      expect(result.product.productId).toBe('KP6801.314.016');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  test('returns shortlist when 2-4 candidates', () => {
    const candidates = [row('A.314.014', 1.4), row('A.314.016', 1.6), row('A.314.018', 1.8)];
    const result = buildRecognitionResult(candidates, BASE_FEATURES, 1.6);
    expect(result.state).toBe('shortlist');
    if (result.state === 'shortlist') {
      expect(result.candidates).toHaveLength(3);
    }
  });

  test('returns filter_needed when >4 candidates', () => {
    const candidates = Array.from({ length: 5 }, (_, i) => row(`A.314.01${i}`, 1 + i * 0.2));
    const result = buildRecognitionResult(candidates, BASE_FEATURES, null);
    expect(result.state).toBe('filter_needed');
  });

  test('returns filter_needed when calc_size is null', () => {
    const result = buildRecognitionResult([row('A.314.016', 1.6)], BASE_FEATURES, null);
    expect(result.state).toBe('filter_needed');
  });

  test('returns not_found when 0 candidates', () => {
    const result = buildRecognitionResult([], BASE_FEATURES, 1.6);
    expect(result.state).toBe('not_found');
  });
});

describe('resolveShankType', () => {
  test('fg + long → hp (HP instrument misidentified as FG)', () => {
    expect(resolveShankType('fg', 'long')).toBe('hp');
  });

  test('fg + extra_long → hp', () => {
    expect(resolveShankType('fg', 'extra_long')).toBe('hp');
  });

  test('fg + short → fg (genuine FG instrument)', () => {
    expect(resolveShankType('fg', 'short')).toBe('fg');
  });

  test('fg + medium → fg (FGL/FGXL still classified as fg)', () => {
    expect(resolveShankType('fg', 'medium')).toBe('fg');
  });

  test('fg + null length → fg (no correction without length info)', () => {
    expect(resolveShankType('fg', null)).toBe('fg');
  });

  test('ca + long → ca (CA is never corrected to HP)', () => {
    expect(resolveShankType('ca', 'long')).toBe('ca');
  });

  test('hp + short → hp (HP stays HP regardless of length)', () => {
    expect(resolveShankType('hp', 'short')).toBe('hp');
  });
});

describe('SHAPE_SYNONYMS', () => {
  test('torpedo ↔ tapered_round_end are mutual synonyms', () => {
    expect(SHAPE_SYNONYMS['torpedo']).toBe('tapered_round_end');
    expect(SHAPE_SYNONYMS['tapered_round_end']).toBe('torpedo');
  });

  test('cylinder_round_end → torpedo (Haiku confuses the two)', () => {
    expect(SHAPE_SYNONYMS['cylinder_round_end']).toBe('torpedo');
  });

  test('cylinder → cylinder_round_end', () => {
    expect(SHAPE_SYNONYMS['cylinder']).toBe('cylinder_round_end');
  });
});

const BASE64  = 'AAAA';
const USER_ID = 'user-test';

function makeDeps(overrides: Partial<{
  callVisionApi: ReturnType<typeof vi.fn>;
  appendRecognitionLog: ReturnType<typeof vi.fn>;
}>) {
  return {
    pool: {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })  // getCached miss
        .mockResolvedValueOnce({ rows: [] })  // resetBudgetIfExpired
        .mockResolvedValueOnce({ rows: [] }), // getBudgetRow → budget_exhausted
    } as unknown as import('../db/pool').DbPool,
    callVisionApi: overrides.callVisionApi ?? vi.fn(),
    appendRecognitionLog: overrides.appendRecognitionLog ?? vi.fn(),
  };
}

describe('runRecognitionPipeline', () => {
  test('non scrive recognition_log quando callVisionApi lancia', async () => {
    const error = new Error('Anthropic timeout');
    const deps = makeDeps({ callVisionApi: vi.fn().mockRejectedValue(error) });
    await runRecognitionPipeline(deps, BASE64, USER_ID, 'agent');
    expect(deps.appendRecognitionLog).not.toHaveBeenCalled();
  });
});
