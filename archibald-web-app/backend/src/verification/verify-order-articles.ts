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
  amountTolerance?: number;
};

const DEFAULT_AMOUNT_TOLERANCE = 0.02;

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
  tolerance: number,
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

  if (snap.unitPrice !== synced.unitPrice) {
    mismatches.push({
      type: 'price_diff',
      snapshotArticleCode: snap.articleCode,
      syncedArticleCode: synced.articleCode,
      field: 'unitPrice',
      expected: snap.unitPrice,
      found: synced.unitPrice,
    });
  }

  const snapDiscount = snap.lineDiscountPercent ?? 0;
  if (snapDiscount !== synced.discountPercent) {
    mismatches.push({
      type: 'discount_diff',
      snapshotArticleCode: snap.articleCode,
      syncedArticleCode: synced.articleCode,
      field: 'discountPercent',
      expected: snapDiscount,
      found: synced.discountPercent,
    });
  }

  const amountDiff = Math.round((snap.expectedLineAmount - synced.lineAmount) * 1e8) / 1e8;
  if (Math.abs(amountDiff) > tolerance) {
    mismatches.push({
      type: 'amount_diff',
      snapshotArticleCode: snap.articleCode,
      syncedArticleCode: synced.articleCode,
      field: 'lineAmount',
      expected: snap.expectedLineAmount,
      found: synced.lineAmount,
    });
  }

  return mismatches;
}

function verifyOrderArticles(
  snapshotItems: readonly SnapshotArticle[],
  syncedArticles: readonly SyncedArticle[],
  options?: VerificationOptions,
): VerificationResult {
  const tolerance = options?.amountTolerance ?? DEFAULT_AMOUNT_TOLERANCE;
  const mismatches: ArticleMismatch[] = [];

  const snapGroups = groupByCode(snapshotItems);
  const syncGroups = groupByCode(syncedArticles);

  const allCodes = new Set([...snapGroups.keys(), ...syncGroups.keys()]);

  for (const code of [...allCodes].sort()) {
    const snaps = snapGroups.get(code) ?? [];
    const syncs = syncGroups.get(code) ?? [];

    const pairCount = Math.min(snaps.length, syncs.length);

    for (let i = 0; i < pairCount; i++) {
      mismatches.push(...compareArticlePair(snaps[i], syncs[i], tolerance));
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
