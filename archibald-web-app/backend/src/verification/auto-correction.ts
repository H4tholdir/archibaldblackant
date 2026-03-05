import type { DbPool } from '../db/pool';
import type { InlineSyncDeps } from './inline-order-sync';
import type { ArticleMismatch, SnapshotArticle, SyncedArticle } from './verify-order-articles';
import type { Modification } from './build-corrections';
import { buildCorrections } from './build-corrections';
import { performInlineOrderSync } from './inline-order-sync';
import { getOrderVerificationSnapshot } from '../db/repositories/order-verification';
import { verifyOrderArticles } from './verify-order-articles';
import { logger } from '../logger';

type AutoCorrectionDeps = {
  pool: DbPool;
  editOrderInArchibald: (archibaldOrderId: string, modifications: Modification[]) => Promise<{ success: boolean; message: string }>;
  inlineSyncDeps: InlineSyncDeps;
};

type AutoCorrectionResult = {
  status: 'auto_corrected' | 'correction_failed';
  details: string;
};

async function performAutoCorrection(
  deps: AutoCorrectionDeps,
  orderId: string,
  userId: string,
  mismatches: ArticleMismatch[],
  snapshotItems: readonly SnapshotArticle[],
  syncedArticles: readonly SyncedArticle[],
  onProgress: (progress: number, label?: string) => void,
): Promise<AutoCorrectionResult> {
  try {
    onProgress(90, 'Analisi correzioni...');
    const correctionPlan = buildCorrections(mismatches, snapshotItems, syncedArticles);

    if (!correctionPlan.canCorrect) {
      return {
        status: 'correction_failed',
        details: JSON.stringify({
          reason: 'uncorrectable',
          uncorrectableReasons: correctionPlan.uncorrectableReasons,
        }),
      };
    }

    onProgress(91, 'Correzione ordine in corso...');
    let editResult: { success: boolean; message: string };
    try {
      editResult = await deps.editOrderInArchibald(orderId, correctionPlan.modifications);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('[AutoCorrection] Bot edit threw', { orderId, error: message });
      return {
        status: 'correction_failed',
        details: JSON.stringify({ reason: 'bot_edit_error', message }),
      };
    }

    if (!editResult.success) {
      return {
        status: 'correction_failed',
        details: JSON.stringify({ reason: 'bot_edit_failed', message: editResult.message }),
      };
    }

    onProgress(94, 'Ri-sincronizzazione articoli...');
    const reSyncedArticles = await performInlineOrderSync(
      deps.inlineSyncDeps, orderId, userId, onProgress,
    );

    if (!reSyncedArticles) {
      return {
        status: 'correction_failed',
        details: JSON.stringify({ reason: 'resync_failed', message: 'Re-sync returned no articles' }),
      };
    }

    onProgress(97, 'Ri-verifica ordine...');
    const snapshot = await getOrderVerificationSnapshot(deps.pool, orderId, userId);

    if (!snapshot) {
      return {
        status: 'correction_failed',
        details: JSON.stringify({ reason: 'snapshot_not_found' }),
      };
    }

    const reVerifyResult = verifyOrderArticles(snapshot.items, reSyncedArticles);

    if (reVerifyResult.status === 'verified') {
      return {
        status: 'auto_corrected',
        details: JSON.stringify({
          modificationsApplied: correctionPlan.modifications.length,
        }),
      };
    }

    return {
      status: 'correction_failed',
      details: JSON.stringify({
        reason: 'reverify_mismatch',
        message: 'Re-verify still found mismatches after correction',
        remainingMismatches: reVerifyResult.mismatches,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('[AutoCorrection] Unexpected error', { orderId, error: message });
    return {
      status: 'correction_failed',
      details: JSON.stringify({ reason: 'unexpected_error', message }),
    };
  }
}

export { performAutoCorrection, type AutoCorrectionDeps, type AutoCorrectionResult };
