# Sync Observability — Design (2026-03-30)

## Problema

Il sistema di sync ha tre categorie di bug che insieme rendono impossibile capire se la PWA è aggiornata:

**Bug A — jobId statici bloccati dopo un fallimento**
`sync-order-articles` usa jobId statici (`sync-order-articles-{userId}-{orderId}`). Se il job fallisce,
rimane nel set Redis "failed" con `removeOnFail: { count: 100 }`. Il prossimo tick dello scheduler
tenta di accodare lo stesso jobId → BullMQ lo ignora silenziosamente → quell'ordine non viene mai
più risincronizzato. Stessa logica per `sync-customer-addresses-{userId}` (introdotto il 2026-03-30).

**Bug B — circuit breaker skip appare "healthy"**
Il processor ritorna `{ circuitBreakerSkipped: true }` e il job completa in ~1ms. La dashboard
calcola `health` guardando solo `job.failedReason` — senza errore, classifica come "healthy".
Circuit breaker attivo → tutti i sync saltati → dashboard mostra "healthy" → falso positivo totale.

**Bug C — reschedule e skip indistinguibili**
Il processor produce anche `{ rescheduled: true }` (lock non acquisito → rischedulato) e
`{ skipped: true }` (max reschedule superato). Entrambi appaiono come job "completed" normali
con durata ms. Contribuiscono al calcolo di `consecutiveFailures` (falsamente: zero errori = healthy)
e al `lastRunTime` (falsamente recente).

---

## Scope

Quattro fix mirati. Nessuna nuova infrastruttura, nessuna nuova tabella DB.

Escluso: migrazione history da BullMQ a DB (overkill per il problema attuale).

---

## 1. Fix BullMQ: `removeOnFail` con age (operation-queue.ts)

**Attuale:**
```ts
removeOnFail: { count: 100 }
```

**Fix:**
```ts
removeOnFail: { age: 3600, count: 100 }
```

`age` è in secondi. Un job failed viene rimosso dopo 1 ora **oppure** quando ci sono più di 100
job failed nella coda, liberando il jobId e permettendo al prossimo tick di accodarlo normalmente.

Si applica a tutte le code (il parametro è nella funzione `getJobOptions` usata da tutti).

---

## 2. Fix scheduler: jobId semi-statico per sync-customer-addresses (sync-scheduler.ts)

**Problema:** il jobId `sync-customer-addresses-${agentUserId}` è statico assoluto. Con
`removeOnComplete: { count: 100 }`, il job completed rimane in Redis finché la coda enrichment
non accumula >100 job completati. Tutti i tentativi intermedi vengono ignorati silenziosamente.

**Fix:** jobId con slot temporale che cambia ogni `ADDRESS_SYNC_DELAY_MS` (5 minuti):

```ts
const slot = Math.floor(Date.now() / ADDRESS_SYNC_DELAY_MS);
`sync-customer-addresses-${agentUserId}-${slot}`
```

Mantiene la deduplicazione all'interno della stessa finestra di 5 minuti (due tick ravvicinati non
creano job duplicati), ma garantisce che ogni nuovo ciclo usi un jobId fresco.

---

## 3. Classificazione outcome nel backend (sync-status.ts)

### 3a. Nuova funzione helper `classifyOutcome`

Il campo `job.returnvalue` contiene già il segnale necessario. Classificazione:

```ts
type JobOutcome = 'real' | 'circuit_breaker_skip' | 'rescheduled' | 'skipped';

function classifyOutcome(job: Job): JobOutcome {
  const rv = job.returnvalue as Record<string, unknown> | null;
  if (rv?.circuitBreakerSkipped) return 'circuit_breaker_skip';
  if (rv?.rescheduled) return 'rescheduled';
  if (rv?.skipped) return 'skipped';
  return 'real';
}
```

### 3b. Aggiornamento `/monitoring/sync-history`

L'endpoint aggiunge `outcome` a ogni history entry e calcola metriche separate per job reali vs skip:

**History entry:**
```ts
{
  timestamp: string | null;
  duration: number | null;
  success: boolean;
  error: string | null;
  outcome: 'real' | 'circuit_breaker_skip' | 'rescheduled' | 'skipped';  // NEW
}
```

**Stats per sync type:**
```ts
{
  // Esistenti (invariati):
  lastRunTime, lastDuration, lastSuccess, lastError,
  health, totalCompleted, totalFailed, consecutiveFailures,
  history,

  // Nuovi:
  lastRealRunTime: string | null;        // ultimo job con outcome='real'
  lastRealDuration: number | null;       // durata di quel job
  circuitBreakerActive: boolean;         // true se almeno un job recente è circuit_breaker_skip
  skipCount: number;                     // quanti skip negli ultimi 20 job
}
```

