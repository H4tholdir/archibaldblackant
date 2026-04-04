import type { DbPool } from '../db/pool';
import type { NotificationServiceDeps } from '../services/notification-service';
import { createNotification } from '../services/notification-service';
import { markAchieved as markAchievedCondition } from '../db/repositories/bonus-conditions';
import { getInactiveCustomers } from '../db/repositories/retention';
import { logger } from '../logger';

const DAILY_CHECK_MS = 24 * 60 * 60 * 1000;

type InactiveCustomerRow = {
  erp_id: string;
  user_id: string;
  name: string;
  last_order_date: string;
};

type OverdueOrderRow = {
  id: string;
  user_id: string;
  order_number: string;
  customer_name: string;
  invoice_due_date: string;
  invoice_remaining_amount: string | null;
  days_past_due: number;
};

type BudgetConditionRow = {
  id: number;
  user_id: string;
  title: string;
  reward_amount: number;
  budget_threshold: number;
};

type BudgetRow = {
  current_budget: number;
};

type MarkAchievedFn = (pool: DbPool, id: number, userId: string) => Promise<unknown>;

async function checkCustomerInactivity(pool: DbPool, deps: NotificationServiceDeps): Promise<number> {
  const { rows } = await pool.query<InactiveCustomerRow>(
    `SELECT c.erp_id, c.user_id, c.name, c.last_order_date
     FROM agents.customers c
     WHERE c.deleted_at IS NULL
       AND c.last_order_date IS NOT NULL
       AND c.last_order_date::date < CURRENT_DATE - INTERVAL '8 months'
       AND c.last_order_date::date > CURRENT_DATE - INTERVAL '12 months'
       AND NOT EXISTS (
         SELECT 1 FROM agents.notifications n
         WHERE n.user_id = c.user_id
           AND n.type = 'customer_inactive'
           AND (n.data->>'erpId') = c.erp_id
           AND n.created_at > NOW() - INTERVAL '30 days'
       )`,
  );

  for (const row of rows) {
    const expiryDate = new Date(row.last_order_date);
    expiryDate.setMonth(expiryDate.getMonth() + 12);
    const monthsLeft = Math.max(0, Math.round((expiryDate.getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000)));
    const monthsLabel = monthsLeft === 1 ? 'mese' : 'mesi';

    await createNotification(deps, {
      target: 'user',
      userId: row.user_id,
      type: 'customer_inactive',
      severity: 'warning',
      title: 'Cliente a rischio esclusività',
      body: `${row.name} non ha effettuato ordini da oltre 8 mesi. Hai circa ${monthsLeft} ${monthsLabel} per mantenere l'esclusività Komet.`,
      data: { erpId: row.erp_id, customerName: row.name, lastOrderDate: row.last_order_date },
    });
  }

  return rows.length;
}

async function checkOverduePayments(pool: DbPool, deps: NotificationServiceDeps): Promise<number> {
  const { rows } = await pool.query<OverdueOrderRow>(
    `SELECT
       o.id, o.user_id, o.order_number, o.customer_name,
       inv.invoice_due_date, inv.invoice_remaining_amount,
       EXTRACT(DAY FROM (CURRENT_DATE - inv.invoice_due_date::date))::int AS days_past_due
     FROM agents.order_records o
     JOIN LATERAL (
       SELECT invoice_due_date, invoice_remaining_amount
       FROM agents.order_invoices
       WHERE order_id = o.id AND user_id = o.user_id
         AND invoice_due_date IS NOT NULL
         AND invoice_due_date::date < CURRENT_DATE - INTERVAL '45 days'
         AND (invoice_closed IS NULL OR invoice_closed = false)
       ORDER BY invoice_due_date ASC
       LIMIT 1
     ) inv ON true
     WHERE (o.total_amount IS NULL OR o.total_amount NOT LIKE '-%')
       AND NOT EXISTS (
         SELECT 1 FROM agents.notifications n
         WHERE n.user_id = o.user_id
           AND n.type = 'order_expiring'
           AND (n.data->>'orderId') = o.id
           AND n.created_at > NOW() - INTERVAL '7 days'
       )`,
  );

  for (const row of rows) {
    await createNotification(deps, {
      target: 'user',
      userId: row.user_id,
      type: 'order_expiring',
      severity: 'error',
      title: 'Pagamento scaduto',
      body: `Ordine ${row.order_number} di ${row.customer_name}: ${row.days_past_due} gg fuori scadenza. Contatta il cliente e invia copia fattura.`,
      data: { orderId: row.id, orderNumber: row.order_number, customerName: row.customer_name, daysPastDue: row.days_past_due },
    });
  }

  return rows.length;
}

