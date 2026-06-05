# Design: Flusso "Condividi con PDF" asincrono con tracking banner

**Data:** 2026-06-05  
**Dominio:** notification-service / frontend UX  
**File principali:** `NotificheTab.tsx`, `share.service.ts`, `OperationTrackingContext.tsx`

---

## Problema

Quando l'utente preme "Condividi con PDF" nella card WA pending e il PDF non è ancora in cache ERP, viene mostrato un `alert()` del browser che dice di riprovare tra qualche minuto. L'utente:
- non vede alcun processo in corso
- non sa quanto deve aspettare
- se riprova ottiene lo stesso risultato
- non capisce se il sistema sta lavorando in background

## Soluzione

Sostituire il pattern alert-e-stop con un flusso a due fasi: **prova immediata → se mancante, enqueue con tracking banner → share automatica al completamento**.

---

## Architettura

### Fase 1 — Prova immediata (invariata per cache hit)

Al click su "Condividi con PDF":
1. Tenta di scaricare **tutti** i PDF delle fatture nel messaggio (`wa.invoiceNumbers`) in parallelo da `/api/ledger/invoice-pdf?invoiceNumber=...`
2. Separa i risultati in `available: { blob, fileName }[]` e `missing: string[]`
3. Se `missing.length === 0` → chiama `doShareAllPdfs(wa, available)` e termina (zero latenza aggiuntiva)

### Fase 2 — Enqueue download per PDF mancanti

Se `missing.length > 0`:
1. Per ogni `invoiceNumber` mancante: `enqueueOperation('cache-invoice-pdf', { invoiceNumber })` → ottiene `jobId`
2. Per ogni job: `trackOperation(invoiceNumber, jobId, 'PDF fattura', 'Download PDF fattura...', 'PDF pronto')` → GlobalOperationBanner mostra spinner + barra progresso
3. Salva in `jobWaMapRef: Map<jobId, waId>` la correlazione job → messaggio WA
4. Aggiorna stato locale `downloadStates: Map<waId, WaDownloadState>` con `phase: 'downloading'`
5. Il bottone "Condividi con PDF" diventa disabilitato con label "⏳ Preparazione PDF…"

### Fase 3 — Share automatica al completamento

Un `useEffect` in `NotificheTab` sottoscrive `JOB_COMPLETED` e `JOB_FAILED` via `useWebSocketContext`:
- Per ogni evento, risolve `waId` da `jobWaMapRef`
- Aggiorna `completedJobIds` / `failedJobIds` in `downloadStates`
- Quando `completedJobIds.size === state.jobIds.size`:
  - Se `failedJobIds.size === 0` → chiama `triggerShareRef.current(waId)` che ri-fetcha tutti i PDF e apre WhatsApp automaticamente
  - Se `failedJobIds.size > 0` → imposta `phase: 'error'`, bottone mostra "⚠ Errore download — Riprova"

Il `triggerShareRef` è un ref (non state) per evitare stale closure issues nel listener WS.

---

## Stato locale

```ts
type WaDownloadState = {
  phase: 'downloading' | 'error';
  jobIds: Set<string>;
  completedJobIds: Set<string>;
  failedJobIds: Set<string>;
  alreadyCached: { blob: Blob; fileName: string }[];
};

// In NotificheTab:
const [downloadStates, setDownloadStates] = useState<Map<string, WaDownloadState>>(new Map());
const jobWaMapRef = useRef<Map<string, string>>(new Map()); // jobId → waId
const triggerShareRef = useRef<(waId: string) => void>(() => {});
```

---

## UI degli stati del bottone

**idle** (default):
```
[ Ignora ]  [ 📎 Condividi con PDF ]  [ 💬 Solo testo ]
```

**downloading** (PDF in cache sul server):
```
[ Ignora ]  [ ⏳ Preparazione PDF… (disabilitato) ]  [ 💬 Solo testo ]
```
GlobalOperationBanner mostra: `"PDF fattura CF1/26004469 — Download PDF fattura… 40%"`

**error** (PDF non disponibile nell'ERP):
```
[ Ignora ]  [ ⚠ Download fallito — Riprova ]  [ 💬 Solo testo ]
```

---

## Modifiche ai file

### `frontend/src/components/NotificheTab.tsx`

- `handleShareWaWithPdf` refactoring a due fasi
- Nuovo `useEffect` per WS listener (`JOB_COMPLETED` / `JOB_FAILED`)
- Nuovo ref `jobWaMapRef` e `triggerShareRef`
- Nuovo state `downloadStates`
- Render condizionale del bottone in base a `downloadStates.get(wa.id)?.phase`

### `frontend/src/services/share.service.ts`

Aggiunta overload `shareViaWhatsAppMultiple`:
```ts
async shareViaWhatsAppMultiple(
  files: { blob: Blob; fileName: string }[],
  message: string,
): Promise<void>
```
- **Mobile** (`navigator.canShare`): `navigator.share({ text: message, files: [File1, File2, ...] })`
- **Desktop fallback**: usa solo il primo PDF (come oggi), più URL upload

### `frontend/src/contexts/OperationTrackingContext.tsx`

Aggiunge `cache-invoice-pdf` alle mappe label:
```ts
completedByType['cache-invoice-pdf'] = 'PDF pronto';
inProgressByType['cache-invoice-pdf'] = 'Download PDF fattura...';
```
`deriveNavigateTo` per `cache-invoice-pdf`: `undefined` (no navigazione).

---

## Non cambia

- `handleSendWa` (Solo testo) — invariato
- Backend — nessuna modifica (operazione `cache-invoice-pdf` già esiste e funziona)
- GlobalOperationBanner — già pronto, mostra automaticamente job user-facing
- `OperationTrackingContext` handler WS — già gestisce `cache-invoice-pdf` (è in `CONDUCTOR_OPERATIONS`)

---

## Edge cases

| Caso | Comportamento |
|---|---|
| Utente preme due volte "Condividi con PDF" | Seconda pressione è no-op (bottone disabilitato in fase `downloading`) |
| PDF non esiste nell'ERP (`cached: false`) | `JOB_COMPLETED` con `result.cached=false` conta come fallito → `phase: 'error'` |
| Connessione WS cade durante il download | Il job è in corso nel backend; al reconnect, `getActiveJobs` in `OperationTrackingContext` recupera lo stato. Il listener in `NotificheTab` riprende a ricevere eventi dal nuovo socket |
| Utente naviga via dalla pagina | `downloadStates` viene perso (componente unmount). Il job continua in background. Al ritorno il PDF sarà in cache e il click funzionerà direttamente in Fase 1 |
| Un messaggio WA ha 1 sola fattura | Funziona identicamente — `jobIds.size === 1`, share automatica appena quel job completa |

---

## Testing

- Unit: `handleShareWaWithPdf` — tutti PDF disponibili → share immediata; alcuni mancanti → enqueue + stato downloading
- Unit: WS listener — `JOB_COMPLETED` per tutti i jobId → triggerShare; `JOB_FAILED` → fase error
- Unit: `shareViaWhatsAppMultiple` — mobile path (mock `navigator.canShare`) + desktop fallback
- Integration: label `cache-invoice-pdf` nel `getRecoveryLabels`
