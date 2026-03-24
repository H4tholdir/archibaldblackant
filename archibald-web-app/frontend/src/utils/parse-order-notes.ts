export const NO_SHIPPING_MARKER = 'NO SPESE DI SPEDIZIONE';

export function parseOrderNotesForEdit(fullText?: string | null): { noShipping: boolean; notes: string } {
  const text = fullText ?? '';
  if (!text.startsWith(NO_SHIPPING_MARKER)) {
    return { noShipping: false, notes: text };
  }
  const afterMarker = text.slice(NO_SHIPPING_MARKER.length);
  const notes = afterMarker.startsWith('\n') ? afterMarker.slice(1).trim() : afterMarker.trim();
  return { noShipping: true, notes };
}
