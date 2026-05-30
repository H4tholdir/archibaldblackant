import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import { logger } from '../logger';

type Deps = { pool: DbPool };

const ProfileSchema = z.object({
  notification_display_name: z.string().max(100).optional(),
  notification_reply_to_email: z.string().email('Email non valida').optional().nullable(),
  notification_phone: z.string().max(30).optional().nullable(),
  notification_title: z.string().max(200).optional().nullable(),
});

export function createNotificationProfileRouter({ pool }: Deps): Router {
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { rows } = await pool.query(
        `SELECT notification_display_name, notification_reply_to_email,
                notification_phone, notification_title
         FROM agents.users WHERE id = $1`,
        [userId],
      );
      res.json({ success: true, data: rows[0] ?? {} });
    } catch (e) {
      logger.error('getNotificationProfile error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  router.put('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const parsed = ProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.message });
        return;
      }
      const b = parsed.data;
      await pool.query(
        `UPDATE agents.users SET
           notification_display_name = COALESCE($2, notification_display_name),
           notification_reply_to_email = $3,
           notification_phone = $4,
           notification_title = $5,
           updated_at = NOW()
         WHERE id = $1`,
        [userId, b.notification_display_name ?? null, b.notification_reply_to_email ?? null,
         b.notification_phone ?? null, b.notification_title ?? null],
      );
      const { rows } = await pool.query(
        `SELECT notification_display_name, notification_reply_to_email,
                notification_phone, notification_title FROM agents.users WHERE id = $1`,
        [userId],
      );
      res.json({ success: true, data: rows[0] });
    } catch (e) {
      logger.error('updateNotificationProfile error', { e });
      res.status(500).json({ success: false, error: 'Errore interno' });
    }
  });

  return router;
}
