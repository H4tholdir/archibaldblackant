import type { ArticleMismatch, SnapshotArticle, SyncedArticle } from './verify-order-articles';
import type { EditOrderArticle } from '../operations/handlers/edit-order';

type UpdateModification = {
  type: 'update';
  rowIndex: number;
  articleCode: string;
  quantity: number;
  discount?: number;
};

type AddModification = {
  type: 'add';
  articleCode: string;
  quantity: number;
  discount: number;
};

type DeleteModification = {
  type: 'delete';
  rowIndex: number;
};

type Modification = UpdateModification | AddModification | DeleteModification;

type CorrectionPlan = {
  modifications: Modification[];
  updatedItems: EditOrderArticle[];
  canCorrect: boolean;
  uncorrectableReasons: string[];
};

function findRowIndex(syncedArticles: readonly SyncedArticle[], articleCode: string): number {
  return syncedArticles.findIndex(
    (a) => a.articleCode.toUpperCase() === articleCode.toUpperCase(),
  );
}

function findSnapshotArticle(
  snapshotItems: readonly SnapshotArticle[],
  articleCode: string,
): SnapshotArticle | undefined {
  return snapshotItems.find(
    (a) => a.articleCode.toUpperCase() === articleCode.toUpperCase(),
  );
}

function buildUpdatedItems(snapshotItems: readonly SnapshotArticle[]): EditOrderArticle[] {
  return snapshotItems.map((snap) => ({
    articleCode: snap.articleCode,
    quantity: snap.quantity,
    unitPrice: snap.unitPrice,
    discountPercent: snap.lineDiscountPercent ?? 0,
    lineAmount: snap.expectedLineAmount,
  }));
}

function buildCorrections(
  mismatches: readonly ArticleMismatch[],
  snapshotItems: readonly SnapshotArticle[],
  syncedArticles: readonly SyncedArticle[],
): CorrectionPlan {
  const uncorrectableReasons: string[] = [];
  const updateMap = new Map<string, UpdateModification>();
  const adds: AddModification[] = [];
  const deletes: DeleteModification[] = [];

  const articlesWithQtyOrDiscountDiff = new Set<string>();
  for (const m of mismatches) {
    if (m.type === 'quantity_diff' || m.type === 'discount_diff') {
      const code = (m.snapshotArticleCode ?? m.syncedArticleCode ?? '').toUpperCase();
      articlesWithQtyOrDiscountDiff.add(code);
    }
  }

  for (const m of mismatches) {
    const articleCode = m.snapshotArticleCode ?? m.syncedArticleCode ?? '';
    const codeUpper = articleCode.toUpperCase();

    switch (m.type) {
      case 'missing': {
        const snap = findSnapshotArticle(snapshotItems, articleCode);
        if (snap) {
          adds.push({
            type: 'add',
            articleCode: snap.articleCode,
            quantity: snap.quantity,
            discount: snap.lineDiscountPercent ?? 0,
          });
        }
        break;
      }

      case 'extra': {
        const rowIndex = findRowIndex(syncedArticles, articleCode);
        if (rowIndex >= 0) {
          deletes.push({ type: 'delete', rowIndex });
        }
        break;
      }

      case 'quantity_diff': {
        const rowIndex = findRowIndex(syncedArticles, articleCode);
        const existing = updateMap.get(codeUpper);
        if (existing) {
          existing.quantity = m.expected!;
        } else {
          updateMap.set(codeUpper, {
            type: 'update',
            rowIndex,
            articleCode,
            quantity: m.expected!,
          });
        }
        break;
      }

      case 'discount_diff': {
        const rowIndex = findRowIndex(syncedArticles, articleCode);
        const synced = syncedArticles[rowIndex];
        const existing = updateMap.get(codeUpper);
        if (existing) {
          existing.discount = m.expected!;
        } else {
          updateMap.set(codeUpper, {
            type: 'update',
            rowIndex,
            articleCode,
            quantity: synced?.quantity ?? 0,
            discount: m.expected!,
          });
        }
        break;
      }

      case 'price_diff': {
        uncorrectableReasons.push(
          `Price difference on ${articleCode}: expected ${m.expected}, found ${m.found}`,
        );
        break;
      }

      case 'amount_diff': {
        if (!articlesWithQtyOrDiscountDiff.has(codeUpper)) {
          uncorrectableReasons.push(
            `Unexplained amount difference on ${articleCode}: expected ${m.expected}, found ${m.found}`,
          );
        }
        break;
      }
    }
  }

  const updates = [...updateMap.values()];
  const sortedDeletes = [...deletes].sort((a, b) => b.rowIndex - a.rowIndex);

  const modifications: Modification[] = [...updates, ...adds, ...sortedDeletes];
  const canCorrect = uncorrectableReasons.length === 0;
  const updatedItems = buildUpdatedItems(snapshotItems);

  return { modifications, updatedItems, canCorrect, uncorrectableReasons };
}

export { buildCorrections, type CorrectionPlan, type Modification, type UpdateModification, type AddModification, type DeleteModification };
