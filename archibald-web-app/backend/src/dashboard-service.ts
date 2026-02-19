import type { DbPool } from './db/pool';
import * as usersRepo from './db/repositories/users';
import {
  calculateCurrentMonthRevenue,
  calculateCurrentYearRevenue,
  calculateAverageOrderValue,
  calculateRevenueInRange,
  countOrdersInRange,
  parseItalianCurrency,
  getMonthsAgo,
  getOrderAmountOverrides,
  buildComparison,
} from './temporal-comparisons';
import * as WidgetCalc from './widget-calculations';

async function getDashboardData(pool: DbPool, userId: string) {
  const userConfig = await usersRepo.getUserTarget(pool, userId);
  if (!userConfig) {
    throw new Error('User not found');
  }

  const now = new Date();

  const currentMonthRevenue = await calculateCurrentMonthRevenue(pool, userId, true);
  const currentYearRevenue = await calculateCurrentYearRevenue(pool, userId, true);

  const threeMonthsAgoDate = getMonthsAgo(3);
  const averageOrderValue =
    (await calculateAverageOrderValue(pool, userId, threeMonthsAgoDate, now, { excludeFromMonthly: true })) || 4500;

  const workingDaysRemaining = WidgetCalc.calculateWorkingDaysRemaining();

  const dayOfMonth = now.getDate();
  const averageDailyRevenue = dayOfMonth > 0 ? currentMonthRevenue / dayOfMonth : 0;

  const heroStatus = await WidgetCalc.calculateHeroStatus(
    currentMonthRevenue, userConfig.monthlyTarget,
    currentYearRevenue, userConfig.bonusInterval, userConfig.yearlyTarget,
    pool, userId, averageDailyRevenue, workingDaysRemaining,
  );

  const kpiCards = WidgetCalc.calculateKpiCards(
    currentMonthRevenue, userConfig.monthlyTarget,
    userConfig.commissionRate, currentYearRevenue,
    userConfig.bonusInterval, userConfig.bonusAmount,
  );

  const bonusRoadmap = WidgetCalc.calculateBonusRoadmap(
    currentYearRevenue, userConfig.bonusInterval, userConfig.bonusAmount,
  );

  const forecast = await WidgetCalc.calculateForecast(
    currentMonthRevenue, currentYearRevenue,
    averageDailyRevenue, workingDaysRemaining,
    userConfig.commissionRate, userConfig.bonusInterval, userConfig.bonusAmount,
    userConfig.monthlyTarget, pool, userId,
  );

  const actionSuggestion = WidgetCalc.calculateActionSuggestion(
    currentMonthRevenue, userConfig.monthlyTarget,
    bonusRoadmap.missingToNextBonus, userConfig.bonusAmount,
    averageOrderValue, userConfig.yearlyTarget, currentYearRevenue,
  );

  const balance = WidgetCalc.calculateBalance(
    userConfig.commissionRate, currentYearRevenue, userConfig.monthlyAdvance,
  );

  const extraBudget = WidgetCalc.calculateExtraBudget(
    currentYearRevenue, userConfig.yearlyTarget,
    userConfig.extraBudgetInterval, userConfig.extraBudgetReward,
  );

  const alerts = WidgetCalc.calculateAlerts(
    forecast.projectedMonthRevenue, userConfig.monthlyTarget,
    currentMonthRevenue, averageDailyRevenue,
    workingDaysRemaining, averageOrderValue,
  );

  return { heroStatus, kpiCards, bonusRoadmap, forecast, actionSuggestion, balance, extraBudget, alerts };
}

async function getBudgetMetrics(pool: DbPool, userId: string) {
  const target = await usersRepo.getUserTarget(pool, userId);
  if (!target) {
    throw new Error('User not found');
  }

  const now = new Date();
  const monthLabel = now.toISOString().slice(0, 7);

  const currentBudget = await calculateCurrentMonthRevenue(pool, userId, true);

  const monthlyTarget = target.monthlyTarget;
  const progress = monthlyTarget > 0
    ? Math.min((currentBudget / monthlyTarget) * 100, 100)
    : 0;

  return {
    currentBudget,
    targetBudget: monthlyTarget,
    currency: target.currency,
    progress: Math.round(progress * 10) / 10,
    month: monthLabel,
  };
}

async function getOrderMetrics(pool: DbPool, userId: string) {
  const now = new Date();

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMonday, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

  const todayCount = await countOrdersInRange(pool, userId, todayStart, todayEnd);
  const weekCount = await countOrdersInRange(pool, userId, weekStart, todayEnd);
  const monthCount = await countOrdersInRange(pool, userId, monthStart, todayEnd);

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
  const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
  const yesterdayCount = await countOrdersInRange(pool, userId, yesterdayStart, yesterdayEnd);

  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(lastWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() + daysFromMonday);
  lastWeekEnd.setHours(23, 59, 59);
  const lastWeekCount = await countOrdersInRange(pool, userId, lastWeekStart, lastWeekEnd);

  const currentDayOfMonth = now.getDate();
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
  const sameDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, currentDayOfMonth, 23, 59, 59);
  const lastMonthCount = await countOrdersInRange(pool, userId, firstDayLastMonth, sameDayLastMonth);

  return {
    todayCount,
    weekCount,
    monthCount,
    timestamp: now.toISOString(),
    comparisonYesterday: buildComparison(todayCount, yesterdayCount, 'vs Ieri'),
    comparisonLastWeek: buildComparison(weekCount, lastWeekCount, 'vs Stesso Periodo Sett. Scorsa'),
    comparisonLastMonth: buildComparison(monthCount, lastMonthCount, 'vs Stesso Periodo Mese Scorso'),
  };
}

