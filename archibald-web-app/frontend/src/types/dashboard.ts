/**
 * Dashboard Widget Type Definitions
 * Based on PRD specifications for Archibald Dashboard Rework
 */

// ============================================================================
// HERO STATUS WIDGET
// ============================================================================

export type WidgetStatus = "positive" | "warning" | "critical";

export interface HeroStatusData {
  status: WidgetStatus;
  currentMonthRevenue: number;
  monthlyTarget: number;
  missingToMonthlyTarget: number;
  progressMonthly: number; // 0-1 decimal (es. 0.64 = 64%)
  progressNextBonus: number; // 0-1 decimal (es. 0.21 = 21%)
  microCopy: string;
}

// ============================================================================
// KPI CARDS WIDGET
// ============================================================================

export interface KpiCardData {
  label: string;
  value: string; // Formatted value (es. "16.044 €")
  tooltip?: string;
  icon?: string;
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
}

// ============================================================================
// ACTION SUGGESTION WIDGET
// ============================================================================

export interface ActionSuggestion {
  message: string;
  ordersNeeded?: number;
  averageOrderValue?: number;
  missingToNextBonus?: number;
}

// ============================================================================
// BALANCE WIDGET (Anticipi vs Maturato)
// ============================================================================

export interface BalanceData {
  totalCommissionsMatured: number;
  totalAdvancePaid: number;
  balance: number; // maturato - anticipi
  balanceStatus: "positive" | "negative"; // >= 0 = positive, < 0 = negative
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
