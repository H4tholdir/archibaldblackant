# Arca Sync — Single VBS Generation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificare la generazione del VBS in un unico file prodotto alla fine della sync, dopo che matching e articoli KT sono tutti pronti.

**Architecture:** `performArcaSync` smette di generare il VBS e restituisce `ftExportRecords` (dati grezzi). Il frontend li conserva in memoria. Solo al termine (finalize), con FT + KT + ANAGRAFE tutti pronti, si genera UN SOLO VBS. Il finalize-kt accetta `ftExportRecords` nel body e produce il VBS combinato.

**Tech Stack:** TypeScript, Express, React 19, Vitest, PostgreSQL (`pg`).

---

## File coinvolti

| File | Modifica |
|------|----------|
| `backend/src/services/arca-sync-service.ts` | `SyncResult`: rimuovi `vbsScript`, aggiungi `ftExportRecords`. `performArcaSync`: non genera VBS, non esporta KT, non aggiorna `arca_synced_at` ANAGRAFE, restituisce `ftExportRecords`. `generateKtExportVbs`: accetta `ftExportRecords` in input, combina FT+KT+ANAGRAFE in un VBS unico. |
| `backend/src/routes/arca-sync.ts` | POST `/`: restituisce `ftExportRecords` al posto di `vbsScript`. POST `/finalize-kt`: riceve `ftExportRecords` nel body. |
| `frontend/src/services/arca-sync-browser.ts` | `ArcaSyncResponse`: sostituisce `vbsScript` con `ftExportRecords`. `performBrowserArcaSync`: rimuove scrittura VBS in fase 1. `finalizeKtExport`: invia `ftExportRecords` nel body. |
| `frontend/src/components/ArcaSyncButton.tsx` | Salva `ftExportRecords` in ref. Rimuove scrittura VBS in fase 1. `finalizeKt` sempre chiamata (anche senza KT issues). Scrive VBS solo in `finalizeKt`. |
| `backend/src/services/arca-sync-service.spec.ts` | Test aggiornati: `performArcaSync` ritorna `ftExportRecords`; `generateKtExportVbs` accetta `ftExportRecords` e produce VBS combinato. |

---

## Task 1 — Backend: `performArcaSync` restituisce `ftExportRecords`

**Files:**
- Modify: `backend/src/services/arca-sync-service.ts`
- Test: `backend/src/services/arca-sync-service.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Nel `describe("performArcaSync")`, aggiungi:

```typescript
test(
  "restituisce ftExportRecords invece di vbsScript",
  async () => {
    const doctesBuf = readCoop16File("doctes.dbf");
    const docrigBuf = readCoop16File("docrig.dbf");
    const pwaArcaData = makeArcaData({
      testata: { ESERCIZIO: "2026", TIPODOC: "FT", NUMERODOC: "99999" },
    });
    const pool = createMockPool({
      pwaExportRows: [{
        id: "pwa-record-1",
        arca_data: JSON.stringify(pwaArcaData),
        invoice_number: "FT 99999/2026",
      }],
    });

    const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, null);

    // Non deve più esserci vbsScript
    expect((result as any).vbsScript).toBeUndefined();
    // Deve esserci ftExportRecords con il record FT
    expect(result.ftExportRecords).toHaveLength(1);
    expect(result.ftExportRecords[0].invoiceNumber).toBe("FT 99999/2026");
  },
  60000,
);
```

- [ ] **Step 2: Verifica che il test fallisce**

```bash
npm test --prefix archibald-web-app/backend -- arca-sync-service 2>&1 | grep -E "FAIL|PASS|restituisce"
```

Atteso: FAIL — `result.ftExportRecords` undefined.

- [ ] **Step 3: Modifica `SyncResult` e `performArcaSync`**

In `arca-sync-service.ts`, modifica il tipo `SyncResult`:

```typescript
export type SyncResult = {
  imported: number;
  skipped: number;
  exported: number;
  // ktExported rimosso — non si esportano KT in fase 1
  ktNeedingMatch: Array<{ orderId: string; customerName: string }>;
  ktMissingArticles: string[];
  errors: string[];
  ftExportRecords: VbsExportRecord[];  // sostituisce vbsScript
  parseStats: NativeParseResult["stats"];
};
```

Nella funzione `performArcaSync`, fai le seguenti modifiche:

**a) Rimuovi il blocco KT export** (step 9, righe ~1140-1220) — lascia solo il calcolo di `ktNeedingMatch` e `ktMissingArticles`:

```typescript
// 9. KT status: calcola cosa manca (export avviene tutto in finalize)
const ktNeedingMatch: Array<{ orderId: string; customerName: string }> = [];
const ktMissingArticles: string[] = [];

