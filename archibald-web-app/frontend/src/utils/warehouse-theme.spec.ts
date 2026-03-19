import { describe, expect, test } from 'vitest';
import { bestMatchLevel, isAutoSelected } from './warehouse-theme';
import type { MatchLevel } from '../services/warehouse-matching';

const m = (level: MatchLevel) => ({ level });

describe('bestMatchLevel', () => {
  test('returns none for empty array', () => {
    expect(bestMatchLevel([])).toBe('none');
  });
  test('returns exact when present', () => {
    expect(bestMatchLevel([m('figura'), m('exact')])).toBe('exact');
  });
  test('returns figura-gambo when no exact', () => {
    expect(bestMatchLevel([m('figura'), m('figura-gambo')])).toBe('figura-gambo');
  });
  test('returns figura when no better match', () => {
    expect(bestMatchLevel([m('description'), m('figura')])).toBe('figura');
  });
  test('returns description when only match', () => {
    expect(bestMatchLevel([m('description')])).toBe('description');
  });
  test('returns figura-gambo when competing with description only', () => {
    expect(bestMatchLevel([m('description'), m('figura-gambo')])).toBe('figura-gambo');
  });
});

describe('isAutoSelected', () => {
  test('exact is auto-selected', () => expect(isAutoSelected('exact')).toBe(true));
  test('figura-gambo is auto-selected', () => expect(isAutoSelected('figura-gambo')).toBe(true));
  test('figura is NOT auto-selected', () => expect(isAutoSelected('figura')).toBe(false));
  test('description is NOT auto-selected', () => expect(isAutoSelected('description')).toBe(false));
});
