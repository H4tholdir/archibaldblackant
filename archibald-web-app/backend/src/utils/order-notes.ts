export const NO_SHIPPING_MARKER = 'NO SPESE DI SPEDIZIONE';

export function buildOrderNotesText(noShipping?: boolean, notes?: string): string {
  const parts: string[] = [];
  if (noShipping) parts.push(NO_SHIPPING_MARKER);
  if (notes?.trim()) parts.push(notes.trim());
  return parts.join('\n');
}
