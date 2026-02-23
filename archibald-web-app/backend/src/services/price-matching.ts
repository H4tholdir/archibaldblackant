import type { ProductRow } from '../db/repositories/products';

const VARIANT_PACKAGE_CONTENT: Record<string, string> = {
  K2: '5 colli',
  K3: '1 collo',
};

function parseItalianPrice(input: string | null): number | null {
  if (input == null) return null;

  const stripped = input.replace(/[€\s]/g, '');
  if (stripped === '') return null;

  if (/[^0-9.,]/.test(stripped)) return null;

  const normalized = stripped.replace(/\./g, '').replace(',', '.');
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

  const expectedContent = VARIANT_PACKAGE_CONTENT[itemSelection];

  if (expectedContent) {
    const contentMatch = products.find((p) => p.package_content === expectedContent);
    if (contentMatch) return contentMatch;
  }

  const suffixMatch = products.find((p) => p.id.endsWith(`.${itemSelection}`));
  if (suffixMatch) return suffixMatch;

  return null;
}

export { parseItalianPrice, matchVariant };
