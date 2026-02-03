/**
 * Temporal Comparisons Helper Functions
 * Calculate historical periods and comparisons for dashboard widgets
 */

import type { Database } from "better-sqlite3";

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
 * Calculate total revenue from orders in a date range
 * Uses 'total_amount' field (matches existing widget logic)
 * TODO: Switch to imponibile (taxable amount without VAT) when column is added
 */
export function calculateRevenueInRange(
  db: Database,
  userId: string,
  startDate: Date,
  endDate: Date,
): number {
  const query = `
    SELECT COALESCE(SUM(CAST(total_amount AS REAL)), 0) as total
    FROM orders
    WHERE user_id = ?
      AND creation_date >= ?
      AND creation_date <= ?
      AND total_amount IS NOT NULL
      AND total_amount != ''
  `;

  const result = db
    .prepare(query)
    .get(userId, startDate.toISOString(), endDate.toISOString()) as {
    total: number;
  };

  return result?.total || 0;
}

/**
 * Calculate current month revenue (from start of month to now)
 */
export function calculateCurrentMonthRevenue(
  db: Database,
  userId: string,
): number {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return calculateRevenueInRange(db, userId, monthStart, now);
}

/**
 * Calculate previous month revenue (full month)
 */
export function calculatePreviousMonthRevenue(
  db: Database,
  userId: string,
): number {
  const { start, end } = getPreviousMonthRange();
  return calculateRevenueInRange(db, userId, start, end);
}

/**
 * Calculate same month last year revenue (up to same day)
 */
export function calculateSameMonthLastYearRevenue(
  db: Database,
  userId: string,
): number {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const lastYear = now.getFullYear() - 1;

  const start = new Date(lastYear, currentMonth, 1);
  const end = new Date(lastYear, currentMonth, currentDay, 23, 59, 59);

  return calculateRevenueInRange(db, userId, start, end);
}

/**
 * Calculate current year revenue (from Jan 1 to now)
 */
export function calculateCurrentYearRevenue(
  db: Database,
  userId: string,
): number {
  const now = new Date();
  const yearStart = getCurrentYearStart();
  return calculateRevenueInRange(db, userId, yearStart, now);
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
): number {
  const query = `
    SELECT COUNT(*) as count
    FROM orders
    WHERE user_id = ?
      AND creation_date >= ?
      AND creation_date <= ?
  `;

  const result = db
    .prepare(query)
    .get(userId, startDate.toISOString(), endDate.toISOString()) as {
    count: number;
  };

  return result?.count || 0;
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
  return buildComparison(currentValue, previousValue, "vs Mese Scorso");
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
