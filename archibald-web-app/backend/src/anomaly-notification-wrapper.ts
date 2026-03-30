import type { OperationHandler } from './operations/operation-processor';
import type { CreateNotificationParams } from './services/notification-service';
import { logger } from './logger';

type AnomalyNotifyFn = (params: CreateNotificationParams) => Promise<void>;

function withAnomalyNotification(
  handler: OperationHandler,
  syncName: string,
  notifyFn: AnomalyNotifyFn,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const result = await handler(context, data, userId, onProgress);
    const success = result['success'];
    const error = result['error'];
    if (success === false && typeof error === 'string' && !error.includes('stop')) {
      await notifyFn({
        target: 'admin',
        type: 'sync_anomaly',
        severity: 'error',
        title: `Anomalia sincronizzazione: ${syncName}`,
        body: error.slice(0, 300),
        data: { syncName, error },
      }).catch((notifyErr) => { logger.warn('Failed to send anomaly notification', { syncName, error: notifyErr }); });
      throw new Error(error);
    }
    return result;
  };
}

export { withAnomalyNotification };
export type { AnomalyNotifyFn };
