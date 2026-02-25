import type { DbPool } from "./db/pool";
import { logger } from "./logger";

export const ORDER_AMOUNT_OVERRIDES: Record<
  string,
  { correctAmount: number; reason: string }
> = {
  "ORD/26001461": {
    correctAmount: 415.48,
    reason:
      "Bug Archibald: non ha registrato lo sconto globale. Imponibile reale: 415,48€ invece di 933,44€ (gen 2025)",
  },
};

export function getOrderAmountOverrides() {
  return ORDER_AMOUNT_OVERRIDES;
}

export interface TemporalComparison {
  previousValue: number;
  currentValue: number;
  absoluteDelta: number;
  percentageDelta: number;
  label: string;
}

export interface SparklineData {
  values: number[];
  labels?: string[];
  period: "daily" | "weekly" | "monthly" | "yearly";
}

// ============================================================================
// DATE RANGE CALCULATIONS
// ============================================================================

export function getPreviousMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayPreviousMonth = new Date(firstDayCurrentMonth.getTime() - 1);
  const firstDayPreviousMonth = new Date(
    lastDayPreviousMonth.getFullYear(),
    lastDayPreviousMonth.getMonth(),
    1,
  );

  return {
    start: firstDayPreviousMonth,
    end: lastDayPreviousMonth,
  };
}

export function getSameMonthLastYearRange(): { start: Date; end: Date } {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const start = new Date(currentYear - 1, currentMonth, 1);
  const end = new Date(currentYear - 1, currentMonth + 1, 0);

  return { start, end };
}

export function getCurrentYearStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

export function getPreviousYearStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear() - 1, 0, 1);
}

export function getDaysAgo(days: number): Date {
  const now = new Date();
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function getWeeksAgo(weeks: number): Date {
  return getDaysAgo(weeks * 7);
}

export function getMonthsAgo(months: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
}

// ============================================================================
// REVENUE CALCULATIONS FROM ORDERS
// ============================================================================

export function parseItalianCurrency(value: string | null): number {
  if (!value || value.trim() === "") return 0;

  let cleaned = value.replace(/€/g, "").trim();
  cleaned = cleaned.replace(/\./g, "");
  cleaned = cleaned.replace(/,/g, ".");

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export async function calculateRevenueInRange(
  pool: DbPool,
  userId: string,
  startDate: Date,
  endDate: Date,
  options?: {
    excludeFromMonthly?: boolean;
    excludeFromYearly?: boolean;
  },
): Promise<number> {
  const params: unknown[] = [userId, userId, startDate.toISOString(), endDate.toISOString()];
  let paramIndex = 5;

  let query = `
    SELECT o.id, o.order_number, o.creation_date, o.total_amount
    FROM agents.order_records o
    LEFT JOIN agents.widget_order_exclusions e ON o.id = e.order_id AND e.user_id = $1
    WHERE o.user_id = $2
      AND o.creation_date >= $3
      AND o.creation_date <= $4
      AND o.total_amount IS NOT NULL
      AND o.total_amount != ''
  `;

  if (options?.excludeFromMonthly) {
    query += `\n      AND (e.excluded_from_monthly IS NULL OR e.excluded_from_monthly = FALSE)`;
  }
  if (options?.excludeFromYearly) {
    query += `\n      AND (e.excluded_from_yearly IS NULL OR e.excluded_from_yearly = FALSE)`;
  }

  const { rows: orders } = await pool.query<{
    id: string;
    order_number: string;
    creation_date: string;
    total_amount: string;
  }>(query, params);

  let total = 0;

  for (const order of orders) {
    total += parseItalianCurrency(order.total_amount);
  }

  for (const order of orders) {
    const override = ORDER_AMOUNT_OVERRIDES[order.order_number];
    if (override) {
      const originalParsed = parseItalianCurrency(order.total_amount);
      const diff = override.correctAmount - originalParsed;
      total += diff;
      logger.info(
        `[temporal-comparisons] Applied override for ${order.order_number}: ${originalParsed.toFixed(2)}€ → ${override.correctAmount}€ (${diff > 0 ? "+" : ""}${diff.toFixed(2)}€)`,
      );
    }
  }

  return parseFloat(total.toFixed(2));
}

export async function calculateCurrentMonthRevenue(
  pool: DbPool,
  userId: string,
  excludeFromMonthly?: boolean,
): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23, 59, 59,
  );
  return calculateRevenueInRange(pool, userId, monthStart, endOfToday, {
    excludeFromMonthly,
  });
}

export async function calculatePreviousMonthRevenue(
  pool: DbPool,
  userId: string,
  excludeFromMonthly = true,
): Promise<number> {
  const { start, end } = getPreviousMonthRange();
  return calculateRevenueInRange(pool, userId, start, end, {
    excludeFromMonthly,
  });
}

export async function calculateSameMonthLastYearRevenue(
  pool: DbPool,
  userId: string,
  excludeFromMonthly = true,
): Promise<number> {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const lastYear = now.getFullYear() - 1;

  const start = new Date(lastYear, currentMonth, 1);
  const end = new Date(lastYear, currentMonth, currentDay, 23, 59, 59);

  return calculateRevenueInRange(pool, userId, start, end, {
    excludeFromMonthly,
  });
}

export async function calculateCurrentYearRevenue(
  pool: DbPool,
  userId: string,
  excludeFromYearly?: boolean,
): Promise<number> {
  const now = new Date();
  const yearStart = getCurrentYearStart();
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23, 59, 59,
  );
  return calculateRevenueInRange(pool, userId, yearStart, endOfToday, {
    excludeFromYearly,
  });
}

