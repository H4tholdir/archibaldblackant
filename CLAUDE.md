# Archibald — Development Guidelines

## Implementation Best Practices

### 0 — Purpose

These rules ensure maintainability, safety, and developer velocity.
**MUST** rules are enforced by CI; **SHOULD** rules are strongly recommended.

---

### 0 — Memory Check (Prima di qualsiasi lavoro)

**Architettura memoria a due livelli:**

| Layer | Tipo di conoscenza | Chi scrive | Orizzonte |
|---|---|---|---|
| `memory/MEMORY.md` + file MD | Stabile: decisioni, pattern, fix diventati regole permanenti | Esplicito (noi) | Permanente |
| claude-mem (MCP, `~/.claude-mem`) | Episodica: scoperte di sessione, eventi, stato operativo recente | Automatico (osservazioni) | Settimane/mesi |

**Regola di non-sovrapposizione:** I due layer coprono tipi di conoscenza distinti — mai duplicare la stessa informazione in entrambi. Una scoperta episodica (claude-mem) va promossa a `memory/*.md` solo quando diventa una regola permanente del progetto.

**Conflitto:** Se claude-mem e `MEMORY.md` si contraddicono, `MEMORY.md` ha la precedenza (esplicito > emergente).

- **BP-0 (MUST)** Prima di iniziare qualsiasi lavoro (implementazione, modifica, analisi, debug):
  1. Leggi `memory/SESSION_ACTIVE.md` → contesto della sessione corrente (già iniettato all'avvio).
  2. Leggi `memory/MEMORY.md` → stato sprint e versione attuale.
  3. Identifica il dominio del task → leggi `memory/domains/[dominio].md` se esiste.
  4. Se il task tocca l'ERP → leggi `memory/erp-bible.md` PRIMA di tutto.
  5. Se il task coinvolge >2 file o navigazione strutturale → `graphify query "<domanda>"`.
  6. Considera le osservazioni iniettate da claude-mem (`## Relevant Past Work`) come contesto episodico.
  7. Presenta all'utente un riepilogo sintetico di cosa hai trovato ("Mi ricordo che...").
  8. Attendi conferma/correzione dall'utente prima di procedere.

**SESSION_ACTIVE (aggiornamento obbligatorio):**
Aggiorna `memory/SESSION_ACTIVE.md` dopo ogni blocco di lavoro significativo:
- Dopo ogni commit
- Dopo ogni decisione architetturale
- Dopo aver risolto un bug importante
- Prima di terminare una sessione lunga
Formato: sostituisci il file (non appendere), max 200 token, sezioni: Task corrente / Decisioni / Stato / Prossimo step.

**Promozione (push):** Se durante la sessione identifichi una scoperta che diventa regola permanente, proponi: "Vuoi promuovere X a memory/domains/[dominio].md?" oppure "Vuoi aggiornare PINNED.md?".

---

### 1 — Before Coding

- **BP-1 (MUST)** Ask the user clarifying questions.
- **BP-2 (SHOULD)** Draft and confirm an approach for complex work.
- **BP-3 (SHOULD)** If ≥ 2 approaches exist, list clear pros and cons.

---

### 2 — While Coding

- **C-1 (MUST)** Follow TDD: scaffold stub -> write failing test -> implement.
- **C-2 (MUST)** Name functions with existing domain vocabulary for consistency.
- **C-3 (SHOULD NOT)** Introduce classes when small testable functions suffice.
- **C-4 (SHOULD)** Prefer simple, composable, testable functions.
- **C-5 (MUST)** Prefer branded `type`s for IDs
  ```ts
  type UserId = Brand<string, 'UserId'>   // ✅ Good
  type UserId = string                    // ❌ Bad
  ```
- **C-6 (MUST)** Use `import type { … }` for type-only imports.
- **C-7 (SHOULD NOT)** Add comments that explain *what* the code does — i nomi lo fanno già. Aggiungi un commento solo quando il *perché* di una scelta non è ovvio: un vincolo nascosto, un invariante sottile, un workaround per un bug specifico, un pattern non intuitivo. Se rimuovere il commento non confonderebbe un lettore futuro, non scriverlo.
- **C-8 (SHOULD)** Default to `type`; use `interface` only when more readable or interface merging is required.
- **C-9 (SHOULD NOT)** Extract a new function unless it will be reused elsewhere, is the only way to unit-test otherwise untestable logic, or drastically improves readability of an opaque block.

---

### 3 — Testing

- **T-1 (MUST)** For a simple function, colocate unit tests in `*.spec.ts` in same directory as source file.
- **T-2 (MUST)** For any API change, add/extend integration tests.
- **T-3 (MUST)** ALWAYS separate pure-logic unit tests from DB-touching integration tests.
- **T-4 (SHOULD)** Prefer integration tests over heavy mocking.
- **T-5 (SHOULD)** Unit-test complex algorithms thoroughly.
- **T-6 (SHOULD)** Test the entire structure in one assertion if possible
  ```ts
  expect(result).toBe([value]) // Good

  expect(result).toHaveLength(1); // Bad
  expect(result[0]).toBe(value); // Bad
  ```

---

### 4 — Database

- **D-1 (MUST)** Use PostgreSQL via `pg` pool for database operations. Type DB helpers to accept the `DbPool` instance. Legacy test files may still use `better-sqlite3` in devDependencies.
- **D-2 (SHOULD)** Keep SQL queries readable and parameterized to prevent injection.

---

### 5 — Code Organization

- **O-1 (MUST)** Keep frontend and backend code strictly separated under `archibald-web-app/frontend` and `archibald-web-app/backend`.

---

### 6 — Tooling Gates

- **G-1 (MUST)** TypeScript type-check passes:
  - Frontend: `npm run type-check --prefix archibald-web-app/frontend`
  - Backend: `npm run build --prefix archibald-web-app/backend`
- **G-2 (MUST)** Tests pass:
  - Frontend: `npm test --prefix archibald-web-app/frontend`
  - Backend: `npm test --prefix archibald-web-app/backend`

---

### 7 - Git

- **GH-1 (MUST)** Use Conventional Commits format when writing commit messages: https://www.conventionalcommits.org/en/v1.0.0
- **GH-2 (SHOULD NOT)** Refer to Claude or Anthropic in commit messages.

---

## Writing Functions Best Practices

When evaluating whether a function you implemented is good or not, use this checklist:

1. Can you read the function and HONESTLY easily follow what it's doing? If yes, then stop here.
2. Does the function have very high cyclomatic complexity? (number of independent paths, or, in a lot of cases, number of nesting if if-else as a proxy). If it does, then it's probably sketchy.
3. Are there any common data structures and algorithms that would make this function much easier to follow and more robust? Parsers, trees, stacks / queues, etc.
4. Are there any unused parameters in the function?
5. Are there any unnecessary type casts that can be moved to function arguments?
6. Is the function easily testable without mocking core features (e.g. sql queries, redis, etc.)? If not, can this function be tested as part of an integration test?
7. Does it have any hidden untested dependencies or any values that can be factored out into the arguments instead? Only care about non-trivial dependencies that can actually change or affect the function.
8. Brainstorm 3 better function names and see if the current name is the best, consistent with rest of codebase.

IMPORTANT: you SHOULD NOT refactor out a separate function unless there is a compelling need, such as:
  - the refactored function is used in more than one place
  - the refactored function is easily unit testable while the original function is not AND you can't test it any other way
  - the original function is extremely hard to follow and you resort to putting comments everywhere just to explain it

## Writing Tests Best Practices

When evaluating whether a test you've implemented is good or not, use this checklist:

1. SHOULD parameterize inputs; never embed unexplained literals such as 42 or "foo" directly in the test.
2. SHOULD NOT add a test unless it can fail for a real defect. Trivial asserts (e.g., expect(2).toBe(2)) are forbidden.
3. SHOULD ensure the test description states exactly what the final expect verifies. If the wording and assert don't align, rename or rewrite.
4. SHOULD compare results to independent, pre-computed expectations or to properties of the domain, never to the function's output re-used as the oracle.
5. SHOULD follow the same type-safety and style rules as prod code (strict types).
6. SHOULD express invariants or axioms (e.g., commutativity, idempotence, round-trip) rather than single hard-coded cases whenever practical. Use `fast-check` library e.g.
```
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { getCharacterCount } from './string';

describe('properties', () => {
  test('concatenation functoriality', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (a, b) =>
          getCharacterCount(a + b) ===
          getCharacterCount(a) + getCharacterCount(b)
      )
    );
  });
});
```

7. Unit tests for a function should be grouped under `describe(functionName, () => ...`.
8. Use `expect.any(...)` when testing for parameters that can be anything (e.g. variable ids).
9. ALWAYS use strong assertions over weaker ones e.g. `expect(x).toEqual(1)` instead of `expect(x).toBeGreaterThanOrEqual(1)`.
10. SHOULD test edge cases, realistic input, unexpected input, and value boundaries.
11. SHOULD NOT test conditions that are caught by the type checker.

## Code Organization

- `archibald-web-app/frontend` - React 19 PWA (Vite + TypeScript strict). State via hooks+Context (no Redux). Vitest + Testing Library.
- `archibald-web-app/backend` - Express + TypeScript. PostgreSQL (`pg` pool), BullMQ+Redis (job queue), Puppeteer (browser automation per ERP Archibald), WebSocket (real-time). Vitest + supertest.
- `archibald-web-app/load-tests` - Load tests

### Backend Key Directories
- `src/operations/handlers/` - 16 operation handlers (submit-order, sync-customers, sync-order-articles, etc.)
- `src/db/repositories/` - Data access layer (~26 repos). Ogni funzione accetta `DbPool` come primo parametro.
- `src/db/migrations/` - 10 migration SQL (001-010). Runner in `src/db/migrate.ts`.
- `src/bot/` - Browser pool (`browser-pool.ts`) + ERP bot (`archibald-bot.ts`). Max 3 browser, 8 context/browser.
- `src/sync/sync-scheduler.ts` - Scheduler: agent syncs ogni 10 min, shared syncs ogni 30 min. Article sync: batch 10, delay 3 min.
- `src/realtime/` - WebSocket server + SSE progress + job event bus.
- `src/services/password-encryption-service.ts` - AES-256-GCM per password agenti, persistite in DB e recuperate al bisogno.
- `src/routes/` - ~17 Express routers. Dependency injection via factory functions (`createXxxRouter(deps)`).

### Frontend Key Directories
- `src/pages/` - 14 pagine (Dashboard, OrderHistory, PendingOrdersPage, CustomerList, ArticoliList, ecc.)
- `src/components/` - 200+ componenti. `OrderCardNew.tsx` (140KB) è il più grande. Stile: inline `style={{}}`.
- `src/hooks/` - 13 hook custom (useAuth, useOrderStacks, useSyncProgress, ecc.)
- `src/services/` - 21 service (customers, products, pdf-export, biometric-auth, ecc.)
- `src/utils/` - 31 utility (orderStacking, orderGrouping, format-currency, ecc.)
- `src/contexts/` - WebSocketContext (real-time) + PrivacyContext (offuscamento dati).
- `src/api/` - 12 moduli API. Tutti usano `fetchWithRetry` con exponential backoff.

### Architettura Produzione
- **4 container Docker**: frontend (nginx), backend (Node 20), PostgreSQL, Redis. Prometheus e Grafana rimossi (non utilizzati).
- **CI/CD**: GitHub Actions → build images → push GHCR → deploy VPS via SSH
- **VPS**: formicanera.com (91.98.136.198), Hetzner CPX32, 4 vCPU, 8 GB RAM, 160 GB disk
- **SSL**: Let's Encrypt + nginx reverse proxy con rate limiting

### Sync System (redesign 2026-03-28)
- **4 code BullMQ**: `writes` (concurrency 5), `agent-sync` (3), `enrichment` (3), `shared-sync` (1)
- **HTML scraping** al posto di PDF per tutte le letture ERP (scraper in `src/sync/scraper/`)
- **Activity-aware scheduling**: agenti active (<2h)/idle (2-24h)/offline (>24h)
- **Circuit breaker**: auto-pausa dopo 3 fallimenti consecutivi (`system.circuit_breaker`)
- **Spec**: `docs/superpowers/specs/2026-03-28-sync-system-redesign-design.md`

### ⚠️ BIBBIA ERP (MUST READ per qualsiasi lavoro sull'ERP)
La **Bibbia ERP** è il documento di riferimento DEFINITIVO per interagire con l'ERP Archibald. Contiene l'autopsia certificata di OGNI pagina (7 ListView + 8 DetailView + Login + Announcements), con:
- Struttura DOM esatta, colonne fantasma (+2 offset), formati numeri/date
- Filtri XAF con valori interni, persistenza sessione
- Checklist scraper 13 step obbligatoria
- Campi xaf_dvi per ogni DetailView, tab, griglie embedded

**Memoria**: `memory/erp-bible.md`
**Raw data**: `docs/diagnostics/erp-full-autopsy-2026-03-29.json` · `docs/diagnostics/erp-detailview-autopsy-2026-03-29.json` · `docs/diagnostics/erp-full-autopsy-2026-05-10.json`

**REGOLE CRITICHE** (quick reference — dettaglio completo in `memory/erp-bible.md`):
1. **GotoPage(0)** SEMPRE prima di leggere dati — il page index persiste tra navigazioni
2. **Numeri con virgola** = separatore migliaia EN (51,847 = 51847) — `replace(/,/g, '')`
3. **Date formato US** = M/D/YYYY (3/28/2026 non 28/3/2026)
4. **Colonne fantasma** = 2 celle extra (edit+checkbox) prima dei dati nel DOM
5. **Page size** via `ASPx.POnPageSizeBlur(pagerId, new Event('blur'))` — PerformCallback NON funziona

### Pattern Chiave
- **Nota di credito (NC)**: ordini con `gross_amount` negativo (es. `-4.264,48 €`). Il filtro NC nelle query articoli usa `NOT EXISTS` per escludere ordini stornati (stesso cliente, stessa cifra negata).
- **Password agenti**: criptate AES-256-GCM in DB (`users.encrypted_password`), decriptate on-demand nella `loginFn` del browser pool. L'utente deve fare login almeno una volta per salvare la password.
- **Order article sync**: scheduler enqueue job `sync-order-articles` per ogni ordine con `articles_synced_at IS NULL`. Bot scrapa HTML tab "Linee di vendita" dalla DetailView ordine.
- **Card stacking**: nella pagina /orders, triadi NC (ordine + NC + sostituto) vengono auto-impilate visivamente. Stack manuali persistiti in localStorage.

---

## VPS Access & Production Database

### VPS Credentials Location

**File:** `/Users/hatholdir/Downloads/Archibald/VPS-ACCESS-CREDENTIALS.md`

**Important:**
- This file contains SSH keys, tokens, and access credentials for production VPS
- **NEVER commit this file to Git** (already in .gitignore)
- When you need to access production database or VPS, read this file first
- VPS Host: `formicanera.com` (91.98.136.198)
- Database: **PostgreSQL** in Docker container `postgres`

### Accessing Production Database

When asked to check production data:
1. Read VPS-ACCESS-CREDENTIALS.md for SSH key
2. Save SSH key to /tmp/archibald_vps with chmod 600
3. Query via Docker:
```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \"SELECT ...;\""
```

**Never modify production data directly — only read queries!**

**Schema**: `agents.*` (tabelle per-agente), `shared.*` (tabelle condivise), `system.*` (sistema).
**Tabelle chiave**: `agents.order_records`, `agents.order_articles`, `agents.customers`, `agents.users`, `shared.products`, `shared.prices`.

### Checking Backend Logs

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   logs --tail 50 backend"
```

---

## Formato spiegazioni (MUST)

Ogni volta che analizzi un bug o proponi una soluzione non banale, fornisci SEMPRE due versioni:

1. **Versione classica**: strutturata con titoli, bullet point, riferimenti a file/righe/codice
2. **Versione verbale**: colloquiale, senza riferimenti a file o codice, come spiegheresti a voce a un collega

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
