# Customer Create — Banner Integration & Dismissable Modal

**Data**: 2026-04-01  
**Status**: Approvato per implementazione

---

## Obiettivo

La creazione di un nuovo cliente avvia un job bot che può richiedere decine di secondi. Oggi l'utente è bloccato nella modale finché il bot non finisce. L'obiettivo è rendere la modale dismissibile (ESC, click fuori) durante il processing, con il job che continua in background visibile nel `GlobalOperationBanner`, e la modale riapribile cliccando il banner.

---

## Architettura

### Problema attuale

`CustomerCreateModal` è istanziata localmente in `CustomerList` e `OrderFormSimple`. Quando viene chiusa, lo stato del job (taskId, progress, WebSocket listener via `waitForJobViaWebSocket`) viene distrutto. Riaprire il modal è impossibile perché non c'è memoria persistente dell'operazione in corso.

### Soluzione: singleton globale + CustomerCreationContext

`CustomerCreateModal` viene spostato in `AppRouter` come singleton sempre montato (ma visibile solo quando necessario). Un nuovo `CustomerCreationContext` governa visibilità e configurazione. `CustomerList` e `OrderFormSimple` smettono di gestire `useState` locale per la modale.

---

## Componenti

### 1. `CustomerCreationContext` (nuovo)

**File**: `frontend/src/contexts/CustomerCreationContext.tsx`

```typescript
type ModalConfig = {
  contextMode: "standalone" | "order";
  prefillName?: string;
};

type CustomerCreationContextValue = {
  isModalOpen: boolean;
  modalConfig: ModalConfig;
  activeTaskId: string | null;
  openModal: (config?: Partial<ModalConfig>, onCreated?: () => void) => void;
  closeModal: () => void;      // nasconde, non cancella il job
  setActiveTaskId: (id: string | null) => void;
  notifyCreated: () => void;   // chiamato dal modal al completamento → esegue onCreated callback
};
```

**Responsabilità**:
- `openModal(config?, onCreated?)` — imposta `isModalOpen = true`, `modalConfig`, e memorizza `onCreated` callback (es. `loadCustomers`) nel ref del context
- `closeModal()` — imposta `isModalOpen = false`; se `activeTaskId !== null`, il job continua in background
- `setActiveTaskId(id)` — chiamato da `CustomerCreateModal.performSave` dopo aver ottenuto il `taskId`; chiamato con `null` quando il job finisce
- `notifyCreated()` — chiamato dal modal quando `JOB_COMPLETED`; esegue il callback `onCreated` registrato, poi `setActiveTaskId(null)`, `closeModal()`

**Posizionamento**: dentro `OperationTrackingProvider` in AppRouter, così può chiamare `trackOperation`.

---

### 2. Modifiche a `OperationTrackingContext`

**File**: `frontend/src/contexts/OperationTrackingContext.tsx`

Aggiunta minimale a `TrackedOperation`:
```typescript
type TrackedOperation = {
  // ... campi esistenti
  onBannerClick?: () => void;  // NUOVO: override navigazione
  completedLabel?: string;     // NUOVO: es. "Cliente creato" vs "Ordine completato"
};
```

`trackOperation` accetta un quarto parametro opzionale `opts?: { onBannerClick?: () => void; completedLabel?: string }`.

`JOB_COMPLETED` usa `op.completedLabel ?? "Ordine completato"` per il label finale.

---

### 3. Modifiche a `GlobalOperationBanner`

**File**: `frontend/src/components/GlobalOperationBanner.tsx`

`handleClick` diventa per-operazione:
```typescript
// PRIMA (singola operazione)
const handleClick = () => navigate("/pending-orders");

// DOPO (per-operazione)
const handleOperationClick = (op: TrackedOperation) => {
  if (op.onBannerClick) op.onBannerClick();
  else navigate("/pending-orders");
};
```

Per le operazioni multiple (summary view), il click naviga sempre a `/pending-orders` (comportamento invariato).

---

### 4. Modifiche a `CustomerCreateModal`

**File**: `frontend/src/components/CustomerCreateModal.tsx`

#### A. Props ridotte

Vengono rimosse `isOpen`, `onClose`, `contextMode`, `prefillName` come props. Il modal le legge dal `CustomerCreationContext`. `onSaved` viene spostata nel context come callback registrata al momento di `openModal`.

```typescript
// PRIMA
interface CustomerCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  contextMode?: "standalone" | "order";
  prefillName?: string;
}

// DOPO
// Nessuna prop — tutto da CustomerCreationContext
export function CustomerCreateModal() { ... }
```

