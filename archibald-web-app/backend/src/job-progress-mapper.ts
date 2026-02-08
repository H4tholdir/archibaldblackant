import { logger } from "./logger";

export interface ProgressMilestone {
  percent: number;
  labelTemplate: string;
}

export const PROGRESS_MILESTONES: Record<string, ProgressMilestone> = {
  "navigation.ordini": {
    percent: 10,
    labelTemplate: "Apertura sezione ordini",
  },
  "form.customer": {
    percent: 25,
    labelTemplate: "Inserimento cliente",
  },
  "form.articles.start": {
    percent: 35,
    labelTemplate: "Inizio inserimento articoli",
  },
  "form.articles.progress": {
    percent: 50,
    labelTemplate: "Inserimento articolo {currentArticle} di {totalArticles}",
  },
  "form.articles.complete": {
    percent: 70,
    labelTemplate: "Articoli inseriti",
  },
  "form.discount": {
    percent: 80,
    labelTemplate: "Applicazione sconto globale",
  },
  "form.submit.start": {
    percent: 90,
    labelTemplate: "Salvataggio ordine in corso",
  },
  "form.submit.complete": {
    percent: 100,
    labelTemplate: "Ordine salvato con successo",
  },
};

export function calculateArticleProgress(
  currentArticle: number,
  totalArticles: number,
): number {
  const startPercent = 35;
  const endPercent = 70;
  const range = endPercent - startPercent;
  return Math.round(startPercent + range * (currentArticle / totalArticles));
}

export function formatProgressLabel(
  template: string,
  metadata?: Record<string, any>,
): string {
  if (!metadata) return template;
  let formatted = template;
  Object.entries(metadata).forEach(([key, value]) => {
    const regex = new RegExp(`\\{${key}\\}`, "g");
    formatted = formatted.replace(regex, String(value));
  });
  return formatted;
}

const CUSTOMER_PROGRESS_MILESTONES: Record<string, { progress: number; label: string }> = {
  "customer.navigation": { progress: 15, label: "Navigazione alla lista clienti" },
  "customer.search": { progress: 30, label: "Ricerca cliente" },
  "customer.edit_loaded": { progress: 40, label: "Scheda modifica aperta" },
  "customer.field": { progress: 60, label: "Aggiornamento campi" },
  "customer.save": { progress: 85, label: "Salvataggio in corso" },
  "customer.sync": { progress: 95, label: "Sincronizzazione dati" },
  "customer.complete": { progress: 100, label: "Completato" },
};

export function getCustomerProgressMilestone(
  category: string,
): { progress: number; label: string } | null {
  return CUSTOMER_PROGRESS_MILESTONES[category] ?? null;
}

export function getProgressMilestone(
  operationCategory: string,
  metadata?: Record<string, any>,
): { progress: number; label: string } | null {
  const milestone = PROGRESS_MILESTONES[operationCategory];
  if (!milestone) {
    logger.debug(`[JobProgressMapper] No milestone for: ${operationCategory}`);
    return null;
  }

  let progress = milestone.percent;

  if (operationCategory === "form.articles.progress" && metadata) {
    const { currentArticle, totalArticles } = metadata;
    if (currentArticle && totalArticles) {
      progress = calculateArticleProgress(currentArticle, totalArticles);
    }
  }

  const label = formatProgressLabel(milestone.labelTemplate, metadata);
  return { progress, label };
}