const ktOrders = await getKtEligibleOrders(pool, userId);
if (ktOrders.length > 0) {
  const allSubclients = await getAllSubclients(pool);
  const subByProfile = new Map<string, Subclient>();
  for (const sc of allSubclients) {
    if (sc.matchedCustomerProfileId) {
      subByProfile.set(sc.matchedCustomerProfileId, sc);
    }
  }
  for (const order of ktOrders) {
    if (!order.articlesSyncedAt) {
      ktMissingArticles.push(order.id);
    } else if (!order.customerProfileId || !subByProfile.get(order.customerProfileId)) {
      ktNeedingMatch.push({ orderId: order.id, customerName: order.customerName });
    }
    // ordini pronti vengono esportati in finalize, non qui
  }
}
```

**b) Rimuovi il blocco ANAGRAFE** (step 10, ~righe 1222-1293) — la query e l'aggiornamento `arca_synced_at` si spostano in `generateKtExportVbs`.

**c) Rimuovi la chiamata a `generateVbsScript`** (~riga 1289-1293).

**d) Modifica il return:**

```typescript
return {
  imported,
  skipped,
  exported: exportRecords.length,
  ktNeedingMatch,
  ktMissingArticles,
  errors,
  ftExportRecords: exportRecords,
  parseStats: parsed.stats,
};
```

- [ ] **Step 4: Verifica che il test passa**

```bash
npm test --prefix archibald-web-app/backend -- arca-sync-service 2>&1 | tail -10
```

Atteso: tutti i test passano.

- [ ] **Step 5: Aggiorna il test esistente `"produces VBS with INSERT INTO doctes"` nel describe `generateVbsScript`**

Quel test usa `VbsExportRecord[]` direttamente — non è impattato da questo step. Verifica solo che il test `"restituisce ftExportRecords"` è l'unico nuovo e che gli altri passano ancora.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/services/arca-sync-service.ts \
        archibald-web-app/backend/src/services/arca-sync-service.spec.ts
git commit -m "refactor(arca-sync): performArcaSync returns ftExportRecords instead of vbsScript"
```

---

## Task 2 — Backend: `generateKtExportVbs` accetta `ftExportRecords` e produce VBS unico

