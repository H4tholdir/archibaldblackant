# Create Customer Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riscrivere il flusso di creazione cliente eliminando il dual-system legacy, introducendo validazione P.IVA istantanea via VIES e sessione bot asincrona in background.

**Architecture:** Un nuovo endpoint stateless `/api/customers/vat-check` chiama il registro VIES EU e ritorna dati azienda in ~500ms. Un nuovo endpoint `/api/customers/interactive/begin` avvia il bot ERP in background (login + naviga + valida P.IVA) senza bloccare la UI. `CustomerCreateModal.tsx` viene riscritto con 7 step puliti, eliminando ~700 righe di codice legacy.

**Tech Stack:** TypeScript, Express, Zod, Vitest, Supertest, React 19, Testing Library, `fetch` (Node 18 global + browser)

---

## File map

| File | Azione | Responsabilità |
|---|---|---|
| `backend/src/types.ts` | Modify | Aggiunge `"erp_validating"` a `InteractiveSessionState` |
| `backend/src/routes/customers.ts` | Modify | Aggiunge `POST /vat-check` |
| `backend/src/routes/customers.spec.ts` | Modify | Test per `vat-check` |
| `backend/src/routes/customer-interactive.ts` | Modify | Aggiunge `POST /begin`; fix `saveSchema` |
| `backend/src/routes/customer-interactive.spec.ts` | Modify | Test per `begin` e `saveSchema` |
| `frontend/src/services/customers.service.ts` | Modify | Aggiunge `checkVat()`, `beginInteractiveSession()`; fix tipo `saveInteractiveCustomer()` |
| `frontend/src/components/CustomerCreateModal.tsx` | Modify (full rewrite) | Wizard 7 step, autofill 2 ondate, ERP wait asincrono |
| `frontend/src/components/CustomerCreateModal.spec.tsx` | Modify | Test aggiornati per nuovi step e logica |

---

## Task 1 — Backend: `InteractiveSessionState` + `saveSchema`

**Files:**
- Modify: `archibald-web-app/backend/src/types.ts`
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.ts`

- [ ] **Step 1.1 — Aggiungi `erp_validating` alla union in `types.ts`**

Trova la riga con `InteractiveSessionState` e aggiorna la union:

```typescript
export type InteractiveSessionState =
  | "starting"
  | "ready"
  | "erp_validating"   // ← NUOVO: bot sul form, VAT in attesa callback ERP
  | "processing_vat"
  | "vat_complete"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";
```

- [ ] **Step 1.2 — Fix `saveSchema` in `customer-interactive.ts`**

Nella funzione `createCustomerInteractiveRouter`, trova `const saveSchema = z.object({...})` (intorno a riga 47) e aggiungi i 7 campi mancanti alla fine dell'oggetto, prima della parentesi di chiusura:

```typescript
  // Campi aggiunti: erano silenziosamente scartati da Zod, il bot non li riceveva
  fiscalCode: z.string().optional(),
  sector: z.string().optional(),
  attentionTo: z.string().optional(),
  notes: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
```

- [ ] **Step 1.3 — Scrivi test failing per `saveSchema`**

In `customer-interactive.spec.ts`, aggiungi in fondo al file:

```typescript
describe('saveSchema — campi estesi', () => {
  test('fiscalCode, sector, attentionTo, notes raggiungono completeCustomerCreation', async () => {
    const mockBot = createMockBot();
    const app = createTestApp(mockBot);
    const { sessionId } = await startSession(app);
    await makeSessionReady(sessionId);

    await request(app)
      .post(`/interactive/${sessionId}/save`)
      .set('x-user-id', 'user-1')
      .send({
        name: 'Test Srl',
        vatNumber: '12345678901',
        fiscalCode: 'TSTFSC80A01H501Z',
        sector: 'concessionari',
        attentionTo: 'Mario Rossi',
        notes: 'Note interne di test',
        county: 'RM',
        state: 'Lazio',
        country: 'IT',
      });

    expect(mockBot.completeCustomerCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        fiscalCode: 'TSTFSC80A01H501Z',
        sector: 'concessionari',
        attentionTo: 'Mario Rossi',
        notes: 'Note interne di test',
        county: 'RM',
        state: 'Lazio',
        country: 'IT',
      }),
    );
  });
});
```

> **Nota:** `createTestApp`, `startSession`, `makeSessionReady` sono helper già definiti nel file spec. Se non esistono, aggiungili prima del test seguendo lo stesso pattern degli altri test nel file.

- [ ] **Step 1.4 — Esegui il test, verifica che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customer-interactive.spec.ts
```

Atteso: FAIL su "fiscalCode, sector, attentionTo, notes raggiungono completeCustomerCreation"

- [ ] **Step 1.5 — Esegui i test per verificare che passano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customer-interactive.spec.ts
```

Atteso: PASS su tutti i test incluso il nuovo

- [ ] **Step 1.6 — Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Atteso: nessun errore TS

- [ ] **Step 1.7 — Commit**

```bash
git add archibald-web-app/backend/src/types.ts \
        archibald-web-app/backend/src/routes/customer-interactive.ts \
        archibald-web-app/backend/src/routes/customer-interactive.spec.ts
git commit -m "fix(customer-interactive): saveSchema + erp_validating state

Aggiunge 7 campi mancanti al saveSchema Zod (fiscalCode, sector,
attentionTo, notes, county, state, country). Prima venivano scartati
da Zod e non raggiungevano il bot ERP. Aggiunge stato erp_validating
alla union InteractiveSessionState."
```

---

## Task 2 — Backend: `POST /api/customers/vat-check`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/customers.ts`
- Modify: `archibald-web-app/backend/src/routes/customers.spec.ts`

- [ ] **Step 2.1 — Scrivi test failing**

In `customers.spec.ts`, aggiungi un nuovo `describe` dopo gli esistenti:

```typescript
describe('POST /vat-check', () => {
  const vatNumber = '12345678901';

  test('restituisce valid:true e name quando VIES risponde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        valid: true,
        name: 'ACME SRL',
        address: 'VIA ROMA 1 00100 ROMA IT',
      }),
    }));

    const res = await request(app)
      .post('/vat-check')
      .set('x-user-id', 'user-1')
      .send({ vatNumber });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      valid: true,
      name: 'ACME SRL',
      rawAddress: 'VIA ROMA 1 00100 ROMA IT',
    });

    vi.unstubAllGlobals();
  });

  test('restituisce valid:false quando VIES dice invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: false }),
    }));

    const res = await request(app)
      .post('/vat-check')
      .set('x-user-id', 'user-1')
      .send({ vatNumber });

    expect(res.body.data.valid).toBe(false);
    vi.unstubAllGlobals();
  });

  test('fallback gracioso quando VIES non raggiungibile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const res = await request(app)
      .post('/vat-check')
      .set('x-user-id', 'user-1')
      .send({ vatNumber });

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.meta?.source).toBe('fallback');
    vi.unstubAllGlobals();
  });

  test('400 se vatNumber ha formato errato', async () => {
    const res = await request(app)
      .post('/vat-check')
      .set('x-user-id', 'user-1')
      .send({ vatNumber: 'abc' });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2.2 — Esegui il test, verifica che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customers.spec.ts
```

Atteso: FAIL su tutti i test `POST /vat-check`

- [ ] **Step 2.3 — Implementa l'endpoint in `customers.ts`**

Nella funzione `createCustomersRouter`, aggiungi prima della riga `return router;`:

```typescript
router.post('/vat-check', async (req: AuthRequest, res) => {
  const { vatNumber } = req.body as { vatNumber?: string };

  if (!vatNumber || !/^\d{11}$/.test(vatNumber)) {
    return res.status(400).json({
      success: false,
      error: 'Formato P.IVA non valido (11 cifre numeriche)',
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const viesRes = await fetch(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/IT/vat/${vatNumber}`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!viesRes.ok) {
      return res.json({ success: true, data: { valid: true }, meta: { source: 'fallback' } });
    }

    const viesData = await viesRes.json() as { valid?: boolean; name?: string; address?: string };

    return res.json({
      success: true,
      data: {
        valid: viesData.valid ?? true,
        name: viesData.name || undefined,
        rawAddress: viesData.address || undefined,
      },
    });
  } catch {
    return res.json({ success: true, data: { valid: true }, meta: { source: 'fallback' } });
  }
});
```

- [ ] **Step 2.4 — Esegui i test, verifica che passano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customers.spec.ts
```