`openModal` accetta un callback opzionale `onCreated` che viene chiamato al completamento del job:
```typescript
openModal: (config?: Partial<ModalConfig>, onCreated?: () => void) => void;
```
CustomerList e OrderFormSimple passano i loro refresh callback qui (es. `() => loadCustomers()`).


#### B. Comportamento chiusura durante processing

Quando `processingState === "processing"`:
- ESC chiama `closeModal()` (nasconde la modale)
- Click fuori chiama `closeModal()`
- **NON** cancella il job bot
- Il `waitForJobViaWebSocket` continua a girare perché la modale rimane montata

Quando `processingState === "idle"`:
- ESC / click fuori chiama `closeModal()` + cancella la sessione interattiva (comportamento attuale)

#### C. `performSave` — integrazione con banner

```typescript
// Dopo aver ottenuto resultTaskId:
setActiveTaskId(resultTaskId);
trackOperation(
  resultTaskId,   // orderId (riusato come chiave)
  resultTaskId,   // jobId
  formData.name,
  "Creazione cliente in corso...",
  {
    onBannerClick: openModal,
    completedLabel: "Cliente creato",
  }
);
```

#### D. Progress screen legge da `OperationTrackingContext`

```typescript
const { activeOperations } = useOperationTracking();
const trackedOp = activeOperations.find(o => o.jobId === activeTaskId);

const displayProgress = trackedOp?.progress ?? localProgress;
const displayLabel = trackedOp?.label ?? localProgressLabel;
const displayStatus = trackedOp?.status ?? processingState;
```

Questo elimina la dipendenza da `waitForJobViaWebSocket` per la progress screen — il `OperationTrackingContext` già ascolta `JOB_PROGRESS`/`JOB_COMPLETED`/`JOB_FAILED`.

`waitForJobViaWebSocket` viene mantenuto solo per il comportamento di `onSaved()` + `closeModal()` al completamento.

#### E. Reset wizard su riapertura

Quando `isModalOpen` passa da `false` a `true` e `activeTaskId === null` (nessun job in corso), il wizard si resetta allo step "vat" (comportamento attuale). Se `activeTaskId !== null`, la modale si apre direttamente sulla progress screen.

---

### 5. Modifiche ad `AppRouter`

**File**: `frontend/src/AppRouter.tsx`

```tsx
<OperationTrackingProvider>
  <CustomerCreationProvider>       {/* NUOVO */}
    <CustomerCreateModal />        {/* NUOVO: singleton sempre montato */}
    <GlobalOperationBanner />
    <DashboardNav />
    <Routes>...</Routes>
  </CustomerCreationProvider>
</OperationTrackingProvider>
```

`CustomerCreateModal` viene sempre montato (mai smontato). Internamente legge `isModalOpen` dal context:

```typescript
// All'inizio del render (non prima degli hook)
const { isModalOpen, activeTaskId } = useCustomerCreation();
// ...tutti gli hook/effect girano sempre (componente sempre montato)...
// Alla fine:
if (!isModalOpen) return null;  // render null ≠ smontaggio — gli hook continuano
```

Questo garantisce che `waitForJobViaWebSocket` continui a girare anche quando la modale è nascosta.

---

### 6. Modifiche a `CustomerList` e `OrderFormSimple`

Rimozione del `useState` locale per la modale:

```typescript
// PRIMA (CustomerList)
const [createModalOpen, setCreateModalOpen] = useState(false);
// <CustomerCreateModal isOpen={createModalOpen} onClose={...} onSaved={() => loadCustomers()} ... />

// DOPO (CustomerList)
const { openModal } = useCustomerCreation();
// (nessun CustomerCreateModal nel JSX — è in AppRouter)
// onClick: openModal({ contextMode: "standalone" }, () => loadCustomers())

// PRIMA (OrderFormSimple)
const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
// <CustomerCreateModal contextMode="order" prefillName={...} ... />

// DOPO (OrderFormSimple)
// openModal({ contextMode: "order", prefillName: "..." }, handleCustomerCreated)
```

---

## Flusso UX

