import type { DbPool } from '../../db/pool';
import type { TrackingSyncResult, TrackingEventType } from '../../sync/services/tracking-sync';
import { syncTracking } from '../../sync/services/tracking-sync';
import type { OperationHandler } from '../operation-processor';

function createSyncTrackingHandler(
  pool: DbPool,
  onTrackingEvent?: (type: TrackingEventType, orderNumber: string) => Promise<void>,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const result: TrackingSyncResult = await syncTracking(
      pool,
      userId,
      onProgress,
      () => false,
      onTrackingEvent,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncTrackingHandler };
