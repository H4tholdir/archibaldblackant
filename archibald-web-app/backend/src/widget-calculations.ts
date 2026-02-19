import type { DbPool } from "./db/pool";
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
  bonusInterval: number;
  extraBudgetInterval: number;
  extraBudgetReward: number;
  monthlyAdvance: number;
}

export interface OrderData {
  currentMonthRevenue: number;
  currentYearRevenue: number;
  averageOrderValue: number;
}

// ============================================================================
// WORKING DAYS CALCULATION (Italian calendar: Mon-Fri)
// ============================================================================

export function calculateWorkingDaysRemaining(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const lastDay = new Date(year, month + 1, 0).getDate();

  let workingDays = 0;

  for (let day = today + 1; day <= lastDay; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
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
  | "legendary"
  | "champion"
  | "excellent"
  | "on-track"
  | "attention"
  | "critical"
  | "emergency";

interface MicroCopyContext {
  dayOfMonth: number;
  absolutePercent: number;
  projectedPercent: number;
  daysRemaining: number;
}

type MicroCopyTemplate = (ctx: MicroCopyContext) => string;

const MICRO_COPY: Record<WidgetStatus, MicroCopyTemplate[]> = {
  legendary: [
    (ctx) =>
      `Giorno ${ctx.dayOfMonth} e già al ${ctx.absolutePercent}%: proiezione ${ctx.projectedPercent}%! Sei una macchina, che mese incredibile! 🏆`,
    (ctx) =>
      `Solo giorno ${ctx.dayOfMonth} e punti al ${ctx.projectedPercent}% del target! Stai facendo la storia questo mese! 🚀`,
    (ctx) =>
      `${ctx.absolutePercent}% in ${ctx.dayOfMonth} giorni, ritmo da ${ctx.projectedPercent}%! Nessuno ti ferma, continua a volare! ⭐`,
    (ctx) =>
      `A questo passo chiudi al ${ctx.projectedPercent}% del target! Risultato straordinario, sei un campione! 💎`,
    (ctx) =>
      `Mancano ${ctx.daysRemaining} giorni e la proiezione è ${ctx.projectedPercent}%! Numeri pazzeschi, complimenti! 🔥`,
    (ctx) =>
      `${ctx.absolutePercent}% al giorno ${ctx.dayOfMonth}: mese leggendario in arrivo! Sei su un altro livello! 👑`,
  ],
  champion: [
    (ctx) =>
      `Giorno ${ctx.dayOfMonth}, ${ctx.absolutePercent}%: proiezione ${ctx.projectedPercent}%! Grandissimo ritmo, stai spaccando! 🏅`,
    (ctx) =>
      `Al ${ctx.absolutePercent}% con ${ctx.daysRemaining} giorni ancora — chiuderai alla grande, che lavoro! 💪`,
    (ctx) =>
      `Proiezione al ${ctx.projectedPercent}%: nettamente sopra target! Il tuo impegno sta dando frutti enormi! 🎯`,
    (ctx) =>
      `Ritmo da ${ctx.projectedPercent}% al giorno ${ctx.dayOfMonth}! Stai dominando questo mese, bravo! 🚀`,
    (ctx) =>
      `${ctx.absolutePercent}% in ${ctx.dayOfMonth} giorni, passo da campione! Continua così, sei fortissimo! ⚡`,
    (ctx) =>
      `Con ${ctx.daysRemaining} giorni rimasti punti al ${ctx.projectedPercent}%! Sei in una forma strepitosa! 🏆`,
  ],
  excellent: [
    (ctx) =>
      `Al ${ctx.absolutePercent}% il giorno ${ctx.dayOfMonth}: proiezione ${ctx.projectedPercent}%! Ottimo lavoro, il target è tuo! ✅`,
    (ctx) =>
      `Proiezione ${ctx.projectedPercent}%: con questo ritmo superi il target! Stai lavorando benissimo! 📈`,
    (ctx) =>
      `${ctx.absolutePercent}% e mancano ${ctx.daysRemaining} giorni — passo solido, sei sulla strada giusta! 🎯`,
    (ctx) =>
      `Giorno ${ctx.dayOfMonth} al ${ctx.absolutePercent}%: sei sopra il ritmo target! Bel lavoro, continua così! 🎉`,
    (ctx) =>
      `A questo passo chiudi al ${ctx.projectedPercent}%: obiettivo in cassaforte! Grande costanza! 💚`,
    (ctx) =>
      `${ctx.daysRemaining} giorni rimasti e proiezione al ${ctx.projectedPercent}%! Ce la stai facendo alla grande! ✨`,
  ],
  "on-track": [
    (ctx) =>
      `Giorno ${ctx.dayOfMonth} al ${ctx.absolutePercent}%: proiezione ${ctx.projectedPercent}%, sei in linea. Mantieni il ritmo, stai andando bene! 📊`,
    (ctx) =>
      `${ctx.absolutePercent}% con ${ctx.daysRemaining} giorni rimasti, ritmo allineato al target. Buon lavoro, non mollare! 👍`,
    (ctx) =>
      `Proiezione ${ctx.projectedPercent}% al giorno ${ctx.dayOfMonth}: sei in zona target. Ogni giorno conta, avanti così! 🎯`,
    (ctx) =>
      `Al ${ctx.absolutePercent}% il giorno ${ctx.dayOfMonth}, passo regolare. Sei sulla buona strada, tieni duro! 💪`,
    (ctx) =>
      `Ritmo regolare: ${ctx.absolutePercent}% fatto, proiezione ${ctx.projectedPercent}%. Ci sei, un passo alla volta! 🚶‍♂️`,
    (ctx) =>
      `${ctx.daysRemaining} giorni rimasti, proiezione ${ctx.projectedPercent}%: continua così e il target è tuo! 📈`,
  ],
  attention: [
    (ctx) =>
      `Giorno ${ctx.dayOfMonth} al ${ctx.absolutePercent}%: proiezione ${ctx.projectedPercent}%. Serve accelerare, ma hai tutto il tempo per farcela! 💪`,
    (ctx) =>
      `${ctx.absolutePercent}% con ${ctx.daysRemaining} giorni rimasti — il ritmo non basta ancora, ma sai come rimontare! 🔄`,
    (ctx) =>
      `Proiezione al ${ctx.projectedPercent}%: serve spingere di più, ma il target è ancora raggiungibile! Dai gas! 🏃`,
    (ctx) =>
      `Al giorno ${ctx.dayOfMonth} sei al ${ctx.absolutePercent}%: accelera il passo, hai le capacità per recuperare! 💥`,
    (ctx) =>
      `Con questo ritmo chiuderesti al ${ctx.projectedPercent}%: si può fare di meglio e lo sai! Forza! 🔥`,
    (ctx) =>
      `${ctx.daysRemaining} giorni per colmare il gap, proiezione ${ctx.projectedPercent}%. Ce la puoi fare, concentra le energie! 🎯`,
  ],
  critical: [
    (ctx) =>
      `Giorno ${ctx.dayOfMonth} al ${ctx.absolutePercent}%: proiezione solo ${ctx.projectedPercent}%. È dura ma non impossibile, serve uno scatto adesso! ⚠️`,
    (ctx) =>
      `${ctx.absolutePercent}% e mancano ${ctx.daysRemaining} giorni — situazione difficile, ma hai già superato momenti così. Reagisci! 💪`,
    (ctx) =>
      `Proiezione ${ctx.projectedPercent}% al giorno ${ctx.dayOfMonth}: serve una svolta. Concentra tutto sui clienti migliori! 🎯`,
    (ctx) =>
      `Solo ${ctx.absolutePercent}% in ${ctx.dayOfMonth} giorni — non arrenderti, un paio di ordini grandi cambiano tutto! 🔥`,
    (ctx) =>
      `Ritmo al ${ctx.projectedPercent}%: il gap è importante, ma ogni giorno è un'occasione. Non mollare! ⚡`,
    (ctx) =>
      `${ctx.daysRemaining} giorni rimasti per risalire dal ${ctx.absolutePercent}%. Hai le capacità, serve solo lo sprint finale! 🏃`,
  ],
  emergency: [
    (ctx) =>
      `Giorno ${ctx.dayOfMonth} al ${ctx.absolutePercent}%: proiezione ${ctx.projectedPercent}%. Momento critico, ma ogni singolo ordine ti avvicina. Non arrenderti! ⛔`,
    (ctx) =>
      `Solo ${ctx.absolutePercent}% con ${ctx.daysRemaining} giorni rimasti — è emergenza, ma ricorda: basta un grande ordine per ripartire! 💪`,
    (ctx) =>
      `Proiezione ${ctx.projectedPercent}% al giorno ${ctx.dayOfMonth}: serve azione immediata. Chiama i clienti più caldi, ogni contatto conta! 📞`,
    (ctx) =>
      `${ctx.absolutePercent}% in ${ctx.dayOfMonth} giorni — ogni ordine fa la differenza. Concentra tutte le energie sul fatturato! 🔥`,
    (ctx) =>
      `Emergenza: proiezione al ${ctx.projectedPercent}%. Priorità massima, ma ricorda che hai ribaltato situazioni peggiori! 💥`,
    (ctx) =>
      `${ctx.daysRemaining} giorni rimasti e proiezione ${ctx.projectedPercent}%: non è finita, ogni giornata può cambiare tutto! 🚀`,
  ],
};

export function determineHeroStatus(
  currentMonthRevenue: number,
  monthlyTarget: number,
  averageDailyRevenue: number,
  workingDaysRemaining: number,
  dayOfMonth: number,
): {
  status: WidgetStatus;
  projectedProgress: number;
  projectedMonthRevenue: number;
} {
  const projectedMonthRevenue =
    currentMonthRevenue + averageDailyRevenue * workingDaysRemaining;
  const projectedProgress =
    monthlyTarget > 0 ? projectedMonthRevenue / monthlyTarget : 0;
  const absoluteProgress =
    monthlyTarget > 0 ? currentMonthRevenue / monthlyTarget : 0;

  if (dayOfMonth <= 3 && absoluteProgress < 0.1) {
    return { status: "on-track", projectedProgress, projectedMonthRevenue };
  }

  if (absoluteProgress >= 2.0) {
    return { status: "legendary", projectedProgress, projectedMonthRevenue };
  }
  if (absoluteProgress >= 1.0) {
    const projectionStatus = projectedProgressToStatus(projectedProgress);
    const statusRank = STATUS_RANK[projectionStatus];
    const minStatus: WidgetStatus =
      statusRank > STATUS_RANK["excellent"] ? projectionStatus : "excellent";
    return { status: minStatus, projectedProgress, projectedMonthRevenue };
  }

  return {
    status: projectedProgressToStatus(projectedProgress),
    projectedProgress,
    projectedMonthRevenue,
  };
}

const STATUS_RANK: Record<WidgetStatus, number> = {
  emergency: 0,
  critical: 1,
  attention: 2,
  "on-track": 3,
  excellent: 4,
  champion: 5,
  legendary: 6,
};

function projectedProgressToStatus(projectedProgress: number): WidgetStatus {
  if (projectedProgress >= 2.0) return "legendary";
  if (projectedProgress >= 1.5) return "champion";
  if (projectedProgress >= 1.1) return "excellent";
  if (projectedProgress >= 0.85) return "on-track";
  if (projectedProgress >= 0.6) return "attention";
  if (projectedProgress >= 0.3) return "critical";
  return "emergency";
}

export async function calculateHeroStatus(
  currentMonthRevenue: number,
  monthlyTarget: number,
  currentYearRevenue: number,
  bonusInterval: number,
  yearlyTarget: number,
  pool: DbPool,
  userId: string,
  averageDailyRevenue: number,
  workingDaysRemaining: number,
) {
  const dayOfMonth = new Date().getDate();
  const { status, projectedProgress, projectedMonthRevenue } =
    determineHeroStatus(
      currentMonthRevenue,
      monthlyTarget,
      averageDailyRevenue,
      workingDaysRemaining,
      dayOfMonth,
    );

  const absolutePercent = Math.round(
    (monthlyTarget > 0 ? currentMonthRevenue / monthlyTarget : 0) * 100,
  );
  const microCopyCtx: MicroCopyContext = {
    dayOfMonth,
    absolutePercent,
    projectedPercent: Math.round(projectedProgress * 100),
    daysRemaining: workingDaysRemaining,
  };
  const microCopyArray = MICRO_COPY[status];
  const microCopyIndex = dayOfMonth % microCopyArray.length;
  const microCopy = microCopyArray[microCopyIndex](microCopyCtx);

  const missingToMonthlyTarget = Math.max(
    0,
    monthlyTarget - currentMonthRevenue,
  );
  const progressMonthly = monthlyTarget > 0 ? Math.min(1, currentMonthRevenue / monthlyTarget) : 0;

  const progressInCurrentInterval = currentYearRevenue % bonusInterval;
  const progressNextBonus = progressInCurrentInterval / bonusInterval;

  const comparisonPreviousMonth = await buildPreviousMonthComparison(
    pool, userId, currentMonthRevenue,
  );
  const comparisonSameMonthLastYear = await buildSameMonthLastYearComparison(
    pool, userId, currentMonthRevenue,
  );
  const comparisonYearlyProgress = buildYearlyProgressComparison(
    currentYearRevenue, yearlyTarget,
  );

  const sparkline = await generateMonthlySparkline(pool, userId, 12);

  return {
    status,
    currentMonthRevenue,
    monthlyTarget,
    missingToMonthlyTarget,
    progressMonthly,
    progressNextBonus,
    microCopy,
    projectedProgress,
    projectedMonthRevenue,
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

export async function calculateForecast(
  currentMonthRevenue: number,
  currentYearRevenue: number,
  averageDailyRevenue: number,
  workingDaysRemaining: number,
  commissionRate: number,
  bonusInterval: number,
  bonusAmount: number,
  monthlyTarget: number,
  pool: DbPool,
  userId: string,
) {
  const projectedMonthRevenue =
    currentMonthRevenue + averageDailyRevenue * workingDaysRemaining;

  const projectedYearRevenue = currentYearRevenue + projectedMonthRevenue;

  const projectedCommissions = projectedYearRevenue * commissionRate;

  const projectedBonusSteps = Math.floor(projectedYearRevenue / bonusInterval);
  const estimatedBonuses = projectedBonusSteps * bonusAmount;

  const missingToTarget = Math.max(0, monthlyTarget - currentMonthRevenue);
  const requiredDailyRevenue =
    workingDaysRemaining > 0 ? missingToTarget / workingDaysRemaining : 0;

  const previousMonthRevenue = await calculatePreviousMonthRevenue(pool, userId);
  const sameMonthLastYearRevenue = await calculateSameMonthLastYearRevenue(pool, userId);

  const comparisonPreviousMonth = buildComparison(
    projectedMonthRevenue,
    previousMonthRevenue,
    "vs Stesso Periodo Mese Scorso",
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

  let primaryGoal: "monthly_target" | "next_bonus" | "extra_budget";
  let primaryMessage: string;
  let primaryMetrics: any;

  const progressToTarget = (currentMonthRevenue / monthlyTarget) * 100;

  if (progressToTarget < 90) {
    primaryGoal = "monthly_target";
    primaryMessage = `Mancano ${formatCurrency(missingToMonthlyTarget)} al target di ${formatCurrency(monthlyTarget)}`;
    primaryMetrics = {
      missing: missingToMonthlyTarget,
      ordersNeeded: ordersNeededForTarget,
      averageOrderValue,
    };
  } else if (missingToNextBonus <= averageOrderValue * 2) {
    primaryGoal = "next_bonus";
    primaryMessage = `Mancano solo ${formatCurrency(missingToNextBonus)} per sbloccare +${formatCurrency(bonusAmount)}`;
    primaryMetrics = {
      missing: missingToNextBonus,
      ordersNeeded: ordersNeededForBonus,
      averageOrderValue,
    };
  } else {
    primaryGoal = "monthly_target";
    primaryMessage = `Focus sul target mensile: ancora ${formatCurrency(missingToMonthlyTarget)}`;
    primaryMetrics = {
      missing: missingToMonthlyTarget,
      ordersNeeded: ordersNeededForTarget,
      averageOrderValue,
    };
  }

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

  const currentMonth = new Date().getMonth() + 1;
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

  const requiredDailyRevenue =
    workingDaysRemaining > 0
      ? (monthlyTarget - currentMonthRevenue) / workingDaysRemaining
      : 0;

  const ordersNeeded = Math.ceil(gap / averageOrderValue);

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
    comparisonLastMonth: undefined,
  };
}
