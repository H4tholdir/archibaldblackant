import type { DbPool } from '../db/pool';
import type { NotificationServiceDeps } from '../services/notification-service';
import { createNotification } from '../services/notification-service';
import { markAchieved as markAchievedCondition } from '../db/repositories/bonus-conditions';
import { logger } from '../logger';

const DAILY_CHECK_MS = 24 * 60 * 60 * 1000;

type InactiveCustomerRow = {
  customer_profile: string;
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
    `SELECT c.customer_profile, c.user_id, c.name, c.last_order_date
     FROM agents.customers c
     WHERE c.deleted_at IS NULL
       AND c.last_order_date IS NOT NULL
       AND c.last_order_date::date < CURRENT_DATE - INTERVAL '8 months'
       AND c.last_order_date::date > CURRENT_DATE - INTERVAL '12 months'
       AND NOT EXISTS (
         SELECT 1 FROM agents.notifications n
         WHERE n.user_id = c.user_id
           AND n.type = 'customer_inactive'
           AND (n.data->>'customerProfile') = c.customer_profile
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
      data: { customerProfile: row.customer_profile, customerName: row.name, lastOrderDate: row.last_order_date },
    });
  }

  return rows.length;
}

async function checkOverduePayments(pool: DbPool, deps: NotificationServiceDeps): Promise<number> {
  const { rows } = await pool.query<OverdueOrderRow>(
    `SELECT
       o.id, o.user_id, o.order_number, o.customer_name,
       o.invoice_due_date, o.invoice_remaining_amount,
       EXTRACT(DAY FROM (CURRENT_DATE - o.invoice_due_date::date))::int AS days_past_due
     FROM agents.order_records o
     WHERE o.invoice_due_date IS NOT NULL
       AND o.invoice_due_date::date < CURRENT_DATE - INTERVAL '45 days'
       AND (o.invoice_closed IS NULL OR o.invoice_closed = false)
       AND (o.total_amount IS NULL OR o.total_amount NOT LIKE '-%')
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
  DAILY_CHECK_MS,
};
