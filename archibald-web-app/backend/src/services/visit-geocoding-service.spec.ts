import { describe, test, expect, vi, beforeEach } from 'vitest';
import { geocodeAddress, buildAddressString, buildArcaAddressString, stripHouseNumber, geocodeWithFallback } from './visit-geocoding-service';

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

describe('stripHouseNumber', () => {
  test.each([
    // Formato reale DB: comma + civico
    ['Piazza Francesco Alario, 1',   'Piazza Francesco Alario'],
    ['Viale Sabino Cocchia, 36A',    'Viale Sabino Cocchia'],
    ['V.le ITALIA,10',               'V.le ITALIA'],
    ['Via Roma, 10B',                'Via Roma'],
    ['Contrada Torre, 36/A',         'Contrada Torre'],
    // Civico senza virgola
    ['Via Roma 10',                  'Via Roma'],
    // Il numero nella toponomastica (NON nel civico) non viene strippato
    ['Via 4 Novembre, 12',           'Via 4 Novembre'],
    // Nessun numero civico: stringa invariata
    ['Via Dante',                    'Via Dante'],
    ['Corso Garibaldi',              'Corso Garibaldi'],
    // snc (senza numero civico): invariata
    ['Via Roma, snc',                'Via Roma, snc'],
  ] as [string, string][])('"%s" → "%s"', (input, expected) => {
    expect(stripHouseNumber(input)).toBe(expected);
  });
});

describe('geocodeWithFallback', () => {
  const COORDS = { lat: 40.6, lng: 14.7 };

  test('usa indirizzo completo se Nominatim lo trova — quality geocoded', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ lat: '40.6', lon: '14.7' }] });
    const result = await geocodeWithFallback('Via Roma, 10', '84013', 'Salerno');
    expect(result).toEqual({ ...COORDS, quality: 'geocoded' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('ricade su via senza civico se indirizzo completo fallisce — quality geocoded', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })          // completo: fallisce
      .mockResolvedValueOnce({ ok: true, json: async () => [{ lat: '40.6', lon: '14.7' }] }); // via senza civico: ok
    const result = await geocodeWithFallback('Piazza Alario, 1', '84100', 'Salerno');
    expect(result).toEqual({ ...COORDS, quality: 'geocoded' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test('ricade su città se anche la via senza civico fallisce — quality geocoded_approx', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })   // completo: fallisce
      .mockResolvedValueOnce({ ok: true, json: async () => [] })   // via senza civico: fallisce
      .mockResolvedValueOnce({ ok: true, json: async () => [{ lat: '40.6', lon: '14.7' }] }); // città: ok
    const result = await geocodeWithFallback('Viale Sabino Cocchia, 36A', '83020', 'Cesinali');
    expect(result).toEqual({ ...COORDS, quality: 'geocoded_approx' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test('restituisce null se tutti i livelli falliscono', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const result = await geocodeWithFallback('Via XYZ, 1', '00000', 'Paese Inesistente');
    expect(result).toBeNull();
  });

  test('non tenta il fallback via se il civico non è presente', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })   // completo senza civico: fallisce
      .mockResolvedValueOnce({ ok: true, json: async () => [{ lat: '40.6', lon: '14.7' }] }); // città: ok
    // "Via Dante" non ha numero civico → salta il livello 2
    const result = await geocodeWithFallback('Via Dante', '84013', 'Cava de Tirreni');
    expect(result).toEqual({ ...COORDS, quality: 'geocoded_approx' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test('restituisce null se city è null e tutti i livelli falliscono', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const result = await geocodeWithFallback('Via Roma, 1', '84013', null);
    expect(result).toBeNull();
  });
});
