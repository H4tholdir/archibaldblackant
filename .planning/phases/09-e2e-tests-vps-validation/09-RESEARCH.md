# Phase 9: E2E Tests & VPS Validation - Research

**Researched:** 2026-02-20
**Domain:** Playwright E2E testing su VPS Docker-based
**Confidence:** HIGH

<research_summary>
## Summary

Ricerca su come eseguire test E2E Playwright direttamente sul VPS (formicanera.com) dove la PWA Archibald è deployata via Docker Compose. L'infrastruttura è già parzialmente in place: Playwright v1.58.1 è installato nel frontend con una configurazione esistente e 2 file E2E con helpers multi-device.

Il problema principale è che la configurazione attuale è orientata allo sviluppo locale (baseURL localhost:5173, webServer auto-start Vite). Per il VPS serve una configurazione dedicata che punti all'app deployata (https://formicanera.com), senza webServer, con solo Chromium headless.

Approccio consigliato: usare l'immagine Docker ufficiale Playwright (`mcr.microsoft.com/playwright:v1.58.2-noble`) sul VPS per evitare problemi di dipendenze, con accesso alla rete Docker interna per testare l'app. I test vanno adattati perché i test E2E esistenti usano pesantemente IndexedDB (ArchibaldDB) per le verifiche — ma il refactoring ha eliminato IndexedDB per i dati applicativi, quindi quei test sono obsoleti e vanno riscritti con verifiche via API/DOM.

**Primary recommendation:** Creare una configurazione Playwright dedicata VPS (`playwright.vps.config.ts`) con baseURL `https://formicanera.com`, eseguire via Docker Playwright image sul VPS, con auth setup via storageState e verifiche tramite UI/API invece che IndexedDB.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | ^1.58.1 | E2E test framework | Già installato, standard de facto per E2E web testing |
| Chromium (headless) | bundled | Browser engine | Unico browser necessario per verifica una tantum |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Playwright Docker image | v1.58.2-noble | Runtime con tutte le dipendenze | Per eseguire i test sul VPS senza installare dipendenze OS |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Docker Playwright image | Install nativo su VPS | Nativo richiede ~7 librerie OS (libnss3, libatk-bridge2.0-0, libdrm2, libxcomposite1, libxdamage1, libxrandr2, libgbm1) — Docker è più pulito |
| Chromium only | Multi-browser (Firefox+WebKit) | Multi-browser non necessario per verifica una tantum, rallenta esecuzione |

### Existing Infrastructure
Già presente nel progetto:
- `archibald-web-app/frontend/playwright.config.ts` — configurazione locale
- `archibald-web-app/frontend/e2e/` — directory test con 2 file esistenti
- `archibald-web-app/frontend/e2e/helpers/multi-device.ts` — helpers per test multi-device
- `archibald-web-app/frontend/package.json` — script `test:e2e`, `test:e2e:ui`, `test:e2e:debug`
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Config VPS vs Config Locale
Servono due configurazioni separate:

**Locale (esistente):** `playwright.config.ts`
- baseURL: `http://localhost:5173`
- webServer: auto-start Vite
- 3 browser projects (chromium, firefox, webkit)

**VPS (da creare):** `playwright.vps.config.ts`
- baseURL: `https://formicanera.com` (o `http://archibald-frontend` da rete Docker)
- NO webServer (app già running via Docker Compose)
- Solo Chromium headless
- workers: 1 (VPS ha risorse limitate)
- retries: 0 (verifica una tantum, vogliamo risultati reali non retry mascherati)

```typescript
// playwright.vps.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // VPS ha risorse limitate
  retries: 0, // Verifica una tantum — nessun retry
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'https://formicanera.com',
    trace: 'on', // Sempre trace per debugging remoto
    screenshot: 'on', // Screenshot per ogni test
    headless: true,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  // NO webServer — app già deployata
});
```

### Pattern: Auth Setup con storageState
Playwright supporta auth setup dedicato che esegue il login una volta e salva lo stato. I test successivi partono già autenticati.

```typescript
// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/');

  // Fill login form
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', process.env.TEST_USER_USERNAME!);
  await page.fill('#password', process.env.TEST_USER_PASSWORD!);
  await page.click('button[type="submit"]');

  // Wait for JWT to be stored
  await page.waitForFunction(() => {
    return localStorage.getItem('archibald_jwt') !== null;
  }, { timeout: 30000 }); // Login triggers Puppeteer on backend, can be slow

  // Save auth state
  await page.context().storageState({ path: authFile });
});
```

