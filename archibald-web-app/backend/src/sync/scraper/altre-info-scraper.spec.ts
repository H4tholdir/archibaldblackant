import { describe, expect, test, vi } from 'vitest';
import { parseItDatetime, scrapeCustomerAltreInfoTab } from './altre-info-scraper';

describe('parseItDatetime', () => {
  test.each([
    ['23/01/2026 10:05:25', '2026-01-23T10:05:25'],
    ['28/04/2026 16:19:52', '2026-04-28T16:19:52'],
    ['07/02/2027 00:00:00', '2027-02-07T00:00:00'],
  ])('converte "%s" → "%s"', (input, expected) => {
    expect(parseItDatetime(input)).toBe(expected);
  });

  test('restituisce null per stringa vuota', () => {
    expect(parseItDatetime('')).toBeNull();
  });

  test('restituisce null per formato non riconosciuto', () => {
    expect(parseItDatetime('2026-01-23')).toBeNull();
    expect(parseItDatetime('23/01/2026')).toBeNull();
  });
});

describe('scrapeCustomerAltreInfoTab', () => {
  function buildMockPage(overrides: Record<string, unknown> = {}) {
    return {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn()
        .mockResolvedValueOnce(true) // tabClicked
        .mockResolvedValueOnce({    // fields
          refId: '-1',
          refIdOldCrm: '67.961',
          busRelAccount: 'IN00042395',
          busRelTypeId: 'Debitor',
          createdDatetime: '23/01/2026 10:05:25',
          modifiedDatetime: '28/04/2026 16:19:52',
          createdBy: '00122',
          modifiedBy: 'admsy',
          groAddress: '',
          latitude: '0',
          longitude: '0',
        }),
      ...overrides,
    } as unknown as import('puppeteer').Page;
  }

  test('naviga alla URL corretta rimuovendo il punto dall\'erpId', async () => {
    const page = buildMockPage();
    await scrapeCustomerAltreInfoTab(page, 'https://erp.local', '55.258');
    expect(page.goto).toHaveBeenCalledWith(
      'https://erp.local/CUSTTABLE_DetailView/55258/?mode=View',
      expect.any(Object),
    );
  });

  test('mappa i campi CRM correttamente', async () => {
    const page = buildMockPage();
    const result = await scrapeCustomerAltreInfoTab(page, 'https://erp.local', '55.258');
    expect(result).toMatchObject({
      ok: true,
      crmRefId: '-1',
      crmOldRefId: '67.961',
      crmAccountCommercial: 'IN00042395',
      crmContactType: 'Debitor',
    });
  });

  test('mappa le date del sistema ERP in formato ISO', async () => {
    const page = buildMockPage();
    const result = await scrapeCustomerAltreInfoTab(page, 'https://erp.local', '55.258');
    expect(result).toMatchObject({
      erpCreatedAt: '2026-01-23T10:05:25',
      erpCreatedBy: '00122',
      erpModifiedAt: '2026-04-28T16:19:52',
      erpModifiedBy: 'admsy',
    });
  });

  test('restituisce ok:false se la navigazione fallisce', async () => {
    const page = buildMockPage({
      goto: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    const result = await scrapeCustomerAltreInfoTab(page, 'https://erp.local', '55.258');
    expect(result.ok).toBe(false);
  });

  test('restituisce ok:false se il tab non è trovato', async () => {
    const page = buildMockPage({
      evaluate: vi.fn().mockResolvedValueOnce(false), // tabClicked = false
    });
    const result = await scrapeCustomerAltreInfoTab(page, 'https://erp.local', '55.258');
    expect(result.ok).toBe(false);
  });

  test('mappa geo_latitude e geo_longitude come numeri', async () => {
    const page = buildMockPage({
      evaluate: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce({
          refId: '', refIdOldCrm: '', busRelAccount: '', busRelTypeId: '',
          createdDatetime: '', modifiedDatetime: '',
          createdBy: '', modifiedBy: '',
          groAddress: 'Via Roma 1',
          latitude: '41.9028',
          longitude: '12.4964',
        }),
    });
    const result = await scrapeCustomerAltreInfoTab(page, 'https://erp.local', '55.258');
    expect(result.geoLatitude).toBeCloseTo(41.9028);
    expect(result.geoLongitude).toBeCloseTo(12.4964);
    expect(result.geoAddress).toBe('Via Roma 1');
  });
});
