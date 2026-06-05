import { describe, test, expect, vi } from 'vitest';
import { buildCustomerProfile, resolveCustomerIdentity } from './visit-unified-customer';

const USER_ID = 'user-1';

const archRow = {
  erp_id: '55.374', account_num: '1002328-no', name: 'Dr. Rossi Mario',
  street: 'Via Roma 1', postal_code: '80100', city: 'Napoli',
  phone: '081123456', email: null, vat_number: '07234911217',
  is_distributor: false,
};

const arcaRow = {
  codice: 'C00602', ragione_sociale: 'Lab. Odont. Rossi',
  indirizzo: 'Via Roma 2', cap: '80100', localita: 'Napoli', prov: 'NA',
  telefono: '081999999', email: null, partita_iva: '07234911217',
};

describe('buildCustomerProfile — sorgente archibald', () => {
  test('mappa correttamente i campi Archibald in CustomerProfile', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [archRow] })  // customers query
        .mockResolvedValueOnce({ rows: [] })          // geo status
        .mockResolvedValueOnce({ rows: [] }),          // match arca
    } as any;

    const result = await buildCustomerProfile(pool, USER_ID, 'archibald', '55.374');

    expect(result).toMatchObject({
      sourceType: 'archibald',
      sourceId: '55.374',
      displayName: 'Dr. Rossi Mario',
      city: 'Napoli',
      postalCode: '80100',
      isDistributor: false,
    });
  });

  test('restituisce null per cliente non trovato', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
    const result = await buildCustomerProfile(pool, USER_ID, 'archibald', '99.999');
    expect(result).toBeNull();
  });
});

describe('buildCustomerProfile — sorgente arca', () => {
  test('mappa correttamente i campi Arca in CustomerProfile', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [arcaRow] })  // sub_clients query
        .mockResolvedValueOnce({ rows: [] })          // geo status
        .mockResolvedValueOnce({ rows: [] }),          // match archibald
    } as any;

    const result = await buildCustomerProfile(pool, USER_ID, 'arca', 'C00602');

    expect(result).toMatchObject({
      sourceType: 'arca',
      sourceId: 'C00602',
      displayName: 'Lab. Odont. Rossi',
      city: 'Napoli',
      isDistributor: false,
    });
  });
});

describe('resolveCustomerIdentity', () => {
  test('risolve source type da prefisso arca:', () => {
    const result = resolveCustomerIdentity('arca:C00602');
    expect(result).toEqual({ sourceType: 'arca', sourceId: 'C00602' });
  });

  test('risolve source type archibald da ID numerico XX.YYY', () => {
    const result = resolveCustomerIdentity('55.374');
    expect(result).toEqual({ sourceType: 'archibald', sourceId: '55.374' });
  });

  test('lancia errore per ID non riconoscibile', () => {
    expect(() => resolveCustomerIdentity('invalid-id')).toThrow('Cannot resolve');
  });
});