Atteso: PASS su tutti i test `POST /vat-check`

- [ ] **Step 2.5 — Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Atteso: nessun errore

- [ ] **Step 2.6 — Commit**

```bash
git add archibald-web-app/backend/src/routes/customers.ts \
        archibald-web-app/backend/src/routes/customers.spec.ts
git commit -m "feat(customers): POST /vat-check — validazione P.IVA via VIES

Endpoint stateless che chiama il registro VIES EU (~500ms). Ritorna
ragione sociale e indirizzo grezzo per autofill immediato nel wizard.
Fallback gracioso se VIES non raggiungibile."
```

---

## Task 3 — Backend: `POST /api/customers/interactive/begin`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.ts`
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.spec.ts`

- [ ] **Step 3.1 — Scrivi test failing**

In `customer-interactive.spec.ts`, aggiungi dopo i test esistenti:

```typescript
describe('POST /interactive/begin', () => {
  test('ritorna sessionId immediatamente e avvia bot in background', async () => {
    const mockBot = createMockBot();
    const app = createTestApp(mockBot);

    const res = await request(app)
      .post('/interactive/begin')
      .set('x-user-id', 'user-1')
      .send({ vatNumber: '12345678901' });

    expect(res.status).toBe(200);
    expect(res.body.data.sessionId).toBeTruthy();
  });

  test('400 se vatNumber mancante', async () => {
    const mockBot = createMockBot();
    const app = createTestApp(mockBot);

    const res = await request(app)
      .post('/interactive/begin')
      .set('x-user-id', 'user-1')
      .send({});

    expect(res.status).toBe(400);
  });

  test('chiama submitVatAndReadAutofill con il vatNumber corretto', async () => {
    const mockBot = createMockBot();
    const app = createTestApp(mockBot);

    await request(app)
      .post('/interactive/begin')
      .set('x-user-id', 'user-1')
      .send({ vatNumber: '12345678901' });

    // Aspetta che il background task completi
    await new Promise(r => setTimeout(r, 50));

    expect(mockBot.submitVatAndReadAutofill).toHaveBeenCalledWith('12345678901');
  });

  test('broadcast CUSTOMER_VAT_RESULT dopo validazione ERP', async () => {
    const mockBot = createMockBot();
    const broadcasts: unknown[] = [];
    const app = createTestApp(mockBot, (userId, msg) => broadcasts.push(msg));

    await request(app)
      .post('/interactive/begin')
      .set('x-user-id', 'user-1')
      .send({ vatNumber: '12345678901' });

    await new Promise(r => setTimeout(r, 50));

    const vatResult = broadcasts.find((b: any) => b.type === 'CUSTOMER_VAT_RESULT');
    expect(vatResult).toBeTruthy();
  });
});
```

> **Nota:** `createTestApp` nell'interactive.spec.ts accetta già un secondo parametro `broadcast?`. Se la firma attuale non lo accetta, aggiornala per accettarlo come opzionale con default `() => {}`.

- [ ] **Step 3.2 — Esegui il test, verifica che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customer-interactive.spec.ts
```

Atteso: FAIL su tutti i test `POST /interactive/begin`

- [ ] **Step 3.3 — Implementa `begin` in `customer-interactive.ts`**

Nella funzione `createCustomerInteractiveRouter`, aggiungi prima del `return router;` finale:

```typescript
router.post('/begin', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { vatNumber } = req.body as { vatNumber?: string };

    if (!vatNumber) {
      return res.status(400).json({ success: false, error: 'vatNumber obbligatorio' });
    }

    const existing = sessionManager.getActiveSessionForUser(userId);
    if (existing) {
      const hadSyncsPaused = sessionManager.isSyncsPaused(existing.sessionId);
      await sessionManager.removeBot(existing.sessionId);
      sessionManager.destroySession(existing.sessionId);
      if (hadSyncsPaused) resumeSyncs();
    }

    const sessionId = sessionManager.createSession(userId);
    res.json({ success: true, data: { sessionId }, message: 'Sessione avviata' });

    (async () => {
      let bot: CustomerBotLike | null = null;
      try {
        sessionManager.updateState(sessionId, 'starting');
        await pauseSyncs();
        sessionManager.markSyncsPaused(sessionId, true);

        bot = createBot(userId);
        await bot.initialize();
        await bot.navigateToNewCustomerForm();
        sessionManager.setBot(sessionId, bot);
        sessionManager.updateState(sessionId, 'erp_validating');

        const vatResult = await bot.submitVatAndReadAutofill(vatNumber);
        sessionManager.setVatResult(sessionId, vatResult);

        broadcast(userId, {
          type: 'CUSTOMER_VAT_RESULT',
          payload: { sessionId, vatResult },
          timestamp: now(),
        });
      } catch (error) {
        if (bot) try { await bot.close(); } catch { /* ignore */ }
        if (sessionManager.isSyncsPaused(sessionId)) {
          sessionManager.markSyncsPaused(sessionId, false);
          resumeSyncs();
        }
        sessionManager.setError(
          sessionId,
          error instanceof Error ? error.message : 'Errore begin',
        );
        broadcast(userId, {
          type: 'CUSTOMER_INTERACTIVE_FAILED',
          payload: { sessionId, error: error instanceof Error ? error.message : 'Errore sconosciuto' },
          timestamp: now(),
        });
      }
    })();
  } catch (error) {
    logger.error('Error in /begin', { error });
    res.status(500).json({ success: false, error: 'Errore interno' });
  }
});
```

- [ ] **Step 3.4 — Esegui i test, verifica che passano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customer-interactive.spec.ts
```

Atteso: PASS su tutti

- [ ] **Step 3.5 — Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

- [ ] **Step 3.6 — Commit**

```bash
git add archibald-web-app/backend/src/routes/customer-interactive.ts \
        archibald-web-app/backend/src/routes/customer-interactive.spec.ts
git commit -m "feat(customer-interactive): POST /begin — avvio bot + validazione VAT in background

Nuovo endpoint che rimpiazza la sequenza start+vat nel flow di creazione.
Ritorna sessionId immediatamente; bot login + navigazione + ERP VAT
validation avvengono in background con broadcast CUSTOMER_VAT_RESULT."
```

---

## Task 4 — Frontend: `customers.service.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/services/customers.service.ts`

- [ ] **Step 4.1 — Aggiungi `checkVat()` al service**

Trova il metodo `startInteractiveSession()` (riga ~208) e aggiungi **prima** di esso:

```typescript
async checkVat(vatNumber: string): Promise<{
  valid: boolean;
  name?: string;
  rawAddress?: string;
  source?: string;
}> {
  const response = await fetchWithRetry('/api/customers/vat-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vatNumber }),
  });
  if (!response.ok) throw new Error(`vat-check failed: ${response.status}`);
  const data = await response.json();
  return {
    valid: data.data?.valid ?? true,
    name: data.data?.name,
    rawAddress: data.data?.rawAddress,
    source: data.meta?.source,
  };
}
```

- [ ] **Step 4.2 — Aggiungi `beginInteractiveSession()`**

Aggiungi subito dopo `checkVat()`:

```typescript
async beginInteractiveSession(vatNumber: string): Promise<{ sessionId: string }> {
  const response = await fetchWithRetry('/api/customers/interactive/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vatNumber }),
  });
  if (!response.ok) throw new Error(`begin session failed: ${response.status}`);
  const data = await response.json();
  return { sessionId: data.data?.sessionId || '' };
}
```

- [ ] **Step 4.3 — Fix tipo `saveInteractiveCustomer()`**

Trova `async saveInteractiveCustomer(sessionId: string, formData: { name: string; vatNumber?: string; ...})` e sostituisci l'intero parametro `formData` con il tipo completo:

```typescript
async saveInteractiveCustomer(
  sessionId: string,
  formData: import('../types/customer-form-data').CustomerFormData,
): Promise<{ customer: Customer | null; taskId: string | null }>
```

- [ ] **Step 4.4 — Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Atteso: nessun errore

- [ ] **Step 4.5 — Commit**

```bash
git add archibald-web-app/frontend/src/services/customers.service.ts
git commit -m "feat(customers.service): checkVat, beginInteractiveSession, fix saveInteractiveCustomer"
```

---

## Task 5 — Frontend: `CustomerCreateModal.tsx` — riscrittura completa

**File:** `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

