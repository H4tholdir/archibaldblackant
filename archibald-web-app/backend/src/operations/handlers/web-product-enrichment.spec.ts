import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import {
  createWebProductEnrichmentHandler,
  parseKometFrPage,
  filterKometUkImages,
  parseKometUkJson,
} from './web-product-enrichment';

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const productInfoRow = {
  name: 'Komet 879.314.014',
  catalog_family_code: '879',
  web_enriched_at: null,
};

const youtubeResult = {
  url: 'https://www.youtube.com/watch?v=abc123',
  title: 'Komet 879 tutorial',
  snippet: 'Step-by-step guide',
};

const pdfResult = {
  url: 'https://komet.de/ifu/879.pdf',
  title: 'IFU 879',
  snippet: 'Instructions for use',
};

const articleResult = {
  url: 'https://dental-journal.com/879-komet-review',
  title: '879 Komet clinical review',
  snippet: 'Clinical indications for use',
};

const kometFrHtmlWithImages = `
<html>
<head><title>Produits Komet France - 879</title></head>
<body>
  <h1 class="product-title">Flamme, longue</h1>
  <div class="product-gallery">
    <img src="/getmetafile/af2a77f7-d07b-439e-ba7b-74e2adec3a25/03di_879_000_000_204.aspx" alt="879 image 1" />
    <img src="/getmetafile/bf3b88f8-e18c-550f-cb8c-85f3bfed4b36/03di_879_010_000_204.aspx" alt="879 image 2" />
  </div>
  <ul>
    <li>879.314.014 VPE 5</li>
    <li>879.314.018 VPE 5</li>
  </ul>
</body>
</html>
`;

const kometFrHtmlDuplicateImages = `
<html>
<body>
  <h2>Congé ogival cilindrico, lungo</h2>
  <img src="/getmetafile/af2a77f7-d07b-439e-ba7b-74e2adec3a25/03di_863_000_000_204.aspx" alt="863" />
  <img src="/getmetafile/af2a77f7-d07b-439e-ba7b-74e2adec3a25/03di_863_000_000_204.aspx" alt="863 dup" />
  <img src="/getmetafile/cc4d99a9-f20d-661g-dc9d-96g4cgfe5c47/03di_863_010_000_204.aspx" alt="863 v2" />
</body>
</html>
`;

const kometFrHtmlNoImages = `
<html>
<body>
  <p>No product photos available.</p>
</body>
</html>
`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseKometFrPage', () => {
  test('extracts getmetafile image URLs from HTML', () => {
    const result = parseKometFrPage(kometFrHtmlWithImages);

    expect(result.imageUrls).toEqual([
      '/getmetafile/af2a77f7-d07b-439e-ba7b-74e2adec3a25/03di_879_000_000_204.aspx',
      '/getmetafile/bf3b88f8-e18c-550f-cb8c-85f3bfed4b36/03di_879_010_000_204.aspx',
    ]);
  });

  test('deduplicates image URLs when the same getmetafile path appears multiple times', () => {
    const result = parseKometFrPage(kometFrHtmlDuplicateImages);

    expect(result.imageUrls).toEqual([
      '/getmetafile/af2a77f7-d07b-439e-ba7b-74e2adec3a25/03di_863_000_000_204.aspx',
      '/getmetafile/cc4d99a9-f20d-661g-dc9d-96g4cgfe5c47/03di_863_010_000_204.aspx',
    ]);
  });

  test('returns empty imageUrls array when no getmetafile URL is found', () => {
    const result = parseKometFrPage(kometFrHtmlNoImages);

    expect(result.imageUrls).toEqual([]);
  });

  test('extracts product description from h1 heading', () => {
    const result = parseKometFrPage(kometFrHtmlWithImages);

    expect(result.description).toBe('Flamme, longue');
  });

  test('extracts product description from h2 heading when no h1 is present', () => {
    const result = parseKometFrPage(kometFrHtmlDuplicateImages);

    expect(result.description).toBe('Congé ogival cilindrico, lungo');
  });

  test('returns empty description when no heading is found', () => {
    const result = parseKometFrPage(kometFrHtmlNoImages);

    expect(result.description).toBe('');
  });
});

