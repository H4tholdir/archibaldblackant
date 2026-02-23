import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import type { ProductRow } from '../db/repositories/products';
import { matchVariant, parseItalianPrice } from './price-matching';

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
    expect(matchVariant([singleProduct], undefined as unknown as string | null)).toEqual(singleProduct);
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
