import { describe, test, expect, vi, beforeEach } from 'vitest';
import { geocodeAddress, buildAddressString, buildArcaAddressString } from './visit-geocoding-service';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => { vi.clearAllMocks(); });

describe('buildAddressString', () => {
  test('combina street, postal_code, city', () => {
    expect(buildAddressString('Via Roma 10', '84013', 'Cava de Tirreni')).toBe('Via Roma 10, 84013 Cava de Tirreni');
  });

  test('skippa i campi null', () => {
    expect(buildAddressString(null, '84013', 'Cava de Tirreni')).toBe('84013 Cava de Tirreni');
  });

  test('restituisce null se tutti i campi sono null', () => {
    expect(buildAddressString(null, null, null)).toBeNull();
  });
});

describe('buildArcaAddressString', () => {
  test('combina indirizzo, cap, localita', () => {
    expect(buildArcaAddressString('Via Napoli 5', '84100', 'Salerno')).toBe('Via Napoli 5, 84100 Salerno');
  });

  test('restituisce null se localita mancante', () => {
    expect(buildArcaAddressString('Via Napoli 5', '84100', null)).toBeNull();
  });
});

describe('geocodeAddress', () => {
  test('restituisce lat/lng se Nominatim risponde con risultati', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '40.6824', lon: '14.7681' }],
    });
    const result = await geocodeAddress('Via Roma 10, 84013 Cava de Tirreni');
    expect(result).toEqual({ lat: 40.6824, lng: 14.7681 });
  });

  test('restituisce null se Nominatim risponde con array vuoto', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    const result = await geocodeAddress('Indirizzo inesistente XYZ 99999');
    expect(result).toBeNull();
  });

  test('restituisce null se fetch fallisce', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await geocodeAddress('Via Roma 10');
    expect(result).toBeNull();
  });

  test('usa User-Agent corretto nella request', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ lat: '40', lon: '14' }] });
    await geocodeAddress('Via Roma 10, 84013 Salerno');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('nominatim.openstreetmap.org'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Formicanera') }),
      }),
    );
  });
});