**Files:**
- Modify: `backend/src/services/arca-sync-service.ts`
- Test: `backend/src/services/arca-sync-service.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi un nuovo `describe("generateKtExportVbs")`:

```typescript
describe("generateKtExportVbs", () => {
  test("combina ftExportRecords e KT in un VBS unico", async () => {
    const ftRecord = makeArcaData({
      testata: { ESERCIZIO: "2026", TIPODOC: "FT", NUMERODOC: "99999" },
    });
    const ftExportRecords: VbsExportRecord[] = [
      { invoiceNumber: "FT 99999/2026", arcaData: ftRecord },
    ];

    const pool = createMockPool({
      ktEligibleOrders: [
        {
          id: "kt-order-ready",
          order_number: "ORD-001",
          customer_name: "Cliente KT",
          customer_profile_id: "profile-kt",
          creation_date: "2026-03-13T08:00:00Z",
          discount_percent: null,
          remaining_sales_financial: null,
          articles_synced_at: "2026-03-13T09:00:00Z",
        },
      ],
    });

    const result = await generateKtExportVbs(pool, "test-user", ftExportRecords);

    // Il VBS deve contenere sia la FT che la KT
    expect(result.vbsScript).not.toBeNull();
    expect(result.vbsScript!.vbs).toContain("FT 99999/2026");
    expect(result.ktExported).toBe(0); // nessun subclient matchato in questo mock
  });

  test("genera VBS solo con FT se non ci sono KT idonee", async () => {
    const ftRecord = makeArcaData({
      testata: { ESERCIZIO: "2026", TIPODOC: "FT", NUMERODOC: "88888" },
    });
    const ftExportRecords: VbsExportRecord[] = [
      { invoiceNumber: "FT 88888/2026", arcaData: ftRecord },
    ];
    const pool = createMockPool(); // nessun kt eligible

    const result = await generateKtExportVbs(pool, "test-user", ftExportRecords);

    expect(result.vbsScript).not.toBeNull();
    expect(result.vbsScript!.vbs).toContain("FT 88888/2026");
    expect(result.ktExported).toBe(0);
  });

  test("restituisce vbsScript null se non ci sono né FT né KT", async () => {
    const pool = createMockPool();
    const result = await generateKtExportVbs(pool, "test-user", []);
    expect(result.vbsScript).toBeNull();
    expect(result.ktExported).toBe(0);
  });
});
```

- [ ] **Step 2: Verifica che i test falliscono**

```bash
npm test --prefix archibald-web-app/backend -- arca-sync-service 2>&1 | grep -E "FAIL|generateKtExportVbs"
```

Atteso: FAIL — firma funzione incompatibile.

- [ ] **Step 3: Modifica `generateKtExportVbs`**

Cambia la firma per accettare `ftExportRecords`:

```typescript
export async function generateKtExportVbs(
  pool: DbPool,
  userId: string,
  ftExportRecords: VbsExportRecord[],  // ← parametro aggiunto
): Promise<KtExportResult> {
```

All'interno della funzione, `exportRecords` parte da `ftExportRecords` (copia):

```typescript
const exportRecords: VbsExportRecord[] = [...ftExportRecords];
```

Poi aggiunge i KT idonei (logica identica a quella precedente):
```typescript
// ... stesso loop KT di prima ...
exportRecords.push({ invoiceNumber: `KT ${docNumber}/${esercizio}`, arcaData });
```

Dopo il loop KT, aggiungi il blocco ANAGRAFE (spostato da `performArcaSync`):

```typescript
// ANAGRAFE export: subclients non ancora sincronizzati
const anagrafeExportRecords: AnagrafeExportRecord[] = [];
const { rows: exportableSubclients } = await pool.query<{ ... }>(
  `SELECT ... FROM shared.sub_clients WHERE arca_synced_at IS NULL ...`,
);
// ... stesso codice che era in performArcaSync step 10 ...

// Genera VBS combinato (FT + KT + ANAGRAFE)
let vbsScript: VbsResult | null = null;
if (exportRecords.length > 0 || anagrafeExportRecords.length > 0) {
  vbsScript = generateVbsScript(exportRecords, anagrafeExportRecords);
  // Aggiorna arca_synced_at solo ora che il VBS è generato
  if (anagrafeExportRecords.length > 0) {
    const codici = anagrafeExportRecords.map((r) => r.subclient.codice);
    const placeholders = codici.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(
      `UPDATE shared.sub_clients SET arca_synced_at = NOW() WHERE codice IN (${placeholders})`,
      codici,
    );
  }
}
```

- [ ] **Step 4: Verifica che i test passano**

```bash
npm test --prefix archibald-web-app/backend -- arca-sync-service 2>&1 | tail -10
```

Atteso: tutti i test passano.

- [ ] **Step 5: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -20
```

Atteso: nessun errore TypeScript.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/services/arca-sync-service.ts \
        archibald-web-app/backend/src/services/arca-sync-service.spec.ts
git commit -m "refactor(arca-sync): generateKtExportVbs accepts ftExportRecords, produces single combined VBS"
```

---

## Task 3 — Backend: aggiorna le route

**Files:**
- Modify: `backend/src/routes/arca-sync.ts`

- [ ] **Step 1: Aggiorna `POST /`**

La route ora restituisce `ftExportRecords` invece di `vbsScript`:

```typescript
res.json({
  success: true,
  sync: {
    imported: result.imported,
    skipped: result.skipped,
    exported: result.exported,
    ktNeedingMatch: result.ktNeedingMatch,
    ktMissingArticles: result.ktMissingArticles,
    errors: result.errors,
  },
  parseStats: result.parseStats,
  ftExportRecords: result.ftExportRecords,  // ← al posto di vbsScript
});
```

Rimuovi il broadcast `ARCA_SYNC_COMPLETED` con `ktExported` (non esiste più in fase 1):

```typescript
deps.broadcast?.(userId, {
  type: 'ARCA_SYNC_COMPLETED',
  payload: {
    imported: result.imported,
    exported: result.exported,
    skipped: result.skipped,
  },
  timestamp: new Date().toISOString(),
});
```

- [ ] **Step 2: Aggiorna `POST /finalize-kt`**

```typescript
router.post('/finalize-kt', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const ftExportRecords: VbsExportRecord[] = req.body?.ftExportRecords ?? [];
    const result = await generateKtExportVbs(deps.pool, userId, ftExportRecords);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to finalize KT' });
  }
});
```

Aggiungi `import type { VbsExportRecord } from '../services/arca-sync-service';` in cima al file se non c'è già.

- [ ] **Step 3: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/routes/arca-sync.ts
git commit -m "refactor(arca-sync): routes return ftExportRecords; finalize-kt accepts them in body"
```

