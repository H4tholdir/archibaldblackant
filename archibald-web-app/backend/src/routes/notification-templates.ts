import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { logger } from '../logger';

type Deps = { pool: DbPool };

const TemplateSchema = z.object({
  customer_erp_id: z.string().nullable().optional(),
  event_type: z.enum(['overdue_step', 'new_invoice', 'pre_due', 'periodic_statement']),
  tone: z.enum(['cordiale', 'formale', 'urgente']),
  channel: z.enum(['email', 'whatsapp']),
  subject_tmpl: z.string().nullable().optional(),
  body_tmpl: z.string().min(10),
});

export function createNotificationTemplatesRouter({ pool }: Deps): Router {
  const router = Router();

  // GET /api/notification-templates — template dell'agente, opzionalmente filtrati per cliente
  // ?customerErpId=X → template per-cliente; senza param → template agente (customer_erp_id IS NULL)
  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { customerErpId } = req.query as { customerErpId?: string };
      const { rows } = await pool.query(
        customerErpId
          ? `SELECT id, customer_erp_id, event_type, tone, channel, subject_tmpl, body_tmpl
             FROM agents.notification_message_templates
             WHERE user_id = $1 AND customer_erp_id = $2
             ORDER BY event_type, tone, channel`
          : `SELECT id, customer_erp_id, event_type, tone, channel, subject_tmpl, body_tmpl
             FROM agents.notification_message_templates
             WHERE user_id = $1 AND customer_erp_id IS NULL
             ORDER BY event_type, tone, channel`,
        customerErpId ? [userId, customerErpId] : [userId],
      );
      res.json({ success: true, data: rows });
    } catch (e) {
      logger.error('getTemplates error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  // PUT /api/notification-templates — upsert template
  router.put('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const parsed = TemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.message });
        return;
      }
      const t = parsed.data;
      const customerErpId = t.customer_erp_id ?? null;
      await pool.query(
        `INSERT INTO agents.notification_message_templates
           (user_id, customer_erp_id, event_type, tone, channel, subject_tmpl, body_tmpl)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, (COALESCE(customer_erp_id, '')), event_type, tone, channel) DO UPDATE SET
           subject_tmpl = EXCLUDED.subject_tmpl,
           body_tmpl = EXCLUDED.body_tmpl`,
        [userId, customerErpId, t.event_type, t.tone, t.channel, t.subject_tmpl ?? null, t.body_tmpl],
      );
      const { rows } = await pool.query(
        `SELECT id, customer_erp_id, event_type, tone, channel, subject_tmpl, body_tmpl
         FROM agents.notification_message_templates
         WHERE user_id = $1
           AND COALESCE(customer_erp_id, '') = COALESCE($2, '')
           AND event_type = $3 AND tone = $4 AND channel = $5`,
        [userId, customerErpId, t.event_type, t.tone, t.channel],
      );
      res.json({ success: true, data: rows[0] });
    } catch (e) {
      logger.error('upsertTemplate error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  // DELETE /api/notification-templates/:id — ripristina default
  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params as { id: string };
      await pool.query(
        `DELETE FROM agents.notification_message_templates WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      res.json({ success: true });
    } catch (e) {
      logger.error('deleteTemplate error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  return router;
}
