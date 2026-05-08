import { describe, expect, test } from 'vitest';
import { PreemptedSignal, isPreemptedSignal } from './preempted-signal';

describe('PreemptedSignal', () => {
  test('è istanza di Error', () => {
    expect(new PreemptedSignal()).toBeInstanceOf(Error);
  });

  test('isPreemptedSignal riconosce PreemptedSignal', () => {
    expect(isPreemptedSignal(new PreemptedSignal())).toBe(true);
  });

  test('isPreemptedSignal rigetta Error generico', () => {
    expect(isPreemptedSignal(new Error('generic'))).toBe(false);
  });

  test('isPreemptedSignal rigetta null e primitive', () => {
    expect(isPreemptedSignal(null)).toBe(false);
    expect(isPreemptedSignal('string')).toBe(false);
    expect(isPreemptedSignal(undefined)).toBe(false);
  });

  test('tag è preempted', () => {
    const s = new PreemptedSignal();
    expect(s.tag).toBe('preempted');
  });
});
