import { describe, it, expect, beforeEach } from 'vitest';
import { cacheService } from './cache-service';
import { db } from '../db/schema';

describe('CacheService', () => {
  beforeEach(async () => {
    // Clear database before each test
    await db.customers.clear();
    await db.products.clear();
    await db.productVariants.clear();
    await db.prices.clear();
    await db.cacheMetadata.clear();

    // Seed test data
    await db.customers.bulkAdd([
      {
        id: 'C001',
        name: 'Mario Rossi',
        code: 'A123',
        taxCode: 'RSSMRA80A01H501Z',
        address: 'Via Roma 1',
        city: 'Milano',
        province: 'MI',
        cap: '20100',
        phone: '0212345678',
        email: 'mario.rossi@example.com',
        fax: '',
        lastModified: new Date().toISOString(),
        hash: 'hash1'
      },
      {
        id: 'C002',
        name: 'Luigi Verdi',
        code: 'B456',
        taxCode: 'VRDLGU75B02H501W',
        address: 'Via Milano 2',
        city: 'Roma',
        province: 'RM',
        cap: '00100',
        phone: '0698765432',
        email: 'luigi.verdi@example.com',
        fax: '',
        lastModified: new Date().toISOString(),
        hash: 'hash2'
      },
      {
        id: 'C003',
        name: 'Anna Bianchi',
        code: 'C789',
        taxCode: 'BNCNNA85C03H501V',
        address: 'Corso Milano 3',
        city: 'Milano',
        province: 'MI',
        cap: '20121',
        phone: '0298765432',
        email: 'anna.bianchi@example.com',
        fax: '',
        lastModified: new Date().toISOString(),
        hash: 'hash3'
      }
    ]);

    await db.products.bulkAdd([
      {
        id: 'P001',
        name: 'H71',
        article: '02.33.016',
        description: 'H71 Product Description',
        lastModified: new Date().toISOString(),
        hash: 'phash1'
      },
      {
        id: 'P002',
        name: 'H72',
        article: '02.33.017',
        description: 'H72 Product Description',
        lastModified: new Date().toISOString(),
        hash: 'phash2'
      }
    ]);

    await db.productVariants.bulkAdd([
      {
        productId: 'P001',
        variantId: 'V001',
        multipleQty: 10,
        minQty: 10,
        maxQty: 100,
        packageContent: '10'
      },
      {
        productId: 'P002',
        variantId: 'V002',
        multipleQty: 5,
        minQty: 5,
        maxQty: 50,
        packageContent: '5'
      }
    ]);

    await db.prices.bulkAdd([
      {
        articleId: 'P001',
        articleName: 'H71',
        price: 29.99,
        lastSynced: new Date().toISOString()
      },
      {
        articleId: 'P002',
        articleName: 'H72',
        price: 39.99,
        lastSynced: new Date().toISOString()
      }
    ]);
  });

  describe('searchCustomers', () => {
    it('should return customers matching name (case-insensitive)', async () => {
      const results = await cacheService.searchCustomers('mario');
      expect(results.some(c => c.name.toLowerCase().includes('mario'))).toBe(true);
    });

    it('should return customers matching code', async () => {
      const results = await cacheService.searchCustomers('A123');
      expect(results.some(c => c.code.includes('A123'))).toBe(true);
    });

    it('should return customers matching city', async () => {
      const results = await cacheService.searchCustomers('Milano');
      expect(results.some(c => c.city.includes('Milano'))).toBe(true);
    });

    it('should limit results to 50 (performance)', async () => {
      const results = await cacheService.searchCustomers('a'); // Common letter
      expect(results.length).toBeLessThanOrEqual(50);
    });

    it('should complete search in < 100ms', async () => {
      const start = performance.now();
      await cacheService.searchCustomers('test');
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });

  describe('searchProducts', () => {
    it('should return products matching name', async () => {
      const results = await cacheService.searchProducts('H71');
      expect(results.some(p => p.name.includes('H71'))).toBe(true);
    });

    it('should return products matching article code', async () => {
      const results = await cacheService.searchProducts('02.33.016');
      expect(results.some(p => p.article.includes('02.33.016'))).toBe(true);
    });

    it('should include variants for each product', async () => {
      const results = await cacheService.searchProducts('H71');
      expect(results[0]?.variants).toBeDefined();
      expect(results[0]?.variants.length).toBeGreaterThan(0);
    });

    it('should include price for each product', async () => {
      const results = await cacheService.searchProducts('H71');
      expect(results[0]?.price).toBeDefined();
      expect(typeof results[0]?.price).toBe('number');
    });

    it('should complete search in < 100ms', async () => {
      const start = performance.now();
      await cacheService.searchProducts('test');
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });

  describe('cache freshness', () => {
    it('should return null age if no cache', async () => {
      // Clear cache first
      await db.cacheMetadata.clear();
      const age = await cacheService.getCacheAge();
      expect(age).toBeNull();
    });

    it('should return cache age in hours', async () => {
      // Populate metadata with timestamp 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await db.cacheMetadata.put({
        key: 'customers',
        lastSynced: twoHoursAgo.toISOString(),
        recordCount: 5000,
        version: 1
      });

      const age = await cacheService.getCacheAge();
      expect(age).toBeGreaterThan(1.9);
      expect(age).toBeLessThan(2.1);
    });

    it('should detect stale cache (> 3 days)', async () => {
      // Populate metadata with timestamp 4 days ago
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      await db.cacheMetadata.put({
        key: 'customers',
        lastSynced: fourDaysAgo.toISOString(),
        recordCount: 5000,
        version: 1
      });

      const isStale = await cacheService.isCacheStale();
      expect(isStale).toBe(true);
    });
  });
});
