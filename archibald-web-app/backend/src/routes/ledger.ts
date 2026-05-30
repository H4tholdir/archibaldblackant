import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import {
  getCustomerLedger,
  getCustomerLedgerHistory,
} from '../db/repositories/customer-ledger.repository';
import { logger } from '../logger';

type LedgerRouterDeps = { pool: DbPool };

export function createLedgerRouter({ pool }: LedgerRouterDeps): Router {
  const router = Router();

  // NOTA: /dashboard-summary DEVE stare PRIMA di /:erpId per evitare
  // che Express interpreti "dashboard-summary" come un erpId.
  // Il contenuto di questo handler sarà espanso nel Piano 3.
  // Per ora restituisce un placeholder che il frontend gestisce come "non disponibile".
  router.get('/dashboard-summary', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;

      type DebtorRow = { name: string; erp_id: string; blocked_status: string | null; scaduto: string; aperto: string };

      const [debtorsRes, blockedRes, pendingWaRes] = await Promise.all([
        pool.query<DebtorRow>(
          `SELECT
             c.name, c.erp_id,
             c.blocked_status,
             SUM(CASE WHEN oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
                 AND oi.invoice_due_date::date < CURRENT_DATE
                 THEN oi.invoice_remaining_amount::numeric ELSE 0 END) AS scaduto,
             SUM(CASE WHEN oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
                 THEN oi.invoice_remaining_amount::numeric ELSE 0 END) AS aperto
           FROM agents.order_invoices oi
           JOIN agents.order_records o ON o.id = oi.order_id AND o.user_id = oi.user_id
           JOIN agents.customers c ON c.user_id = o.user_id
             AND c.account_num = o.customer_account_num AND c.deleted_at IS NULL
           WHERE o.user_id = $1
             AND oi.invoice_remaining_amount NOT IN ('0','')
             AND oi.invoice_remaining_amount IS NOT NULL
           GROUP BY c.name, c.erp_id, c.blocked_status
           HAVING SUM(CASE WHEN oi.invoice_remaining_amount ~ '^-?[0-9.]+$'
                 THEN oi.invoice_remaining_amount::numeric ELSE 0 END) > 0
           ORDER BY scaduto DESC, aperto DESC
           LIMIT 10`,
          [userId],
        ),
        pool.query(
          `SELECT COUNT(*) AS cnt FROM agents.customers
           WHERE user_id = $1 AND blocked_status IS NOT NULL AND deleted_at IS NULL`,
          [userId],
        ),
        pool.query(
          `SELECT COUNT(*) AS cnt FROM agents.invoice_notification_pending_wa
           WHERE user_id = $1 AND status IN ('pending','opened_by_agent')`,
          [userId],
        ),
      ]);

      const debtors = debtorsRes.rows;
      const totalScaduto = debtors.reduce(
        (s, d) => s + parseFloat(d.scaduto || '0'),
        0,
      );
      const totalAperto = debtors.reduce(
        (s, d) => s + parseFloat(d.aperto || '0'),
        0,
      );

      res.json({
        success: true,
        data: {
          totalScaduto,
          totalAperto,
          blockedCount: parseInt(blockedRes.rows[0].cnt, 10),
          topDebtors: debtors.map((d) => ({
            name: d.name,
            erpId: d.erp_id,
            scaduto: parseFloat(d.scaduto || '0'),
            isBlocked: d.blocked_status != null,
          })),
          pendingWaCount: parseInt(pendingWaRes.rows[0].cnt, 10),
        },
      });
    } catch (e) {
      logger.error('dashboard-summary error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  // GET /api/ledger/:erpId — DOPO /dashboard-summary
  router.get('/:erpId', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params as { erpId: string };

      if (!erpId || erpId.trim() === '') {
        res.status(400).json({ success: false, error: 'erpId richiesto' });
        return;
      }

      const ledger = await getCustomerLedger(pool, userId, erpId);
      res.json({ success: true, data: ledger });
    } catch (error) {
      logger.error('Errore getCustomerLedger', { error });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  // GET /api/ledger/:erpId/history
  router.get('/:erpId/history', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { erpId } = req.params as { erpId: string };

      const history = await getCustomerLedgerHistory(pool, userId, erpId);
      res.json({ success: true, data: history });
    } catch (error) {
      logger.error('Errore getCustomerLedgerHistory', { error });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  return router;
}
