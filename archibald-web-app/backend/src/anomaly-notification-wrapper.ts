import type { OperationHandler } from './operations/operation-processor';
import type { CreateNotificationParams } from './services/notification-service';

type AnomalyNotifyFn = (params: CreateNotificationParams) => Promise<void>;

function withAnomalyNotification(
  handler: OperationHandler,
  syncName: string,
  notifyFn: AnomalyNotifyFn,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const result = await handler(context, data, userId, onProgress);
    const r = result as { success?: boolean; error?: string };
    if (r.success === false && r.error && !r.error.includes('stop')) {
      await notifyFn({
        target: 'admin',
        type: 'sync_anomaly',
        severity: 'error',
        title: `Anomalia sincronizzazione: ${syncName}`,
        body: r.error.slice(0, 300),
        data: { syncName, error: r.error },
      }).catch(() => {});
      throw new Error(r.error);
    }
    return result;
  };
}

export { withAnomalyNotification };
export type { AnomalyNotifyFn };
