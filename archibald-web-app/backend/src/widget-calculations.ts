/**
 * Widget Dashboard Calculations
 * All formulas and logic for dashboard widgets according to PRD
 */

import { logger } from "./logger";

export interface UserConfig {
  yearlyTarget: number;
  monthlyTarget: number;
  commissionRate: number;
  bonusAmount: number;
  bonusInterval: number; // progressiveBonusStep
  extraBudgetInterval: number;
  extraBudgetReward: number;
  monthlyAdvance: number;
}

export interface OrderData {
  currentMonthRevenue: number;
  currentYearRevenue: number;
  averageOrderValue: number; // last 3 months
}

// ============================================================================
// WORKING DAYS CALCULATION (Italian calendar: Mon-Fri)
// ============================================================================

/**
 * Calculate working days remaining in current month
 * Italian calendar: Monday to Friday only
 */
export function calculateWorkingDaysRemaining(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  // Get last day of current month
  const lastDay = new Date(year, month + 1, 0).getDate();

  let workingDays = 0;

  for (let day = today + 1; day <= lastDay; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
  }

  return workingDays;
}

// ============================================================================
// HERO STATUS WIDGET
// ============================================================================

export type WidgetStatus = "positive" | "warning" | "critical";

const MICRO_COPY = {
  positive: [
    "Sulla buona strada 🚀",
    "Obiettivo sotto controllo",
    "Ritmo giusto, continua così",
  ],
  warning: [
    "Sei vicino al target, spingi ora",
    "Manca poco, questo è il momento",
    "Target a portata di mano",
  ],
  critical: [
    "Serve una accelerazione",
    "È il momento di spingere forte",
    "Recupero necessario, si può fare",
  ],
};

export function calculateHeroStatus(
  currentMonthRevenue: number,
  monthlyTarget: number,
  currentYearRevenue: number,
  bonusInterval: number,
) {
  // Determine status according to PRD rules
  let status: WidgetStatus;
  if (currentMonthRevenue >= monthlyTarget) {
    status = "positive";
  } else if (currentMonthRevenue >= monthlyTarget * 0.8) {
    status = "warning";
  } else {
    status = "critical";
  }

  // Select micro-copy (using first one for consistency)
  const microCopy = MICRO_COPY[status][0];

  const missingToMonthlyTarget = Math.max(
    0,
    monthlyTarget - currentMonthRevenue,
  );
  const progressMonthly = Math.min(1, currentMonthRevenue / monthlyTarget);

  // Progress to next bonus
  const progressInCurrentInterval = currentYearRevenue % bonusInterval;
  const progressNextBonus = progressInCurrentInterval / bonusInterval;

  return {
    status,
    currentMonthRevenue,
    monthlyTarget,
    missingToMonthlyTarget,
    progressMonthly,
    progressNextBonus,
    microCopy,
  };
}

// ============================================================================
// KPI CARDS
// ============================================================================

export function calculateKpiCards(
  currentMonthRevenue: number,
  monthlyTarget: number,
  commissionRate: number,
  currentYearRevenue: number,
  bonusInterval: number,
  bonusAmount: number,
) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const currentCommissions = currentYearRevenue * commissionRate;

  return [
    {
      label: "Budget Attuale",
      value: formatCurrency(currentMonthRevenue),
      tooltip: "Fatturato del mese corrente",
    },
    {
      label: "Target Mensile",
      value: formatCurrency(monthlyTarget),
      tooltip: "Obiettivo mensile da raggiungere",
    },
    {
      label: "Provvigioni Maturate",
      value: formatCurrency(currentCommissions),
      tooltip: `${(commissionRate * 100).toFixed(1)}% sul fatturato annuale`,
    },
    {
      label: "Prossimo Bonus",
      value: formatCurrency(bonusAmount),
      tooltip: `Bonus ogni ${formatCurrency(bonusInterval)} di fatturato`,
    },
  ];
}

// ============================================================================
// BONUS ROADMAP
// ============================================================================

export function calculateBonusRoadmap(
  currentYearRevenue: number,
  bonusInterval: number,
  bonusAmount: number,
) {
  const completedSteps = Math.floor(currentYearRevenue / bonusInterval);

  // Generate 4 steps
  const steps = [];
  for (let i = 0; i < 4; i++) {
    const stepNumber = completedSteps + i;
    const threshold = bonusInterval * (stepNumber + 1);

    let status: "completed" | "active" | "locked";
    if (stepNumber < completedSteps) {
      status = "completed";
    } else if (stepNumber === completedSteps) {
      status = "active";
    } else {
      status = "locked";
    }

    steps.push({
      threshold,
      bonusAmount,
      status,
      label: `${(threshold / 1000).toFixed(0)}k`,
      bonusLabel: `+${(bonusAmount / 1000).toFixed(0)}k`,
    });
  }

  const nextBonusThreshold = bonusInterval * (completedSteps + 1);
  const missingToNextBonus = nextBonusThreshold - currentYearRevenue;

  return {
    steps,
    currentYearRevenue,
    missingToNextBonus,
    nextBonusAmount: bonusAmount,
  };
}