Questo task riscrive il file intero. L'approccio è: sostituire il contenuto esistente con l'implementazione pulita. I subtask mostrano le sezioni da costruire; alla fine il file è completo e testato.

### Task 5a — Tipi, costanti, stato

- [ ] **Step 5a.1 — Sostituisci il tipo `StepType` con `WizardStep` pulito**

Elimina la definizione di `FieldDef`, `FIELDS_BEFORE_ADDRESS_QUESTION`, `INITIAL_FORM` (mantienila), `StepType` e sostituisci con:

```typescript
type WizardStep =
  | { kind: 'vat' }
  | { kind: 'anagrafica' }
  | { kind: 'indirizzo' }
  | { kind: 'contatti' }
  | { kind: 'commerciale' }
  | { kind: 'indirizzi-alt' }
  | { kind: 'riepilogo' };

const STEP_ORDER: WizardStep['kind'][] = [
  'vat', 'anagrafica', 'indirizzo', 'contatti', 'commerciale', 'indirizzi-alt', 'riepilogo',
];

const STEP_LABELS: Record<WizardStep['kind'], string> = {
  'vat':          'Partita IVA',
  'anagrafica':   'Anagrafica',
  'indirizzo':    'Indirizzo',
  'contatti':     'Contatti',
  'commerciale':  'Dati commerciali',
  'indirizzi-alt': 'Indirizzi alternativi',
  'riepilogo':    'Riepilogo',
};
```

- [ ] **Step 5a.2 — Aggiorna le prop del componente**

Mantieni `CustomerCreateModalProps` identico all'attuale (no breaking changes su `isOpen`, `onClose`, `onSaved`, `contextMode`, `prefillName`).

- [ ] **Step 5a.3 — Sostituisci le variabili di stato**

Nella funzione `CustomerCreateModal`, rimuovi tutti gli `useState` esistenti e sostituisci con:

```typescript
const [currentStep, setCurrentStep] = useState<WizardStep>({ kind: 'vat' });
const [formData, setFormData] = useState<CustomerFormData>({ ...INITIAL_FORM });
const formDataRef = useRef<CustomerFormData>({ ...INITIAL_FORM });

// Bot session
const [interactiveSessionId, setInteractiveSessionId] = useState<string | null>(null);
const interactiveSessionIdRef = useRef<string | null>(null);
const [erpValidated, setErpValidated] = useState(false);

// VAT step
const [vatChecking, setVatChecking] = useState(false);
const [vatError, setVatError] = useState<string | null>(null);
const [vatFallbackWarning, setVatFallbackWarning] = useState(false);

// CAP disambiguation (inline, non uno step separato)
const [capDisambigEntries, setCapDisambigEntries] = useState<CapEntry[]>([]);
const [altAddressCapDisambig, setAltAddressCapDisambig] = useState<CapEntry[] | null>(null);

// Indirizzi alternativi
const [localAddresses, setLocalAddresses] = useState<AddressEntry[]>([]);
const [showAddressForm, setShowAddressForm] = useState(false);
const [addressForm, setAddressForm] = useState<AddressEntry>({
  tipo: 'Consegna', via: '', cap: '', citta: '', nome: '',
});

// Payment terms search (nello step commerciale)
const [paymentTermsSearch, setPaymentTermsSearch] = useState('');
const [paymentTermsHighlight, setPaymentTermsHighlight] = useState(0);

// Save / processing
const [saving, setSaving] = useState(false);
const [pendingSave, setPendingSave] = useState(false); // attesa ERP validation prima del save
const [processingState, setProcessingState] = useState<ProcessingState>('idle');
const [taskId, setTaskId] = useState<string | null>(null);
const [progress, setProgress] = useState(0);
const [progressLabel, setProgressLabel] = useState('');
const [botError, setBotError] = useState<string | null>(null);
const [error, setError] = useState<string | null>(null);
```

- [ ] **Step 5a.4 — Aggiorna `useEffect` di sync ref**

```typescript
useEffect(() => { formDataRef.current = formData; }, [formData]);
useEffect(() => { interactiveSessionIdRef.current = interactiveSessionId; }, [interactiveSessionId]);
```

### Task 5b — Reset, navigazione, heartbeat

- [ ] **Step 5b.1 — Reset all'apertura del modal**

```typescript
useEffect(() => {
  if (isOpen) {
    setCurrentStep({ kind: 'vat' });
    const initial = { ...INITIAL_FORM };
    if (prefillName) initial.name = prefillName;
    setFormData(initial);
    setInteractiveSessionId(null);
    setErpValidated(false);
    setVatChecking(false);
    setVatError(null);
    setVatFallbackWarning(false);
    setCapDisambigEntries([]);
    setAltAddressCapDisambig(null);
    setLocalAddresses([]);
    setShowAddressForm(false);
    setAddressForm({ tipo: 'Consegna', via: '', cap: '', citta: '', nome: '' });
    setPaymentTermsSearch('');
    setPaymentTermsHighlight(0);
    setSaving(false);
    setPendingSave(false);
    setProcessingState('idle');
    setTaskId(null);
    setProgress(0);
    setProgressLabel('');
    setBotError(null);
    setError(null);
  } else {
    if (interactiveSessionIdRef.current) {
      customerService.cancelInteractiveSession(interactiveSessionIdRef.current).catch(() => {});
    }
  }
}, [isOpen, prefillName]);
```

- [ ] **Step 5b.2 — Navigazione `goForward` / `goBack`**

```typescript
const goForward = () => {
  const idx = STEP_ORDER.indexOf(currentStep.kind);
  if (idx < STEP_ORDER.length - 1) setCurrentStep({ kind: STEP_ORDER[idx + 1] });
};

const goBack = () => {
  const idx = STEP_ORDER.indexOf(currentStep.kind);
  if (idx > 0) setCurrentStep({ kind: STEP_ORDER[idx - 1] });
};
```

- [ ] **Step 5b.3 — Heartbeat**

```typescript
useEffect(() => {
  if (!interactiveSessionId) return;
  const timer = setInterval(() => {
    customerService.heartbeat(interactiveSessionId);
  }, 45_000); // ridotto da 120s a 45s
  return () => clearInterval(timer);
}, [interactiveSessionId]);
```

- [ ] **Step 5b.4 — Subscriptions WebSocket**

```typescript
useEffect(() => {
  if (!interactiveSessionId) return;
  const unsubs: Array<() => void> = [];

  unsubs.push(
    subscribe('CUSTOMER_VAT_RESULT', (payload: any) => {
      if (payload.sessionId !== interactiveSessionIdRef.current) return;
      const r = payload.vatResult as VatLookupResult;
      setErpValidated(true);
      // Onda 2: auto-fill solo se il campo è ancora vuoto (non sovrascrive l'utente)
      setFormData(prev => ({
        ...prev,
        fiscalCode:     prev.fiscalCode     || (r.parsed?.internalId ?? ''),
        pec:            prev.pec            || r.pec            || '',
        sdi:            prev.sdi            || r.sdi            || '',
        street:         prev.street         || r.parsed?.street || '',
        postalCode:     prev.postalCode     || r.parsed?.postalCode || '',
        postalCodeCity: prev.postalCodeCity || r.parsed?.city   || '',
      }));
    }),
  );

  unsubs.push(
    subscribe('CUSTOMER_INTERACTIVE_FAILED', (payload: any) => {
      if (payload.sessionId !== interactiveSessionIdRef.current) return;
      // erpValidated rimane false → al save userà fallback fresh-bot
    }),
  );

  return () => unsubs.forEach(u => u());
}, [interactiveSessionId, subscribe]);
```

- [ ] **Step 5b.5 — Job progress listener (per processing state)**

