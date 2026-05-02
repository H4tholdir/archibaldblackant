import type { DbPool } from '../db/pool';
import * as queueRepo from '../db/repositories/agent-queue';
import { logger } from '../logger';
import type { TaskRow } from './types';

// Task running con heartbeat più vecchio di 60s al momento del riavvio = orfana
const ORPHAN_STALE_SECONDS = 60;

export type RecoveryHandlers = {
  resumeFromErpSaveDone: (task: TaskRow) => Promise<void>;
  reEnqueueTask: (task: TaskRow) => Promise<void>;
};

export async function recoverOrphans(pool: DbPool, handlers: RecoveryHandlers): Promise<void> {
  const orphans = await queueRepo.findOrphanRunningTasks(pool, ORPHAN_STALE_SECONDS);

  if (orphans.length === 0) {
    logger.info('[Conductor.recovery] No orphan tasks at startup');
    return;
  }

  logger.info(`[Conductor.recovery] Found ${orphans.length} orphan tasks at startup`);

  for (const task of orphans) {
    try {
      switch (task.phase) {
        case 'erp_save_done':
          if (task.erpOrderId) {
            logger.info(`[Conductor.recovery] Resuming task ${task.taskId} from erp_save_done with orderId ${task.erpOrderId}`);
            await handlers.resumeFromErpSaveDone(task);
          } else {
            // erp_save_done senza orderId: ERP potrebbe aver salvato ma non abbiamo l'ID — re-enqueue per sicurezza
            logger.warn(`[Conductor.recovery] Task ${task.taskId} phase=erp_save_done but no erpOrderId; re-enqueue`);
            await handlers.reEnqueueTask(task);
          }
          break;

        case 'db_committed':
          // DB già committato, mancava solo la verifica post-save. Marca completed.
          logger.info(`[Conductor.recovery] Task ${task.taskId} was db_committed, marking completed`);
          await queueRepo.completeTask(pool, task.taskId);
          break;

        case 'completed':
          // status=running + phase=completed è uno stato incoerente: il worker è crashato dopo completeTask ma prima dell'aggiornamento dello status
          logger.warn(`[Conductor.recovery] Task ${task.taskId} has phase=completed but status=running, fixing`);
          await queueRepo.completeTask(pool, task.taskId);
          break;

        case null:
        case 'in_progress':
        default:
          logger.info(`[Conductor.recovery] Task ${task.taskId} not yet saved on ERP, re-enqueue`);
          await handlers.reEnqueueTask(task);
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[Conductor.recovery] Failed to recover task ${task.taskId}: ${message}`);
      await queueRepo.failTask(pool, task.taskId, {
        errorClass: 'application_error',
        errorMessage: `Recovery failed: ${message}`,
        incrementRetry: true,
      });
    }
  }
}
