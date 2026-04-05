import { describe, expect, test } from 'vitest';
import { parseKometCode, calculateHeadSizeMm } from './komet-code-parser';

describe('parseKometCode', () => {
  test('parses TC round FG (H1.314.016)', () => {
    const result = parseKometCode('H1.314.016');
    expect(result).toEqual({
      shape_family:    'round',
      material:        'tungsten_carbide',
      grit_ring_color: null,
      family_code:     'H1',
      shank_type:      'fg',
      shank_diameter_mm: 1.6,
      head_size_code:  '016',
      head_size_mm:    1.6,
    });
  });

  test('parses DIAO round FG (KP6801.314.016)', () => {
    const result = parseKometCode('KP6801.314.016');
    expect(result).not.toBeNull();
    expect(result!.material).toBe('diamond_diao');
    expect(result!.shank_type).toBe('fg');
    expect(result!.head_size_mm).toBe(1.6);
  });

  test('parses CA shank (H2.204.010)', () => {
    const result = parseKometCode('H2.204.010');
    expect(result).not.toBeNull();
    expect(result!.shank_type).toBe('ca');
    expect(result!.shank_diameter_mm).toBe(2.35);
    expect(result!.head_size_mm).toBe(1.0);
  });

  test('parses diamond fine red ring (8801.314.018)', () => {
    const result = parseKometCode('8801.314.018');
    expect(result).not.toBeNull();
    expect(result!.material).toBe('diamond');
    expect(result!.grit_ring_color).toBe('red');
    expect(result!.head_size_mm).toBe(1.8);
  });

  test('returns null for unknown family code (ZZZ.314.016)', () => {
    expect(parseKometCode('ZZZ.314.016')).toBeNull();
  });

  test('returns null for malformed code (no dots)', () => {
    expect(parseKometCode('H1314016')).toBeNull();
  });
});

describe('calculateHeadSizeMm', () => {
  test('calculates size from pixel ratio (FG shank)', () => {
    // shank = 1.6mm, head is twice the shank → 3.2mm → snaps to 3.1
    const result = calculateHeadSizeMm(200, 100, 'fg');
    expect(result).toBe(3.1);
  });

  test('snaps to nearest ISO size (FG, head ≈ 1.0 → exactly 1.0)', () => {
    // head 100px, shank 160px → rawMm = (100/160)*1.6 = 1.0
    const result = calculateHeadSizeMm(100, 160, 'fg');
    expect(result).toBe(1.0);
  });

  test('returns null when shankPx is 0', () => {
    expect(calculateHeadSizeMm(100, 0, 'fg')).toBeNull();
  });

  test('returns null for unknown shank type', () => {
    expect(calculateHeadSizeMm(100, 100, 'unknown')).toBeNull();
  });
});