async function checkBudgetMilestones(
  pool: DbPool,
  deps: NotificationServiceDeps,
  markAchieved: MarkAchievedFn,
): Promise<number> {
  const { rows: conditions } = await pool.query<BudgetConditionRow>(
    `SELECT id, user_id, title, reward_amount, budget_threshold
     FROM agents.bonus_conditions
     WHERE condition_type = 'budget'
       AND is_achieved = false
       AND budget_threshold IS NOT NULL`,
  );

  let notified = 0;

  for (const cond of conditions) {
    const { rows: budgetRows } = await pool.query<BudgetRow>(
      `SELECT COALESCE(SUM(total_amount::numeric), 0) AS current_budget
       FROM agents.order_records
       WHERE user_id = $1
         AND total_amount IS NOT NULL
         AND total_amount NOT LIKE '-%'
         AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())`,
      [cond.user_id],
    );

    const currentBudget = Number(budgetRows[0]?.current_budget ?? 0);

    if (currentBudget >= cond.budget_threshold) {
      await markAchieved(pool, cond.id, cond.user_id);
      await createNotification(deps, {
        target: 'user',
        userId: cond.user_id,
        type: 'budget_milestone',
        severity: 'success',
        title: 'Traguardo budget raggiunto!',
        body: `Hai raggiunto la condizione "${cond.title}" e guadagnato un bonus di €${cond.reward_amount.toLocaleString('it-IT')}.`,
        data: { conditionId: cond.id, conditionTitle: cond.title, rewardAmount: cond.reward_amount },
      });
      notified++;
    }
  }

  return notified;
}

type MissingDocumentsRow = {
  id: string;
  user_id: string;
  order_number: string;
  customer_name: string;
  current_state: string;
  missing_ddt: boolean;
  missing_invoice: boolean;
};

async function checkMissingOrderDocuments(pool: DbPool, deps: NotificationServiceDeps): Promise<number> {
  const { rows } = await pool.query<MissingDocumentsRow>(
    `SELECT
       o.id, o.user_id, o.order_number, o.customer_name, o.current_state,
       NOT EXISTS (
         SELECT 1 FROM agents.order_ddts d
         WHERE d.order_id = o.id AND d.user_id = o.user_id
       ) AS missing_ddt,
       NOT EXISTS (
         SELECT 1 FROM agents.order_invoices i
         WHERE i.order_id = o.id AND i.user_id = o.user_id
       ) AS missing_invoice
     FROM agents.order_records o
     WHERE o.creation_date::date >= '2026-01-01'
       AND o.order_number NOT LIKE 'NC/%'
       AND (o.total_amount IS NULL OR o.total_amount NOT LIKE '-%')
       AND (
         (o.current_state IN ('spedito','consegnato','parzialmente_consegnato','fatturato','pagamento_scaduto','pagato')
          AND NOT EXISTS (SELECT 1 FROM agents.order_ddts d WHERE d.order_id = o.id AND d.user_id = o.user_id))
         OR
         (o.current_state IN ('fatturato','pagamento_scaduto','pagato')
          AND NOT EXISTS (SELECT 1 FROM agents.order_invoices i WHERE i.order_id = o.id AND i.user_id = o.user_id))
       )
       AND NOT EXISTS (
         SELECT 1 FROM agents.notifications n
         WHERE n.user_id = o.user_id
           AND n.type = 'order_documents_missing'
           AND (n.data->>'orderId') = o.id
           AND n.created_at > NOW() - INTERVAL '14 days'
       )`,
  );

  for (const row of rows) {
    const missing: ('ddt' | 'invoice')[] = [];
    if (row.missing_ddt) missing.push('ddt');
    if (row.missing_invoice) missing.push('invoice');

    const title = missing.length === 2
      ? 'DDT e fattura mancanti'
      : missing[0] === 'ddt'
        ? 'Spedizione senza DDT'
        : 'Fattura mancante';

    const body = missing.length === 2
      ? `Ordine ${row.order_number} di ${row.customer_name} è in stato ${row.current_state} senza DDT né fattura collegati. Verifica con Verona.`
      : missing[0] === 'ddt'
        ? `Ordine ${row.order_number} di ${row.customer_name} è in stato ${row.current_state} ma non risulta nessun DDT collegato. Verifica con Verona se la spedizione è avvenuta.`
        : `Ordine ${row.order_number} di ${row.customer_name} è in stato ${row.current_state} ma non risulta nessuna fattura collegata. Segnala a Verona.`;

    await createNotification(deps, {
      target: 'user',
      userId: row.user_id,
      type: 'order_documents_missing',
      severity: 'warning',
      title,
      body,
      data: {
        orderId: row.id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        currentState: row.current_state,
        missing,
      },
    });
  }

  return rows.length;
}

