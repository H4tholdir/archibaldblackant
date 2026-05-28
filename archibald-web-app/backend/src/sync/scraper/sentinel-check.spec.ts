import { describe, expect, test } from 'vitest';
import { evaluateSentinel } from './sentinel-check';

const d = (iso: string) => new Date(iso);

describe('evaluateSentinel', () => {
  test('unknown se maxModifiedAt è null (colonna assente o errore)', () => {
    const r = evaluateSentinel(null, d('2026-05-28T09:00:00Z'));
    expect(r).toEqual({ status: 'unknown', reason: 'modif_unavailable' });
  });

  test('unknown se lastSyncAt è null (prima sync mai eseguita)', () => {
    const r = evaluateSentinel(d('2026-05-28T08:00:00Z'), null);
    expect(r).toEqual({ status: 'unknown', reason: 'never_synced' });
  });

  test('unknown se entrambi null', () => {
    const r = evaluateSentinel(null, null);
    expect(r).toEqual({ status: 'unknown', reason: 'modif_unavailable' });
  });

  test('unchanged se maxModifiedAt è uguale a lastSyncAt (alla soglia)', () => {
    const t = d('2026-05-28T08:00:00Z');
    const r = evaluateSentinel(t, t);
    expect(r).toEqual({ status: 'unchanged', maxModifiedAt: t });
  });

  test('unchanged se maxModifiedAt è precedente a lastSyncAt', () => {
    const r = evaluateSentinel(
      d('2026-05-27T10:00:00Z'),
      d('2026-05-28T09:00:00Z'),
    );
    expect(r).toEqual({ status: 'unchanged', maxModifiedAt: d('2026-05-27T10:00:00Z') });
  });

  test('changed se maxModifiedAt è successivo a lastSyncAt di 1ms', () => {
    const max = d('2026-05-28T09:00:00.001Z');
    const last = d('2026-05-28T09:00:00.000Z');
    const r = evaluateSentinel(max, last);
    expect(r).toEqual({ status: 'changed', maxModifiedAt: max });
  });

  test('changed se maxModifiedAt è molto successivo a lastSyncAt', () => {
    const r = evaluateSentinel(
      d('2026-05-28T09:16:38.000Z'), // ordine di oggi
      d('2026-05-28T08:00:00.000Z'), // ultima sync un\'ora fa
    );
    expect(r.status).toBe('changed');
  });

  test('unchanged: prezzi di febbraio con ultima sync di stamattina → skip', () => {
    const r = evaluateSentinel(
      d('2026-02-26T21:00:42.823Z'), // max prezzo (PRICEDISCTABLE)
      d('2026-05-28T08:00:00.000Z'), // ultima sync
    );
    expect(r).toEqual({ status: 'unchanged', maxModifiedAt: d('2026-02-26T21:00:42.823Z') });
  });
});