```typescript
useEffect(() => {
  if (!taskId) return;
  let resolved = false;
  let cancelled = false;

  waitForJobViaWebSocket(taskId, {
    subscribe,
    maxWaitMs: 180_000,
    skipSafetyPoll: true,
    onProgress: (p, label) => {
      if (!resolved && !cancelled) { setProgress(p); setProgressLabel(label ?? 'Elaborazione...'); }
    },
  }).then(() => {
    if (cancelled) return;
    resolved = true;
    setProcessingState('completed');
    setProgress(100);
    setProgressLabel('Completato');
    setTimeout(() => { onSaved(); onClose(); }, 2000);
  }).catch((err) => {
    if (cancelled) return;
    resolved = true;
    setProcessingState('failed');
    setBotError(err instanceof Error ? err.message : 'Operazione fallita');
  });

  return () => { cancelled = true; };
}, [taskId, subscribe, onSaved, onClose]);
```

- [ ] **Step 5b.6 — `pendingSave` useEffect: attende erpValidated o timeout 60s**

```typescript
// Quando pendingSave=true e erpValidated diventa true → esegui il save
useEffect(() => {
  if (pendingSave && erpValidated) {
    setPendingSave(false);
    void performSave();
  }
}, [pendingSave, erpValidated]);

// Timeout: se erpValidated non arriva entro 60s → procedi comunque (fallback fresh-bot)
useEffect(() => {
  if (!pendingSave) return;
  const timeout = setTimeout(() => {
    setPendingSave(false);
    void performSave();
  }, 60_000);
  return () => clearTimeout(timeout);
}, [pendingSave]);
```

### Task 5c — Logica VAT e save

- [ ] **Step 5c.1 — `handleVerifyVat`**

```typescript
const handleVerifyVat = async () => {
  const vat = formData.vatNumber.trim();
  if (!vat) return;

  setVatChecking(true);
  setVatError(null);
  setVatFallbackWarning(false);

  try {
    // Onda 1: registro esterno (~500ms), non blocca su ERP
    const result = await customerService.checkVat(vat);

    if (!result.valid) {
      setVatError('P.IVA non valida — verifica il numero inserito');
      return;
    }

    if (result.source === 'fallback') setVatFallbackWarning(true);

    // Auto-fill onda 1: solo se il campo nome è vuoto
    if (result.name) {
      setFormData(f => ({ ...f, name: f.name || result.name! }));
    }

    // Avanza subito — non aspetta ERP
    setCurrentStep({ kind: 'anagrafica' });

    // Background: avvia bot + validazione ERP (solo in standalone)
    if (contextMode !== 'order') {
      customerService.beginInteractiveSession(vat)
        .then(({ sessionId }) => setInteractiveSessionId(sessionId))
        .catch(() => { /* erpValidated rimane false, fallback al save */ });
    }
  } catch {
    setVatError('Errore durante la verifica. Riprova.');
  } finally {
    setVatChecking(false);
  }
};
```

- [ ] **Step 5c.2 — `performSave` (la logica effettiva di salvataggio)**

```typescript
const performSave = async () => {
  setSaving(true);
  setError(null);
  setBotError(null);

  try {
    const dataToSend: CustomerFormData = { ...formData, addresses: localAddresses };

    let resultTaskId: string | null = null;

    if (interactiveSessionId) {
      const result = await customerService.saveInteractiveCustomer(interactiveSessionId, dataToSend);
      resultTaskId = result.taskId;
    } else {
      const result = await customerService.createCustomer(dataToSend);
      resultTaskId = result.taskId;
    }

    if (resultTaskId) {
      setTaskId(resultTaskId);
      setProcessingState('processing');
      setProgress(5);
      setProgressLabel('Avvio operazione...');
    } else {
      onSaved();
      onClose();
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Errore durante il salvataggio');
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 5c.3 — `handleSave` (entry point dal pulsante Riepilogo)**

```typescript
const handleSave = () => {
  // Se ERP non ha ancora validato la P.IVA (e c'è una sessione attiva),
  // aspetta fino a 60s prima di chiamare performSave
  if (!erpValidated && interactiveSessionId && contextMode !== 'order') {
    setSaving(true);
    setPendingSave(true); // triggerato da useEffect
    return;
  }
  void performSave();
};

const handleRetry = () => {
  setProcessingState('idle');
  setBotError(null);
  setProgress(0);
  setProgressLabel('');
  setTaskId(null);
  void performSave();
};
```

### Task 5d — Step VAT rendering

- [ ] **Step 5d.1 — Rendering step VAT**

Nel blocco return del componente, il rendering è un switch sull'unico `currentStep.kind`. Inizia con:

```typescript
if (!isOpen) return null;

const stepIndex = STEP_ORDER.indexOf(currentStep.kind);
const isProcessing = processingState !== 'idle';

