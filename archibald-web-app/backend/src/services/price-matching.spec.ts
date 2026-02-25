import fc from 'fast-check';
import { describe, expect, test, vi } from 'vitest';
import type { ProductRow } from '../db/repositories/products';
import type { PriceRow } from '../db/repositories/prices';
import type { MatchPricesToProductsDeps } from './price-matching';
import { matchVariant, parseItalianPrice, matchPricesToProducts, computeChangeType } from './price-matching';

function makeProduct(overrides: Partial<ProductRow> & Pick<ProductRow, 'id'>): ProductRow {
  return {
    name: 'Test Product',
    description: null,
    group_code: null,
    search_name: null,
    price_unit: null,
    product_group_id: null,
    product_group_description: null,
    package_content: null,
    min_qty: null,
    multiple_qty: null,
    max_qty: null,
    price: null,
    price_source: null,
    price_updated_at: null,
    vat: null,
    vat_source: null,
    vat_updated_at: null,
    image_url: null,
    image_local_path: null,
    image_downloaded_at: null,
    deleted_at: null,
    hash: 'test-hash',
    last_sync: 0,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('parseItalianPrice', () => {
  test('parses Italian format with thousands separator and euro symbol: "1.234,56 €" -> 1234.56', () => {
    expect(parseItalianPrice('1.234,56 €')).toEqual(1234.56);
  });

  test('parses decimal-only format: "0,75" -> 0.75', () => {
    expect(parseItalianPrice('0,75')).toEqual(0.75);
  });

  test('parses large number with thousands separator: "12.345,00" -> 12345', () => {
    expect(parseItalianPrice('12.345,00')).toEqual(12345);
  });

  test('parses integer without separators: "100" -> 100', () => {
    expect(parseItalianPrice('100')).toEqual(100);
  });

  test('returns null for null input', () => {
    expect(parseItalianPrice(null)).toEqual(null);
  });

  test('returns null for empty string', () => {
    expect(parseItalianPrice('')).toEqual(null);
  });

  test('returns null for non-numeric string: "abc"', () => {
    expect(parseItalianPrice('abc')).toEqual(null);
  });

  test('returns null for negative price: "-1.234,56"', () => {
    expect(parseItalianPrice('-1.234,56')).toEqual(null);
  });

  test('parses price with euro symbol and no space: "5,00€" -> 5', () => {
    expect(parseItalianPrice('5,00€')).toEqual(5);
  });

  test('parses price with leading/trailing whitespace: "  42,50  " -> 42.5', () => {
    expect(parseItalianPrice('  42,50  ')).toEqual(42.5);
  });

  test('returns null for whitespace-only string', () => {
    expect(parseItalianPrice('   ')).toEqual(null);
  });

  describe('property-based tests', () => {
    test('non-negative integers formatted as Italian strings roundtrip correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 999_999 }),
          (n) => {
            const italianFormatted = n.toLocaleString('it-IT');
            const parsed = parseItalianPrice(italianFormatted);
            return parsed === n;
          },
        ),
      );
    });

    test('non-negative decimals with 2 decimal places roundtrip correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 999_999 }),
          fc.integer({ min: 0, max: 99 }),
          (intPart, decPart) => {
            const decStr = decPart.toString().padStart(2, '0');
            const italianFormatted = intPart.toLocaleString('it-IT') + ',' + decStr;
            const parsed = parseItalianPrice(italianFormatted);
            const expected = intPart + decPart / 100;
            return parsed !== null && Math.abs(parsed - expected) < 0.001;
          },
        ),
      );
    });

    test('result is always null or a non-negative number', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.string(), fc.constant(null)),
          (input) => {
            const result = parseItalianPrice(input);
            return result === null || (typeof result === 'number' && result >= 0 && !Number.isNaN(result));
          },
        ),
      );
    });
  });
});

