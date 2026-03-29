import type { DbPool } from '../../db/pool';
import { SyncStoppedError } from './customer-sync';
import { copyFile } from 'node:fs/promises';
import { upsertOrderDdt, repositionOrderDdts } from '../../db/repositories/order-ddts';

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
  ddtQuantity?: string;
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

function groupByOrderNumber(ddts: ParsedDdt[]): Map<string, ParsedDdt[]> {
  const groups = new Map<string, ParsedDdt[]>();
  for (const ddt of ddts) {
    const existing = groups.get(ddt.orderNumber);
    if (existing) {
      existing.push(ddt);
    } else {
      groups.set(ddt.orderNumber, [ddt]);
    }
  }
  return groups;
}

function sortByDdtIdAsc(ddts: ParsedDdt[]): ParsedDdt[] {
  return [...ddts].sort((a, b) => {
    const aId = a.ddtId ? parseInt(a.ddtId, 10) : 0;
    const bId = b.ddtId ? parseInt(b.ddtId, 10) : 0;
    return aId - bId;
  });
}

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
    await copyFile(pdfPath, '/app/data/debug-ddt.pdf').catch(() => {});

    if (shouldStop()) throw new SyncStoppedError('download');

    onProgress(20, 'Lettura PDF DDT');
    const parsedDdts = await parsePdf(pdfPath);

    if (shouldStop()) throw new SyncStoppedError('parse');

    onProgress(40, `Aggiornamento ${parsedDdts.length} DDT`);

    let ddtUpdated = 0;
    let ddtSkipped = 0;

    const groups = groupByOrderNumber(parsedDdts);

    for (const [orderNumber, ddts] of groups) {
      const { rows: [order] } = await pool.query<{ id: string }>(
        'SELECT id FROM agents.order_records WHERE order_number = $1 AND user_id = $2',
        [orderNumber, userId],
      );

      if (!order) {
        ddtSkipped += ddts.length;
        continue;
      }

      const sorted = sortByDdtIdAsc(ddts);

      for (const ddt of sorted) {
        await upsertOrderDdt(pool, {
          orderId: order.id,
          userId,
          ddtNumber: ddt.ddtNumber,
          ddtId: ddt.ddtId ?? null,
          ddtDeliveryDate: ddt.ddtDeliveryDate ?? null,
          ddtCustomerAccount: ddt.ddtCustomerAccount ?? null,
          ddtSalesName: ddt.ddtSalesName ?? null,
          ddtDeliveryName: ddt.ddtDeliveryName ?? null,
          deliveryTerms: ddt.deliveryTerms ?? null,
          deliveryMethod: ddt.deliveryMethod ?? null,
          deliveryCity: ddt.deliveryCity ?? null,
          attentionTo: ddt.attentionTo ?? null,
          ddtDeliveryAddress: ddt.ddtDeliveryAddress ?? null,
          ddtQuantity: ddt.ddtQuantity ?? null,
          ddtCustomerReference: ddt.ddtCustomerReference ?? null,
          ddtDescription: ddt.ddtDescription ?? null,
          trackingNumber: ddt.trackingNumber ?? null,
          trackingUrl: ddt.trackingUrl ?? null,
          trackingCourier: ddt.trackingCourier ?? null,
        });
        ddtUpdated++;
      }
    }

    await repositionOrderDdts(pool, userId);

    onProgress(100, 'Sincronizzazione DDT completata');

    return { success: true, ddtProcessed: parsedDdts.length, ddtUpdated, ddtSkipped, duration: Date.now() - startTime };
  } catch (error) {
    return {
      success: false,
      ddtProcessed: 0, ddtUpdated: 0, ddtSkipped: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (pdfPath) await cleanupFile(pdfPath);
  }
}

export { syncDdt, type DdtSyncDeps, type DdtSyncResult, type ParsedDdt };