describe('createWebProductEnrichmentHandler', () => {
  test('bulk mode: queries products pending web enrichment when no productId given', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn();
    const searchWeb = vi.fn();

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    const result = await handler(null, {}, 'service-account', vi.fn());

    expect(result).toEqual({ scraped: 0, resourcesFound: 0 });
    const [bulkSql] = vi.mocked(pool.query).mock.calls[0] as [string];
    expect(bulkSql).toContain('web_enriched_at IS NULL');
    expect(bulkSql).toContain('catalog_enriched_at IS NOT NULL');
  });

  test('bulk mode: enriches each pending product and reports final progress', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockResolvedValue({ html: kometFrHtmlWithImages, finalUrl: '' });
    const searchWeb = vi.fn().mockResolvedValue([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [
          { id: 'ERP-879', name: '879.314.014', catalog_family_code: '879' },
          { id: 'ERP-863', name: '863.314.016', catalog_family_code: '863' },
        ],
        rowCount: 2,
      })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const onProgress = vi.fn();
    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, {}, 'service-account', onProgress);

    expect(fetchUrl).toHaveBeenCalledTimes(4);
    expect(fetchUrl).toHaveBeenCalledWith('https://www.komet.fr/fr-FR/Produits/Produits-Komet-France/879');
    expect(fetchUrl).toHaveBeenCalledWith('https://www.komet.fr/fr-FR/Produits/Produits-Komet-France/863');
    expect(onProgress).toHaveBeenCalledWith(100, 'Done');
  });

  test('returns early with zeros when product not found in DB', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn();
    const searchWeb = vi.fn();

    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    const result = await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    expect(result).toEqual({ scraped: 0, resourcesFound: 0 });
    expect(fetchUrl).not.toHaveBeenCalled();
    expect(searchWeb).not.toHaveBeenCalled();
  });

  test('calls fetchUrl with komet.fr URL for the family code', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockResolvedValue({ html: kometFrHtmlWithImages, finalUrl: '' });
    const searchWeb = vi.fn().mockResolvedValue([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    expect(fetchUrl).toHaveBeenCalledWith(
      'https://www.komet.fr/fr-FR/Produits/Produits-Komet-France/879',
    );
  });

  test('returns empty images and empty description when fetchUrl throws', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockRejectedValue(new Error('network error'));
    const searchWeb = vi.fn().mockResolvedValue([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    const result = await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    expect(result).toEqual({ scraped: 0, resourcesFound: 0 });
  });

  test('calls searchWeb 3 times with correct query strings for the family code', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockRejectedValue(new Error('network error'));
    const searchWeb = vi.fn().mockResolvedValue([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    expect(searchWeb).toHaveBeenCalledTimes(3);
    expect(searchWeb).toHaveBeenCalledWith('"879 Komet" dental technique OR clinical indication');
    expect(searchWeb).toHaveBeenCalledWith('"879 Komet" video tutorial youtube');
    expect(searchWeb).toHaveBeenCalledWith('"879 Komet" IFU instructions pdf');
  });

  test('classifies youtube URL as video, .pdf URL as pdf, other as article', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockRejectedValue(new Error('network error'));
    const searchWeb = vi.fn()
      .mockResolvedValueOnce([youtubeResult])
      .mockResolvedValueOnce([pdfResult])
      .mockResolvedValueOnce([articleResult]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    const queryCalls = vi.mocked(pool.query).mock.calls;
    const resourceInsertCalls = queryCalls.filter(([sql]) =>
      (sql as string).includes('product_web_resources'),
    );

    const insertedTypes = resourceInsertCalls.map(([, params]) => (params as unknown[])[1]);
    expect(insertedTypes).toEqual(['video', 'pdf', 'article']);
  });

  test('inserts resources into product_web_resources with correct params', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockRejectedValue(new Error('network error'));
    const searchWeb = vi.fn()
      .mockResolvedValueOnce([youtubeResult])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    const queryCalls = vi.mocked(pool.query).mock.calls;
    const resourceInsertCall = queryCalls.find(([sql]) =>
      (sql as string).includes('product_web_resources'),
    );

    expect(resourceInsertCall![1]).toEqual([
      '879.314.014',
      'video',
      youtubeResult.url,
      youtubeResult.title,
      youtubeResult.snippet,
      'www.youtube.com',
      'en',
    ]);
  });

  test('inserts komet.fr images into product_gallery with source komet.fr', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockResolvedValue({ html: kometFrHtmlWithImages, finalUrl: '' });
    const searchWeb = vi.fn().mockResolvedValue([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    const queryCalls = vi.mocked(pool.query).mock.calls;
    const galleryInsertCalls = queryCalls.filter(([sql]) =>
      (sql as string).includes('product_gallery'),
    );

    expect(galleryInsertCalls[0]![1]).toEqual([
      '879.314.014',
      'https://www.komet.fr/getmetafile/af2a77f7-d07b-439e-ba7b-74e2adec3a25/03di_879_000_000_204.aspx',
      'web',
      'komet.fr',
      0,
    ]);
  });

  test('continues and updates web_enriched_at even when fetchUrl throws', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockRejectedValue(new Error('connection refused'));
    const searchWeb = vi.fn().mockResolvedValue([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    const result = await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    expect(result).toEqual({ scraped: 0, resourcesFound: 0 });

    const queryCalls = vi.mocked(pool.query).mock.calls;
    const webEnrichedAtUpdate = queryCalls.find(([sql]) =>
      (sql as string).includes('web_enriched_at'),
    );
    expect(webEnrichedAtUpdate).toBeDefined();
  });

  test('uses productId first segment as family code when catalog_family_code is null', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockResolvedValue({ html: '<html></html>', finalUrl: '' });
    const searchWeb = vi.fn().mockResolvedValue([]);

    const productRowWithNullFamily = {
      name: 'Komet 879.314.014',
      catalog_family_code: null,
      web_enriched_at: null,
    };

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productRowWithNullFamily], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, { productId: '879.314.014' }, 'user', vi.fn());

    expect(fetchUrl).toHaveBeenCalledWith(
      'https://www.komet.fr/fr-FR/Produits/Produits-Komet-France/879',
    );
    expect(searchWeb).toHaveBeenCalledWith(expect.stringContaining('"879 Komet"'));
  });

  test('updates web_enriched_at in product_details via upsert', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockRejectedValue(new Error('network error'));
    const searchWeb = vi.fn().mockResolvedValue([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    const queryCalls = vi.mocked(pool.query).mock.calls;
    const upsertCall = queryCalls.find(
      ([sql]) =>
        (sql as string).includes('product_details') &&
        (sql as string).includes('web_enriched_at') &&
        (sql as string).includes('ON CONFLICT'),
    );

    expect(upsertCall![1]).toEqual(['879.314.014']);
  });
});