```
Utente clicca "Nuovo cliente"
  → openModal({ contextMode: "standalone" })
  → Modale apre al passo "vat"

Utente riempie wizard e clicca "Crea"
  → performSave() → taskId ricevuto
  → setActiveTaskId(taskId)
  → trackOperation(taskId, taskId, name, "Creazione cliente...", { onBannerClick: openModal })
  → Modale mostra progress screen

Utente preme ESC (durante processing)
  → closeModal()
  → Modale nascosta, job continua
  → Banner appare: "[Nome] — Creazione cliente in corso... 45%"

Utente clicca banner
  → op.onBannerClick() → openModal()
  → Modale riappare sulla progress screen con stato aggiornato

Job completato (JOB_COMPLETED via WS)
  → OperationTrackingContext: status = "completed", label = "Cliente creato"
  → waitForJobViaWebSocket: onSaved() + closeModal() + setActiveTaskId(null)
  → Banner: verde "Cliente creato" per 10s, poi sparisce
```

---

## Gestione errori

**Job fallisce** (`JOB_FAILED`):
- `OperationTrackingContext` aggiorna `status = "failed"`
- `waitForJobViaWebSocket` chiama `setProcessingState("failed")`, setta `botError`
- Se modale è chiusa: banner rimane visibile con icona errore; click riapre la modale che mostra il messaggio di errore e il pulsante "Riprova"
- Il banner non auto-dismissisce in caso di errore

**Sessione interattiva fallisce** (`CUSTOMER_INTERACTIVE_FAILED`):
- Comportamento invariato: `erpValidated` rimane `false`, il salvataggio usa il fallback fresh-bot

---

## Bug separato: "form non si è chiuso"

Il messaggio di errore contiene il codice JavaScript di inizializzazione del `Vertical_PopupWindowCallback` di DevExpress — questo elemento è sempre presente nel DOM (anche quando non visibile) e viene catturato dal selettore `div[id*="Popup"]` nel diagnostico del bot. Il check `offsetParent !== null || style.display !== "none"` è troppo permissivo.

**Fix separato** (non in scope di questa spec): nel `page.evaluate` del diagnostico a `archibald-bot.ts:12287`, aggiungere il filtro che esclude elementi il cui `textContent` inizia con `<!--` o non contiene caratteri leggibili (lettere/numeri) oltre alla soglia minima. Il vero motivo del fallimento del form (campo obbligatorio ERP, popup VIES non gestito) resta da investigare via log.

---

## Testing

**Unit test** (`CustomerCreationContext.spec.tsx`):
- `openModal` / `closeModal` modificano `isModalOpen`
- `setActiveTaskId` aggiorna `activeTaskId`
- `closeModal` non azzera `activeTaskId`

**Unit test** (`OperationTrackingContext.spec.tsx`):
- `trackOperation` con `onBannerClick` — l'opzione viene preservata in `activeOperations`
- `completedLabel` appare nel label quando `JOB_COMPLETED`

**Unit test** (`GlobalOperationBanner.spec.tsx`):
- Se `onBannerClick` definito, click chiama `onBannerClick` invece di `navigate`

**Unit test** (`CustomerCreateModal.spec.tsx`):
- Durante `processingState === "processing"`: ESC chiama `closeModal()` (non cancella job)
- Durante `processingState === "idle"`: ESC chiama `closeModal()` + cancella sessione
- `performSave` success → chiama `setActiveTaskId` + `trackOperation`

**Integration** (manuale): flusso completo standalone — crea cliente, chiudi modale, verifica banner, clicca banner, riapri modale, attendi completamento.

---

## File da creare / modificare

| File | Azione |
|------|--------|
| `frontend/src/contexts/CustomerCreationContext.tsx` | **CREA** |
| `frontend/src/contexts/CustomerCreationContext.spec.tsx` | **CREA** |
| `frontend/src/contexts/OperationTrackingContext.tsx` | **MODIFICA** (aggiunge onBannerClick, completedLabel) |
| `frontend/src/contexts/OperationTrackingContext.spec.tsx` | **MODIFICA** |
| `frontend/src/components/GlobalOperationBanner.tsx` | **MODIFICA** (handleOperationClick per-op) |
| `frontend/src/components/GlobalOperationBanner.spec.tsx` | **MODIFICA** |
| `frontend/src/components/CustomerCreateModal.tsx` | **MODIFICA** (props→context, close behavior, trackOperation) |
| `frontend/src/components/CustomerCreateModal.spec.tsx` | **MODIFICA** |
| `frontend/src/AppRouter.tsx` | **MODIFICA** (CustomerCreationProvider + GlobalCustomerCreateModal) |
| `frontend/src/pages/CustomerList.tsx` | **MODIFICA** (rimuove useState locale modale) |
| `frontend/src/components/OrderFormSimple.tsx` | **MODIFICA** (rimuove useState locale modale) |