### Pattern: Multi-Device Testing con Browser Contexts
Già in uso nel progetto. Due browser contexts indipendenti con deviceId diversi simulano due dispositivi.

```typescript
test('multi-device sync', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  // ... test real-time sync
});
```

### Pattern: Verifiche via DOM/API (non IndexedDB)
I test esistenti verificano lo stato via IndexedDB (`ArchibaldDB`). Dopo il refactoring, il backend è la source of truth. Le verifiche devono passare per:
1. **DOM assertions** — verificare che elementi visibili corrispondano allo stato atteso
2. **API calls dirette** — `page.request.get('/api/...')` per verificare stato backend
3. **WebSocket events** — `page.on('websocket')` per verificare eventi real-time

### Anti-Patterns to Avoid
- **IndexedDB come oracle** — dopo il refactoring, IndexedDB non è più la source of truth per i dati applicativi. I test esistenti che usano `indexedDB.open('ArchibaldDB')` sono obsoleti.
- **waitForTimeout() come sync mechanism** — usare `waitForFunction()` o `expect().toBeVisible()` con auto-wait di Playwright
- **Multi-browser per verifica una tantum** — Chromium basta, Firefox/WebKit aggiungono tempo senza valore per una verifica one-shot
- **retries > 0 per verifica** — i retry mascherano flaky behavior, per una verifica one-shot vogliamo risultati reali
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth state persistence | Custom login prima di ogni test | Playwright `storageState` con auth setup project | Login Archibald triggera Puppeteer sul backend (~10s), farlo per ogni test spreca tempo |
| Wait per sync real-time | `waitForTimeout(2000)` | `page.waitForFunction()` o `expect(locator).toBeVisible()` | waitForTimeout è flaky — troppo o troppo poco |
| Dipendenze Chromium su VPS | Install manuale libnss3, libatk, etc. | Docker image `mcr.microsoft.com/playwright:v1.58.2-noble` | L'immagine ha tutto pre-installato, evita broken dependencies |
| Verifica stato ordini | Query IndexedDB diretta | DOM assertions (`expect(locator).toContainText()`) o API (`page.request`) | IndexedDB non è più source of truth dopo refactoring |
| Screenshot debugging | Custom screenshot logic | Playwright built-in `screenshot: 'on'` + `trace: 'on'` | Trace viewer mostra timeline completa con screenshot, network, console |
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Test E2E Esistenti Usano IndexedDB Eliminato
**What goes wrong:** I 2 test E2E esistenti (`pending-realtime.spec.ts`) fanno query dirette a `indexedDB.open('ArchibaldDB')` con store `pendingOrders` e `draftOrders`. Dopo il refactoring che ha eliminato IndexedDB per i dati applicativi, questi test falliranno.
**Why it happens:** I test erano stati scritti prima del refactoring IndexedDB → backend-as-source-of-truth.
**How to avoid:** Riscrivere le verifiche usando DOM assertions (visibilità elementi nella pagina) e API calls (`page.request.get('/api/pending-orders')`). L'IndexedDB è ancora usato solo per il credential store crittografato (legittimo).
**Warning signs:** `indexedDB.open('ArchibaldDB')` nei test, riferimenti a store `pendingOrders`/`draftOrders`.

### Pitfall 2: Login Lento sul VPS (Puppeteer Backend)
**What goes wrong:** Il login di Archibald valida le credenziali lanciando un browser Puppeteer sul backend che si connette all'ERP esterno. Questo può richiedere 10-30 secondi.
**Why it happens:** È il flusso reale — non è un bug, è l'architettura dell'app.
**How to avoid:** Usare auth setup con `storageState` per fare il login una volta sola. Impostare timeout generosi (30-60s) per il setup auth. Non fare login in ogni test.
**Warning signs:** Timeout su `page.click('button[type="submit"]')` o sulla waitForFunction del JWT.

### Pitfall 3: Risorse VPS Limitate
**What goes wrong:** Il VPS esegue già Docker Compose (frontend, backend, PostgreSQL, Redis, Puppeteer, Nginx, Prometheus, Grafana). Aggiungere Playwright + Chromium può sovraccaricare il sistema.
**Why it happens:** Playwright Chromium è resource-intensive (~200-300MB RAM per istanza).
**How to avoid:** Usare `workers: 1`, `fullyParallel: false`, chiudere i contesti dopo ogni test. Per multi-device test, limitare a 2 contesti simultanei max.
**Warning signs:** OOM kills, test che si bloccano senza errori, timeout casuali.

