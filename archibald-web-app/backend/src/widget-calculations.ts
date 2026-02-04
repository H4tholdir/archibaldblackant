/**
 * Widget Dashboard Calculations
 * All formulas and logic for dashboard widgets according to PRD
 */

import type { Database } from "better-sqlite3";
import { logger } from "./logger";
import {
  buildPreviousMonthComparison,
  buildSameMonthLastYearComparison,
  buildYearlyProgressComparison,
  generateMonthlySparkline,
  calculatePreviousMonthRevenue,
  calculateSameMonthLastYearRevenue,
  buildComparison,
  type TemporalComparison,
  type SparklineData,
} from "./temporal-comparisons";

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

export type WidgetStatus =
  | "champion" // ≥ 120% - Superamento straordinario
  | "excellent" // ≥ 100% - Obiettivo raggiunto
  | "on-track" // ≥ 80% - Sulla buona strada
  | "attention" // ≥ 50% - Serve attenzione
  | "critical"; // < 50% - Situazione critica

const MICRO_COPY = {
  champion: [
    "Obiettivo superato! 🏆",
    "Risultato straordinario! 🚀",
    "Performance eccezionale! ⭐",
    "Oltre ogni aspettativa! 🎯",
  ],
  excellent: [
    "Obiettivo raggiunto! 🎉",
    "Target centrato! 🎯",
    "Missione compiuta! ✅",
    "Obiettivo conquistato! 🏅",
  ],
  "on-track": [
    "Sulla buona strada 🚀",
    "Obiettivo sotto controllo",
    "Ritmo giusto, continua così",
    "Percorso allineato 📈",
  ],
  attention: [
    "Serve una accelerazione",
    "È il momento di spingere forte",
    "Recupero necessario, si può fare",
    "Focus sull'obiettivo! 💪",
  ],
  critical: [
    "Situazione critica - azione immediata",
    "Alert: serve cambio di strategia",
    "Urgente: recupero necessario",
    "Piano di recupero richiesto ⚡",
  ],
};

