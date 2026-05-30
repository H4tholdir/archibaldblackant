export type EscalationStep = {
  days_after_due: number;
  tone: string;
  channels: string[];
};

export type ApplicableStep = {
  index: number;
  tone: string;
  channels: string[];
  days_after_due: number;
};

const TONE_SEVERITY: Record<string, number> = { cordiale: 1, formale: 2, urgente: 3 };

// channel opzionale: se passato, salta i passi che non includono quel canale.
// Senza il filtro canale, uno step WA-only (es. Aggressivo step 0 = ['whatsapp'])
// verrebbe restituito per la ricerca email → il caller scarterebbe l'invoice
// ma lo step 0 non verrebbe mai loggato per email → deadlock permanente.
export function getApplicableStep(
  daysPastDue: number,
  steps: EscalationStep[],
  alreadySentIndexes: Set<number>,
  channel?: string,
): ApplicableStep | null {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (
      daysPastDue >= step.days_after_due &&
      !alreadySentIndexes.has(i) &&
      (channel === undefined || step.channels.includes(channel))
    ) {
      return { index: i, tone: step.tone, channels: step.channels, days_after_due: step.days_after_due };
    }
  }
  return null;
}

export function dominantTone(tones: string[]): string {
  return tones.reduce((max, t) =>
    (TONE_SEVERITY[t] ?? 0) > (TONE_SEVERITY[max] ?? 0) ? t : max
  , 'cordiale');
}
