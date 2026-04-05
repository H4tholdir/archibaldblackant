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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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

      const { rows: orders } = await pool.query<{
        id: string;
        order_number: string;
        customer_name: string;
        customer_account_num: string | null;
        creation_date: string;
        discount_percent: string | null;
        order_description: string | null;
      }>(
        `SELECT id, order_number, customer_name, customer_account_num,
                creation_date, discount_percent, order_description
         FROM agents.order_records
         WHERE user_id = $1 AND id = ANY($2::text[])`,
        [userId, orderIds],
      );

      if (orders.length === 0) {
        return res.status(404).json({ success: false, error: 'Nessun ordine trovato' });
      }

      // Ordina per data ASC: garantisce NUMERO_P monotono
      orders.sort((a, b) => (a.creation_date ?? '').localeCompare(b.creation_date ?? ''));

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

      // Fallback: account_num (1002xxx) → erp_id (55.xxx) for customers assigned an ACCOUNTNUM by Verona
      const { rows: customerRows } = await pool.query<{ account_num: string; erp_id: string }>(
        `SELECT account_num, erp_id FROM agents.customers
         WHERE user_id = $1 AND account_num IS NOT NULL AND account_num != '' AND erp_id IS NOT NULL AND erp_id != ''`,
        [userId],
      );
      const accountNumToErpId = new Map<string, string>();
      for (const c of customerRows) {
        accountNumToErpId.set(c.account_num, c.erp_id);
      }

      // Pre-carica effectiveLastDate per ogni esercizio distinto
      const currentYear = new Date().getFullYear().toString();
      const uniqueEsercizi = new Set(orders.map((o) => o.creation_date?.slice(0, 4) ?? currentYear));
      const effectiveLastDateByEsercizio = new Map<string, string>();
      for (const esercizio of uniqueEsercizi) {
        const { rows: counterRows } = await pool.query<{ max_date: string }>(
          `SELECT COALESCE(MAX(last_date)::text, '') AS max_date
           FROM agents.ft_counter
           WHERE user_id = $1 AND esercizio = $2 AND tipodoc IN ('FT', 'KT')`,
          [userId, esercizio],
        );
        effectiveLastDateByEsercizio.set(esercizio, counterRows[0]?.max_date ?? '');
      }

      const errors: string[] = [];
      let synced = 0;
      const exportRecords: Array<{ invoiceNumber: string; arcaData: any }> = [];

      for (const order of orders) {
        // Resolve subclient: check override first, then profile match (with account_num → erp_id fallback)
        const overrideCodice = matchOverrides?.[order.id];
        let subclient: typeof allSubclients[number] | undefined;
        if (overrideCodice) {
          subclient = subByCodice.get(overrideCodice);
        } else if (order.customer_account_num) {
          const erpId = subByProfile.has(order.customer_account_num)
            ? order.customer_account_num
            : accountNumToErpId.get(order.customer_account_num);
          subclient = erpId ? subByProfile.get(erpId) : undefined;
        }

        if (!subclient) {
          errors.push(`Ordine ${order.order_number}: nessun sottocliente trovato per ${order.customer_name}`);
          continue;
        }

        const articles = await getOrderArticles(pool, order.id, userId);
        if (articles.length === 0) {
          errors.push(`Ordine ${order.order_number}: nessun articolo sincronizzato`);
          continue;
        }

        const esercizio = order.creation_date?.slice(0, 4) ?? currentYear;
        const effectiveLastDate = effectiveLastDateByEsercizio.get(esercizio) ?? '';
        const rawDate = order.creation_date?.slice(0, 10) ?? todayIso();
        const docDate = rawDate > effectiveLastDate ? rawDate : effectiveLastDate; // YYYY-MM-DD lexicographic = chronological
        effectiveLastDateByEsercizio.set(esercizio, docDate);

        const docNumber = await getNextDocNumber(pool, userId, esercizio, 'KT', docDate);

        const arcaData = generateArcaDataFromOrder(
          {
            id: order.id,
            creationDate: docDate,
            customerName: order.customer_name,
            discountPercent: order.discount_percent != null ? parseFloat(order.discount_percent) : null,
            notes: order.order_description,
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