export async function calculatePreviousYearRevenue(
  pool: DbPool,
  userId: string,
): Promise<number> {
  const lastYear = new Date().getFullYear() - 1;
  const start = new Date(lastYear, 0, 1);
  const end = new Date(lastYear, 11, 31, 23, 59, 59);
  return calculateRevenueInRange(pool, userId, start, end);
}

// ============================================================================
// ORDER COUNT CALCULATIONS
// ============================================================================

export async function countOrdersInRange(
  pool: DbPool,
  userId: string,
  startDate: Date,
  endDate: Date,
  options?: {
    excludeFromMonthly?: boolean;
    excludeFromYearly?: boolean;
  },
): Promise<number> {
  let query = `
    SELECT COUNT(*) as count
    FROM agents.order_records o
    LEFT JOIN agents.widget_order_exclusions e ON o.id = e.order_id AND e.user_id = $1
    WHERE o.user_id = $2
      AND o.creation_date >= $3
      AND o.creation_date <= $4
  `;

  if (options?.excludeFromMonthly) {
    query += `\n      AND (e.excluded_from_monthly IS NULL OR e.excluded_from_monthly = FALSE)`;
  }
  if (options?.excludeFromYearly) {
    query += `\n      AND (e.excluded_from_yearly IS NULL OR e.excluded_from_yearly = FALSE)`;
  }

  const { rows: [result] } = await pool.query<{ count: string }>(
    query,
    [userId, userId, startDate.toISOString(), endDate.toISOString()],
  );

  return parseInt(result?.count ?? '0', 10);
}

export async function calculateAverageOrderValue(
  pool: DbPool,
  userId: string,
  startDate: Date,
  endDate: Date,
  options?: {
    excludeFromMonthly?: boolean;
    excludeFromYearly?: boolean;
  },
): Promise<number> {
  const totalRevenue = await calculateRevenueInRange(
    pool, userId, startDate, endDate, options,
  );
  const orderCount = await countOrdersInRange(
    pool, userId, startDate, endDate, options,
  );

  if (orderCount === 0) {
    return 0;
  }

  return parseFloat((totalRevenue / orderCount).toFixed(2));
}

// ============================================================================
// SPARKLINE DATA GENERATION
// ============================================================================

export async function generateMonthlySparkline(
  pool: DbPool,
  userId: string,
  months: number = 12,
): Promise<SparklineData> {
  const values: number[] = [];
  const labels: string[] = [];

  const monthNames = [
    "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
    "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
  ];

  for (let i = months - 1; i >= 0; i--) {
    const monthDate = getMonthsAgo(i);
    const monthStart = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      1,
    );
    const monthEnd = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0, 23, 59, 59,
    );

    const revenue = await calculateRevenueInRange(pool, userId, monthStart, monthEnd);
    values.push(revenue);
    labels.push(monthNames[monthDate.getMonth()]);
  }

  return { values, labels, period: "monthly" };
}

export async function generateDailySparkline(
  pool: DbPool,
  userId: string,
  days: number = 7,
): Promise<SparklineData> {
  const values: number[] = [];
  const labels: string[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = getDaysAgo(i);
    const dayStart = new Date(
      date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0,
    );
    const dayEnd = new Date(
      date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59,
    );

    const count = await countOrdersInRange(pool, userId, dayStart, dayEnd);
    values.push(count);

    const dayNames = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
    const dayName = dayNames[date.getDay()];
    labels.push(`${dayName} ${date.getDate()}`);
  }

  return { values, labels, period: "daily" };
}

// ============================================================================
// COMPARISON BUILDERS
// ============================================================================

export function buildComparison(
  currentValue: number,
  previousValue: number,
  label: string,
): TemporalComparison {
  const absoluteDelta = currentValue - previousValue;
  const percentageDelta =
    previousValue > 0 ? (absoluteDelta / previousValue) * 100 : 0;

  return {
    previousValue,
    currentValue,
    absoluteDelta,
    percentageDelta,
    label,
  };
}

export async function buildPreviousMonthComparison(
  pool: DbPool,
  userId: string,
  currentValue: number,
): Promise<TemporalComparison> {
  const previousValue = await calculatePreviousMonthRevenue(pool, userId);
  return buildComparison(
    currentValue,
    previousValue,
    "vs Stesso Periodo Mese Scorso",
  );
}

export async function buildSameMonthLastYearComparison(
  pool: DbPool,
  userId: string,
  currentValue: number,
): Promise<TemporalComparison> {
  const previousValue = await calculateSameMonthLastYearRevenue(pool, userId);
  const now = new Date();
  const monthNames = [
    "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
    "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
  ];
  const monthName = monthNames[now.getMonth()];
  const lastYear = now.getFullYear() - 1;

  return buildComparison(
    currentValue,
    previousValue,
    `vs ${monthName} ${lastYear}`,
  );
}

export function buildYearlyProgressComparison(
  currentYearRevenue: number,
  yearlyTarget: number,
): TemporalComparison {
  const percentageDelta = (currentYearRevenue / yearlyTarget) * 100;

  return {
    previousValue: yearlyTarget,
    currentValue: currentYearRevenue,
    absoluteDelta: currentYearRevenue - yearlyTarget,
    percentageDelta,
    label: "vs Obiettivo Annuo",
  };
}
