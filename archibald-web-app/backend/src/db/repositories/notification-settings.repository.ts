import type { DbPool } from '../pool';

export type NotificationProfile = {
  id: number;
  name: string;
  isDefault: boolean;
  steps: Array<{ days_after_due: number; tone: string; channels: string[] }>;
};

export type NotificationSettings = {
  id: string;
  customerId: string;
  enabled: boolean;
  profileId: number | null;
  overrideSteps: NotificationProfile['steps'] | null;
  emailOverride: string | null;
  whatsappOverride: string | null;
  notifyNewInvoice: boolean;
  notifyPreDue: boolean;
  preDueDays: number;
  periodicStatementEnabled: boolean;
  periodicStatementDays: number;
  periodicStatementContent: Record<string, boolean>;
  effectiveEmail: string | null;
  effectiveWhatsapp: string | null;
};

export function buildEffectiveContactQuery(): string {
  return `COALESCE(ns.email_override, c.email) AS effective_email,
          COALESCE(ns.whatsapp_override, c.mobile) AS effective_whatsapp`;
}

export async function getNotificationSettings(
  pool: DbPool,
  userId: string,
  customerErpId: string,
): Promise<NotificationSettings | null> {
  const { rows } = await pool.query(
    `SELECT ns.*,
       ${buildEffectiveContactQuery()}
     FROM agents.invoice_notification_settings ns
     JOIN agents.customers c ON c.user_id = ns.user_id AND c.erp_id = ns.customer_erp_id AND c.deleted_at IS NULL
     WHERE ns.user_id = $1 AND ns.customer_erp_id = $2`,
    [userId, customerErpId],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id, customerId: r.customer_erp_id, enabled: r.enabled,
    profileId: r.profile_id, overrideSteps: r.override_steps,
    emailOverride: r.email_override, whatsappOverride: r.whatsapp_override,
    notifyNewInvoice: r.notify_new_invoice, notifyPreDue: r.notify_pre_due,
    preDueDays: r.pre_due_days, periodicStatementEnabled: r.periodic_statement_enabled,
    periodicStatementDays: r.periodic_statement_days,
    periodicStatementContent: r.periodic_statement_content ?? {},
    effectiveEmail: r.effective_email, effectiveWhatsapp: r.effective_whatsapp,
  };
}

export async function upsertNotificationSettings(
  pool: DbPool,
  userId: string,
  customerErpId: string,
  settings: Partial<Omit<NotificationSettings, 'id' | 'customerId' | 'effectiveEmail' | 'effectiveWhatsapp'>>,
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.invoice_notification_settings
       (user_id, customer_erp_id, enabled, profile_id, override_steps,
        email_override, whatsapp_override, notify_new_invoice, notify_pre_due,
        pre_due_days, periodic_statement_enabled, periodic_statement_days,
        periodic_statement_content, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
     ON CONFLICT (user_id, customer_erp_id) DO UPDATE SET
       enabled = COALESCE(EXCLUDED.enabled, invoice_notification_settings.enabled),
       profile_id = COALESCE(EXCLUDED.profile_id, invoice_notification_settings.profile_id),
       override_steps = EXCLUDED.override_steps,
       email_override = EXCLUDED.email_override,
       whatsapp_override = EXCLUDED.whatsapp_override,
       notify_new_invoice = COALESCE(EXCLUDED.notify_new_invoice, invoice_notification_settings.notify_new_invoice),
       notify_pre_due = COALESCE(EXCLUDED.notify_pre_due, invoice_notification_settings.notify_pre_due),
       pre_due_days = COALESCE(EXCLUDED.pre_due_days, invoice_notification_settings.pre_due_days),
       periodic_statement_enabled = COALESCE(EXCLUDED.periodic_statement_enabled, invoice_notification_settings.periodic_statement_enabled),
       periodic_statement_days = COALESCE(EXCLUDED.periodic_statement_days, invoice_notification_settings.periodic_statement_days),
       periodic_statement_content = COALESCE(EXCLUDED.periodic_statement_content, invoice_notification_settings.periodic_statement_content),
       updated_at = NOW()`,
    [
      userId, customerErpId,
      settings.enabled ?? false,
      settings.profileId ?? null,
      settings.overrideSteps ? JSON.stringify(settings.overrideSteps) : null,
      settings.emailOverride ?? null,
      settings.whatsappOverride ?? null,
      settings.notifyNewInvoice ?? true,
      settings.notifyPreDue ?? true,
      settings.preDueDays ?? 7,
      settings.periodicStatementEnabled ?? false,
      settings.periodicStatementDays ?? 30,
      settings.periodicStatementContent ? JSON.stringify(settings.periodicStatementContent) : null,
    ],
  );
}

export async function listNotificationProfiles(pool: DbPool): Promise<NotificationProfile[]> {
  const { rows } = await pool.query(
    `SELECT id, name, is_default, steps FROM agents.notification_profiles ORDER BY id`,
  );
  return rows.map(r => ({ id: r.id, name: r.name, isDefault: r.is_default, steps: r.steps }));
}

export async function getPendingWaForUser(
  pool: DbPool,
  userId: string,
): Promise<Array<{
  id: string;
  customerErpId: string;
  phoneTo: string;
  messageText: string;
  tone: string;
  status: string;
  invoiceNumbers: string[];
  totalAmount: number | null;
}>> {
  const { rows } = await pool.query(
    `SELECT id, customer_erp_id, phone_to, message_text, tone, status, invoice_numbers, total_amount
     FROM agents.invoice_notification_pending_wa
     WHERE user_id = $1 AND status IN ('pending','opened_by_agent')
     ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map(r => ({
    id: r.id, customerErpId: r.customer_erp_id, phoneTo: r.phone_to,
    messageText: r.message_text, tone: r.tone, status: r.status,
    invoiceNumbers: r.invoice_numbers, totalAmount: r.total_amount,
  }));
}

export async function updatePendingWaStatus(
  pool: DbPool,
  userId: string,
  id: string,
  status: 'opened_by_agent' | 'confirmed_sent' | 'dismissed',
): Promise<void> {
  const now = new Date();
  await pool.query(
    `UPDATE agents.invoice_notification_pending_wa
     SET status = $3,
         sent_at = CASE WHEN $3 = 'confirmed_sent' THEN $4 ELSE sent_at END,
         dismissed_at = CASE WHEN $3 = 'dismissed' THEN $4 ELSE dismissed_at END
     WHERE id = $1 AND user_id = $2`,
    [id, userId, status, now],
  );
}