### Pitfall 4: Docker Networking
**What goes wrong:** Se Playwright gira in un container Docker separato, potrebbe non raggiungere l'app se è sulla rete Docker interna (`archibald-net`).
**Why it happens:** I container Docker hanno network isolate per default.
**How to avoid:** Due opzioni: (1) usare `--network=host` per accedere a localhost, (2) connettere il container alla rete `archibald-net` e usare i nomi container come hostname. Oppure testare via URL pubblica `https://formicanera.com`.
**Warning signs:** `ERR_CONNECTION_REFUSED` o DNS resolution failures nel test.

### Pitfall 5: Service Worker Cache
**What goes wrong:** La PWA ha un service worker (Workbox) con cache StaleWhileRevalidate per JS/CSS. I test potrebbero vedere contenuto cached vecchio.
**Why it happens:** Il service worker è registrato con `registerType: 'autoUpdate'` e `skipWaiting: true`.
**How to avoid:** In Playwright config, disabilitare service worker con `serviceWorkers: 'block'` nel context o fare hard refresh. Oppure accettare il comportamento cached (è il comportamento reale dell'utente).
**Warning signs:** Test vedono UI vecchia, modifiche al frontend non riflesse nei test.
</common_pitfalls>

<code_examples>
## Code Examples

### Esecuzione Test su VPS via Docker
```bash
# SSH into VPS, poi:
docker run --rm \
  --network archibald_archibald-net \
  -v $(pwd)/archibald-web-app/frontend/e2e:/app/e2e \
  -v $(pwd)/archibald-web-app/frontend/playwright.vps.config.ts:/app/playwright.config.ts \
  -e BASE_URL=http://archibald-frontend \
  -e TEST_USER_USERNAME=... \
  -e TEST_USER_PASSWORD=... \
  mcr.microsoft.com/playwright:v1.58.2-noble \
  npx playwright test
```

### Esecuzione Nativa su VPS (alternativa)
```bash
# Install Node.js se non presente
# Install dipendenze
npx playwright install chromium --with-deps

# Run tests
BASE_URL=https://formicanera.com \
TEST_USER_USERNAME=... \
TEST_USER_PASSWORD=... \
npx playwright test --config=playwright.vps.config.ts
```

### Auth Setup con storageState
```typescript
// Source: Playwright official docs (storageState pattern)
// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', process.env.TEST_USER_USERNAME!);
  await page.fill('#password', process.env.TEST_USER_PASSWORD!);
  await page.click('button[type="submit"]');

  // Login triggers Puppeteer on backend — generous timeout
  await page.waitForFunction(
    () => localStorage.getItem('archibald_jwt') !== null,
    { timeout: 60000 }
  );

  await page.context().storageState({ path: authFile });
});
```

### Multi-Device Test con DOM Assertions (non IndexedDB)
```typescript
// Source: Playwright docs (browser contexts) + progetto esistente pattern
test('two devices see pending order in real-time', async ({ browser }) => {
  const deviceA = await browser.newContext({
    storageState: 'playwright/.auth/user.json'
  });
  const deviceB = await browser.newContext({
    storageState: 'playwright/.auth/user.json'
  });

  const pageA = await deviceA.newPage();
  const pageB = await deviceB.newPage();

  // Both devices on pending orders page
  await pageA.goto('/pending-orders');
  await pageB.goto('/pending-orders');

  // Device A creates order via UI...
  // Device B should see it appear via WebSocket
  await expect(pageB.locator('[data-testid="pending-order"]'))
    .toBeVisible({ timeout: 10000 });

  await deviceA.close();
  await deviceB.close();
});
```

### WebSocket Event Verification
```typescript
// Source: Playwright docs (page.on websocket)
test('WebSocket events propagate correctly', async ({ page }) => {
  const wsMessages: string[] = [];

  page.on('websocket', ws => {
    ws.on('framereceived', frame => {
      wsMessages.push(frame.payload as string);
    });
  });

  await page.goto('/');

  // Trigger action that should emit WebSocket event...

  // Verify WebSocket message received
  await page.waitForFunction(
    () => (window as any).__lastWsEvent !== undefined,
    { timeout: 5000 }
  );
});
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `npx playwright install` (all browsers) | `npx playwright install chromium --only-shell` | Playwright 1.46+ | Installa solo la headless shell (~50% meno spazio) |
| `waitForTimeout()` | `expect(locator).toBeVisible()` con auto-wait | Playwright 1.20+ | Auto-wait elimina flakiness |
| Custom login per ogni test | `storageState` + auth setup project | Playwright 1.28+ | Login una volta, riutilizza per tutti i test |
| Docker image generico + install | `mcr.microsoft.com/playwright:v1.58.2-noble` | Corrente | Immagine dedicata con tutte le dipendenze |
| `page.on('websocket')` solo passivo | `page.routeWebSocket()` per intercept/mock | Playwright 1.48+ | Può modificare messaggi WebSocket in transito |

**New tools/patterns:**
- **`--only-shell` flag**: Installa solo Chromium headless shell per CI/server — molto più leggero
- **`page.routeWebSocket()`**: Intercetta e modifica messaggi WebSocket — utile per mock in testing
- **Trace Viewer remoto**: `npx playwright show-trace trace.zip` per analizzare risultati post-esecuzione

**Deprecated/outdated:**
- **IndexedDB come test oracle**: L'app ha eliminato IndexedDB per i dati applicativi — le verifiche devono usare DOM/API
- **Multi-browser per verifica**: Per una verifica una tantum, Chromium-only è sufficiente
</sota_updates>

<open_questions>
## Open Questions

1. **Credenziali test per il login**
   - What we know: Il login valida contro l'ERP Archibald esterno via Puppeteer. Serve un utente reale.
   - What's unclear: Quale utente usare — l'utente del proprietario? Un utente whitelisted dedicato?
   - Recommendation: Usare le credenziali dell'utente dal VPS credentials file, passate come env vars

2. **Approccio Docker vs Nativo sul VPS**
   - What we know: Docker Playwright image ha tutte le dipendenze. VPS ha già Docker. Nativo richiede install di ~7 librerie OS.
   - What's unclear: Quanto è grande il VPS (RAM, CPU)? Docker Playwright image è ~1.5GB.
   - Recommendation: Provare Docker first, fallback a nativo se spazio disco è un problema

3. **Test contro URL pubblica vs rete Docker interna**
   - What we know: L'app è raggiungibile su `https://formicanera.com` (via Nginx SSL). Da rete Docker interna, il frontend è su `http://archibald-frontend`.
   - What's unclear: Se WebSocket funziona attraverso Nginx reverse proxy in test mode.
   - Recommendation: Usare URL pubblica `https://formicanera.com` — testa il percorso reale dell'utente
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Context7 `/microsoft/playwright.dev` — baseURL config, storageState, auth setup, multi-browser contexts, WebSocket testing
- Codebase analysis — playwright.config.ts, e2e/ directory, multi-device.ts helpers, docker-compose.yml
- Playwright official docs — Docker images, CI configuration, headless mode

### Secondary (MEDIUM confidence)
- BrowserStack guide "15 Best Practices for Playwright testing in 2026" — verified against official docs
- Playwright Docker docs — verified image tag `v1.58.2-noble` exists

### Tertiary (LOW confidence - needs validation)
- VPS resource constraints — inferred from docker-compose.yml (7 services), needs validation during execution
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Playwright v1.58.1 (already installed)
- Ecosystem: Playwright Docker image, storageState auth
- Patterns: VPS config, auth setup, multi-device contexts, DOM assertions vs IndexedDB
- Pitfalls: IndexedDB obsolete, login lento, risorse VPS, Docker networking, SW cache

**Confidence breakdown:**
- Standard stack: HIGH — Playwright già installato, versione verificata via Context7
- Architecture: HIGH — pattern storageState e multi-context da docs ufficiali
- Pitfalls: HIGH — IndexedDB obsolescence verificata dall'analisi codebase (refactoring Phase 1)
- Code examples: HIGH — da Context7 e pattern esistenti nel progetto

**Research date:** 2026-02-20
**Valid until:** 2026-03-22 (30 days — Playwright ecosystem stabile)
</metadata>

---

*Phase: 09-e2e-tests-vps-validation*
*Research completed: 2026-02-20*
*Ready for planning: yes*
