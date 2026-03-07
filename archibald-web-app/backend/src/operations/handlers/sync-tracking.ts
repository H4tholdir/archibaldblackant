import type { DbPool } from '../../db/pool';
import type { TrackingSyncResult } from '../../sync/services/tracking-sync';
import { syncTracking } from '../../sync/services/tracking-sync';
import { scrapeFedExTracking } from '../../sync/services/fedex-tracking-scraper';
import type { OperationHandler } from '../operation-processor';

function createSyncTrackingHandler(pool: DbPool): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const result: TrackingSyncResult = await syncTracking(
      { pool, scrapeFedEx: scrapeFedExTracking },
      userId,
      onProgress,
      () => false,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncTrackingHandler };
