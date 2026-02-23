import type { ProductRow } from '../db/repositories/products';

function parseItalianPrice(_input: string | null): number | null {
  throw new Error('Not implemented');
}

function matchVariant(
  _products: ProductRow[],
  _itemSelection: string | null,
): ProductRow | null {
  throw new Error('Not implemented');
}

export { parseItalianPrice, matchVariant };
