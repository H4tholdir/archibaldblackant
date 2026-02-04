/**
 * Temporal Comparisons Helper Functions
 * Calculate historical periods and comparisons for dashboard widgets
 */

import type { Database } from "better-sqlite3";
import { logger } from "./logger";

/**
 * ORDER AMOUNT OVERRIDES
 * Hardcoded corrections for orders with erroneous data from Archibald
 *
 * Format: { "ORDER_NUMBER": { correctAmount: number, reason: string } }
 *
 * NOTE: These overrides are applied during revenue calculations.
 * The database values remain unchanged to preserve sync integrity.
 */
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

/**
 * Get order amount overrides (for API responses)
 */
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

/**
 * Get start and end dates for previous month
 */
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

/**
 * Get start and end dates for same month last year
 */
export function getSameMonthLastYearRange(): { start: Date; end: Date } {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const start = new Date(currentYear - 1, currentMonth, 1);
  const end = new Date(currentYear - 1, currentMonth + 1, 0); // Last day of month

  return { start, end };
}

/**
 * Get start date for current year
 */
export function getCurrentYearStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1); // January 1st
}

/**
 * Get start date for previous year
 */
export function getPreviousYearStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear() - 1, 0, 1);
}

/**
 * Get date N days ago
 */
export function getDaysAgo(days: number): Date {
  const now = new Date();
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Get date N weeks ago
 */
export function getWeeksAgo(weeks: number): Date {
  return getDaysAgo(weeks * 7);
}

/**
 * Get date N months ago
 */
export function getMonthsAgo(months: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
}

// ============================================================================
// REVENUE CALCULATIONS FROM ORDERS
// ============================================================================

/**
 * Parse Italian-formatted currency string to number
 * Handles formats like:
 * - "123,45 €" → 123.45
 * - "1.234,56 €" → 1234.56
 * - "2.215,40 €" → 2215.40
 *
 * Exported for use in other modules to avoid code duplication
 */
export function parseItalianCurrency(value: string | null): number {
  if (!value || value.trim() === "") return 0;

  // Remove currency symbol and whitespace
  let cleaned = value.replace(/€/g, "").trim();

  // Remove thousand separators (.)
  cleaned = cleaned.replace(/\./g, "");

  // Replace decimal comma with dot
  cleaned = cleaned.replace(/,/g, ".");

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculate total revenue from orders in a date range
 * Uses 'total_amount' field (matches existing widget logic)
 * TODO: Switch to imponibile (taxable amount without VAT) when column is added
 *
 * NOTE: Applies ORDER_AMOUNT_OVERRIDES for known erroneous orders
 * NOTE: Properly parses Italian currency format ("2.215,40 €")
 *
 * @param excludeFromMonthly - If true, excludes orders marked as excluded_from_monthly
 * @param excludeFromYearly - If true, excludes orders marked as excluded_from_yearly
 */
export function calculateRevenueInRange(
  db: Database,
  userId: string,
  startDate: Date,
  endDate: Date,
  options?: {
    excludeFromMonthly?: boolean;
    excludeFromYearly?: boolean;
  },
): number {
  logger.info(`[temporal-comparisons] calculateRevenueInRange called`, {
    userId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    options,
  });

  // Build query with optional exclusions
  let query = `
    SELECT o.id, o.order_number, o.creation_date, o.total_amount
    FROM orders o
    LEFT JOIN widget_order_exclusions e ON o.id = e.order_id AND e.user_id = ?
    WHERE o.user_id = ?
      AND o.creation_date >= ?
      AND o.creation_date <= ?
      AND o.total_amount IS NOT NULL
      AND o.total_amount != ''
  `;

  // Add exclusion filters if requested
  if (options?.excludeFromMonthly) {
    query += `\n      AND (e.excluded_from_monthly IS NULL OR e.excluded_from_monthly = 0)`;
  }
  if (options?.excludeFromYearly) {
    query += `\n      AND (e.excluded_from_yearly IS NULL OR e.excluded_from_yearly = 0)`;
  }

  const orders = db
    .prepare(query)
    .all(
      userId,
      userId,
      startDate.toISOString(),
      endDate.toISOString(),
    ) as Array<{
    id: string;
    order_number: string;
    creation_date: string;
    total_amount: string;
  }>;

  logger.info(`[temporal-comparisons] Found ${orders.length} orders in range`, {
    orders,
  });

  // Calculate total by parsing Italian currency format
  let total = 0;
  const parsedAmounts: Array<{ order_number: string; parsed: number }> = [];

  for (const order of orders) {
    const parsed = parseItalianCurrency(order.total_amount);
    total += parsed;
    parsedAmounts.push({ order_number: order.order_number, parsed });
  }

  logger.info(`[temporal-comparisons] Base total: ${total.toFixed(2)}€`, {
    parsedAmounts,
  });

  // Apply overrides
  for (const order of orders) {
    const override = ORDER_AMOUNT_OVERRIDES[order.order_number];
    if (override) {
      const originalParsed = parseItalianCurrency(order.total_amount);
      const diff = override.correctAmount - originalParsed;
      total += diff;
      logger.info(
        `[temporal-comparisons] Applied override for ${order.order_number}: ${originalParsed.toFixed(2)}€ → ${override.correctAmount}€ (${diff > 0 ? "+" : ""}${diff.toFixed(2)}€) - ${override.reason}`,
      );
    }
  }

  return parseFloat(total.toFixed(2));
}

/**
 * Calculate current month revenue (from start of month to now)
 * @param excludeFromMonthly - If true, excludes orders marked as excluded_from_monthly
 */
export function calculateCurrentMonthRevenue(
  db: Database,
  userId: string,
  excludeFromMonthly?: boolean,
): number {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return calculateRevenueInRange(db, userId, monthStart, now, {
    excludeFromMonthly,
  });
}

/**
 * Calculate previous month revenue (full month)
 * @param excludeFromMonthly - If true (default), excludes orders marked as excluded_from_monthly
 */
export function calculatePreviousMonthRevenue(
  db: Database,
  userId: string,
  excludeFromMonthly = true,
): number {
  const { start, end } = getPreviousMonthRange();
  return calculateRevenueInRange(db, userId, start, end, {
    excludeFromMonthly,
  });
}

/**
 * Calculate same month last year revenue (up to same day)
 * @param excludeFromMonthly - If true (default), excludes orders marked as excluded_from_monthly
 */
export function calculateSameMonthLastYearRevenue(
  db: Database,
  userId: string,
  excludeFromMonthly = true,
): number {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const lastYear = now.getFullYear() - 1;

  const start = new Date(lastYear, currentMonth, 1);
  const end = new Date(lastYear, currentMonth, currentDay, 23, 59, 59);

  return calculateRevenueInRange(db, userId, start, end, {
    excludeFromMonthly,
  });
}

/**
 * Calculate current year revenue (from Jan 1 to now)
 * @param excludeFromYearly - If true, excludes orders marked as excluded_from_yearly
 */
export function calculateCurrentYearRevenue(
  db: Database,
  userId: string,
  excludeFromYearly?: boolean,
): number {
  const now = new Date();
  const yearStart = getCurrentYearStart();
  return calculateRevenueInRange(db, userId, yearStart, now, {
    excludeFromYearly,
  });
}

/**
 * Calculate previous year revenue (full year)
 */
export function calculatePreviousYearRevenue(
  db: Database,
  userId: string,
): number {
  const lastYear = new Date().getFullYear() - 1;
  const start = new Date(lastYear, 0, 1);
  const end = new Date(lastYear, 11, 31, 23, 59, 59);
  return calculateRevenueInRange(db, userId, start, end);
}

// ============================================================================
// ORDER COUNT CALCULATIONS
// ============================================================================

/**
 * Count orders in a date range
 */
export function countOrdersInRange(
  db: Database,
  userId: string,
  startDate: Date,
  endDate: Date,
  options?: {
    excludeFromMonthly?: boolean;
    excludeFromYearly?: boolean;
  },
): number {
  let query = `
    SELECT COUNT(*) as count
    FROM orders o
    LEFT JOIN widget_order_exclusions e ON o.id = e.order_id AND e.user_id = ?
    WHERE o.user_id = ?
      AND o.creation_date >= ?
      AND o.creation_date <= ?
  `;

  // Add exclusion filters if requested
  if (options?.excludeFromMonthly) {
    query += `\n      AND (e.excluded_from_monthly IS NULL OR e.excluded_from_monthly = 0)`;
  }
  if (options?.excludeFromYearly) {
    query += `\n      AND (e.excluded_from_yearly IS NULL OR e.excluded_from_yearly = 0)`;
  }

  const result = db
    .prepare(query)
    .get(userId, userId, startDate.toISOString(), endDate.toISOString()) as {
    count: number;
  };

  return result?.count || 0;
}

/**
 * Calculate average order value in a date range
 * Uses correct Italian currency parsing for accurate results
 */
export function calculateAverageOrderValue(
  db: Database,
  userId: string,
  startDate: Date,
  endDate: Date,
  options?: {
    excludeFromMonthly?: boolean;
    excludeFromYearly?: boolean;
  },
): number {
  const totalRevenue = calculateRevenueInRange(
    db,
    userId,
    startDate,
    endDate,
    options,
  );
  const orderCount = countOrdersInRange(
    db,
    userId,
    startDate,
    endDate,
    options,
  );

  if (orderCount === 0) {
    return 0;
  }

  return parseFloat((totalRevenue / orderCount).toFixed(2));
}

// ============================================================================
// SPARKLINE DATA GENERATION
// ============================================================================

/**
 * Generate monthly sparkline data for last N months
 */
export function generateMonthlySparkline(
  db: Database,
  userId: string,
  months: number = 12,
): SparklineData {
  const values: number[] = [];
  const labels: string[] = [];

  const monthNames = [
    "Gen",
    "Feb",
    "Mar",
    "Apr",
    "Mag",
    "Giu",
    "Lug",
    "Ago",
    "Set",
    "Ott",
    "Nov",
    "Dic",
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
      0,
      23,
      59,
      59,
    );

    const revenue = calculateRevenueInRange(db, userId, monthStart, monthEnd);
    values.push(revenue);
    labels.push(monthNames[monthDate.getMonth()]);
  }

  return {
    values,
    labels,
    period: "monthly",
  };
}

/**
 * Generate daily sparkline data for last N days
 */
export function generateDailySparkline(
  db: Database,
  userId: string,
  days: number = 7,
): SparklineData {
  const values: number[] = [];
  const labels: string[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = getDaysAgo(i);
    const dayStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0,
      0,
      0,
    );
    const dayEnd = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
    );

    const count = countOrdersInRange(db, userId, dayStart, dayEnd);
    values.push(count);

    // Format label as "Lun 3" or similar
    const dayNames = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
    const dayName = dayNames[date.getDay()];
    labels.push(`${dayName} ${date.getDate()}`);
  }

  return {
    values,
    labels,
    period: "daily",
  };
}

// ============================================================================
// COMPARISON BUILDERS
// ============================================================================

/**
 * Build temporal comparison object
 */
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

/**
 * Build comparison with previous month
 */
export function buildPreviousMonthComparison(
  db: Database,
  userId: string,
  currentValue: number,
): TemporalComparison {
  const previousValue = calculatePreviousMonthRevenue(db, userId);
  return buildComparison(currentValue, previousValue, "vs Stesso Periodo Mese Scorso");
}

/**
 * Build comparison with same month last year
 */
export function buildSameMonthLastYearComparison(
  db: Database,
  userId: string,
  currentValue: number,
): TemporalComparison {
  const previousValue = calculateSameMonthLastYearRevenue(db, userId);
  const now = new Date();
  const monthNames = [
    "Gen",
    "Feb",
    "Mar",
    "Apr",
    "Mag",
    "Giu",
    "Lug",
    "Ago",
    "Set",
    "Ott",
    "Nov",
    "Dic",
  ];
  const monthName = monthNames[now.getMonth()];
  const lastYear = now.getFullYear() - 1;

  return buildComparison(
    currentValue,
    previousValue,
    `vs ${monthName} ${lastYear}`,
  );
}

/**
 * Build comparison with yearly target
 */
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
