/**
 * Dashboard Widget Type Definitions
 * Based on PRD specifications for Archibald Dashboard Rework
 */

// ============================================================================
// TEMPORAL COMPARISONS (for all widgets)
// ============================================================================

/**
 * Temporal comparison with previous period
 * Format: "€14,325 (+€1,719, +12%)"
 */
export interface TemporalComparison {
  previousValue: number;
  currentValue: number;
  absoluteDelta: number; // currentValue - previousValue
  percentageDelta: number; // (absoluteDelta / previousValue) * 100
  label: string; // es. "vs Mese Scorso", "vs Gen 2025"
}

/**
 * Sparkline mini-chart data
 * Array of values for last N periods (months, weeks, days)
 */
export interface SparklineData {
  values: number[]; // es. [12, 15, 18, 22, 25, 28] for last 6 months
  labels?: string[]; // es. ["Ago", "Set", "Ott", "Nov", "Dic", "Gen"]
  period: "daily" | "weekly" | "monthly" | "yearly";
}

// ============================================================================
// HERO STATUS WIDGET
// ============================================================================

export type WidgetStatus =
  | "champion" // ≥ 120% - Superamento straordinario
  | "excellent" // ≥ 100% - Obiettivo raggiunto
  | "on-track" // ≥ 80% - Sulla buona strada
  | "attention" // ≥ 50% - Serve attenzione
  | "critical"; // < 50% - Situazione critica

export interface HeroStatusData {
  status: WidgetStatus;
  currentMonthRevenue: number;
  monthlyTarget: number;
  missingToMonthlyTarget: number;
  progressMonthly: number; // 0-1 decimal (es. 0.64 = 64%)
  progressNextBonus: number; // 0-1 decimal (es. 0.21 = 21%)
  microCopy: string;
  // Temporal comparisons
  comparisonPreviousMonth?: TemporalComparison;
  comparisonSameMonthLastYear?: TemporalComparison;
  comparisonYearlyProgress?: TemporalComparison; // Current year revenue vs yearly target
  sparkline?: SparklineData; // Monthly trend for last 6-12 months
}

// ============================================================================
// KPI CARDS WIDGET
// ============================================================================

export interface KpiCardData {
  label: string;
  value: string; // Formatted value (es. "16.044 €")
  tooltip?: string;
  icon?: string;
  // Temporal comparisons
  comparisonPreviousMonth?: TemporalComparison;
  comparisonSameMonthLastYear?: TemporalComparison;
  sparkline?: SparklineData;
}

// ============================================================================
// BONUS ROADMAP WIDGET
// ============================================================================

export type BonusStepStatus = "completed" | "active" | "locked";

export interface BonusRoadmapStep {
  threshold: number; // es. 75000
  bonusAmount: number; // es. 5000
  status: BonusStepStatus;
  label: string; // es. "75k"
  bonusLabel: string; // es. "+5k"
}

export interface BonusRoadmapData {
  steps: BonusRoadmapStep[];
  currentYearRevenue: number;
  missingToNextBonus: number;
  nextBonusAmount: number;
  // Temporal comparisons
  comparisonLastYear?: TemporalComparison;
  sparkline?: SparklineData;
}

// ============================================================================
// FORECAST WIDGET
// ============================================================================

export interface ForecastData {
  projectedMonthRevenue: number;
  projectedYearRevenue: number;
  projectedCommissions: number;
  estimatedBonuses: number;
  averageDailyRevenue: number;
  workingDaysRemaining: number;
  // Additional data for improved UI
  currentMonthRevenue: number;
  monthlyTarget: number;
  requiredDailyRevenue: number; // Daily average needed to reach target
  // Temporal comparisons
  comparisonPreviousMonth?: TemporalComparison;
  comparisonSameMonthLastYear?: TemporalComparison;
}

// ============================================================================
// ACTION SUGGESTION WIDGET
// ============================================================================

export interface ActionSuggestion {
  // Primary suggestion
  primaryGoal: "monthly_target" | "next_bonus" | "extra_budget";
  primaryMessage: string;
  primaryMetrics: {
    missing: number;
    ordersNeeded: number;
    averageOrderValue: number;
  };
  // Secondary suggestion (if applicable)
  secondaryGoal?: "monthly_target" | "next_bonus" | "extra_budget";
  secondaryMessage?: string;
  secondaryMetrics?: {
    missing: number;
    ordersNeeded: number;
    roi?: number; // Return on investment percentage
  };
  // Strategic suggestions
  strategySuggestions: string[]; // es. ["Focus on orders €2,000+", "3 hot clients to follow up"]
  // Temporal comparison
  comparisonLastMonth?: {
    situation: string; // es. "Same situation last month"
    outcome: string; // es. "You closed +2 orders and reached target"
  };
}

