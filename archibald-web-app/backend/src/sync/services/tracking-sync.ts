import type { DbPool } from '../../db/pool';
import type { FedExTrackingResult } from './fedex-tracking-scraper';
import {
  getOrdersNeedingTrackingSync,
  updateTrackingData,
  incrementTrackingSyncFailures,
} from '../../db/repositories/orders';
import { SyncStoppedError } from './customer-sync';

type TrackingSyncDeps = {
  pool: DbPool;
  scrapeFedEx: (
    trackingNumbers: string[],
    onProgress?: (processed: number, total: number) => void,
  ) => Promise<FedExTrackingResult[]>;
};

type TrackingSyncResult = {
  success: boolean;
  trackingProcessed: number;
  trackingUpdated: number;
  trackingFailed: number;
  newDeliveries: number;
  duration: number;
  error?: string;
  suspended?: boolean;
};

const BATCH_SIZE = 50;

function mapTrackingStatus(statusBarCD: string, keyStatusCD: string): string {
  if (statusBarCD === 'DL') return 'delivered';
  if (statusBarCD === 'DE') return 'exception';
  if (keyStatusCD === 'OD') return 'out_for_delivery';
  if (statusBarCD === 'OW') return 'in_transit';
  return 'pending';
}

async function syncTracking(
  deps: TrackingSyncDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  shouldStop: () => boolean,
): Promise<TrackingSyncResult> {
  const startTime = Date.now();

  try {
    if (shouldStop()) throw new SyncStoppedError('start');

    const orders = await getOrdersNeedingTrackingSync(deps.pool, userId);

    if (orders.length === 0) {
      return {
        success: true,
        trackingProcessed: 0,
        trackingUpdated: 0,
        trackingFailed: 0,
        newDeliveries: 0,
        duration: Date.now() - startTime,
      };
    }

    onProgress(5, 'Avvio sync tracking FedEx');

    const trackingToOrder = new Map<string, string>();
    const trackingNumbers: string[] = [];
    for (const order of orders) {
      trackingToOrder.set(order.trackingNumber, order.orderNumber);
      trackingNumbers.push(order.trackingNumber);
    }

    let trackingUpdated = 0;
    let trackingFailed = 0;
    let newDeliveries = 0;
    let totalProcessed = 0;

    for (let i = 0; i < trackingNumbers.length; i += BATCH_SIZE) {
      const batch = trackingNumbers.slice(i, i + BATCH_SIZE);

      const progressBase = 5 + Math.round((i / trackingNumbers.length) * 90);
      const results = await deps.scrapeFedEx(batch, (processed, total) => {
        const batchProgress = progressBase + Math.round((processed / total) * (90 / Math.ceil(trackingNumbers.length / BATCH_SIZE)));
        onProgress(Math.min(batchProgress, 95), `Tracking ${totalProcessed + processed}/${trackingNumbers.length}`);
      });

      for (const result of results) {
        totalProcessed++;
        const orderNumber = trackingToOrder.get(result.trackingNumber);
        if (!orderNumber) continue;

        if (result.success) {
          const status = mapTrackingStatus(result.statusBarCD ?? '', result.keyStatusCD ?? '');

          await updateTrackingData(deps.pool, userId, orderNumber, {
            trackingStatus: status,
            trackingKeyStatusCd: result.keyStatusCD ?? '',
            trackingStatusBarCd: result.statusBarCD ?? '',
            trackingEstimatedDelivery: result.estimatedDelivery ?? '',
            trackingLastLocation: result.lastScanLocation ?? '',
            trackingLastEvent: result.lastScanStatus ?? '',
            trackingLastEventAt: result.lastScanDateTime ?? '',
            trackingOrigin: result.origin ?? '',
            trackingDestination: result.destination ?? '',
            trackingServiceDesc: result.serviceDesc ?? '',
            deliveryConfirmedAt: status === 'delivered' ? (result.actualDelivery ?? null) : null,
            deliverySignedBy: status === 'delivered' ? (result.receivedByName ?? null) : null,
            trackingEvents: result.scanEvents ?? [],
            trackingSyncFailures: 0,
          });

          if (status === 'delivered') {
            newDeliveries++;
          }
          trackingUpdated++;
        } else {
          await incrementTrackingSyncFailures(deps.pool, userId, orderNumber);
          trackingFailed++;
        }
      }

      if (i + BATCH_SIZE < trackingNumbers.length && shouldStop()) {
        throw new SyncStoppedError('batch');
      }
    }

    const suspended = trackingNumbers.length > 0 && trackingFailed / trackingNumbers.length > 0.5;

    onProgress(100, 'Sync tracking completata');

    return {
      success: true,
      trackingProcessed: totalProcessed,
      trackingUpdated,
      trackingFailed,
      newDeliveries,
      duration: Date.now() - startTime,
      suspended: suspended || undefined,
    };
  } catch (error) {
    return {
      success: false,
      trackingProcessed: 0,
      trackingUpdated: 0,
      trackingFailed: 0,
      newDeliveries: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export { mapTrackingStatus, syncTracking };
export type { TrackingSyncDeps, TrackingSyncResult };
