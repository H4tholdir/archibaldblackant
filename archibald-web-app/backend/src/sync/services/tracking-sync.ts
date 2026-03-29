import type { DbPool } from '../../db/pool';
import type { FedExTrackingResult } from './fedex-api-tracker';
import { trackViaFedExApi } from './fedex-api-tracker';
import {
  getDdtsNeedingTracking,
  updateDdtTracking,
  incrementDdtTrackingFailures,
  computeAndUpdateOrderDeliveryState,
} from '../../db/repositories/order-ddts';
import { SyncStoppedError } from './customer-sync';
import { logger } from '../../logger';
import {
  logTrackingException,
  resolveOpenExceptions,
} from '../../db/repositories/tracking-exceptions';

type TrackingSyncResult = {
  success: boolean;
  trackingProcessed: number;
  trackingUpdated: number;
  trackingFailed: number;
  newDeliveries: number;
  duration: number;
  error?: string;
};

type TrackingEventType = 'delivered' | 'exception' | 'held' | 'returning' | 'canceled';

export function mapTrackingStatus(statusBarCD: string, keyStatusCD: string): string {
  if (statusBarCD === 'DL') return 'delivered';
  if (statusBarCD === 'RS' || statusBarCD === 'RP' || keyStatusCD === 'RS') return 'returning';
  if (statusBarCD === 'HL' || statusBarCD === 'HP' || keyStatusCD === 'HL') return 'held';
  if (statusBarCD === 'CA') return 'canceled';
  if (statusBarCD === 'DE' || keyStatusCD === 'DE' || keyStatusCD === 'DF'
    || statusBarCD === 'SE' || statusBarCD === 'DY'
    || statusBarCD === 'DD' || statusBarCD === 'CD') return 'exception';
  if (keyStatusCD === 'OD' || statusBarCD === 'OD') return 'out_for_delivery';
  if (statusBarCD === 'IT' || statusBarCD === 'OW' || statusBarCD === 'PU'
    || statusBarCD === 'DP' || statusBarCD === 'AR' || statusBarCD === 'AF'
    || statusBarCD === 'FD') return 'in_transit';
  return 'pending';
}

async function syncTracking(
  pool: DbPool,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  shouldStop: () => boolean,
  onTrackingEvent?: (type: TrackingEventType, orderNumber: string) => Promise<void>,
): Promise<TrackingSyncResult> {
  const startTime = Date.now();

  try {
    if (shouldStop()) throw new SyncStoppedError('start');

    const ddts = await getDdtsNeedingTracking(pool, userId);
    logger.info('Tracking sync started', { userId, ddtsToSync: ddts.length });

    if (ddts.length === 0) {
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

    const trackingToDdt = new Map<string, { ddtId: string; orderId: string; orderNumber: string }>();
    const trackingNumbers: string[] = [];
    for (const ddt of ddts) {
      trackingToDdt.set(ddt.trackingNumber, ddt);
      trackingNumbers.push(ddt.trackingNumber);
    }

    const results = await trackViaFedExApi(trackingNumbers, (processed, total) => {
      const progress = 5 + Math.round((processed / total) * 90);
      onProgress(Math.min(progress, 95), `Tracking ${processed}/${total}`);
    });

    if (shouldStop()) throw new SyncStoppedError('after-fetch');

    let trackingUpdated = 0;
    let trackingFailed = 0;
    let newDeliveries = 0;

    for (const result of results) {
      const ddt = trackingToDdt.get(result.trackingNumber);
      if (!ddt) continue;
      const { ddtId, orderId, orderNumber } = ddt;

      if (result.success) {
        const status = mapTrackingStatus(result.statusBarCD ?? '', result.keyStatusCD ?? '');

        await updateDdtTracking(pool, ddtId, {
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
          trackingDelayReason: result.delayReason ?? null,
          trackingDeliveryAttempts: result.deliveryAttempts ?? null,
          trackingAttemptedDeliveryAt: result.attemptedDeliveryAt ?? null,
        });
        await computeAndUpdateOrderDeliveryState(pool, orderId);

        logger.info(`Tracking: ${result.trackingNumber} → ${status}`, {
          orderNumber, trackingNumber: result.trackingNumber, status,
          location: result.lastScanLocation ?? '-',
        });

        // Logga eccezione se anomalia, dedup su (tracking_number, occurred_at)
        // isNewException = true solo se il record è stato inserito ora (non era già presente)
        let isNewException = false;
        if (['exception', 'held', 'returning', 'canceled'].includes(status)) {
          const exceptionStatusCDs: Record<string, string[]> = {
            exception: ['DE', 'SE', 'DY', 'DD', 'CD'],
            held:      ['HL', 'HP'],
            returning: ['RS', 'RP'],
            canceled:  ['CA'],
          };
          const codes = exceptionStatusCDs[status] ?? [];
          const latestEvent = (result.scanEvents ?? [])
            .find((ev) => codes.includes(ev.statusCD) || (status === 'exception' && ev.exception));
          if (latestEvent) {
            isNewException = await logTrackingException(pool, {
              userId,
              orderNumber,
              trackingNumber: result.trackingNumber,
              exceptionCode: latestEvent.exceptionCode,
              exceptionDescription: latestEvent.exceptionDescription || latestEvent.status,
              exceptionType: status as 'exception' | 'held' | 'returning' | 'canceled',
              occurredAt: `${latestEvent.date}T${latestEvent.time}`,
            });
          }
        }

        // Risolvi eccezioni aperte quando l'ordine viene consegnato
        if (status === 'delivered') {
          await resolveOpenExceptions(pool, orderNumber, 'delivered');
        }

        // Per le consegne: notifica sempre. Per le eccezioni: solo se nuova (evita duplicati)
        const trackingEventTypes: readonly TrackingEventType[] = ['delivered', 'exception', 'held', 'returning', 'canceled'];
        const shouldNotify = status === 'delivered' || isNewException;
        if (onTrackingEvent && trackingEventTypes.includes(status as TrackingEventType) && shouldNotify) {
          try {
            await onTrackingEvent(status as TrackingEventType, orderNumber);
          } catch (err) {
            logger.error('onTrackingEvent callback failed', { err });
          }
        }

        if (status === 'delivered') newDeliveries++;
        trackingUpdated++;
      } else {
        logger.warn('Tracking: API lookup failed', { orderNumber, trackingNumber: result.trackingNumber, error: result.error });
        await incrementDdtTrackingFailures(pool, ddtId);
        trackingFailed++;
      }
    }

    onProgress(100, 'Sync tracking completata');

    logger.info('Tracking sync completed', {
      userId, trackingProcessed: results.length,
      trackingUpdated, trackingFailed, newDeliveries,
      duration: Date.now() - startTime,
    });

    return {
      success: true,
      trackingProcessed: results.length,
      trackingUpdated,
      trackingFailed,
      newDeliveries,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Tracking sync error', { userId, error: error instanceof Error ? error.message : String(error) });
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

export { syncTracking };
export type { TrackingSyncResult, TrackingEventType };
