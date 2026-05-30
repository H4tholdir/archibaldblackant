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
  customerErpId?: string,
): Promise<TemplateRow | null> {
  // 1. Cerca template specifico per cliente
  if (customerErpId) {
    const { rows } = await pool.query(
      `SELECT subject_tmpl, body_tmpl FROM agents.notification_message_templates
       WHERE user_id = $1 AND customer_erp_id = $2 AND event_type = $3 AND tone = $4 AND channel = $5
       LIMIT 1`,
      [userId, customerErpId, eventType, tone, channel],
    );
    if (rows[0]) return rows[0];
  }
  // 2. Fallback: template agente (customer_erp_id IS NULL)
  const { rows } = await pool.query(
    `SELECT subject_tmpl, body_tmpl FROM agents.notification_message_templates
     WHERE user_id = $1 AND customer_erp_id IS NULL AND event_type = $2 AND tone = $3 AND channel = $4
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
