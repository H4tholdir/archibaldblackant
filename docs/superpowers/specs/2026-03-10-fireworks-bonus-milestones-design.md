# Design: Fireworks per Milestone Bonus Progressivo

**Data:** 2026-03-10
**Stato:** Approvato

## Contesto

Il widget hero della dashboard mostra il progresso mensile verso il target configurato dal wizard. Già ora, al raggiungimento del 100% del budget mensile, scatta un effetto confetti `sideCannons`. L'obiettivo è aggiungere un effetto fuochi d'artificio a stelle (`fireworks`) che si attivi ogni volta che l'agente supera un milestone del bonus progressivo annuale (es. ogni 75.000€ di fatturato cumulativo annuo).

## Configurazione rilevante (TargetWizard step 4)

- `bonusAmount`: importo del bonus ricevuto ad ogni milestone (es. 5.000€)
- `bonusInterval`: fatturato cumulativo annuale necessario per ogni milestone (es. 75.000€)

Milestone annuali: `bonusInterval × 1`, `bonusInterval × 2`, `bonusInterval × 3`, ...

## Approccio scelto: Approccio A

Aggiungere `bonusMilestonesReached: number` a `HeroStatusData`. Il backend calcola `Math.floor(currentYearRevenue / bonusInterval)` quando costruisce il payload del widget hero.

## Design

### Backend

**Campo nuovo in `HeroStatusData`:**
```typescript
bonusMilestonesReached: number  // Math.floor(currentYearRevenue / bonusInterval), 0 se bonusInterval === 0
```

Il backend recupera `currentYearRevenue` (fatturato ordini dall'1 gennaio dell'anno corrente) e `bonusInterval` dalla config utente, calcola il numero di milestone raggiunti e lo include nel payload.

Se `bonusInterval === 0` (non configurato), il campo è `0` e non scatta nulla.

### Frontend — `HeroStatusWidgetNew.tsx`

Aggiungere una seconda chiamata a `useConfettiCelebration` accanto a quella esistente:

```typescript
// Esistente — budget mensile
useConfettiCelebration({
  enabled: data.progressMonthly >= 1.0,
  key: `monthly-target-${year}-${month}`,
  variant: "sideCannons",
  cooldownMs: 24 * 60 * 60 * 1000,
});

// Nuovo — milestone bonus progressivo
useConfettiCelebration({
  enabled: data.bonusMilestonesReached > 0,
  key: `bonus-milestone-${data.bonusMilestonesReached}-${year}`,
  variant: "fireworks",
  cooldownMs: 365 * 24 * 60 * 60 * 1000,
});
```

La chiave unica per milestone (`bonus-milestone-N-YYYY`) garantisce che ogni milestone si celebri una sola volta per anno tramite il cooldown in localStorage.

### Nessuna modifica a `useConfettiCelebration`

Il hook supporta già `variant: "fireworks"` che chiama `fireStarFireworks()` con `shapes: ["star"]`. Nessuna modifica necessaria.

## Comportamento atteso

| Fatturato annuo cumulativo | `bonusMilestonesReached` | Fireworks? |
|---|---|---|
| 0 – 74.999€ | 0 | No |
| 75.000€ – 149.999€ | 1 | ✅ Una volta (chiave `bonus-milestone-1-2026`) |
| 150.000€ – 224.999€ | 2 | ✅ Una volta (chiave `bonus-milestone-2-2026`) |
| 225.000€ – 299.999€ | 3 | ✅ Una volta (chiave `bonus-milestone-3-2026`) |

## File da modificare

| File | Tipo modifica |
|---|---|
| `backend/src/types/widget.ts` (o equivalente) | Aggiunge `bonusMilestonesReached: number` a `HeroStatusData` |
| `backend/src/services/widget-data-service.ts` (o equivalente) | Calcola e popola `bonusMilestonesReached` |
| `frontend/src/types/dashboard.ts` | Aggiunge `bonusMilestonesReached: number` a `HeroStatusData` |
| `frontend/src/components/widgets/HeroStatusWidgetNew.tsx` | Aggiunge seconda chiamata `useConfettiCelebration` |

## Test

- Unit test backend: `bonusMilestonesReached` = 0 con `bonusInterval = 0`
- Unit test backend: corretto floor con vari valori di fatturato/intervallo
- Frontend: celebrazione non si ripete al reload (cooldown localStorage)
- Frontend: milestone 1 e 2 hanno chiavi indipendenti
