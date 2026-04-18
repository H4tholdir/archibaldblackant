import type { ProductRow } from '../db/repositories/products';
import type { PriceRow } from '../db/repositories/prices';
import type { PriceHistoryInsert } from '../db/repositories/prices-history';

const VARIANT_PACKAGE_CONTENT: Record<string, string> = {
  K2: '5 colli',
  K3: '1 collo',
};

function parseItalianPrice(input: string | null): number | null {
  if (input == null) return null;

  const stripped = input.replace(/[€\s]/g, '');
  if (stripped === '') return null;

  if (/[^0-9.,]/.test(stripped)) return null;

  // Italian format: comma = decimal separator ("1.234,56" or "16,25").
  // Italian integers: dot = thousands separator ("10.000" = 10000).
  // US decimal: dot = decimal separator with 1–2 decimal digits ("1677.87", "16.25").
  // Heuristic: if no comma and last dot group has exactly 3 digits → Italian thousands.
  const normalized = stripped.includes(',')
    ? stripped.replace(/\./g, '').replace(',', '.')
    : /\.\d{3}$/.test(stripped)
      ? stripped.replace(/\./g, '')
      : stripped;
  const value = Number(normalized);

  if (Number.isNaN(value) || value < 0) return null;

  return value;
}

function matchVariant(
  products: ProductRow[],
  itemSelection: string | null | undefined,
): ProductRow | null {
  if (products.length === 0) return null;
  if (itemSelection == null) return products[0];

  const idMatch = products.find((p) => p.id === itemSelection);
  if (idMatch) return idMatch;

  const expectedContent = VARIANT_PACKAGE_CONTENT[itemSelection];

  if (expectedContent) {
    const contentMatch = products.find((p) => p.package_content === expectedContent);
    if (contentMatch) return contentMatch;
  }

  const variantSuffix = itemSelection.match(/[KR]\d+$/)?.[0];
  if (variantSuffix) {
    const contentByVariant = VARIANT_PACKAGE_CONTENT[variantSuffix];
    if (contentByVariant) {
      const contentMatch = products.find((p) => p.package_content === contentByVariant);
      if (contentMatch) return contentMatch;
    }
  }

  const suffixMatch = products.find((p) => p.id.endsWith(`.${itemSelection}`));
  if (suffixMatch) return suffixMatch;

  return null;
}

type MatchResult = {
  matched: number;
  unmatched: number;
  skipped: number;
};

type UnmatchedPrice = {
  productId: string;
  productName: string;
  reason: string;
};

type MatchPricesToProductsDeps = {
  getAllPrices: () => Promise<PriceRow[]>;
  getProductVariants: (name: string) => Promise<ProductRow[]>;
  getProductById: (id: string) => Promise<ProductRow | null>;
  updateProductPrice: (id: string, price: number, vat: number | null, priceSource: string, vatSource: string | null) => Promise<boolean>;
  recordPriceChange: (data: PriceHistoryInsert) => Promise<void>;
};

type MatchPricesToProductsResult = {
  result: MatchResult;
  unmatchedPrices: UnmatchedPrice[];
};

function computeChangeType(oldPrice: number | null, newPrice: number): 'increase' | 'decrease' | 'new' {
  if (oldPrice == null) return 'new';
  if (newPrice > oldPrice) return 'increase';
  return 'decrease';
}

async function matchPricesToProducts(deps: MatchPricesToProductsDeps): Promise<MatchPricesToProductsResult> {
  const prices = await deps.getAllPrices();

  let matched = 0;
  let unmatched = 0;
  let skipped = 0;
  const unmatchedPrices: UnmatchedPrice[] = [];

  for (const price of prices) {
    if (price.unit_price == null) {
      skipped++;
      unmatchedPrices.push({
        productId: price.product_id,
        productName: price.product_name,
        reason: 'null_price',
      });
      continue;
    }

    const parsedPrice = parseItalianPrice(price.unit_price);
    if (parsedPrice == null) {
      skipped++;
      unmatchedPrices.push({
        productId: price.product_id,
        productName: price.product_name,
        reason: 'unparseable_price',
      });
      continue;
    }

    const products = await deps.getProductVariants(price.product_name);
    if (products.length === 0) {
      const byId = await deps.getProductById(price.product_id);
      if (byId == null) {
        unmatched++;
        unmatchedPrices.push({
          productId: price.product_id,
          productName: price.product_name,
          reason: 'product_not_found',
        });
        continue;
      }
      await deps.updateProductPrice(byId.id, parsedPrice, byId.vat, 'prices-db', null);
      if (byId.price !== parsedPrice) {
        const changeType = computeChangeType(byId.price, parsedPrice);
        const priceChange = byId.price != null ? parsedPrice - byId.price : null;
        const percentageChange = byId.price != null && byId.price !== 0
          ? ((parsedPrice - byId.price) / byId.price) * 100
          : null;
        await deps.recordPriceChange({
          productId: byId.id,
          productName: byId.name,
          variantId: price.item_selection,
          oldPrice: byId.price != null ? String(byId.price) : null,
          newPrice: String(parsedPrice),
          oldPriceNumeric: byId.price,
          newPriceNumeric: parsedPrice,
          priceChange,
          percentageChange,
          changeType,
          source: 'pdf-sync',
        });
      }
      matched++;
      continue;
    }

    const directMatch = products.find((p) => p.id === price.product_id);
    const product = directMatch ?? matchVariant(products, price.item_selection);
    if (product == null) {
      unmatched++;
      unmatchedPrices.push({
        productId: price.product_id,
        productName: price.product_name,
        reason: 'variant_mismatch',
      });
      continue;
    }

    await deps.updateProductPrice(product.id, parsedPrice, product.vat, 'prices-db', null);

    if (product.price !== parsedPrice) {
      const changeType = computeChangeType(product.price, parsedPrice);
      const priceChange = product.price != null ? parsedPrice - product.price : null;
      const percentageChange = product.price != null && product.price !== 0
        ? ((parsedPrice - product.price) / product.price) * 100
        : null;

      await deps.recordPriceChange({
        productId: product.id,
        productName: product.name,
        variantId: price.item_selection,
        oldPrice: product.price != null ? String(product.price) : null,
        newPrice: String(parsedPrice),
        oldPriceNumeric: product.price,
        newPriceNumeric: parsedPrice,
        priceChange,
        percentageChange,
        changeType,
        source: 'pdf-sync',
      });
    }

    matched++;
  }

  return {
    result: { matched, unmatched, skipped },
    unmatchedPrices,
  };
}

export { parseItalianPrice, matchVariant, matchPricesToProducts, computeChangeType };
export type { MatchPricesToProductsDeps, MatchPricesToProductsResult, MatchResult, UnmatchedPrice };
