import type { VerificationStatus } from '../db/repositories/order-verification';
import type { ArticleMismatch, MismatchType } from './verify-order-articles';

type NotificationItem = {
  articleCode: string;
  message: string;
  type: MismatchType;
  expected: number | null;
  found: number | null;
};

type VerificationNotification = {
  status: VerificationStatus;
  summary: string;
  items: NotificationItem[];
  severity: 'warning' | 'error';
};

function formatCurrency(value: number): string {
  return `${value.toFixed(2)} €`;
}

function formatMismatchMessage(mismatch: ArticleMismatch): string {
  switch (mismatch.type) {
    case 'missing':
      return 'Articolo mancante nell\'ordine Archibald';
    case 'extra':
      return 'Articolo extra non previsto nell\'ordine';
    case 'quantity_diff':
      return `Quantità diversa: atteso ${mismatch.expected}, trovato ${mismatch.found}`;
    case 'price_diff':
      return `Prezzo unitario diverso: atteso ${formatCurrency(mismatch.expected!)}, trovato ${formatCurrency(mismatch.found!)}`;
    case 'discount_diff':
      return `Sconto diverso: atteso ${mismatch.expected}%, trovato ${mismatch.found}%`;
    case 'amount_diff':
      return `Importo diverso: atteso ${formatCurrency(mismatch.expected!)}, trovato ${formatCurrency(mismatch.found!)}`;
  }
}

function formatSummary(count: number): string {
  if (count === 0) return 'Discrepanze rilevate';
  if (count === 1) return '1 discrepanza rilevata nell\'ordine';
  return `${count} discrepanze rilevate nell'ordine`;
}

function getArticleCode(mismatch: ArticleMismatch): string {
  return mismatch.snapshotArticleCode ?? mismatch.syncedArticleCode ?? '';
}

function formatVerificationNotification(
  status: VerificationStatus,
  mismatches: ArticleMismatch[],
): VerificationNotification | null {
  if (status === 'verified' || status === 'auto_corrected' || status === 'pending_verification') {
    return null;
  }

  const items: NotificationItem[] = mismatches.map((m) => ({
    articleCode: getArticleCode(m),
    message: formatMismatchMessage(m),
    type: m.type,
    expected: m.expected,
    found: m.found,
  }));

  return {
    status,
    summary: formatSummary(mismatches.length),
    items,
    severity: status === 'correction_failed' ? 'error' : 'warning',
  };
}

export {
  formatVerificationNotification,
  type VerificationNotification,
  type NotificationItem,
};
