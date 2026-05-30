import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { logger } from '../logger';

type Deps = { pool: DbPool };

const TemplateSchema = z.object({
  event_type: z.enum(['overdue_step', 'new_invoice', 'pre_due', 'periodic_statement']),
  tone: z.enum(['cordiale', 'formale', 'urgente']),
  channel: z.enum(['email', 'whatsapp']),
  subject_tmpl: z.string().nullable().optional(),
  body_tmpl: z.string().min(10),
});

export function createNotificationTemplatesRouter({ pool }: Deps): Router {
  const router = Router();

  // GET /api/notification-templates — tutti i template dell'agente
  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { rows } = await pool.query(
        `SELECT id, event_type, tone, channel, subject_tmpl, body_tmpl
         FROM agents.notification_message_templates
         WHERE user_id = $1
         ORDER BY event_type, tone, channel`,
        [userId],
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
      await pool.query(
        `INSERT INTO agents.notification_message_templates
           (user_id, event_type, tone, channel, subject_tmpl, body_tmpl)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, event_type, tone, channel) DO UPDATE SET
           subject_tmpl = EXCLUDED.subject_tmpl,
           body_tmpl = EXCLUDED.body_tmpl`,
        [userId, t.event_type, t.tone, t.channel, t.subject_tmpl ?? null, t.body_tmpl],
      );
      const { rows } = await pool.query(
        `SELECT id, event_type, tone, channel, subject_tmpl, body_tmpl
         FROM agents.notification_message_templates
         WHERE user_id = $1 AND event_type = $2 AND tone = $3 AND channel = $4`,
        [userId, t.event_type, t.tone, t.channel],
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
