# Sync Resilience — Design Spec (2026-03-30)

## Problema

Tre bug distinti emergono dall'analisi delle notifiche anomalie sync:

### Bug 1 — Session expiry service-account (causa principale)

`sync-products` e `sync-prices` girano ogni 30 minuti con l'utente `service-account`.
Il `contextExpiryMs` del browser pool è 30 minuti (uguale all'intervallo sync).
La sessione ASP.NET dell'ERP scade server-side dopo ~20-30 minuti di inattività.

**Sequenza di fallimento:**
1. Prezzi gira → sessione fresca, tutto ok
2. Passa ~30 min senza attività service-account
3. Sessione ASP.NET scade server-side
4. Prodotti gira → `validateSession` controlla solo i cookie client-side → risponde "valid"
5. `page.goto(INVENTTABLE_ListView)` → ERP redirige silenziosamente a `/Login.aspx?ReturnUrl=...`
6. `findExportMenuSelector` cerca `li[id*="mainMenu_Menu_DXI"]` → non trova nulla sulla login page
7. Fallback a `#Vertical_mainMenu_Menu_DXI3_` hardcoded
8. `waitForSelector('#Vertical_mainMenu_Menu_DXI3_', { timeout: 10000 })` → **timeout 10s**
9. Context marcato unhealthy → rimosso dal pool
10. Prezzi riparte con fresh login → funziona

Il ciclo si ripete ogni 30 minuti.

**Prova**: prezzi usa stesso `service-account`, stesso `DXI3_`, stessa sessione — ma gira sempre DOPO prodotti. Dopo che prodotti fallisce il context viene invalidato e prezzi parte con fresh login. Nessuna anomalia prezzi nel DB.

### Bug 2 — Circuit breaker non rileva fallimenti shared sync

`syncProducts` (e `syncPrices`, `syncCustomers`, ecc.) wrappano tutti gli errori in `try/catch` e ritornano `{ success: false, error: '...' }` invece di fare throw.

`withAnomalyNotification` vede `success === false`, crea la notifica, e ritorna il risultato.
`operation-processor.ts` riceve il risultato senza eccezione → chiama `recordSuccess` → circuit breaker: `consecutive_failures = 0` nonostante i fallimenti.

**Prova**: `system.circuit_breaker` mostra `consecutive_failures=0`, `last_success_at=2026-03-30 13:41:46` per `sync-products` — esattamente il timestamp del fallimento.

### Bug 3 — CYCLE_SIZE_WARNING causa exit code 1

Il parser Python `parse-products-pdf.py` rileva che il ciclo è 5 pagine invece di 8 attese (il PDF esportato dall'ERP ha meno colonne — probabilmente per Column Chooser reset del 2026-03-29).

Il parser ADATTA il ciclo size (`self.PAGES_PER_CYCLE = detected`) e continua, ma se un'eccezione emerge durante il parsing (memoria, PDF corrotto, ecc.) `main()` esegue `sys.exit(1)`.

Il `PDFParserProductsService` TypeScript tratta exit code ≠ 0 come fallimento totale → sync prodotti fallisce anche se alcuni prodotti erano stati parsati.

---

## Soluzione

### Fix A — Riduzione `contextExpiryMs` per service-account (preventivo)

In `browser-pool.ts`, aggiungere un `serviceAccountContextExpiryMs` separato (default: 15 minuti).
In `acquireContext`, quando `isServiceUser(userId)` usa `serviceAccountContextExpiryMs` come soglia di età invece di `contextExpiryMs`.

Questo forza un fresh login ogni 15 minuti per service-account, prima che la sessione ASP.NET scada.

`isServiceUser(userId)` esiste già in `main.ts` — il criterio: `userId === 'service-account' || userId.endsWith('-service') || userId === 'sync-orchestrator'`.

### Fix B — Rilevamento redirect login in `downloadPDFExport` (fail-fast)

In `archibald-bot.ts`, dopo `page.goto(pageUrl, ...)`, controllare se la URL finale contiene `Login` (redirect a login page). Se sì, lanciare immediatamente `new Error('SessionExpiredError: ...')`.

Questo trasforma un timeout da 10s in un fail immediato con messaggio chiaro.

### Fix C — Retry automatico con fresh context (recovery)

Nei wrapper `downloadProductsPdf` e `downloadPricesPdf` di `main.ts`:
- Se l'errore contiene `SessionExpiredError`, la catch outer:
  1. Il context è già stato rilasciato come unhealthy dal `finally` interno
  2. Acquisisce un nuovo context (con fresh login)
  3. Riprova il download una sola volta

Pattern:
```
acquireContext → try download → finally releaseContext(healthy?)
                 catch SessionExpiredError:
                   acquireContext (fresh login) → try download → finally releaseContext
```

### Fix 2 — Circuit breaker corretto per shared sync

In `withAnomalyNotification`, dopo aver creato la notifica per `success === false`, fare throw dell'errore invece di ritornare il risultato. Questo fa sì che `operation-processor` esegua il proprio `catch`, chiami `recordFailure`, e brodcast `JOB_FAILED`.

Eccezione: se `r.error.includes('stop')` (sync fermato manualmente), NON fare throw.

### Fix 3 — Parser Python resiliente al cycle size change

**Python (`parse-products-pdf.py`)**: wrappare il ciclo interno di parsing (`for cycle in range(cycles)`) in un `try/except` per singolo ciclo. Se un ciclo fallisce, loggare su stderr e continuare con il ciclo successivo. Garantire che, se almeno un prodotto è stato parsato, il processo esca con code 0 e outputti il JSON.

Aggiungere anche: se `status == "CHANGED"`, loggare chiaramente i dettagli del nuovo layout (quali header sulle prime N pagine) per facilitare future diagnosi.

**TypeScript (`pdf-parser-products-service.ts`)**: se il Python esce con code ≠ 0 MA lo stderr contiene `CYCLE_SIZE_WARNING` con `status: "CHANGED"`, tentare di parsare stdout come JSON parziale. Se ha prodotti validi, loggare il warning e usare quei prodotti (non fallire il sync).

---

## File modificati

| File | Tipo modifica |
|------|--------------|
| `backend/src/bot/browser-pool.ts` | Fix A: aggiungere `serviceAccountContextExpiryMs` |
| `backend/src/bot/archibald-bot.ts` | Fix B: detect login redirect |
| `backend/src/main.ts` | Fix C + Fix 2: retry wrapper + withAnomalyNotification throw |
| `scripts/parse-products-pdf.py` | Fix 3: resilienza per-cycle exception |
| `backend/src/pdf-parser-products-service.ts` | Fix 3: graceful CYCLE_SIZE_WARNING |

---

## Test

### Fix A
- `browser-pool.spec.ts`: context service-account scade a 15 min, context agent scade a 30 min

### Fix B
- `archibald-bot.ts`: difficile testare unitariamente (richiede browser). Coperto da test di integrazione Fix C.

### Fix 2
- `main.spec.ts`: `withAnomalyNotification` con handler che ritorna `{success: false}` → verifica che lanci eccezione dopo la notifica

### Fix 3
- `pdf-parser-products-service.spec.ts`: spawn Python con PDF mock 5-pagine → verifica che i prodotti vengano ritornati nonostante CYCLE_SIZE_WARNING

---

## Non incluso in questo spec

- Migrazione products sync da PDF a HTML scraping (issue separata, richiede spec dedicata)
- Investigazione root cause Column Chooser reset che ha causato il 5-page cycle (dato passato, già avvenuto)
