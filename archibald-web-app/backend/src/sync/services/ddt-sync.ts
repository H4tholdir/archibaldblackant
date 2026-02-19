import type { DbPool } from '../../db/pool';
import { SyncStoppedError } from './customer-sync';

type ParsedDdt = {
  orderNumber: string;
  ddtNumber: string;
  ddtDeliveryDate?: string;
  ddtId?: string;
  ddtCustomerAccount?: string;
  ddtSalesName?: string;
  ddtDeliveryName?: string;
  deliveryTerms?: string;
  deliveryMethod?: string;
  deliveryCity?: string;
  attentionTo?: string;
  ddtDeliveryAddress?: string;
  ddtTotal?: string;
  ddtCustomerReference?: string;
  ddtDescription?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  trackingCourier?: string;
};

type DdtSyncDeps = {
  pool: DbPool;
  downloadPdf: (userId: string) => Promise<string>;
  parsePdf: (pdfPath: string) => Promise<ParsedDdt[]>;
  cleanupFile: (filePath: string) => Promise<void>;
};

type DdtSyncResult = {
  success: boolean;
  ddtProcessed: number;
  ddtUpdated: number;
  ddtSkipped: number;
  duration: number;
  error?: string;
};

async function syncDdt(
  deps: DdtSyncDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  shouldStop: () => boolean,
): Promise<DdtSyncResult> {
  const { pool, downloadPdf, parsePdf, cleanupFile } = deps;
  const startTime = Date.now();
  let pdfPath: string | null = null;

  try {
    if (shouldStop()) throw new SyncStoppedError('start');

    onProgress(5, 'Download PDF DDT');
    pdfPath = await downloadPdf(userId);

    if (shouldStop()) throw new SyncStoppedError('download');

    onProgress(20, 'Lettura PDF DDT');
    const parsedDdts = await parsePdf(pdfPath);

    if (shouldStop()) throw new SyncStoppedError('parse');

    onProgress(40, `Aggiornamento ${parsedDdts.length} DDT`);

    let ddtUpdated = 0;
    let ddtSkipped = 0;
    const now = Math.floor(Date.now() / 1000);

    for (const ddt of parsedDdts) {
      const { rows: [order] } = await pool.query<{ id: string }>(
        'SELECT id FROM agents.order_records WHERE order_number = $1 AND user_id = $2',
        [ddt.orderNumber, userId],
      );

      if (!order) {
        ddtSkipped++;
        continue;
      }

      await pool.query(
        `UPDATE agents.order_records SET
          ddt_number=$1, ddt_delivery_date=$2, ddt_id=$3, ddt_customer_account=$4,
          ddt_sales_name=$5, ddt_delivery_name=$6, delivery_terms=$7, delivery_method=$8,
          delivery_city=$9, attention_to=$10, ddt_delivery_address=$11, ddt_total=$12,
          ddt_customer_reference=$13, ddt_description=$14, tracking_number=$15,
          tracking_url=$16, tracking_courier=$17, last_sync=$18
        WHERE id=$19 AND user_id=$20`,
        [
          ddt.ddtNumber, ddt.ddtDeliveryDate ?? null, ddt.ddtId ?? null, ddt.ddtCustomerAccount ?? null,
          ddt.ddtSalesName ?? null, ddt.ddtDeliveryName ?? null, ddt.deliveryTerms ?? null, ddt.deliveryMethod ?? null,
          ddt.deliveryCity ?? null, ddt.attentionTo ?? null, ddt.ddtDeliveryAddress ?? null, ddt.ddtTotal ?? null,
          ddt.ddtCustomerReference ?? null, ddt.ddtDescription ?? null, ddt.trackingNumber ?? null,
          ddt.trackingUrl ?? null, ddt.trackingCourier ?? null, now,
          order.id, userId,
        ],
      );
      ddtUpdated++;
    }

    onProgress(100, 'Sincronizzazione DDT completata');

    return { success: true, ddtProcessed: parsedDdts.length, ddtUpdated, ddtSkipped, duration: Date.now() - startTime };
  } catch (error) {
    return {
      success: error instanceof SyncStoppedError ? false : false,
      ddtProcessed: 0, ddtUpdated: 0, ddtSkipped: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (pdfPath) await cleanupFile(pdfPath);
  }
}

export { syncDdt, type DdtSyncDeps, type DdtSyncResult, type ParsedDdt };