describe('matchVariant', () => {
  const k2Product = makeProduct({ id: 'X.K2', package_content: '5 colli' });
  const k3Product = makeProduct({ id: 'X.K3', package_content: '1 collo' });

  test('matches K2 item selection to product with "5 colli" package content', () => {
    const products = [k2Product, k3Product];
    expect(matchVariant(products, 'K2')).toEqual(k2Product);
  });

  test('matches K3 item selection to product with "1 collo" package content', () => {
    const products = [k2Product, k3Product];
    expect(matchVariant(products, 'K3')).toEqual(k3Product);
  });

  test('returns first product when itemSelection is null', () => {
    const singleProduct = makeProduct({ id: 'X' });
    expect(matchVariant([singleProduct], null)).toEqual(singleProduct);
  });

  test('returns first product when itemSelection is undefined', () => {
    const singleProduct = makeProduct({ id: 'X' });
    expect(matchVariant([singleProduct], undefined)).toEqual(singleProduct);
  });

  test('returns null for empty products array', () => {
    expect(matchVariant([], 'K2')).toEqual(null);
  });

  test('falls back to product ID suffix match when no packageContent match', () => {
    const productWithoutContent = makeProduct({ id: 'Y.K2', package_content: null });
    expect(matchVariant([productWithoutContent], 'K2')).toEqual(productWithoutContent);
  });

  test('returns null when no product matches itemSelection by content or ID suffix', () => {
    const products = [k3Product];
    expect(matchVariant(products, 'K2')).toEqual(null);
  });

  test('returns first product when itemSelection is null even with multiple products', () => {
    const products = [k2Product, k3Product];
    expect(matchVariant(products, null)).toEqual(k2Product);
  });

  test('prefers packageContent match over ID suffix match', () => {
    const contentMatch = makeProduct({ id: 'A.K3', package_content: '5 colli' });
    const suffixMatch = makeProduct({ id: 'B.K2', package_content: '1 collo' });
    expect(matchVariant([contentMatch, suffixMatch], 'K2')).toEqual(contentMatch);
  });
});