// ============================================================================
// FORECAST
// ============================================================================

export function calculateForecast(
  currentMonthRevenue: number,
  currentYearRevenue: number,
  averageDailyRevenue: number,
  workingDaysRemaining: number,
  commissionRate: number,
  bonusInterval: number,
  bonusAmount: number,
) {
  // PRD Formula
  const projectedMonthRevenue =
    currentMonthRevenue + averageDailyRevenue * workingDaysRemaining;

  const projectedYearRevenue = currentYearRevenue + projectedMonthRevenue;

  const projectedCommissions = projectedYearRevenue * commissionRate;

  // Estimate bonuses
  const projectedBonusSteps = Math.floor(projectedYearRevenue / bonusInterval);
  const estimatedBonuses = projectedBonusSteps * bonusAmount;

  return {
    projectedMonthRevenue,
    projectedYearRevenue,
    projectedCommissions,
    estimatedBonuses,
    averageDailyRevenue,
    workingDaysRemaining,
  };
}

// ============================================================================
// ACTION SUGGESTION
// ============================================================================

export function calculateActionSuggestion(
  missingToNextBonus: number,
  averageOrderValue: number,
) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  let message: string;

  if (missingToNextBonus <= averageOrderValue) {
    message = `Un ordine medio ti porta al bonus da ${formatCurrency(5000)}`;
  } else {
    const ordersNeeded = Math.ceil(missingToNextBonus / averageOrderValue);
    message = `Chiudendo ${ordersNeeded} ordini medi da ${formatCurrency(averageOrderValue)} sblocchi il prossimo bonus`;
  }

  return {
    message,
    ordersNeeded: Math.ceil(missingToNextBonus / averageOrderValue),
    averageOrderValue,
    missingToNextBonus,
  };
}

// ============================================================================
// BALANCE (Anticipi vs Maturato)
// ============================================================================

export function calculateBalance(
  commissionRate: number,
  currentYearRevenue: number,
  monthlyAdvance: number,
) {
  const totalCommissionsMatured = currentYearRevenue * commissionRate;

  // Calculate total advance paid (current month number * monthlyAdvance)
  const currentMonth = new Date().getMonth() + 1; // 1-12
  const totalAdvancePaid = monthlyAdvance * currentMonth;

  const balance = totalCommissionsMatured - totalAdvancePaid;
  const balanceStatus: "positive" | "negative" =
    balance >= 0 ? "positive" : "negative";

  return {
    totalCommissionsMatured,
    totalAdvancePaid,
    balance,
    balanceStatus,
  };
}

// ============================================================================
// EXTRA-BUDGET
// ============================================================================

export function calculateExtraBudget(
  currentYearRevenue: number,
  yearlyTarget: number,
  extraBudgetInterval: number,
  extraBudgetReward: number,
) {
  const visible = currentYearRevenue > yearlyTarget;

  if (!visible) {
    return {
      visible: false,
      extraRevenue: 0,
      extraBonuses: 0,
      extraBonusesAmount: 0,
      nextStep: 0,
      missingToNextStep: 0,
    };
  }

  const extraRevenue = currentYearRevenue - yearlyTarget;
  const extraBonuses = Math.floor(extraRevenue / extraBudgetInterval);
  const extraBonusesAmount = extraBonuses * extraBudgetReward;

  const nextStepThreshold =
    yearlyTarget + extraBudgetInterval * (extraBonuses + 1);
  const missingToNextStep = nextStepThreshold - currentYearRevenue;

  return {
    visible: true,
    extraRevenue,
    extraBonuses,
    extraBonusesAmount,
    nextStep: extraBudgetInterval,
    missingToNextStep,
  };
}

// ============================================================================
// ALERTS
// ============================================================================

export function calculateAlerts(
  projectedMonthRevenue: number,
  monthlyTarget: number,
) {
  const visible = projectedMonthRevenue < monthlyTarget * 0.9;

  if (!visible) {
    return {
      visible: false,
      message: "",
      severity: "warning" as const,
    };
  }

  const percentageGap =
    ((monthlyTarget - projectedMonthRevenue) / monthlyTarget) * 100;

  const message = `⚠️ Con questo ritmo chiuderai sotto il target mensile del ${Math.round(percentageGap)}%`;

  const severity: "warning" | "critical" =
    projectedMonthRevenue < monthlyTarget * 0.7 ? "critical" : "warning";

  return {
    visible: true,
    message,
    severity,
    percentageGap,
  };
}