// ── filterKometUkImages tests ────────────────────────────────────────────────

const SHOPIFY_IMAGES = [
  { src: 'https://cdn.shopify.com/s/files/01tc_h1_314_012_450_abc.png', alt: 'H1 FG 012' },
  { src: 'https://cdn.shopify.com/s/files/01tc_h1_314_016_450_def.png', alt: 'H1 FG 016' },
  { src: 'https://cdn.shopify.com/s/files/01tc_h1_314_018_450_ghi.png', alt: 'H1 FG 018' },
  { src: 'https://cdn.shopify.com/s/files/01tc_h1_family_pack_jkl.png', alt: 'H1 family' },
];

describe('filterKometUkImages', () => {
  test('restituisce solo le immagini che matchano shankCode e sizeCode', () => {
    const result = filterKometUkImages(SHOPIFY_IMAGES, '314', '016');
    expect(result).toHaveLength(1);
    expect(result[0].url).toContain('_314_016_');
  });

  test('restituisce array vuoto se nessun match', () => {
    const result = filterKometUkImages(SHOPIFY_IMAGES, '314', '021');
    expect(result).toEqual([]);
  });

  test('scarta immagini di famiglia senza codice misura specifico', () => {
    const result = filterKometUkImages(SHOPIFY_IMAGES, '314', '016');
    expect(result.every(img => img.url.includes('_314_016_'))).toBe(true);
  });

  test('normalizza URL e altText in GalleryImage', () => {
    const result = filterKometUkImages(SHOPIFY_IMAGES, '314', '016');
    expect(result[0]).toMatchObject({
      url:       expect.stringContaining('cdn.shopify.com'),
      source:    'kometuk.com',
      imageType: 'catalog_render',
    });
  });
});

// ── parseKometUkJson tests ───────────────────────────────────────────────────

const shopifyJson = JSON.stringify({
  product: {
    images: [
      { src: 'https://cdn.shopify.com/s/files/01tc_h1_314_016_450_abc.png', alt: 'H1 FG 016' },
      { src: 'https://cdn.shopify.com/s/files/01tc_h1_204_016_450_def.png', alt: 'H1 CA 016' },
    ],
  },
});

describe('parseKometUkJson', () => {
  test('estrae immagini dal JSON Shopify', () => {
    const images = parseKometUkJson(shopifyJson);
    expect(images).toHaveLength(2);
  });

  test('restituisce array vuoto su JSON malformato', () => {
    expect(parseKometUkJson('not json')).toEqual([]);
  });

  test('restituisce array vuoto se product.images assente', () => {
    expect(parseKometUkJson(JSON.stringify({ product: {} }))).toEqual([]);
  });
});