export function calculateHeroStatus(
  currentMonthRevenue: number,
  monthlyTarget: number,
  currentYearRevenue: number,
  bonusInterval: number,
  yearlyTarget: number,
  db: Database,
  userId: string,
) {
  // Calculate progress percentage
  const progress = currentMonthRevenue / monthlyTarget;

  // Determine status based on 5-level thresholds
  let status: WidgetStatus;
  if (progress >= 1.2) {
    status = "champion";
  } else if (progress >= 1.0) {
    status = "excellent";
  } else if (progress >= 0.8) {
    status = "on-track";
  } else if (progress >= 0.5) {
    status = "attention";
  } else {
    status = "critical";
  }

  // Select micro-copy with deterministic daily rotation
  const dayOfMonth = new Date().getDate();
  const microCopyArray = MICRO_COPY[status];
  const microCopyIndex = dayOfMonth % microCopyArray.length;
  const microCopy = microCopyArray[microCopyIndex];

  const missingToMonthlyTarget = Math.max(
    0,
    monthlyTarget - currentMonthRevenue,
  );
  const progressMonthly = Math.min(1, currentMonthRevenue / monthlyTarget);

  // Progress to next bonus
  const progressInCurrentInterval = currentYearRevenue % bonusInterval;
  const progressNextBonus = progressInCurrentInterval / bonusInterval;

  // Calculate temporal comparisons
  const comparisonPreviousMonth = buildPreviousMonthComparison(
    db,
    userId,
    currentMonthRevenue,
  );
  const comparisonSameMonthLastYear = buildSameMonthLastYearComparison(
    db,
    userId,
    currentMonthRevenue,
  );
  const comparisonYearlyProgress = buildYearlyProgressComparison(
    currentYearRevenue,
    yearlyTarget,
  );

  // Generate sparkline for monthly trend
  const sparkline = generateMonthlySparkline(db, userId, 12);

  return {
    status,
    currentMonthRevenue,
    monthlyTarget,
    missingToMonthlyTarget,
    progressMonthly,
    progressNextBonus,
    microCopy,
    comparisonPreviousMonth,
    comparisonSameMonthLastYear,
    comparisonYearlyProgress,
    sparkline,
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
  monthlyTarget: number,
  db: Database,
  userId: string,
) {
  // PRD Formula
  const projectedMonthRevenue =
    currentMonthRevenue + averageDailyRevenue * workingDaysRemaining;

  const projectedYearRevenue = currentYearRevenue + projectedMonthRevenue;

  const projectedCommissions = projectedYearRevenue * commissionRate;

  // Estimate bonuses
  const projectedBonusSteps = Math.floor(projectedYearRevenue / bonusInterval);
  const estimatedBonuses = projectedBonusSteps * bonusAmount;

  // Calculate required daily revenue to reach target
  const missingToTarget = Math.max(0, monthlyTarget - currentMonthRevenue);
  const requiredDailyRevenue =
    workingDaysRemaining > 0 ? missingToTarget / workingDaysRemaining : 0;

  // Calculate temporal comparisons
  const previousMonthRevenue = calculatePreviousMonthRevenue(db, userId);
  const sameMonthLastYearRevenue = calculateSameMonthLastYearRevenue(
    db,
    userId,
  );

  const comparisonPreviousMonth = buildComparison(
    projectedMonthRevenue,
    previousMonthRevenue,
    "vs Mese Scorso",
  );
  const comparisonSameMonthLastYear = buildComparison(
    projectedMonthRevenue,
    sameMonthLastYearRevenue,
    "vs Stesso Mese Anno Scorso",
  );

  return {
    projectedMonthRevenue,
    projectedYearRevenue,
    projectedCommissions,
    estimatedBonuses,
    averageDailyRevenue,
    workingDaysRemaining,
    currentMonthRevenue,
    monthlyTarget,
    requiredDailyRevenue,
    comparisonPreviousMonth,
    comparisonSameMonthLastYear,
  };
}

// ============================================================================
// ACTION SUGGESTION
// ============================================================================

export function calculateActionSuggestion(
  currentMonthRevenue: number,
  monthlyTarget: number,
  missingToNextBonus: number,
  bonusAmount: number,
  averageOrderValue: number,
  yearlyTarget: number,
  currentYearRevenue: number,
) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const missingToMonthlyTarget = Math.max(
    0,
    monthlyTarget - currentMonthRevenue,
  );
  const ordersNeededForTarget = Math.ceil(
    missingToMonthlyTarget / averageOrderValue,
  );
  const ordersNeededForBonus = Math.ceil(
    missingToNextBonus / averageOrderValue,
  );

  // Determine primary goal based on proximity
  let primaryGoal: "monthly_target" | "next_bonus" | "extra_budget";
  let primaryMessage: string;
  let primaryMetrics: any;

  // Check if close to monthly target
  const progressToTarget = (currentMonthRevenue / monthlyTarget) * 100;

  if (progressToTarget < 90) {
    // Priority: reach monthly target
    primaryGoal = "monthly_target";
    primaryMessage = `Mancano ${formatCurrency(missingToMonthlyTarget)} al target di ${formatCurrency(monthlyTarget)}`;
    primaryMetrics = {
      missing: missingToMonthlyTarget,
      ordersNeeded: ordersNeededForTarget,
      averageOrderValue,
    };
  } else if (missingToNextBonus <= averageOrderValue * 2) {
    // Priority: next bonus is very close!
    primaryGoal = "next_bonus";
    primaryMessage = `Mancano solo ${formatCurrency(missingToNextBonus)} per sbloccare +${formatCurrency(bonusAmount)}`;
    primaryMetrics = {
      missing: missingToNextBonus,
      ordersNeeded: ordersNeededForBonus,
      averageOrderValue,
    };
  } else {
    // Default: focus on monthly target
    primaryGoal = "monthly_target";
    primaryMessage = `Focus sul target mensile: ancora ${formatCurrency(missingToMonthlyTarget)}`;
    primaryMetrics = {
      missing: missingToMonthlyTarget,
      ordersNeeded: ordersNeededForTarget,
      averageOrderValue,
    };
  }

  // Secondary goal
  let secondaryGoal:
    | "monthly_target"
    | "next_bonus"
    | "extra_budget"
    | undefined;
  let secondaryMessage: string | undefined;
  let secondaryMetrics: any | undefined;

  if (primaryGoal === "monthly_target" && missingToNextBonus > 0) {
    secondaryGoal = "next_bonus";
    secondaryMessage = `Dopo il target, ${formatCurrency(missingToNextBonus)} per il bonus`;
    const roi = (bonusAmount / missingToNextBonus) * 100;
    secondaryMetrics = {
      missing: missingToNextBonus,
      ordersNeeded: ordersNeededForBonus,
      roi: Math.round(roi),
    };
  } else if (primaryGoal === "next_bonus" && missingToMonthlyTarget > 0) {
    secondaryGoal = "monthly_target";
    secondaryMessage = `E ${formatCurrency(missingToMonthlyTarget)} per il target mensile`;
    secondaryMetrics = {
      missing: missingToMonthlyTarget,
      ordersNeeded: ordersNeededForTarget,
    };
  }

  // Strategic suggestions
  const strategySuggestions: string[] = [];

  if (averageOrderValue > 2000) {
    strategySuggestions.push(
      `Concentrati su ordini ${formatCurrency(2000)}+ per massimizzare ROI`,
    );
  }

  if (ordersNeededForTarget <= 5) {
    strategySuggestions.push(
      `Solo ${ordersNeededForTarget} ordini per raggiungere l'obiettivo`,
    );
  }

  if (missingToNextBonus <= averageOrderValue) {
    strategySuggestions.push(`🔥 Un ordine medio ti porta al bonus!`);
  }

  return {
    primaryGoal,
    primaryMessage,
    primaryMetrics,
    secondaryGoal,
    secondaryMessage,
    secondaryMetrics,
    strategySuggestions,
    // TODO: Add comparison with last month when available
    comparisonLastMonth: undefined,
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
  currentMonthRevenue: number,
  averageDailyRevenue: number,
  workingDaysRemaining: number,
  averageOrderValue: number,
) {
  const visible = projectedMonthRevenue < monthlyTarget * 0.9;

  if (!visible) {
    return {
      visible: false,
      message: "",
      severity: "warning" as const,
    };
  }

  const gap = monthlyTarget - projectedMonthRevenue;
  const percentageGap = (gap / monthlyTarget) * 100;

  const message = `⚠️ Con questo ritmo chiuderai sotto il target mensile del ${Math.round(percentageGap)}%`;

  const severity: "warning" | "critical" =
    projectedMonthRevenue < monthlyTarget * 0.7 ? "critical" : "warning";

  // Calculate required metrics
  const requiredDailyRevenue =
    workingDaysRemaining > 0
      ? (monthlyTarget - currentMonthRevenue) / workingDaysRemaining
      : 0;

  const ordersNeeded = Math.ceil(gap / averageOrderValue);

  // Recovery suggestions
  const recoverySuggestions: string[] = [];
  recoverySuggestions.push(
    `Media giornaliera di ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(requiredDailyRevenue)}/gg (ora: ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(averageDailyRevenue)}/gg)`,
  );

  if (ordersNeeded <= 5) {
    recoverySuggestions.push(
      `${ordersNeeded} ordini grandi nei prossimi giorni`,
    );
  } else {
    recoverySuggestions.push(
      `${ordersNeeded} ordini da ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(averageOrderValue)}`,
    );
  }

  recoverySuggestions.push(`Focus su chiusura offerte pendenti`);

  return {
    visible: true,
    message,
    severity,
    percentageGap,
    projectedMonthRevenue,
    monthlyTarget,
    gap,
    requiredDailyRevenue,
    currentDailyRevenue: averageDailyRevenue,
    daysRemaining: workingDaysRemaining,
    recoverySuggestions,
    // TODO: Add comparison with last month
    comparisonLastMonth: undefined,
  };
}
