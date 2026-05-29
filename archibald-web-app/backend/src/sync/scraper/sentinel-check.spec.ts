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

  // Guard 1: future_timestamp
  test('unknown(future_timestamp) se lastSyncAt è nel futuro (>30s)', () => {
    const futureSync = new Date(Date.now() + 60_000); // 1 minuto nel futuro
    const r = evaluateSentinel(d('2026-05-28T09:00:00Z'), futureSync);
    expect(r).toEqual({ status: 'unknown', reason: 'future_timestamp' });
  });

  test('unchanged (non future_timestamp) se lastSyncAt è nel futuro ma entro 30s di tolleranza', () => {
    const withinTolerance = new Date(Date.now() + 10_000); // 10s nel futuro = dentro tolleranza
    const maxMod = new Date(Date.now() - 3600_000); // 1h fa
    const r = evaluateSentinel(maxMod, withinTolerance);
    expect(r.status).toBe('unchanged'); // maxMod < withinTolerance → unchanged
  });

  // Guard 2: stale
  test('unknown(stale) se lastSyncAt è più vecchio di maxStalenessMs', () => {
    const staleSync = new Date(Date.now() - 3 * 3600_000); // 3h fa
    const maxMod = new Date(Date.now() - 4 * 3600_000);    // 4h fa (non cambiato)
    const r = evaluateSentinel(maxMod, staleSync, 2 * 3600_000); // cap 2h
    expect(r).toEqual({ status: 'unknown', reason: 'stale' });
  });

  test('unchanged se lastSyncAt è recente rispetto a maxStalenessMs', () => {
    const recentSync = new Date(Date.now() - 30 * 60_000); // 30 min fa
    const maxMod = new Date(Date.now() - 2 * 3600_000);    // 2h fa (invariato)
    const r = evaluateSentinel(maxMod, recentSync, 2 * 3600_000); // cap 2h
    expect(r.status).toBe('unchanged');
  });

  test('stale ha precedenza su changed: forza sync anche se maxModifiedAt è recente', () => {
    const staleSync = new Date(Date.now() - 5 * 3600_000);   // 5h fa
    const recentMod = new Date(Date.now() - 10_000);          // 10s fa — nuovo dato
    const r = evaluateSentinel(recentMod, staleSync, 2 * 3600_000);
    // recentMod > staleSync → normally 'changed', but stale guard fires first
    expect(r).toEqual({ status: 'unknown', reason: 'stale' });
  });

  test('senza maxStalenessMs il cap non si applica (unchanged)', () => {
    const veryOldSync = new Date(Date.now() - 30 * 24 * 3600_000); // 30gg fa
    const maxMod = new Date(Date.now() - 31 * 24 * 3600_000);
    const r = evaluateSentinel(maxMod, veryOldSync); // nessun cap
    expect(r.status).toBe('unchanged');
  });
});