function makePriceRow(overrides: Partial<PriceRow> & Pick<PriceRow, 'product_id' | 'product_name'>): PriceRow {
  return {
    id: 1,
    unit_price: '10,00',
    item_selection: null,
    packaging_description: null,
    currency: 'EUR',
    price_valid_from: null,
    price_valid_to: null,
    price_unit: null,
    account_description: null,
    account_code: null,
    price_qty_from: null,
    price_qty_to: null,
    last_modified: null,
    data_area_id: null,
    hash: 'hash-1',
    last_sync: 0,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function createMockDeps(overrides?: Partial<MatchPricesToProductsDeps>): MatchPricesToProductsDeps {
  return {
    getAllPrices: vi.fn().mockResolvedValue([]),
    getProductVariants: vi.fn().mockResolvedValue([]),
    updateProductPrice: vi.fn().mockResolvedValue(true),
    recordPriceChange: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('computeChangeType', () => {
  test('returns "new" when old price is null', () => {
    expect(computeChangeType(null, 10)).toBe('new');
  });

  test('returns "increase" when new price is greater than old price', () => {
    expect(computeChangeType(5, 10)).toBe('increase');
  });

  test('returns "decrease" when new price is less than old price', () => {
    expect(computeChangeType(10, 5)).toBe('decrease');
  });

  test('returns "decrease" when prices are equal', () => {
    expect(computeChangeType(10, 10)).toBe('decrease');
  });
});

describe('matchPricesToProducts', () => {
  test('returns zero counts for empty prices list', async () => {
    const deps = createMockDeps();
    const result = await matchPricesToProducts(deps);

    expect(result).toEqual({
      result: { matched: 0, unmatched: 0, skipped: 0 },
      unmatchedPrices: [],
    });
  });

  test('skips price with null unit_price and adds to unmatched with reason null_price', async () => {
    const price = makePriceRow({ product_id: 'P1', product_name: 'Prodotto A', unit_price: null });
    const deps = createMockDeps({ getAllPrices: vi.fn().mockResolvedValue([price]) });

    const result = await matchPricesToProducts(deps);

    expect(result).toEqual({
      result: { matched: 0, unmatched: 0, skipped: 1 },
      unmatchedPrices: [{ productId: 'P1', productName: 'Prodotto A', reason: 'null_price' }],
    });
    expect(deps.getProductVariants).not.toHaveBeenCalled();
  });

  test('skips price with unparseable unit_price and adds to unmatched with reason unparseable_price', async () => {
    const price = makePriceRow({ product_id: 'P1', product_name: 'Prodotto A', unit_price: 'abc' });
    const deps = createMockDeps({ getAllPrices: vi.fn().mockResolvedValue([price]) });

    const result = await matchPricesToProducts(deps);

    expect(result).toEqual({
      result: { matched: 0, unmatched: 0, skipped: 1 },
      unmatchedPrices: [{ productId: 'P1', productName: 'Prodotto A', reason: 'unparseable_price' }],
    });
    expect(deps.getProductVariants).not.toHaveBeenCalled();
  });

  test('counts as unmatched when no products found for product_name', async () => {
    const price = makePriceRow({ product_id: 'P1', product_name: 'Prodotto A', unit_price: '10,00' });
    const deps = createMockDeps({
      getAllPrices: vi.fn().mockResolvedValue([price]),
      getProductVariants: vi.fn().mockResolvedValue([]),
    });

    const result = await matchPricesToProducts(deps);

    expect(result).toEqual({
      result: { matched: 0, unmatched: 1, skipped: 0 },
      unmatchedPrices: [{ productId: 'P1', productName: 'Prodotto A', reason: 'product_not_found' }],
    });
  });

  test('counts as unmatched with variant_mismatch when matchVariant returns null', async () => {
    const price = makePriceRow({ product_id: 'P1', product_name: 'Prodotto A', unit_price: '10,00', item_selection: 'K2' });
    const product = makeProduct({ id: 'P1.K3', name: 'Prodotto A', package_content: '1 collo' });
    const deps = createMockDeps({
      getAllPrices: vi.fn().mockResolvedValue([price]),
      getProductVariants: vi.fn().mockResolvedValue([product]),
    });

    const result = await matchPricesToProducts(deps);

    expect(result).toEqual({
      result: { matched: 0, unmatched: 1, skipped: 0 },
      unmatchedPrices: [{ productId: 'P1', productName: 'Prodotto A', reason: 'variant_mismatch' }],
    });
  });

  test('matches price to product, updates price, and records price change when price differs', async () => {
    const price = makePriceRow({ product_id: 'P1', product_name: 'Prodotto A', unit_price: '15,50' });
    const product = makeProduct({ id: 'P1', name: 'Prodotto A', price: 10, vat: 22 });

    const recordPriceChange = vi.fn().mockResolvedValue(undefined);
    const updateProductPrice = vi.fn().mockResolvedValue(true);
    const deps = createMockDeps({
      getAllPrices: vi.fn().mockResolvedValue([price]),
      getProductVariants: vi.fn().mockResolvedValue([product]),
      updateProductPrice,
      recordPriceChange,
    });

    const result = await matchPricesToProducts(deps);

    expect(result).toEqual({
      result: { matched: 1, unmatched: 0, skipped: 0 },
      unmatchedPrices: [],
    });
    expect(updateProductPrice).toHaveBeenCalledWith('P1', 15.5, 22, 'prices-db', null);
    expect(recordPriceChange).toHaveBeenCalledWith({
      productId: 'P1',
      productName: 'Prodotto A',
      variantId: null,
      oldPrice: '10',
      newPrice: '15.5',
      oldPriceNumeric: 10,
      newPriceNumeric: 15.5,
      priceChange: 5.5,
      percentageChange: 55.00000000000001,
      changeType: 'increase',
      source: 'pdf-sync',
    });
  });

  test('matches price to product and does NOT record price change when price is unchanged', async () => {
    const price = makePriceRow({ product_id: 'P1', product_name: 'Prodotto A', unit_price: '10,00' });
    const product = makeProduct({ id: 'P1', name: 'Prodotto A', price: 10, vat: 22 });

    const recordPriceChange = vi.fn().mockResolvedValue(undefined);
    const updateProductPrice = vi.fn().mockResolvedValue(true);
    const deps = createMockDeps({
      getAllPrices: vi.fn().mockResolvedValue([price]),
      getProductVariants: vi.fn().mockResolvedValue([product]),
      updateProductPrice,
      recordPriceChange,
    });

    const result = await matchPricesToProducts(deps);

    expect(result).toEqual({
      result: { matched: 1, unmatched: 0, skipped: 0 },
      unmatchedPrices: [],
    });
    expect(updateProductPrice).toHaveBeenCalledWith('P1', 10, 22, 'prices-db', null);
    expect(recordPriceChange).not.toHaveBeenCalled();
  });

  test('records price change with "new" type when product has no existing price', async () => {
    const price = makePriceRow({ product_id: 'P1', product_name: 'Prodotto A', unit_price: '10,00' });
    const product = makeProduct({ id: 'P1', name: 'Prodotto A', price: null, vat: null });

    const recordPriceChange = vi.fn().mockResolvedValue(undefined);
    const deps = createMockDeps({
      getAllPrices: vi.fn().mockResolvedValue([price]),
      getProductVariants: vi.fn().mockResolvedValue([product]),
      recordPriceChange,
    });

    const result = await matchPricesToProducts(deps);

    expect(result.result).toEqual({ matched: 1, unmatched: 0, skipped: 0 });
    expect(recordPriceChange).toHaveBeenCalledWith(expect.objectContaining({
      changeType: 'new',
      oldPrice: null,
      oldPriceNumeric: null,
      priceChange: null,
      percentageChange: null,
    }));
  });

  test('records price change with "decrease" type when new price is lower', async () => {
    const price = makePriceRow({ product_id: 'P1', product_name: 'Prodotto A', unit_price: '8,00' });
    const product = makeProduct({ id: 'P1', name: 'Prodotto A', price: 10, vat: 22 });

    const recordPriceChange = vi.fn().mockResolvedValue(undefined);
    const deps = createMockDeps({
      getAllPrices: vi.fn().mockResolvedValue([price]),
      getProductVariants: vi.fn().mockResolvedValue([product]),
      recordPriceChange,
    });

    await matchPricesToProducts(deps);

    expect(recordPriceChange).toHaveBeenCalledWith(expect.objectContaining({
      changeType: 'decrease',
      priceChange: -2,
      percentageChange: -20,
    }));
  });

  test('correctly passes item_selection as variantId in price change record', async () => {
    const price = makePriceRow({ product_id: 'P1', product_name: 'Prodotto A', unit_price: '15,00', item_selection: 'K2' });
    const product = makeProduct({ id: 'P1.K2', name: 'Prodotto A', price: 10, package_content: '5 colli' });

    const recordPriceChange = vi.fn().mockResolvedValue(undefined);
    const deps = createMockDeps({
      getAllPrices: vi.fn().mockResolvedValue([price]),
      getProductVariants: vi.fn().mockResolvedValue([product]),
      recordPriceChange,
    });

    await matchPricesToProducts(deps);

    expect(recordPriceChange).toHaveBeenCalledWith(expect.objectContaining({
      variantId: 'K2',
    }));
  });

  test('handles multiple prices with mixed outcomes', async () => {
    const prices = [
      makePriceRow({ id: 1, product_id: 'P1', product_name: 'Matched', unit_price: '10,00' }),
      makePriceRow({ id: 2, product_id: 'P2', product_name: 'Null Price', unit_price: null }),
      makePriceRow({ id: 3, product_id: 'P3', product_name: 'Not Found', unit_price: '5,00' }),
      makePriceRow({ id: 4, product_id: 'P4', product_name: 'Variant Miss', unit_price: '7,00', item_selection: 'K2' }),
    ];

    const matchedProduct = makeProduct({ id: 'P1', name: 'Matched', price: 8, vat: 10 });
    const variantMissProduct = makeProduct({ id: 'P4.K3', name: 'Variant Miss', package_content: '1 collo' });

    const getProductVariants = vi.fn()
      .mockImplementation((name: string) => {
        if (name === 'Matched') return Promise.resolve([matchedProduct]);
        if (name === 'Not Found') return Promise.resolve([]);
        if (name === 'Variant Miss') return Promise.resolve([variantMissProduct]);
        return Promise.resolve([]);
      });

    const deps = createMockDeps({
      getAllPrices: vi.fn().mockResolvedValue(prices),
      getProductVariants,
    });

    const result = await matchPricesToProducts(deps);

    expect(result.result).toEqual({ matched: 1, unmatched: 2, skipped: 1 });
    expect(result.unmatchedPrices).toEqual([
      { productId: 'P2', productName: 'Null Price', reason: 'null_price' },
      { productId: 'P3', productName: 'Not Found', reason: 'product_not_found' },
      { productId: 'P4', productName: 'Variant Miss', reason: 'variant_mismatch' },
    ]);
  });
});
