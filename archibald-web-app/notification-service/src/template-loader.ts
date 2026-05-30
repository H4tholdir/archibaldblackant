import type { Pool } from 'pg';

type TemplateRow = {
  subject_tmpl: string | null;
  body_tmpl: string;
};

export async function getCustomTemplate(
  pool: Pool,
  userId: string,
  eventType: string,
  tone: string,
  channel: string,
): Promise<TemplateRow | null> {
  const { rows } = await pool.query(
    `SELECT subject_tmpl, body_tmpl FROM agents.notification_message_templates
     WHERE user_id = $1 AND event_type = $2 AND tone = $3 AND channel = $4
     LIMIT 1`,
    [userId, eventType, tone, channel],
  );
  return rows[0] ?? null;
}

export function applyTemplateVariables(
  template: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v),
    template,
  );
}
