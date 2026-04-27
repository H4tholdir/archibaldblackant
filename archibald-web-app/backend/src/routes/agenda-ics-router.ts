import express, { Router } from 'express';
import ical from 'ical-generator';
import type { DbPool } from '../db/pool';
import { listAppointments } from '../db/repositories/appointments';
import { logger } from '../logger';

type Deps = { pool: DbPool };

async function getUserIdByIcsToken(pool: DbPool, token: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM agents.users WHERE ics_token = $1 AND deleted_at IS NULL`,
    [token],
  );
  return rows[0]?.id ?? null;
}

function buildIcsCalendar(
  appointments: Awaited<ReturnType<typeof listAppointments>>,
): string {
  const cal = ical({ name: 'Agenda Formicanera' });
  for (const appt of appointments) {
    cal.createEvent({
      id: appt.icsUid,
      start: appt.startAt,
      end: appt.endAt,
      allDay: appt.allDay,
      summary: appt.title,
      location: appt.location ?? undefined,
      description: appt.notes ?? undefined,
    });
  }
  return cal.toString();
}

export function createAgendaIcsRouter({ pool }: Deps): Router {
  const router = Router();

  // GET /api/agenda/ics-token — requires authenticate middleware (applied externally)
  router.get('/ics-token', async (req, res) => {
    try {
      const userId = (req as any).userId as string;
      const { rows } = await pool.query<{ ics_token: string }>(
        `SELECT ics_token FROM agents.users WHERE id = $1`,
        [userId],
      );
      res.json({ token: rows[0]?.ics_token });
    } catch (err) {
      logger.error('ICS token error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/agenda/export.ics — auth via JWT session (authenticate middleware applied externally)
  router.get('/export.ics', async (req, res) => {
    try {
      const userId = (req as any).userId as string;
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const to = new Date();
      to.setFullYear(to.getFullYear() + 1);

      const appts = await listAppointments(pool, userId, {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      });

      const icsContent = buildIcsCalendar(appts);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="agenda-formicanera.ics"');
      res.send(icsContent);
    } catch (err) {
      logger.error('ICS export error', { err });
      res.status(500).send('Internal server error');
    }
  });

  return router;
}

export function createFeedIcsHandler({ pool }: Deps): express.RequestHandler {
  return async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : null;
    if (!token) return res.status(401).send('Missing token');

    try {
      const userId = await getUserIdByIcsToken(pool, token);
      if (!userId) return res.status(401).send('Invalid token');

      const from = new Date();
      from.setDate(from.getDate() - 30);
      const to = new Date();
      to.setFullYear(to.getFullYear() + 1);

      const appts = await listAppointments(pool, userId, {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      });

      const icsContent = buildIcsCalendar(appts);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="agenda.ics"');
      res.send(icsContent);
    } catch (err) {
      logger.error('ICS feed error', { err });
      res.status(500).send('Internal server error');
    }
  };
}