// ============================================================================
// BALANCE WIDGET (Anticipi vs Maturato)
// ============================================================================

export interface BalanceData {
  totalCommissionsMatured: number;
  totalAdvancePaid: number;
  balance: number; // maturato - anticipi
  balanceStatus: "positive" | "negative"; // >= 0 = positive, < 0 = negative
  // Temporal comparisons
  comparisonPreviousMonth?: TemporalComparison;
  comparisonSameMonthLastYear?: TemporalComparison;
  sparkline?: SparklineData;
}

// ============================================================================
// EXTRA-BUDGET WIDGET
// ============================================================================

export interface ExtraBudgetData {
  visible: boolean;
  extraRevenue: number;
  extraBonuses: number;
  extraBonusesAmount: number; // Total amount of extra bonuses
  nextStep: number;
  missingToNextStep: number;
  // Temporal comparisons
  comparisonLastYear?: TemporalComparison;
  sparkline?: SparklineData;
}

// ============================================================================
// ALERTS WIDGET
// ============================================================================

export type AlertSeverity = "warning" | "critical";

export interface AlertData {
  visible: boolean;
  message: string;
  severity: AlertSeverity;
  percentageGap?: number; // Gap percentage if applicable
  // Detailed alert data
  projectedMonthRevenue?: number;
  monthlyTarget?: number;
  gap?: number;
  requiredDailyRevenue?: number;
  currentDailyRevenue?: number;
  daysRemaining?: number;
  // Recovery suggestions
  recoverySuggestions?: string[]; // es. ["3 large orders (€1,800+) in next 7 days"]
  // Motivational comparison
  comparisonLastMonth?: {
    situation: string; // es. "You were at €14,200"
    outcome: string; // es. "Recovered and closed at €24,500"
    message: string; // es. "You still have margin to recover!"
  };
}

// ============================================================================
// PRIVACY SETTINGS
// ============================================================================

export interface PrivacySettings {
  enabled: boolean;
}

// ============================================================================
// CONSOLIDATED DASHBOARD DATA
// ============================================================================

/**
 * Complete dashboard data returned by /api/widget/dashboard-data
 */
export interface DashboardData {
  heroStatus: HeroStatusData;
  kpiCards: KpiCardData[];
  bonusRoadmap: BonusRoadmapData;
  forecast: ForecastData;
  actionSuggestion: ActionSuggestion;
  balance: BalanceData;
  extraBudget: ExtraBudgetData;
  alerts: AlertData;
}

// ============================================================================
// USER TARGET CONFIGURATION (from wizard)
// ============================================================================

export interface UserTargetConfig {
  yearlyTarget: number;
  monthlyTarget: number;
  currency: string;
  commissionRate: number; // 0-1 decimal (es. 0.18 = 18%)
  bonusAmount: number;
  bonusInterval: number; // progressiveBonusStep
  extraBudgetInterval: number;
  extraBudgetReward: number;
  monthlyAdvance: number;
  hideCommissions: boolean;
  targetUpdatedAt: string | null;
}

// ============================================================================
// WORKING DAYS CALCULATION
// ============================================================================

export interface WorkingDaysInfo {
  totalDaysInMonth: number;
  workingDaysInMonth: number; // lun-ven
  workingDaysPassed: number;
  workingDaysRemaining: number;
}

// ============================================================================
// ORDERS METRICS (for OrdersSummaryWidget)
// ============================================================================

export interface OrdersMetrics {
  todayCount: number;
  weekCount: number;
  monthCount: number;
  timestamp: string;
  // Temporal comparisons
  comparisonYesterday?: TemporalComparison;
  comparisonLastWeek?: TemporalComparison;
  comparisonLastMonth?: TemporalComparison;
  comparisonSameMonthLastYear?: TemporalComparison;
  // Sparklines
  sparklineDaily?: SparklineData; // Last 7 days
  sparklineWeekly?: SparklineData; // Last 8 weeks
  sparklineMonthly?: SparklineData; // Last 12 months
}