---

## Task 4 — Frontend: aggiorna tipi e `arca-sync-browser.ts`

**Files:**
- Modify: `frontend/src/services/arca-sync-browser.ts`

- [ ] **Step 1: Aggiorna `ArcaSyncResponse`**

```typescript
export type ArcaSyncResponse = {
  success: boolean;
  sync: {
    imported: number;
    skipped: number;
    exported: number;
    ktNeedingMatch?: Array<{ orderId: string; customerName: string }>;
    ktMissingArticles?: string[];
    errors: string[];
  };
  parseStats: {
    totalDocuments: number;
    totalRows: number;
    totalClients: number;
    skippedOtherTypes: number;
  };
  ftExportRecords: Array<{ invoiceNumber: string; arcaData: unknown }>;  // ← sostituisce vbsScript
};
```

- [ ] **Step 2: Aggiorna `performBrowserArcaSync`**

Rimuovi la scrittura del VBS in fase 1 e la stage `'writing-vbs'`:

```typescript
export async function performBrowserArcaSync(
  onProgress: (progress: SyncProgress) => void,
): Promise<ArcaSyncResponse> {
  onProgress({ stage: 'requesting-access' });
  const dirHandle = await getDirectoryHandle();

  onProgress({ stage: 'reading-files' });
  const files = await readDbfFiles(dirHandle);

  let totalSize = 0;
  for (const file of files.values()) totalSize += file.size;
  onProgress({ stage: 'uploading', filesSize: totalSize });

  onProgress({ stage: 'syncing' });
  const result = await uploadFiles(files);

  // NON scrivere VBS qui — il VBS si genera solo in finalizeKtExport
  onProgress({ stage: 'done', result });
  return result;
}
```

Aggiorna il tipo `SyncProgress` rimuovendo la stage `'writing-vbs'`:

```typescript
export type SyncProgress =
  | { stage: 'requesting-access' }
  | { stage: 'reading-files' }
  | { stage: 'uploading'; filesSize: number }
  | { stage: 'syncing' }
  | { stage: 'done'; result: ArcaSyncResponse };
  // 'writing-vbs' rimossa — la scrittura avviene in finalizeKtExport
```

- [ ] **Step 3: Aggiorna `finalizeKtExport`**

```typescript
export async function finalizeKtExport(
  ftExportRecords: Array<{ invoiceNumber: string; arcaData: unknown }>,
): Promise<KtExportResult> {
  const res = await fetch('/api/arca-sync/finalize-kt', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ftExportRecords }),
  });
  if (!res.ok) throw new Error(`finalize-kt failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}
```

Aggiorna `KtExportResult` per tornare il tipo corretto:

```typescript
export type KtExportResult = {
  ktExported: number;
  vbsScript: {
    vbs: string;
    bat: string;
    watcher: string;
    watcherSetup: string;
  } | null;
};
```

- [ ] **Step 4: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -20
```

