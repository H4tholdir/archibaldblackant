import { describe, expect, test } from 'vitest';
import { normalizePictograms } from './pictogram-labels';

describe('normalizePictograms', () => {
  test('maps a known symbol to its Italian label', () => {
    expect(normalizePictograms(['cavity_tooth'])).toEqual([
      { symbol: 'cavity_tooth', labelIt: 'Preparazione cavità' },
    ]);
  });

  test('deduplicates aliases that resolve to the same Italian label', () => {
    // cavity_tooth, cavity_prep, cavity_preparation all → 'Preparazione cavità'
    expect(normalizePictograms(['cavity_tooth', 'cavity_prep', 'cavity_preparation'])).toEqual([
      { symbol: 'cavity_tooth', labelIt: 'Preparazione cavità' },
    ]);
  });

  test('omits symbols mapped to null (maximum_speed, packing_unit, REF)', () => {
    expect(normalizePictograms(['maximum_speed', 'cavity_tooth', 'packing_unit', 'REF'])).toEqual([
      { symbol: 'cavity_tooth', labelIt: 'Preparazione cavità' },
    ]);
  });

  test('omits unknown symbols not present in the map', () => {
    expect(normalizePictograms(['unknown_symbol_xyz'])).toEqual([]);
  });

  test('returns empty array for empty input', () => {
    expect(normalizePictograms([])).toEqual([]);
  });

  test('normalizes autoclave case variants to the same label', () => {
    // DB has autoclave_134, autoclave_134c, autoclave_134C — all same meaning
    const result = normalizePictograms(['autoclave_134', 'autoclave_134c', 'autoclave_134C']);
    expect(result).toEqual([{ symbol: 'autoclave_134', labelIt: 'Autoclave 134°C' }]);
  });

  test('normalizes further_info / further_information / info_i to same label', () => {
    const result = normalizePictograms(['further_info', 'further_information', 'info_i']);
    expect(result).toEqual([{ symbol: 'further_info', labelIt: 'Ulteriori informazioni disponibili' }]);
  });

  test('preserves order of first occurrence when deduplicating', () => {
    const result = normalizePictograms(['implant', 'implantology', 'orthodontics']);
    expect(result).toEqual([
      { symbol: 'implant',      labelIt: 'Implantologia' },
      { symbol: 'orthodontics', labelIt: 'Ortodonzia' },
    ]);
  });
});
