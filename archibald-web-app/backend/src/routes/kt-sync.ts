import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { getOrderArticles } from '../db/repositories/orders';
import { getAllSubclients } from '../db/repositories/subclients';
import { generateArcaDataFromOrder } from '../services/generate-arca-data-from-order';
import { generateVbsScript } from '../services/arca-sync-service';
import { getNextDocNumber } from '../services/ft-counter';
import { logger } from '../logger';

const ktSyncSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1),
  matchOverrides: z.record(z.string(), z.string()).optional(),
});

type KtSyncRouterDeps = {
  pool: DbPool;
};

function createKtSyncRouter(deps: KtSyncRouterDeps) {
  const { pool } = deps;
  const router = Router();

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const parsed = ktSyncSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }

      const userId = req.user!.userId;
      const { orderIds, matchOverrides } = parsed.data;

      // Fetch orders
      const { rows: orders } = await pool.query<{
        id: string;
        order_number: string;
        customer_name: string;
        customer_profile_id: string | null;
        creation_date: string;
        discount_percent: string | null;
        remaining_sales_financial: string | null;
      }>(
        `SELECT id, order_number, customer_name, customer_profile_id,
                creation_date, discount_percent, remaining_sales_financial
         FROM agents.order_records
         WHERE user_id = $1 AND id = ANY($2::text[])`,
        [userId, orderIds],
      );

      if (orders.length === 0) {
        return res.status(404).json({ success: false, error: 'Nessun ordine trovato' });
      }

      // Build subclient lookup
      const allSubclients = await getAllSubclients(pool);
      const subByProfile = new Map<string, typeof allSubclients[number]>();
      const subByCodice = new Map<string, typeof allSubclients[number]>();
      for (const sc of allSubclients) {
        if (sc.matchedCustomerProfileId) {
          subByProfile.set(sc.matchedCustomerProfileId, sc);
        }
        subByCodice.set(sc.codice, sc);
      }

      const errors: string[] = [];
      let synced = 0;
      const exportRecords: Array<{ invoiceNumber: string; arcaData: any }> = [];

      for (const order of orders) {
        // Resolve subclient: check override first, then profile match
        const overrideCodice = matchOverrides?.[order.id];
        let subclient = overrideCodice
          ? subByCodice.get(overrideCodice)
          : order.customer_profile_id
            ? subByProfile.get(order.customer_profile_id)
            : undefined;

        if (!subclient) {
          errors.push(`Ordine ${order.order_number}: nessun sottocliente trovato per ${order.customer_name}`);
          continue;
        }

        const articles = await getOrderArticles(pool, order.id, userId);
        if (articles.length === 0) {
          errors.push(`Ordine ${order.order_number}: nessun articolo sincronizzato`);
          continue;
        }

        const esercizio = order.creation_date?.slice(0, 4) || new Date().getFullYear().toString();
        const docNumber = await getNextDocNumber(pool, userId, esercizio, 'KT');

        const arcaData = generateArcaDataFromOrder(
          {
            id: order.id,
            creationDate: order.creation_date,
            customerName: order.customer_name,
            discountPercent: order.discount_percent != null ? parseFloat(order.discount_percent) : null,
            notes: order.remaining_sales_financial,
          },
          articles.map((a) => ({
            articleCode: a.articleCode,
            articleDescription: a.articleDescription ?? '',
            quantity: a.quantity,
            unitPrice: a.unitPrice ?? 0,
            discountPercent: a.discountPercent ?? 0,
            vatPercent: a.vatPercent ?? 22,
            lineAmount: a.lineAmount ?? 0,
            unit: 'PZ',
          })),
          subclient,
          docNumber,
          esercizio,
        );

        exportRecords.push({
          invoiceNumber: `KT ${docNumber}/${esercizio}`,
          arcaData,
        });

        await pool.query(
          `UPDATE agents.order_records SET arca_kt_synced_at = NOW() WHERE id = $1 AND user_id = $2`,
          [order.id, userId],
        );
        synced++;
      }

      const vbsScript = exportRecords.length > 0
        ? generateVbsScript(exportRecords)
        : null;

      logger.info(`KT sync: ${synced} orders synced for user ${userId}`);

      res.json({
        success: true,
        synced,
        errors,
        vbsScript,
      });
    } catch (err: any) {
      logger.error('KT sync error', { error: err });
      res.status(500).json({ success: false, error: err.message || 'KT sync failed' });
    }
  });

  return router;
}

export { createKtSyncRouter, type KtSyncRouterDeps };