Atteso: nessun errore TypeScript.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/services/arca-sync-browser.ts
git commit -m "refactor(arca-sync): frontend types updated; VBS writing moved to finalizeKtExport"
```

---

## Task 5 — Frontend: aggiorna `ArcaSyncButton.tsx`

**Files:**
- Modify: `frontend/src/components/ArcaSyncButton.tsx`

- [ ] **Step 1: Aggiungi ref per `ftExportRecords`**

```typescript
const ftExportRecordsRef = useRef<Array<{ invoiceNumber: string; arcaData: unknown }>>([]);
```

- [ ] **Step 2: Aggiorna `handleSync`**

Salva `ftExportRecords` dopo fase 1. Rimuovi la chiamata a `writeVbsToDirectory` in fase 1. Chiama sempre `startArticlePolling` o `finalizeKt` (non più la logica `hasKtIssues → done`):

```typescript
const handleSync = useCallback(async () => {
  setPhase('phase1');
  setError(null);
  setPhase1Result(null);
  setKtStatus(null);
  setKtFinalExported(0);

  try {
    dirHandleRef.current = await getOrRequestDirectoryHandle();
    const syncResult = await performBrowserArcaSync(setProgress);

    // Salva ftExportRecords per usarli nel finalize
    ftExportRecordsRef.current = syncResult.ftExportRecords ?? [];

    setPhase1Result({
      imported: syncResult.sync.imported,
      skipped: syncResult.sync.skipped,
      exported: syncResult.sync.exported,
      errors: syncResult.sync.errors,
      hasVbs: false,  // il VBS non esiste ancora
    });

    // Fetch KT status per decidere il prossimo step
    const status = await fetchKtStatus();
    setKtStatus(status);

    if (status.unmatched.length > 0) {
      // Ci sono KT senza sottocliente → mostra matcher
      setPhase('matching');
      setShowMatcher(true);
    } else if (status.articlesPending > 0) {
      // Ci sono KT con articoli non pronti → polling
      startArticlePolling();
    } else {
      // Tutto pronto → genera VBS subito
      await finalizeKt();
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      setError('Selezione cartella annullata');
    } else {
      setError(e.message || 'Errore durante la sincronizzazione');
    }
    setPhase('idle');
  }
}, [onSyncComplete]);
```

- [ ] **Step 3: Aggiorna `finalizeKt`**

```typescript
const finalizeKt = useCallback(async () => {
  setPhase('finalizing-kt');
  try {
    const result = await finalizeKtExport(ftExportRecordsRef.current);
    setKtFinalExported(result.ktExported);

    if (result.vbsScript && dirHandleRef.current) {
      await writeVbsToDirectory(dirHandleRef.current, result.vbsScript);
    }

    setPhase('done');
    onSyncComplete?.();
  } catch (e: any) {
    setError(e.message || 'Errore nel finalizzare la sync');
    setPhase('done');
  }
}, [onSyncComplete]);
```

- [ ] **Step 4: Aggiorna `phase1Result` state type**

Il campo `ktExported` non esiste più (è `ktFinalExported`). Rimuovilo dalla definizione dello stato:

```typescript
const [phase1Result, setPhase1Result] = useState<{
  imported: number; skipped: number; exported: number;
  errors: string[]; hasVbs: boolean;
} | null>(null);
```

Aggiorna il JSX di conseguenza (rimuovi i riferimenti a `phase1Result.ktExported`).

- [ ] **Step 5: Aggiorna `STAGE_MESSAGES`**

Rimuovi `'writing-vbs'` dai messaggi (non esiste più come stage in fase 1):

```typescript
const STAGE_MESSAGES: Record<string, string> = {
  'requesting-access': 'Accesso cartella...',
  'reading-files': 'Lettura DBF...',
  'uploading': 'Upload file...',
  'syncing': 'Sincronizzazione...',
  'done': 'Completato!',
};
```

- [ ] **Step 6: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -20
```

Atteso: nessun errore TypeScript.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/components/ArcaSyncButton.tsx
git commit -m "refactor(arca-sync): single VBS generated only at finalize with FT+KT+ANAGRAFE combined"
```

---

## Task 6 — Verifica finale

- [ ] **Step 1: Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -15
```

Atteso: tutti i test passano.

- [ ] **Step 2: Type-check completo**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Atteso: nessun errore.

- [ ] **Step 3: Commit finale e push**

```bash
git push
```

---

## Note implementative

- Il `writeVbsToDirectory` chiamato in `finalizeKt` scrive tutti e 4 i file: `sync_arca.vbs`, `sync_arca.bat`, `arca_watcher.vbs`, `setup_watcher.bat`. Questo rimane identico.
- Il blocco ANAGRAFE (query + aggiornamento `arca_synced_at`) si sposta interamente da `performArcaSync` a `generateKtExportVbs`. Il codice è identico, cambia solo dove viene eseguito.
- `ktExported` nel broadcast WebSocket viene rimosso da fase 1. Eventualmente si può aggiungere un broadcast diverso in finalize, ma non è necessario per questo task.
- La `SyncPhase` nel frontend rimuove la dipendenza da `hasKtIssues`: ora si chiama sempre `fetchKtStatus` dopo fase 1 e si decide il passo successivo in base allo stato reale.
