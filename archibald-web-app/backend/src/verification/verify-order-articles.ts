type SnapshotArticle = {
  articleCode: string;
  quantity: number;
  unitPrice: number;
  lineDiscountPercent: number | null;
  expectedLineAmount: number;
};

type SyncedArticle = {
  articleCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineAmount: number;
};

type MismatchType =
  | 'missing'
  | 'extra'
  | 'quantity_diff'
  | 'price_diff'
  | 'discount_diff'
  | 'amount_diff';

type ArticleMismatch = {
  type: MismatchType;
  snapshotArticleCode: string | null;
  syncedArticleCode: string | null;
  field: string | null;
  expected: number | null;
  found: number | null;
};

type VerificationResult = {
  status: 'verified' | 'mismatch_detected';
  mismatches: ArticleMismatch[];
};

type VerificationOptions = {
  amountToleranceMin?: number;
  discountTolerance?: number;
};

// Flat tolerance for amount comparison (0.05€ covers rounding differences).
// The amount check uses Archibald's own synced unit price — see compareArticlePair.
// Unit price is NOT compared: the bot never sets prices (Archibald auto-fills from
// its price list), so any price diff is just shared.prices staleness, not a real error.
const DEFAULT_AMOUNT_TOLERANCE_MIN = 0.05;
const DEFAULT_DISCOUNT_TOLERANCE = 0.02;

function groupByCode<T extends { articleCode: string }>(
  items: readonly T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.articleCode.toUpperCase();
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

function compareArticlePair(
  snap: SnapshotArticle,
  synced: SyncedArticle,
  amountToleranceMin: number,
  discountTolerance: number,
): ArticleMismatch[] {
  const mismatches: ArticleMismatch[] = [];

  if (snap.quantity !== synced.quantity) {
    mismatches.push({
      type: 'quantity_diff',
      snapshotArticleCode: snap.articleCode,
      syncedArticleCode: synced.articleCode,
      field: 'quantity',
      expected: snap.quantity,
      found: synced.quantity,
    });
  }

  // Unit price is NOT compared: the bot never sets prices — Archibald auto-fills
  // from its price list, so any diff is just shared.prices staleness, not an error.

  const snapDiscount = snap.lineDiscountPercent ?? 0;
  if (Math.abs(snapDiscount - synced.discountPercent) > discountTolerance) {
    mismatches.push({
      type: 'discount_diff',
      snapshotArticleCode: snap.articleCode,
      syncedArticleCode: synced.articleCode,
      field: 'discountPercent',
      expected: snapDiscount,
      found: synced.discountPercent,
    });
  }

  // Amount check: recompute using Archibald's own unit price so the comparison is
  // independent of the snapshot price (which may be a subclient price for Fresis orders).
  // Verifies that Archibald correctly applied our quantity and discount to its price.
  if (synced.unitPrice > 0) {
    const recomputedExpected =
      Math.round(snap.quantity * synced.unitPrice * (1 - snapDiscount / 100) * 100) / 100;
    const amountDiff = Math.round((recomputedExpected - synced.lineAmount) * 1e8) / 1e8;
    if (Math.abs(amountDiff) > amountToleranceMin) {
      mismatches.push({
        type: 'amount_diff',
        snapshotArticleCode: snap.articleCode,
        syncedArticleCode: synced.articleCode,
        field: 'lineAmount',
        expected: recomputedExpected,
        found: synced.lineAmount,
      });
    }
  }

  return mismatches;
}

function verifyOrderArticles(
  snapshotItems: readonly SnapshotArticle[],
  syncedArticles: readonly SyncedArticle[],
  options?: VerificationOptions,
): VerificationResult {
  const amtMin = options?.amountToleranceMin ?? DEFAULT_AMOUNT_TOLERANCE_MIN;
  const discTolerance = options?.discountTolerance ?? DEFAULT_DISCOUNT_TOLERANCE;
  const mismatches: ArticleMismatch[] = [];

  const snapGroups = groupByCode(snapshotItems);
  const syncGroups = groupByCode(syncedArticles);

  const allCodes = new Set([...snapGroups.keys(), ...syncGroups.keys()]);

  for (const code of [...allCodes].sort()) {
    const snaps = snapGroups.get(code) ?? [];
    const syncs = syncGroups.get(code) ?? [];

    const pairCount = Math.min(snaps.length, syncs.length);

    for (let i = 0; i < pairCount; i++) {
      mismatches.push(...compareArticlePair(snaps[i], syncs[i], amtMin, discTolerance));
    }

    for (let i = pairCount; i < snaps.length; i++) {
      mismatches.push({
        type: 'missing',
        snapshotArticleCode: snaps[i].articleCode,
        syncedArticleCode: null,
        field: null,
        expected: null,
        found: null,
      });
    }

    for (let i = pairCount; i < syncs.length; i++) {
      mismatches.push({
        type: 'extra',
        snapshotArticleCode: null,
        syncedArticleCode: syncs[i].articleCode,
        field: null,
        expected: null,
        found: null,
      });
    }
  }

  return {
    status: mismatches.length === 0 ? 'verified' : 'mismatch_detected',
    mismatches,
  };
}

export {
  verifyOrderArticles,
  type SnapshotArticle,
  type SyncedArticle,
  type ArticleMismatch,
  type MismatchType,
  type VerificationResult,
  type VerificationOptions,
};