const RETENTION_THRESHOLD_MONTHS = 24;

async function checkRetentionPolicy(pool: DbPool, deps: NotificationServiceDeps): Promise<void> {
  if (new Date().getUTCDay() !== 0) return;

  const { rows: users } = await pool.query<{ id: string }>(
    `SELECT DISTINCT user_id AS id FROM agents.customers WHERE deleted_at IS NULL`,
  );
  for (const user of users) {
    const inactive = await getInactiveCustomers(pool, user.id, RETENTION_THRESHOLD_MONTHS);
    if (inactive.length > 0) {
      await createNotification(deps, {
        target: 'user',
        userId: user.id,
        type: 'customer_inactive_retention',
        severity: 'warning',
        title: 'Clienti da verificare per policy di conservazione',
        body: `${inactive.length} ${inactive.length === 1 ? 'cliente non ha avuto' : 'clienti non hanno avuto'} attività negli ultimi ${RETENTION_THRESHOLD_MONTHS} mesi. Verifica se i dati devono essere conservati.`,
        data: {
          count: inactive.length,
          customerProfiles: inactive.map((c) => c.customerProfile),
        },
      });
    }
  }
}

function createNotificationScheduler(pool: DbPool, deps: NotificationServiceDeps) {
  const timers: NodeJS.Timeout[] = [];

  function start(): void {
    timers.push(
      setInterval(() => {
        checkCustomerInactivity(pool, deps).catch((error) => {
          logger.error('Failed to check customer inactivity', { error });
        });
        checkOverduePayments(pool, deps).catch((error) => {
          logger.error('Failed to check overdue payments', { error });
        });
        checkBudgetMilestones(pool, deps, markAchievedCondition as MarkAchievedFn).catch((error) => {
          logger.error('Failed to check budget milestones', { error });
        });
        checkMissingOrderDocuments(pool, deps).catch((error) => {
          logger.error('Failed to check missing order documents', { error });
        });
        checkRetentionPolicy(pool, deps).catch((error) => {
          logger.error('Failed to check retention policy', { error });
        });
      }, DAILY_CHECK_MS),
    );
  }

  function stop(): void {
    for (const timer of timers) {
      clearInterval(timer);
    }
    timers.length = 0;
  }

  return { start, stop };
}

export {
  createNotificationScheduler,
  checkCustomerInactivity,
  checkOverduePayments,
  checkBudgetMilestones,
  checkMissingOrderDocuments,
  checkRetentionPolicy,
  RETENTION_THRESHOLD_MONTHS,
  DAILY_CHECK_MS,
};
