export function parseOrderDiscountPercent(raw?: string | null): number {
  if (!raw) return 0;
  const cleaned = raw.replace('%', '').replace(',', '.').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}