**Ricalcolo `health`:**
- `consecutiveFailures` conta solo job con `outcome === 'real'` e `failedReason !== null`
- Un blocco di skip non abbassa la health (non sono errori)
- Se `circuitBreakerActive === true` → health speciale `'paused'` (nuovo stato)
- `isStale` si basa su `lastRealRunTime` invece di `lastRunTime`

### 3c. Aggiornamento tipo `health`

```ts
health: 'healthy' | 'degraded' | 'stale' | 'idle' | 'paused'
```

`'paused'` = circuit breaker attivo (skip recenti) — il sistema sa del problema e sta aspettando
il timeout di 2h prima di riprovare.

### 3d. Nuovo endpoint `/monitoring/circuit-breaker`

```ts
GET /api/sync/monitoring/circuit-breaker
```

Legge dalla tabella esistente `system.circuit_breaker` e ritorna:

```ts
{
  success: true,
  entries: Array<{
    userId: string;
    syncType: string;
    consecutiveFailures: number;
    totalFailures24h: number;
    lastFailureAt: string | null;
    lastError: string | null;
    pausedUntil: string | null;        // null = non in pausa
    isPaused: boolean;
    lastSuccessAt: string | null;
  }>
}
```

Deps necessarie nella `SyncStatusRouterDeps`: aggiungere `getCircuitBreakerStatus?: () => Promise<CircuitBreakerEntry[]>`.

---

## 4. Frontend: dashboard migliorata (SyncMonitoringDashboard.tsx)

### 4a. Nuovi tipi

```ts
type JobOutcome = 'real' | 'circuit_breaker_skip' | 'rescheduled' | 'skipped';

type HistoryEntry = {
  timestamp: string | null;
  duration: number | null;
  success: boolean;
  error: string | null;
  outcome: JobOutcome;   // NEW
};

type SyncTypeStats = {
  // ... esistenti ...
  health: 'healthy' | 'degraded' | 'stale' | 'idle' | 'paused';  // paused aggiunto
  lastRealRunTime: string | null;    // NEW
  lastRealDuration: number | null;   // NEW
  circuitBreakerActive: boolean;     // NEW
  skipCount: number;                 // NEW
};
```

### 4b. Badge health aggiornato

Aggiungere caso `'paused'`:
```ts
case 'paused':
  return { color: '#7b1fa2', bg: '#f3e5f5', label: 'PAUSA CB' };
```

### 4c. Status line della card

Cambiare da:
```
Last: 12:34  Durata: 45ms
```

A:
```
Reale: <lastRealRunTime>  Durata: <lastRealDuration>
[se skipCount > 0]: ⏭ <skipCount> saltati
```

Questo elimina la confusione: "12:34 — 1ms" sparisce (era uno skip), viene mostrato solo
l'ultimo sync che ha effettivamente eseguito il codice.

### 4d. Icone outcome nella history table

| outcome | icona | colore riga |
|---------|-------|-------------|
| `real` + success | ✅ | bianco |
| `real` + failed | ❌ | rosso chiaro |
| `circuit_breaker_skip` | ⏸ | viola chiaro |
| `rescheduled` | 🔄 | giallo chiaro |
| `skipped` | ⏭ | grigio |

### 4e. Sezione "Circuit Breaker Status"

Nuova sezione nella dashboard (dopo "Active Jobs"), visibile solo se ci sono entry con `isPaused: true`:

```
⏸ Circuit Breaker Attivo
─────────────────────────────────────────
sync-ddt (user xyz...)    pausa fino alle 14:30    [3 errori consecutivi]
```

Polling separato `/monitoring/circuit-breaker` ogni 60 secondi.

---

## File modificati

| File | Modifica |
|------|----------|
| `src/operations/operation-queue.ts` | `removeOnFail: { age: 3600, count: 100 }` |
| `src/sync/sync-scheduler.ts` | jobId semi-statico per `sync-customer-addresses` |
| `src/sync/circuit-breaker.ts` | Aggiungere metodo `getAllStatus()` |
| `src/routes/sync-status.ts` | `classifyOutcome`, metriche reali vs skip, endpoint `/monitoring/circuit-breaker` |
| `src/main.ts` | Passare `getCircuitBreakerStatus` nelle deps del router |
| `frontend/src/components/SyncMonitoringDashboard.tsx` | Nuovi tipi, icone outcome, sezione CB, `lastRealRunTime` |

---

## Test

- `operation-queue.spec.ts`: verifica che `removeOnFail` contenga `age: 3600`
- `sync-scheduler.spec.ts`: verifica che jobId `sync-customer-addresses` cambi tra slot temporali diversi
- `sync-status.spec.ts` (nuovo): verifica `classifyOutcome` per tutti e 4 gli outcome; verifica che `circuitBreakerActive` sia true quando l'ultimo job è uno skip; verifica che `health = 'paused'` quando CB è attivo; verifica `lastRealRunTime` escluda gli skip
- `circuit-breaker.spec.ts`: aggiungere test per `getAllStatus()`
- Frontend: nessun test nuovo richiesto (componente display puro)
