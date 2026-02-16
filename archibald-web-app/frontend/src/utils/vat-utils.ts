const VALID_ITALIAN_VAT_RATES = [0, 4, 5, 10, 22];

export function normalizeVatRate(vat: number | null | undefined): number | null {
  if (vat === null || vat === undefined) return null;

  if (VALID_ITALIAN_VAT_RATES.includes(vat)) return vat;

  for (const validRate of VALID_ITALIAN_VAT_RATES) {
    if (Math.abs(vat - validRate) < 0.5) return validRate;
  }

  return vat;
}