// --- MODAL SHELL (identica all'attuale: fixed overlay, responsive sizing) ---
return (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: isMobile ? 'white' : 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
    justifyContent: 'center', zIndex: 10000,
    backdropFilter: isMobile ? 'none' : 'blur(4px)',
    overflowY: isMobile ? 'auto' : 'visible',
    ...(!isMobile ? modalOverlayKeyboardStyle : {}),
  }}>
    <div style={{
      backgroundColor: '#fff',
      borderRadius: isMobile ? '0' : '16px',
      padding: isMobile ? '12px 16px' : '32px',
      maxWidth: isMobile ? '100%' : (isDesktop ? '580px' : '500px'),
      width: isMobile ? '100%' : '90%',
      minHeight: isMobile ? '100dvh' : 'auto',
      maxHeight: isMobile ? 'none' : '90vh',
      overflowY: isMobile ? 'visible' : 'auto',
      boxShadow: isMobile ? 'none' : '0 20px 60px rgba(0,0,0,0.3)',
      ...(!isMobile ? keyboardPaddingStyle : {}),
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Handle mobile */}
      {isMobile && <div style={{ width: '36px', height: '3px', background: '#d1d5db', borderRadius: '2px', margin: '0 auto 12px' }} />}

      {/* Pulsante chiudi */}
      {!isProcessing && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} aria-label="Chiudi" style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: '#999', borderRadius: '50%', marginTop: '-16px', marginRight: '-16px' }}>&#x2715;</button>
        </div>
      )}

      {/* Header con step counter (per tutti gli step non-processing) */}
      {!isProcessing && currentStep.kind !== 'vat' && (
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#333', marginBottom: '6px' }}>Nuovo Cliente</h2>
          <p style={{ fontSize: '13px', color: '#999' }}>
            Passo {stepIndex} di {STEP_ORDER.length - 1}
            {isDesktop && <span style={{ color: '#64748b', marginLeft: '8px' }}>— {STEP_LABELS[currentStep.kind]}</span>}
          </p>
          {/* Progress bar */}
          <div style={{ marginTop: '8px', height: '3px', backgroundColor: '#e0e0e0', borderRadius: '2px' }}>
            <div style={{ width: `${(stepIndex / (STEP_ORDER.length - 1)) * 100}%`, height: '100%', backgroundColor: '#1976d2', borderRadius: '2px', transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* ── STEP VAT ──────────────────────────────────────────────────── */}
      {currentStep.kind === 'vat' && !isProcessing && (
        <div>
          <div style={{ marginBottom: '24px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#333', marginBottom: '8px' }}>Nuovo Cliente</h2>
            <p style={{ fontSize: '14px', color: '#999' }}>Inserisci la Partita IVA per verificare i dati</p>
          </div>
          {vatFallbackWarning && (
            <div style={{ padding: '10px 14px', backgroundColor: '#fff8e1', border: '1px solid #ffc107', borderRadius: '8px', fontSize: '13px', color: '#f57f17', marginBottom: '12px' }}>
              Dati fiscali non disponibili — compilare manualmente
            </div>
          )}
          <label style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: '#333', marginBottom: '8px' }}>Partita IVA</label>
          <input
            autoComplete="off"
            type="text"
            value={formData.vatNumber}
            onChange={e => setFormData(f => ({ ...f, vatNumber: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter' && formData.vatNumber.trim()) { e.preventDefault(); void handleVerifyVat(); } }}
            onFocus={e => scrollFieldIntoView(e.target as HTMLElement)}
            maxLength={11}
            placeholder="es. 06104510653"
            style={{ width: '100%', padding: '14px 16px', fontSize: '18px', border: '2px solid #1976d2', borderRadius: '12px', outline: 'none', boxSizing: 'border-box' }}
          />
          {vatError && (
            <div style={{ marginTop: '10px', padding: '10px 14px', backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '8px', color: '#f44336', fontSize: '14px' }}>
              {vatError}
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button onClick={() => { setCurrentStep({ kind: 'anagrafica' }); }} style={{ flex: 1, padding: '14px', fontSize: '15px', fontWeight: 600, backgroundColor: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' }}>
              Salta
            </button>
            <button
              onClick={() => void handleVerifyVat()}
              disabled={vatChecking || !formData.vatNumber.trim()}
              style={{ flex: 1, padding: '14px', fontSize: '15px', fontWeight: 700, backgroundColor: (vatChecking || !formData.vatNumber.trim()) ? '#ccc' : '#1976d2', color: '#fff', border: 'none', borderRadius: '8px', cursor: vatChecking || !formData.vatNumber.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {vatChecking && <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
              {vatChecking ? 'Verifica...' : 'Verifica'}
            </button>
          </div>
        </div>
      )}
```

### Task 5e — Steps Anagrafica, Indirizzo, Contatti, Commerciale

- [ ] **Step 5e.1 — Step ANAGRAFICA**

Aggiungi dopo il blocco VAT:

```typescript
      {/* ── STEP ANAGRAFICA ─────────────────────────────────────────── */}
      {currentStep.kind === 'anagrafica' && !isProcessing && (
        <div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Nome / Ragione sociale *</label>
            <input autoComplete="off" type="text" value={formData.name}
              onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
              onFocus={e => scrollFieldIntoView(e.target as HTMLElement)}
              placeholder="Es. Rossi Dr. Mario"
              style={{ width: '100%', padding: '12px 14px', fontSize: '16px', border: '2px solid #1976d2', borderRadius: '10px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Codice Fiscale</label>
            <input autoComplete="off" type="text" value={formData.fiscalCode || ''}
              onChange={e => setFormData(f => ({ ...f, fiscalCode: e.target.value.toUpperCase() }))}
              onFocus={e => scrollFieldIntoView(e.target as HTMLElement)}
              maxLength={16} placeholder="Auto-compilato dalla P.IVA"
              style={{ width: '100%', padding: '12px 14px', fontSize: '15px', border: '1.5px solid #ddd', borderRadius: '10px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Settore</label>
            <select value={formData.sector || ''} onChange={e => setFormData(f => ({ ...f, sector: e.target.value }))}
              style={{ width: '100%', padding: '12px 14px', fontSize: '15px', border: '1.5px solid #ddd', borderRadius: '10px', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff' }}>
              <option value="">— nessuno —</option>
              <option value="concessionari">Concessionari</option>
              <option value="Spett. Laboratorio Odontotecnico">Lab. Odontotecnico</option>
              <option value="Spett. Studio Dentistico">Studio Dentistico</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
            <button onClick={goBack} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, backgroundColor: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' }}>Indietro</button>
            <button onClick={() => { if (!formData.name.trim()) return; goForward(); }} disabled={!formData.name.trim()}
              style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 700, backgroundColor: formData.name.trim() ? '#1976d2' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', cursor: formData.name.trim() ? 'pointer' : 'not-allowed' }}>
              Avanti →
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 5e.2 — Step INDIRIZZO (con CAP disambiguation inline)**

```typescript
      {/* ── STEP INDIRIZZO ──────────────────────────────────────────── */}
      {currentStep.kind === 'indirizzo' && !isProcessing && (
        <div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Via e civico</label>
            <input autoComplete="off" type="text" value={formData.street}
              onChange={e => setFormData(f => ({ ...f, street: e.target.value }))}
              onFocus={e => scrollFieldIntoView(e.target as HTMLElement)}
              placeholder="Es. Via Roma 1"
              style={{ width: '100%', padding: '12px 14px', fontSize: '15px', border: '1.5px solid #ddd', borderRadius: '10px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: capDisambigEntries.length > 0 ? '0' : '14px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>CAP</label>
              <input autoComplete="off" type="text" value={formData.postalCode}
                onChange={e => {
                  const cap = e.target.value;
                  setFormData(f => ({ ...f, postalCode: cap, postalCodeCity: '', postalCodeCountry: '', county: '', state: '', country: '' }));
                  setCapDisambigEntries([]);
                  // Resolve CAP inline quando 5 cifre digitate
                  if (cap.length === 5) {
                    const entries = CAP_BY_CODE.get(cap);
                    if (entries && entries.length === 1) {
                      setFormData(f => ({ ...f, postalCode: cap, postalCodeCity: entries[0].citta, postalCodeCountry: entries[0].paese, county: entries[0].contea, state: entries[0].stato }));
                    } else if (entries && entries.length > 1) {
                      setCapDisambigEntries(entries);
                    }
                  }
                }}
                onFocus={e => scrollFieldIntoView(e.target as HTMLElement)}
                maxLength={5} placeholder="Es. 80100"
                style={{ width: '100%', padding: '12px 14px', fontSize: '15px', border: '1.5px solid #ddd', borderRadius: capDisambigEntries.length > 0 ? '10px 10px 0 0' : '10px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Città</label>
              <input autoComplete="off" type="text" value={formData.postalCodeCity}
                onChange={e => setFormData(f => ({ ...f, postalCodeCity: e.target.value }))}
                onFocus={e => scrollFieldIntoView(e.target as HTMLElement)}
                placeholder="Auto da CAP"
                style={{ width: '100%', padding: '12px 14px', fontSize: '15px', border: '1.5px solid #ddd', borderRadius: '10px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          {/* CAP disambiguation inline */}
          {capDisambigEntries.length > 0 && (
            <div style={{ border: '1.5px solid #1976d2', borderTop: 'none', borderRadius: '0 0 10px 10px', marginBottom: '14px', overflow: 'hidden' }}>
              {capDisambigEntries.map((entry, i) => (
                <div key={`${entry.citta}-${i}`}
                  onClick={() => {
                    setFormData(f => ({ ...f, postalCodeCity: entry.citta, postalCodeCountry: entry.paese, county: entry.contea, state: entry.stato }));
                    setCapDisambigEntries([]);
                  }}
                  style={{ padding: '10px 14px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#fff', borderBottom: i < capDisambigEntries.length - 1 ? '1px solid #f0f0f0' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e3f2fd')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
                >
                  <span style={{ fontWeight: 700 }}>{entry.citta}</span>
                  <span style={{ color: '#666' }}> ({entry.contea})</span>
                </div>
              ))}
            </div>
          )}
          {formData.postalCodeCity && (
            <div style={{ padding: '8px 12px', background: '#f0f7ff', borderRadius: '8px', fontSize: '13px', color: '#1976d2', marginBottom: '14px' }}>
              📍 {[formData.postalCodeCity, formData.county].filter(Boolean).join(' · ')}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
            <button onClick={goBack} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, backgroundColor: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' }}>Indietro</button>
            <button onClick={goForward} style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 700, backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Avanti →</button>
          </div>
        </div>
      )}
```

- [ ] **Step 5e.3 — Step CONTATTI**

```typescript
      {/* ── STEP CONTATTI ───────────────────────────────────────────── */}
      {currentStep.kind === 'contatti' && !isProcessing && (
        <div>
          {([
            { key: 'phone',  label: 'Telefono',  type: 'tel',   placeholder: '+39 0...' },
            { key: 'mobile', label: 'Cellulare', type: 'tel',   placeholder: '+39 3...' },
            { key: 'email',  label: 'E-mail',    type: 'email', placeholder: 'email@dominio.it' },
            { key: 'url',    label: 'Sito web',  type: 'url',   placeholder: 'https://...' },
            { key: 'pec',    label: 'PEC',       type: 'email', placeholder: 'pec@pec.it' },
            { key: 'sdi',    label: 'SDI',       type: 'text',  placeholder: '0000000', maxLength: 7 },
          ] as const).map(({ key, label, type, placeholder, maxLength }) => (
            <div key={key} style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '4px' }}>{label}</label>
              <input autoComplete="off" type={type}
                value={(formData as any)[key] || ''}
                onChange={e => {
                  const v = key === 'sdi' ? e.target.value.toUpperCase() : e.target.value;
                  setFormData(f => {
                    const next = { ...f, [key]: v };
                    if (key === 'pec' && v.trim() && !f.sdi) next.sdi = '0000000';
                    return next;
                  });
                }}
                onFocus={e => scrollFieldIntoView(e.target as HTMLElement)}
                placeholder={placeholder}
                maxLength={maxLength}
                style={{ width: '100%', padding: '10px 12px', fontSize: '15px', border: '1.5px solid #ddd', borderRadius: '8px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
            <button onClick={goBack} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, backgroundColor: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' }}>Indietro</button>
            <button onClick={goForward} style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 700, backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Avanti →</button>
          </div>
        </div>
      )}
```

- [ ] **Step 5e.4 — Step COMMERCIALE (con payment terms searchable)**

```typescript
      {/* ── STEP COMMERCIALE ────────────────────────────────────────── */}
      {currentStep.kind === 'commerciale' && !isProcessing && (() => {
        const filtered = paymentTermsSearch
          ? PAYMENT_TERMS.filter(t => t.id.toLowerCase().includes(paymentTermsSearch.toLowerCase()) || t.descrizione.toLowerCase().includes(paymentTermsSearch.toLowerCase()))
          : PAYMENT_TERMS;
        return (
          <div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>All'attenzione di</label>
              <input autoComplete="off" type="text" value={formData.attentionTo || ''}
                onChange={e => setFormData(f => ({ ...f, attentionTo: e.target.value }))}
                onFocus={e => scrollFieldIntoView(e.target as HTMLElement)}
                placeholder="Nome referente (opzionale)" maxLength={50}
                style={{ width: '100%', padding: '12px 14px', fontSize: '15px', border: '1.5px solid #ddd', borderRadius: '10px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Modalità di consegna</label>
              <select value={formData.deliveryMode} onChange={e => setFormData(f => ({ ...f, deliveryMode: e.target.value }))}
                style={{ width: '100%', padding: '12px 14px', fontSize: '15px', border: '1.5px solid #ddd', borderRadius: '10px', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff' }}>
                {DELIVERY_MODES.map(dm => <option key={dm.value} value={dm.value}>{dm.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Termini di pagamento</label>
              <input autoComplete="off" type="search" value={paymentTermsSearch}
                onChange={e => { setPaymentTermsSearch(e.target.value); setPaymentTermsHighlight(0); }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setPaymentTermsHighlight(h => Math.min(h + 1, filtered.length - 1)); }
                  if (e.key === 'ArrowUp')   { e.preventDefault(); setPaymentTermsHighlight(h => Math.max(h - 1, 0)); }
                  if (e.key === 'Enter' && filtered.length > 0) { e.preventDefault(); setFormData(f => ({ ...f, paymentTerms: filtered[paymentTermsHighlight].id })); setPaymentTermsSearch(''); }
                }}
                onFocus={e => scrollFieldIntoView(e.target as HTMLElement)}
                placeholder="Cerca per codice o descrizione..."
                style={{ width: '100%', padding: '10px 14px', fontSize: '15px', border: '1.5px solid #1976d2', borderRadius: filtered.length > 0 ? '8px 8px 0 0' : '8px', outline: 'none', boxSizing: 'border-box' }} />
              {paymentTermsSearch && (
                <div style={{ border: '1.5px solid #1976d2', borderTop: 'none', borderRadius: '0 0 8px 8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {filtered.map((t, i) => (
                    <div key={t.id} onClick={() => { setFormData(f => ({ ...f, paymentTerms: t.id })); setPaymentTermsSearch(''); setPaymentTermsHighlight(0); }}
                      style={{ padding: '8px 14px', fontSize: '14px', cursor: 'pointer', backgroundColor: i === paymentTermsHighlight ? '#e3f2fd' : '#fff', borderBottom: i < filtered.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                      <span style={{ fontWeight: 700, color: '#1976d2' }}>{t.id}</span> <span style={{ color: '#666' }}>— {t.descrizione}</span>
                    </div>
                  ))}
                </div>
              )}
              {formData.paymentTerms && !paymentTermsSearch && (
                <div style={{ marginTop: '6px', fontSize: '13px', color: '#4caf50', fontWeight: 600 }}>
                  Selezionato: {(() => { const t = PAYMENT_TERMS.find(x => x.id === formData.paymentTerms); return t ? `${t.id} — ${t.descrizione}` : formData.paymentTerms; })()}
                </div>
              )}
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Note / Memo</label>
              <textarea value={formData.notes || ''} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                placeholder="Note interne (opzionale)" rows={3} maxLength={4000}
                style={{ width: '100%', padding: '12px 14px', fontSize: '15px', border: '1.5px solid #ddd', borderRadius: '10px', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <button onClick={goBack} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, backgroundColor: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' }}>Indietro</button>
              <button onClick={goForward} style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 700, backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Avanti →</button>
            </div>
          </div>
        );
      })()}
```

### Task 5f — Step Indirizzi alternativi

- [ ] **Step 5f.1 — Step INDIRIZZI-ALT**

```typescript
      {/* ── STEP INDIRIZZI-ALT ──────────────────────────────────────── */}
      {currentStep.kind === 'indirizzi-alt' && !isProcessing && (
        <div>
          {localAddresses.length === 0 && !showAddressForm && (
            <div style={{ color: '#9e9e9e', marginBottom: '12px', fontSize: '14px' }}>Nessun indirizzo alternativo aggiunto</div>
          )}
          {localAddresses.map((addr, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', marginBottom: '8px', backgroundColor: '#f5f5f5', borderRadius: '8px', fontSize: '14px' }}>
              <span><strong>{addr.tipo}</strong>{addr.via ? ` — ${addr.via}` : ''}{addr.cap ? `, ${addr.cap}` : ''}{addr.citta ? ` ${addr.citta}` : ''}</span>
              <button onClick={() => setLocalAddresses(prev => prev.filter((_, i) => i !== idx))}
                style={{ padding: '4px 10px', fontSize: '13px', fontWeight: 600, backgroundColor: '#fff', color: '#f44336', border: '1px solid #f44336', borderRadius: '6px', cursor: 'pointer' }}>
                Elimina
              </button>
            </div>
          ))}
          {showAddressForm && (
            <div style={{ padding: '12px', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', marginBottom: '12px' }}>
              {/* Tipo */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Tipo *</label>
                <select value={addressForm.tipo} onChange={e => setAddressForm(f => ({ ...f, tipo: e.target.value }))}
                  style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc' }}>
                  <option>Consegna</option><option>Ufficio</option><option>Fattura</option><option>Indir. cons. alt.</option>
                </select>
              </div>
              {/* Via */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Via e civico</label>
                <input autoComplete="off" type="text" value={addressForm.via ?? ''} onChange={e => setAddressForm(f => ({ ...f, via: e.target.value }))}
                  style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>
              {/* CAP con disambiguation inline */}
              <div style={{ marginBottom: altAddressCapDisambig ? '0' : '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>CAP</label>
                <input autoComplete="off" type="text" value={addressForm.cap ?? ''}
                  onChange={e => {
                    const cap = e.target.value;
                    setAddressForm(f => ({ ...f, cap, citta: '', contea: '', stato: '' }));
                    setAltAddressCapDisambig(null);
                    if (cap.length === 5) {
                      const entries = CAP_BY_CODE.get(cap);
                      if (entries && entries.length === 1) setAddressForm(f => ({ ...f, cap, citta: entries[0].citta, contea: entries[0].contea, stato: entries[0].stato }));
                      else if (entries && entries.length > 1) setAltAddressCapDisambig(entries);
                    }
                  }}
                  style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: altAddressCapDisambig ? '6px 6px 0 0' : '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>
              {altAddressCapDisambig && (
                <div style={{ border: '1px solid #ccc', borderTop: 'none', borderRadius: '0 0 6px 6px', marginBottom: '8px', overflow: 'hidden' }}>
                  {altAddressCapDisambig.map((entry, i) => (
                    <div key={i} onClick={() => { setAddressForm(f => ({ ...f, citta: entry.citta, contea: entry.contea, stato: entry.stato })); setAltAddressCapDisambig(null); }}
                      style={{ padding: '8px 12px', fontSize: '14px', cursor: 'pointer', borderBottom: i < altAddressCapDisambig.length - 1 ? '1px solid #eee' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}>
                      {entry.citta} ({entry.contea})
                    </div>
                  ))}
                </div>
              )}
              {/* Città (editabile) */}
              {!altAddressCapDisambig && (
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Città</label>
                  <input autoComplete="off" type="text" value={addressForm.citta ?? ''} onChange={e => setAddressForm(f => ({ ...f, citta: e.target.value }))}
                    style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>
              )}
              {/* Nome */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Nome (opzionale)</label>
                <input autoComplete="off" type="text" value={addressForm.nome ?? ''} onChange={e => setAddressForm(f => ({ ...f, nome: e.target.value }))}
                  style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { if (!addressForm.tipo) return; setLocalAddresses(prev => [...prev, { ...addressForm }]); setShowAddressForm(false); setAddressForm({ tipo: 'Consegna', via: '', cap: '', citta: '', nome: '' }); setAltAddressCapDisambig(null); }}
                  style={{ padding: '8px 16px', fontSize: '14px', fontWeight: 600, backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Conferma</button>
                <button onClick={() => { setShowAddressForm(false); setAddressForm({ tipo: 'Consegna', via: '', cap: '', citta: '', nome: '' }); setAltAddressCapDisambig(null); }}
                  style={{ padding: '8px 16px', fontSize: '14px', fontWeight: 600, backgroundColor: '#fff', color: '#757575', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }}>Annulla</button>
              </div>
            </div>
          )}
          {!showAddressForm && (
            <button onClick={() => setShowAddressForm(true)}
              style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 600, backgroundColor: '#fff', color: '#1976d2', border: '2px dashed #1976d2', borderRadius: '8px', cursor: 'pointer', marginBottom: '16px' }}>
              + Aggiungi indirizzo
            </button>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <button onClick={goBack} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, backgroundColor: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' }}>Indietro</button>
            <button onClick={goForward} style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 700, backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Avanti →</button>
          </div>
        </div>
      )}
```

### Task 5g — Step Riepilogo e Processing state

- [ ] **Step 5g.1 — Step RIEPILOGO**

```typescript
      {/* ── STEP RIEPILOGO ──────────────────────────────────────────── */}
      {currentStep.kind === 'riepilogo' && !isProcessing && (
        <div>
          {/* Banner ERP validation in corso */}
          {!erpValidated && interactiveSessionId && contextMode !== 'order' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', backgroundColor: '#fff8e1', border: '1px solid #ffc107', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#f57f17' }}>
              <div style={{ width: '14px', height: '14px', flexShrink: 0, border: '2px solid rgba(245,127,23,0.3)', borderTop: '2px solid #f57f17', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Connessione al gestionale in corso...
            </div>
          )}
          {/* Riepilogo dati per sezioni */}
          <div style={{ backgroundColor: '#f5f5f5', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            {[
              { label: 'P.IVA', value: formData.vatNumber },
              { label: 'Nome', value: formData.name },
              { label: 'Codice Fiscale', value: formData.fiscalCode },
              { label: 'Settore', value: formData.sector },
              { label: 'Via', value: formData.street },
              { label: 'CAP / Città', value: [formData.postalCode, formData.postalCodeCity].filter(Boolean).join(' ') },
              { label: 'Telefono', value: formData.phone },
              { label: 'Cellulare', value: formData.mobile },
              { label: 'Email', value: formData.email },
              { label: 'Sito web', value: formData.url },
              { label: 'PEC', value: formData.pec },
              { label: 'SDI', value: formData.sdi },
              { label: 'All\'attenzione di', value: formData.attentionTo },
              { label: 'Modalità consegna', value: formData.deliveryMode },
              { label: 'Termini pagamento', value: (() => { const t = PAYMENT_TERMS.find(x => x.id === formData.paymentTerms); return t ? `${t.id} — ${t.descrizione}` : formData.paymentTerms; })() },
              { label: 'Note', value: formData.notes },
            ].filter(row => row.value).map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #e0e0e0', fontSize: '14px' }}>
                <span style={{ color: '#666', fontWeight: 600 }}>{row.label}</span>
                <span style={{ color: '#333', maxWidth: '60%', textAlign: 'right', wordBreak: 'break-word' }}>{row.value}</span>
              </div>
            ))}
            {localAddresses.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#616161', marginBottom: '4px' }}>Indirizzi alternativi</div>
                {localAddresses.map((addr, i) => (
                  <div key={i} style={{ fontSize: '13px', color: '#424242' }}>{addr.tipo}{addr.via ? ` — ${addr.via}` : ''}{addr.cap ? `, ${addr.cap}` : ''}{addr.citta ? ` ${addr.citta}` : ''}</div>
                ))}
              </div>
            )}
          </div>
          {error && (
            <div style={{ padding: '12px', backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '8px', color: '#f44336', marginBottom: '16px', fontSize: '14px' }}>{error}</div>
          )}
          <button onClick={handleSave} disabled={saving}
            style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: 700, backgroundColor: saving ? '#ccc' : '#4caf50', color: '#fff', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
            {saving && <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
            {saving ? 'In attesa del gestionale...' : 'Crea Cliente'}
          </button>
          <button onClick={goBack} disabled={saving}
            style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 600, backgroundColor: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', marginBottom: '8px' }}>
            Indietro
          </button>
          <button onClick={onClose} disabled={saving}
            style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 600, backgroundColor: '#fff', color: '#999', border: '1px solid #eee', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer' }}>
            Annulla
          </button>
        </div>
      )}
```

- [ ] **Step 5g.2 — Processing state UI**

```typescript
      {/* ── PROCESSING STATE ────────────────────────────────────────── */}
      {isProcessing && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#333', marginBottom: '8px' }}>
              {processingState === 'completed' ? 'Operazione completata' : processingState === 'failed' ? 'Errore' : 'Creazione in corso...'}
            </h2>
          </div>
          {processingState === 'processing' && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ height: '8px', backgroundColor: '#e0e0e0', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#1976d2', borderRadius: '4px', transition: 'width 0.5s ease' }} />
              </div>
              <p style={{ fontSize: '14px', color: '#666', textAlign: 'center' }}>{progressLabel || 'Elaborazione...'}</p>
              <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', marginTop: '4px' }}>{progress}%</p>
            </div>
          )}
          {processingState === 'completed' && (
            <div style={{ padding: '16px', backgroundColor: '#e8f5e9', border: '1px solid #4caf50', borderRadius: '8px', textAlign: 'center', marginBottom: '16px' }}>
              <p style={{ color: '#2e7d32', fontSize: '16px', fontWeight: 600 }}>Cliente creato con successo!</p>
              <p style={{ color: '#666', fontSize: '13px', marginTop: '4px' }}>Chiusura automatica...</p>
            </div>
          )}
          {processingState === 'failed' && (
            <div>
              <div style={{ padding: '16px', backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ color: '#c62828', fontSize: '14px' }}>{botError || 'Si è verificato un errore durante l\'operazione.'}</p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={handleRetry} style={{ flex: 1, padding: '14px', fontSize: '16px', fontWeight: 700, backgroundColor: '#ff9800', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Riprova</button>
                <button onClick={onClose} style={{ flex: 1, padding: '14px', fontSize: '16px', fontWeight: 700, backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Chiudi</button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  </div>
);
```

### Task 5h — Pulizia import e type-check

- [ ] **Step 5h.1 — Aggiorna gli import in cima al file**

Sostituisci l'intero blocco di import con:

```typescript
import { useState, useRef, useEffect } from 'react';
import { useKeyboardScroll } from '../hooks/useKeyboardScroll';
import { customerService } from '../services/customers.service';
import { PAYMENT_TERMS } from '../data/payment-terms';
import { DELIVERY_MODES } from '../data/delivery-modes';
import { CAP_BY_CODE } from '../data/cap-list';
import type { CapEntry } from '../data/cap-list';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { waitForJobViaWebSocket } from '../api/operations';
import type { CustomerFormData, AddressEntry } from '../types/customer-form-data';
import type { VatLookupResult } from '../types/vat-lookup-result';
```

Rimuovi import di `INITIAL_FORM` — spostalo inline o mantienilo nel file se già dichiarato.

> **Nota:** `DEFAULT_DELIVERY_MODE` e `DEFAULT_PAYMENT_TERM_ID` sono ancora usati in `INITIAL_FORM`. Aggiungili agli import se necessario.

- [ ] **Step 5h.2 — Rimuovi le variabili che non servono più**

Rimuovi dal file:
- `FIELDS_BEFORE_ADDRESS_QUESTION`
- `getCapCityDisplay` (non più usata)
- `getPaymentTermDisplay` standalone (ora inline nel riepilogo)
- `totalFieldsBefore`, `totalSteps`
- `currentStepNumber` (sostituito da `stepIndex`)
- Tutti i booleani `isVatInput`, `isVatProcessing`, `isFieldStep`, `isPaymentTermsStep`, `isCapDisambiguation`, `isSummary`, `isStepAnagrafica`, `isStepIndirizzo`, `isStepContatti`, `isStepCommerciale`, `isAddressesStep`, `isFirstStep`, `isInteractiveStep`
- `getCurrentField`, `currentField`
- `filteredPaymentTerms` (spostato inline nello step commerciale)
- `handlePaymentTermSelect` (logica inline)
- `handleCapDisambiguationSelect` (rimossa)
- `handleFieldChange` (rimossa)
- `pollingProfileRef`
- `earlyVatInput`, `earlyVatInputRef`
- `vatResult` state (non più necessario — l'autofill avviene direttamente in setFormData)
- `handleEditFields`, `handleVatReviewContinue`, `handleSkipVat` (rinominati/inline)
- `handleDiscard` (inline nel riepilogo)

- [ ] **Step 5h.3 — Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | head -30
```

Atteso: 0 errori. Se ci sono errori TS, risolverli prima di proseguire.

- [ ] **Step 5h.4 — Commit parziale**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "feat(CustomerCreateModal): riscrittura wizard 7 step puliti

Rimuove dual-system legacy (field-by-field + group-steps). Introduce
approccio D+C: vat-check VIES istantaneo + bot ERP in background.
CAP disambiguation inline. Autofill 2 ondate. ERP wait silenzioso."
```

---

## Task 6 — Frontend: aggiorna `CustomerCreateModal.spec.tsx`

**File:** `archibald-web-app/frontend/src/components/CustomerCreateModal.spec.tsx`

- [ ] **Step 6.1 — Aggiorna i mock del service nel file spec**

Sostituisci il blocco `vi.mock('../services/customers.service', ...)` con:

```typescript
vi.mock('../services/customers.service', () => ({
  customerService: {
    checkVat: vi.fn().mockResolvedValue({ valid: true, name: 'ACME SRL' }),
    beginInteractiveSession: vi.fn().mockResolvedValue({ sessionId: 'test-session' }),
    createCustomer: vi.fn().mockResolvedValue({ taskId: 'task-1' }),
    saveInteractiveCustomer: vi.fn().mockResolvedValue({ customer: null, taskId: 'task-1' }),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    cancelInteractiveSession: vi.fn().mockResolvedValue(undefined),
  },
}));
```

- [ ] **Step 6.2 — Aggiorna i test esistenti per i nuovi step kind**

Il test "renders the VAT input step" deve cercare `Partita IVA` e i pulsanti `Verifica` / `Salta`. Il test "renders the Salta button" rimane valido. Aggiusta eventuali test che cercano step kind vecchi (`vat-input`, `vat-processing`).

- [ ] **Step 6.3 — Aggiungi test per autofill onda 1**

```typescript
it('autofill nome da vat-check quando campo vuoto', async () => {
  const user = userEvent.setup();
  render(<CustomerCreateModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  const vatInput = screen.getByPlaceholderText(/06104510653/i);
  await user.type(vatInput, '12345678901');
  await user.click(screen.getByRole('button', { name: /Verifica/i }));

  await waitFor(() => {
    // Siamo passati ad anagrafica
    expect(screen.getByText(/Anagrafica/i)).toBeInTheDocument();
  });

  // Il campo nome deve essere pre-compilato con ACME SRL (da checkVat mock)
  expect((screen.getByPlaceholderText(/Rossi/i) as HTMLInputElement).value).toBe('ACME SRL');
});
```

- [ ] **Step 6.4 — Aggiungi test per skip VAT**

```typescript
it('salta VAT e avanza ad anagrafica senza chiamare checkVat', async () => {
  const { customerService } = await import('../services/customers.service');
  const user = userEvent.setup();
  render(<CustomerCreateModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: /Salta/i }));

  await waitFor(() => {
    expect(screen.getByText(/Nome \/ Ragione/i)).toBeInTheDocument();
  });
  expect(customerService.checkVat).not.toHaveBeenCalled();
  expect(customerService.beginInteractiveSession).not.toHaveBeenCalled();
});
```

- [ ] **Step 6.5 — Aggiungi test per P.IVA non valida**

```typescript
it('mostra errore se checkVat risponde valid:false', async () => {
  const { customerService } = await import('../services/customers.service');
  (customerService.checkVat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ valid: false });

  const user = userEvent.setup();
  render(<CustomerCreateModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />);

  const vatInput = screen.getByPlaceholderText(/06104510653/i);
  await user.type(vatInput, '12345678901');
  await user.click(screen.getByRole('button', { name: /Verifica/i }));

  await waitFor(() => {
    expect(screen.getByText(/P\.IVA non valida/i)).toBeInTheDocument();
  });
  // Rimane sul passo VAT
  expect(screen.queryByText(/Anagrafica/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 6.6 — Esegui tutti i test frontend**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerCreateModal
```

Atteso: tutti i test PASS

- [ ] **Step 6.7 — Esegui type-check finale**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Atteso: 0 errori su entrambi

- [ ] **Step 6.8 — Test completi**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -10
npm test --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Atteso: tutti PASS

- [ ] **Step 6.9 — Commit finale**

```bash
git add archibald-web-app/frontend/src/components/CustomerCreateModal.spec.tsx
git commit -m "test(CustomerCreateModal): aggiorna spec per wizard redesign

Nuovi mock per checkVat/beginInteractiveSession. Test per autofill
onda 1, skip VAT, errore P.IVA non valida."
```

---

## Self-review del piano

### Copertura spec

| Requisito spec | Task |
|---|---|
| POST /vat-check (VIES, ~500ms, fallback) | Task 2 |
| POST /interactive/begin (bot background) | Task 3 |
| saveSchema fix (7 campi mancanti) | Task 1 |
| InteractiveSessionState + erp_validating | Task 1 |
| WizardStep 7 tipi puliti | Task 5a |
| goForward/goBack lineare | Task 5b |
| Heartbeat 45s | Task 5b |
| VAT step: spinner inline, non bloccante | Task 5c + 5d |
| Autofill onda 1 (VIES, nome) | Task 5c |
| Autofill onda 2 (CUSTOMER_VAT_RESULT, CF/PEC/SDI/indirizzo) | Task 5b |
| Step Anagrafica | Task 5e |
| Step Indirizzo con CAP disambiguation inline | Task 5e |
| Step Contatti | Task 5e |
| Step Commerciale con payment terms search | Task 5e |
| Step Indirizzi Alt | Task 5f |
| Step Riepilogo con ERP wait banner | Task 5g |
| handleSave: pendingSave + useEffect 60s timeout | Task 5b + 5c |
| Processing state UI | Task 5g |
| Eliminazione codice legacy | Task 5h |
| saveInteractiveCustomer tipo completo | Task 4 |
| Test vat-check backend | Task 2 |
| Test begin backend | Task 3 |
| Test saveSchema fix | Task 1 |
| Test frontend wizard | Task 6 |
| contextMode="order": nessun beginInteractiveSession | Task 5c (handleVerifyVat) |

### Nessun placeholder trovato ✓

### Consistenza tipi ✓

- `WizardStep` definita in Task 5a, usata in 5b-5g
- `STEP_ORDER` e `STEP_LABELS` definiti in 5a, usati in 5b/5g
- `performSave` definita in 5c, chiamata da 5c e 5b (pendingSave useEffect)
- `handleSave` definita in 5c, chiamata nel bottone 5g
- `customerService.checkVat` aggiunto in Task 4, usato in Task 5c
- `customerService.beginInteractiveSession` aggiunto in Task 4, usato in Task 5c