async function getOrdersForPeriod(pool: DbPool, userId: string, year: number, month: number) {
  const startDate = new Date(year, month - 1, 1, 0, 0, 0).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

  const { rows: orders } = await pool.query<{
    id: string;
    order_number: string;
    customer_name: string;
    total_amount: string | null;
    creation_date: string;
    excluded_from_yearly: boolean | null;
    excluded_from_monthly: boolean | null;
    exclusion_reason: string | null;
  }>(
    `SELECT o.id, o.order_number, o.customer_name, o.total_amount, o.creation_date,
            e.excluded_from_yearly, e.excluded_from_monthly, e.reason as exclusion_reason
     FROM agents.order_records o
     LEFT JOIN agents.widget_order_exclusions e ON o.id = e.order_id AND e.user_id = $1
     WHERE o.user_id = $1
       AND o.creation_date >= $2
       AND o.creation_date <= $3
     ORDER BY o.creation_date DESC`,
    [userId, startDate, endDate],
  );

  const overrides = getOrderAmountOverrides();

  const mappedOrders = orders.map((o) => {
    const override = overrides[o.order_number];
    return {
      id: o.id,
      orderNumber: o.order_number,
      customerName: o.customer_name,
      totalAmount: o.total_amount,
      creationDate: o.creation_date,
      excludedFromYearly: o.excluded_from_yearly ?? false,
      excludedFromMonthly: o.excluded_from_monthly ?? false,
      exclusionReason: o.exclusion_reason,
      hasOverride: !!override,
      overrideAmount: override?.correctAmount ?? null,
      overrideReason: override?.reason ?? null,
    };
  });

  const totalIncluded = mappedOrders
    .filter((o) => !o.excludedFromMonthly)
    .reduce((sum, o) => {
      const override = overrides[o.orderNumber];
      const amount = override ? override.correctAmount : parseItalianCurrency(o.totalAmount);
      return sum + amount;
    }, 0);

  const totalExcluded = mappedOrders
    .filter((o) => o.excludedFromMonthly)
    .reduce((sum, o) => {
      const override = overrides[o.orderNumber];
      const amount = override ? override.correctAmount : parseItalianCurrency(o.totalAmount);
      return sum + amount;
    }, 0);

  return {
    orders: mappedOrders,
    summary: {
      totalOrders: orders.length,
      includedCount: mappedOrders.filter((o) => !o.excludedFromMonthly).length,
      excludedCount: mappedOrders.filter((o) => o.excludedFromMonthly).length,
      totalIncluded,
      totalExcluded,
      grandTotal: totalIncluded + totalExcluded,
    },
    period: { year, month, startDate, endDate },
  };
}

async function setOrderExclusion(
  pool: DbPool, userId: string, orderId: string,
  excludeFromYearly: boolean, excludeFromMonthly: boolean, reason?: string,
) {
  await pool.query(
    `INSERT INTO agents.widget_order_exclusions (user_id, order_id, excluded_from_yearly, excluded_from_monthly, reason, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (user_id, order_id)
     DO UPDATE SET excluded_from_yearly = $3, excluded_from_monthly = $4, reason = $5, updated_at = NOW()`,
    [userId, orderId, excludeFromYearly, excludeFromMonthly, reason ?? null],
  );
}

async function getExcludedOrders(pool: DbPool, userId: string) {
  const { rows } = await pool.query<{
    order_id: string;
    order_number: string;
    excluded_from_yearly: boolean;
    excluded_from_monthly: boolean;
    reason: string | null;
  }>(
    `SELECT e.order_id, o.order_number, e.excluded_from_yearly, e.excluded_from_monthly, e.reason
     FROM agents.widget_order_exclusions e
     JOIN agents.order_records o ON e.order_id = o.id AND o.user_id = e.user_id
     WHERE e.user_id = $1
       AND (e.excluded_from_yearly = TRUE OR e.excluded_from_monthly = TRUE)`,
    [userId],
  );

  return rows.map((r) => ({
    orderId: r.order_id,
    orderNumber: r.order_number,
    excludedFromYearly: r.excluded_from_yearly,
    excludedFromMonthly: r.excluded_from_monthly,
    reason: r.reason,
  }));
}

export {
  getDashboardData,
  getBudgetMetrics,
  getOrderMetrics,
  getOrdersForPeriod,
  setOrderExclusion,
  getExcludedOrders,
};
