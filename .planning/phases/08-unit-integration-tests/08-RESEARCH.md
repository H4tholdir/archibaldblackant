# Phase 8: Unit & Integration Tests - Research

**Researched:** 2026-02-20
**Domain:** Vitest testing patterns for BullMQ processor, agent lock, sync services, WebSocket, PostgreSQL
**Confidence:** HIGH

<research_summary>
## Summary

Ricerca sulle best practice per testare i moduli backend di Archibald: operation processor, agent lock, sync handlers, WebSocket server, e sync services con PostgreSQL reale.

Il codebase ha già 63 file `.spec.ts` con pattern consolidati: dependency injection, mock pool, supertest per route, fake timers per scheduler. La ricerca si concentra sulle aree non ancora coperte: **integration testing con PostgreSQL reale** (plan 08-05) e **WebSocket integration testing** (plan 08-04).

Per i test di integrazione PostgreSQL, tre opzioni valutate: **testcontainers** (Docker-based, ideale ma richiede Docker), **pg-mem** (in-memory PG emulator, zero dipendenze esterne), e **real local PG** (il progetto già usa PG localmente). Per WebSocket, il pattern esistente con mock objects è già solido per unit test; per integration test basta aprire un server HTTP reale su porta random con `ws` client.

**Primary recommendation:** Per plan 08-01/02/03 (unit test), estendere i pattern mock esistenti. Per plan 08-04 (WebSocket integration), real HTTP server su porta 0. Per plan 08-05 (sync+DB), usare il PostgreSQL locale già disponibile con DB di test dedicato e migrations, senza aggiungere dipendenze esterne.
</research_summary>

<standard_stack>
## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^1.2.1 | Test framework | Already in use, 63 spec files |
| supertest | ^7.2.2 | HTTP integration tests | Already in use per route tests |
| fast-check | ^4.5.3 | Property-based testing | In devDependencies, richiesto da CLAUDE.md |
| ws | ^8.19.0 | WebSocket (prod + test client) | Already in dependencies |
| pg | ^8.18.0 | PostgreSQL client | Already in dependencies |

### Supporting (no new deps needed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:http | built-in | Test HTTP server per WebSocket | Plan 08-04, server su porta 0 |
| node:events | built-in | once() per WebSocket promise wrapper | Plan 08-04, await event-based API |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Real local PG | testcontainers | testcontainers richiede Docker, più lento per startup (2-5s), ma perfetto isolamento. Overkill per questo progetto che già ha PG locale |
| Real local PG | pg-mem | pg-mem è in-memory (veloce, no Docker), ma emulazione PG incompleta: non supporta tutti i tipi, CREATE SCHEMA, alcune funzioni. Rischio di falsi positivi |
| Mock WebSocket | vitest-websocket-mock | Mock library dedicata, ma il progetto già ha pattern mock consolidati. Aggiungere dipendenza per poco valore |

### Installation
```bash
# Nessuna nuova dipendenza necessaria
# Tutto il necessario è già in package.json
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Test File Organization
```
src/
├── operations/
│   ├── operation-processor.ts
│   ├── operation-processor.spec.ts        # Unit (existing, expand)
│   ├── agent-lock.ts
│   └── agent-lock.spec.ts                 # Unit (existing, expand)
├── operations/handlers/
│   ├── sync-customers.spec.ts             # Unit (existing, expand)
│   ├── sync-products.spec.ts              # Unit (existing, expand)
│   └── ...
├── realtime/
│   ├── websocket-server.ts
│   └── websocket-server.spec.ts           # Unit (existing) + Integration (expand)
├── sync/services/
│   ├── customer-sync.spec.ts              # Unit (existing, expand)
│   └── ...
└── db/
    └── integration/                       # NEW: Integration tests con real PG
        ├── test-db-setup.ts               # Helper: create/destroy test DB, run migrations
        ├── customer-sync.integration.spec.ts
        ├── order-sync.integration.spec.ts
        ├── product-sync.integration.spec.ts
        └── price-sync.integration.spec.ts
```

### Pattern 1: Vitest Projects per Separare Unit e Integration
**What:** Usare `projects` in vitest.config.ts per eseguire unit e integration separatamente
**When to use:** Quando integration test richiedono infrastruttura esterna (PG)
**Example:**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/**/*.integration.spec.ts'],
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.spec.ts'],
          testTimeout: 60000,
          hookTimeout: 30000,
          // Integration tests run sequentially to share DB
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
})
```

### Pattern 2: Real PostgreSQL Test Database
**What:** Usare un database PG dedicato (`archibald_test`) con migrations reali
**When to use:** Integration test sync services (plan 08-05)
**Example:**
```typescript
// src/db/integration/test-db-setup.ts
import { createPool } from '../pool';
import { runMigrations, loadMigrationFiles } from '../migrate';
import path from 'path';

const TEST_DB_URL = process.env.TEST_DATABASE_URL
  ?? 'postgresql://localhost:5432/archibald_test';

export async function setupTestDb() {
  const pool = createPool(TEST_DB_URL);
  const migrations = loadMigrationFiles(
    path.join(__dirname, '..', 'migrations')
  );
  await runMigrations(pool, migrations);
  return pool;
}

export async function teardownTestDb(pool: DbPool) {
  // Truncate all tables for clean state between test suites
  await pool.query(`
    DO $$ DECLARE r RECORD;
    BEGIN
      FOR r IN (SELECT tablename, schemaname FROM pg_tables
                WHERE schemaname IN ('shared', 'agents', 'system')
                AND tablename != 'migrations')
      LOOP
        EXECUTE 'TRUNCATE TABLE ' || r.schemaname || '.' || r.tablename || ' CASCADE';
      END LOOP;
    END $$;
  `);
}

export async function destroyTestDb(pool: DbPool) {
  await pool.end();
}
```

### Pattern 3: WebSocket Integration Test con Real Server
**What:** Aprire un HTTP server su porta 0 (random) con WS server reale
**When to use:** Integration test WebSocket events (plan 08-04)
**Example:**
```typescript
// WebSocket integration test pattern
import http from 'http';
import WebSocket from 'ws';
import { createWebSocketServer } from './websocket-server';

function createTestServer(verifyToken: VerifyTokenFn) {
  const server = http.createServer();
  const wsServer = createWebSocketServer({
    createWss: () => new WebSocket.Server({ server }),
    verifyToken,
  });

  return new Promise<{ server: http.Server; wsServer: WebSocketServerModule; port: number }>(
    (resolve) => {
      server.listen(0, () => {
        const port = (server.address() as any).port;
        resolve({ server, wsServer, port });
      });
    }
  );
}

// In test:
function connectClient(port: number, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}?token=${token}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}
```

### Anti-Patterns to Avoid
- **Test che dipendono dall'ordine di esecuzione:** Ogni test deve essere indipendente, truncate tra test suite
- **Hardcoded ports:** Usare porta 0 per evitare conflitti in CI
- **Timer reali nei unit test:** Usare sempre `vi.useFakeTimers()` per preemption/timeout test
- **Mocking eccessivo nei integration test:** Il punto degli integration test è verificare le interazioni reali
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DB test isolation | Custom transaction wrapper | TRUNCATE CASCADE tra suite + migrations reali | Le transazioni rollback non funzionano con codice che fa commit interni |
| WebSocket test client | Custom event promise wrapper | `ws` library con `once()` di node:events | Il client `ws` è lo stesso usato in produzione |
| Test DB creation | Script SQL custom | `runMigrations()` già esistente in `migrate.ts` | Riusa la stessa logica di migrazione della produzione |
| Mock factories | Nuovi helper globali | Pattern inline esistenti (createMockPool, createMockDeps) | Il codebase ha già 63 file con pattern consolidati, mantenere consistenza |
| Port allocation | Porta fissa | `server.listen(0)` | Node.js assegna porta libera automaticamente |

**Key insight:** Il codebase ha già pattern di test maturi e consolidati. Non serve introdurre nuove librerie o pattern. L'unica novità è il DB reale per integration test e il WebSocket server reale per integration test — ma entrambi usano le stesse dipendenze già in `package.json`.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Test Flaky con AbortSignal/Timer
**What goes wrong:** Test di preemption/timeout intermittentemente falliscono
**Why it happens:** Race condition tra timer reali e Promise resolution
**How to avoid:** Usare `vi.useFakeTimers()` per tutti i test che coinvolgono timeout. Avanzare esplicitamente con `vi.advanceTimersByTimeAsync()`. Il codebase già usa questo pattern in `sync-scheduler.spec.ts`.
**Warning signs:** Test che passano/falliscono alternativamente, specialmente in CI

### Pitfall 2: WebSocket Test Connection Leak
**What goes wrong:** Process Node.js resta appeso dopo i test
**Why it happens:** WebSocket connections non chiuse in afterAll
**How to avoid:** Chiudere TUTTI i client WS, poi il server, in afterAll. Usare `ws.terminate()` (non `ws.close()`) per chiusura immediata.
**Warning signs:** `vitest run` non termina, timeout dopo completamento test

### Pitfall 3: Integration Test che Inquinano il DB
**What goes wrong:** Un test inserisce dati che fanno fallire il test successivo
**Why it happens:** Mancanza di cleanup tra test o test che assumono DB vuoto
**How to avoid:** TRUNCATE CASCADE in beforeEach o beforeAll per ogni suite. Mai assumere stato iniziale — sempre pulire prima.
**Warning signs:** Test che passano singolarmente ma falliscono quando eseguiti insieme

### Pitfall 4: pg-mem Falsi Positivi
**What goes wrong:** Test passano con pg-mem ma falliscono con PostgreSQL reale
**Why it happens:** pg-mem non supporta tutte le feature PG (CREATE SCHEMA, alcune funzioni, ON CONFLICT, etc.)
**How to avoid:** Usare PostgreSQL reale per integration test, non pg-mem. pg-mem va bene per unit test di query semplici, ma i sync services usano feature PG avanzate (COALESCE, ON CONFLICT DO UPDATE, schema multipli).
**Warning signs:** Query che funzionano in test ma non in produzione (o viceversa)

### Pitfall 5: shouldStop Test con Dataset Troppo Piccoli
**What goes wrong:** Test di shouldStop interruption non triggera il check nel DB loop
**Why it happens:** shouldStop viene controllato ogni 10 record nel loop. Con <10 record, il check non scatta.
**How to avoid:** Usare dataset di almeno 15-20 record per testare shouldStop nel DB loop. Il check è a `loopIndex % 10 === 0`.
**Warning signs:** Test di interruzione che non copre il checkpoint nel loop
</common_pitfalls>

<code_examples>
## Code Examples

### Unit Test Operation Processor — Preemption Flow
```typescript
// Pattern: test preemption con agentLock mock
describe('processJob', () => {
  test('preempts sync and acquires lock on retry', async () => {
    const agentLock = {
      acquire: vi.fn()
        .mockReturnValueOnce({ acquired: false, activeJob: { jobId: 'sync-1', type: 'SYNC_CUSTOMERS', requestStop: vi.fn() }, preemptable: true })
        .mockReturnValueOnce({ acquired: true }),
      release: vi.fn().mockReturnValue(true),
      setStopCallback: vi.fn(),
    };

    const processor = createOperationProcessor({
      ...baseDeps,
      agentLock,
      preemptionConfig: { pollIntervalMs: 10, timeoutMs: 100 },
    });

    const result = await processor.processJob(mockJob);

    expect(agentLock.acquire).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  });
});
```

### Unit Test Agent Lock — Preemptable Detection
```typescript
// Pattern: test tutte le combinazioni preemptable
describe('acquire', () => {
  test.each([
    ['SYNC_CUSTOMERS', 'SUBMIT_ORDER', true],   // sync + write = preemptable
    ['SUBMIT_ORDER', 'SYNC_CUSTOMERS', false],   // write + sync = NOT preemptable
    ['SYNC_CUSTOMERS', 'SYNC_ORDERS', false],    // sync + sync = NOT preemptable
    ['SUBMIT_ORDER', 'EDIT_ORDER', false],        // write + write = NOT preemptable
  ])('active %s + incoming %s → preemptable: %s', (activeType, incomingType, expectedPreemptable) => {
    lock.acquire('user-1', 'job-1', activeType as OperationType);
    const result = lock.acquire('user-1', 'job-2', incomingType as OperationType);

    expect(result).toEqual({
      acquired: false,
      activeJob: expect.objectContaining({ jobId: 'job-1' }),
      preemptable: expectedPreemptable,
    });
  });
});
```

### Integration Test Sync Service con Real PostgreSQL
```typescript
// Pattern: real DB con migrations
import { setupTestDb, teardownTestDb, destroyTestDb } from '../integration/test-db-setup';

describe('syncCustomers (integration)', () => {
  let pool: DbPool;

  beforeAll(async () => {
    pool = await setupTestDb();
  });

  beforeEach(async () => {
    await teardownTestDb(pool); // TRUNCATE all tables
  });

  afterAll(async () => {
    await destroyTestDb(pool);
  });

  test('inserts new customers and updates existing', async () => {
    const deps = {
      pool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/test.pdf'),
      parsePdf: vi.fn().mockResolvedValue([
        { customerProfile: 'CUST001', companyName: 'Acme' },
        { customerProfile: 'CUST002', companyName: 'Beta' },
      ]),
      cleanupFile: vi.fn(),
    };

    const result = await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    expect(result.success).toBe(true);
    expect(result.newCustomers).toBe(2);

    // Verify DB state directly
    const { rows } = await pool.query(
      'SELECT * FROM agents.customers WHERE user_id = $1 ORDER BY customer_profile',
      ['user-1']
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].customer_profile).toBe('CUST001');
  });
});
```

### Integration Test WebSocket Events
```typescript
// Pattern: real WS server su porta random
import http from 'http';
import WebSocket from 'ws';

describe('WebSocket broadcast (integration)', () => {
  let server: http.Server;
  let wsServer: WebSocketServerModule;
  let port: number;

  beforeAll(async () => {
    server = http.createServer();
    wsServer = createWebSocketServer({
      createWss: () => new WebSocket.Server({ server }),
      verifyToken: vi.fn().mockResolvedValue({ userId: 'user-1', username: 'agent1', role: 'agent' }),
    });

    await new Promise<void>(resolve => server.listen(0, resolve));
    port = (server.address() as any).port;
  });

  afterAll(async () => {
    await wsServer.shutdown();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  test('broadcasts JOB_COMPLETED to connected client', async () => {
    const client = new WebSocket(`ws://localhost:${port}?token=valid`);
    await new Promise(resolve => client.on('open', resolve));

    const messagePromise = new Promise<any>(resolve => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    wsServer.broadcast('user-1', {
      type: 'JOB_COMPLETED',
      payload: { jobId: 'job-1', operationType: 'SUBMIT_ORDER' },
      timestamp: new Date().toISOString(),
    });

    const received = await messagePromise;
    expect(received.type).toBe('JOB_COMPLETED');
    expect(received.payload.jobId).toBe('job-1');

    client.terminate();
  });
});
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vitest `workspace` config | Vitest `projects` in defineConfig | Vitest 2.x+ | `workspace` deprecato, usare `projects` |
| pg-mem per integration test | Real PG o testcontainers | 2024+ | pg-mem ha troppe limitazioni per query complesse |
| jest-websocket-mock | Real WS server o vitest-websocket-mock | 2024 | Jest mock portato a Vitest, ma real server è più affidabile |

**New tools/patterns to consider:**
- **Vitest `projects`:** Sostituisce `workspace` per separare unit/integration test
- **PostgreSQL snapshot/restore:** testcontainers supporta snapshot per reset veloce tra test

**Deprecated/outdated:**
- **Vitest `workspace` property:** Deprecato in favore di `projects`
- **pg-mem per integration complessi:** Non supporta CREATE SCHEMA, alcune funzioni PG avanzate
</sota_updates>

<open_questions>
## Open Questions

1. **Docker disponibile in ambiente dev/CI?**
   - What we know: Il progetto usa PostgreSQL locale. Non è chiaro se Docker è disponibile.
   - What's unclear: Se testcontainers sarebbe un'opzione praticabile.
   - Recommendation: Usare PostgreSQL locale diretto (no Docker dependency). Se in futuro serve CI, aggiungere testcontainers.

2. **Vitest version compatibility con `projects`**
   - What we know: Il progetto usa vitest ^1.2.1. La feature `projects` è stabile da Vitest 2.x.
   - What's unclear: Se il progetto può aggiornare Vitest a v2.x.
   - Recommendation: Se upgrade non possibile, usare naming convention (`.integration.spec.ts`) con script npm separati (`vitest run --include '**/integration*.spec.ts'`). Oppure aggiornare vitest (breaking changes minime da v1 a v2).
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- /vitest-dev/vitest (Context7) — workspace/projects configuration, test isolation, performance
- /testcontainers/testcontainers-node (Context7) — PostgreSQL container setup, snapshot/restore, Vitest integration
- /oguimbal/pg-mem (Context7) — pg adapter, migrations API, limitazioni
- Codebase analysis — 63 existing spec files, pattern consolidati, vitest.config.ts

### Secondary (MEDIUM confidence)
- [Integration Testing Node.js Postgres with Vitest & Testcontainers](https://nikolamilovic.com/posts/integration-testing-node-postgres-vitest-testcontainers/) — Pattern real DB integration test
- [Writing Integration Tests for WebSocket Servers Using Vitest and WS](https://thomason-isaiah.medium.com/writing-integration-tests-for-websocket-servers-using-jest-and-ws-8e5c61726b2a) — WebSocket test patterns
- [testing-websockets GitHub repo](https://github.com/ITenthusiasm/testing-websockets) — Vitest WebSocket integration examples

### Tertiary (LOW confidence - needs validation)
- Nessuno — tutti i finding verificati con fonti primarie
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Vitest ^1.2.1 (testing framework)
- Ecosystem: pg, ws, supertest, fast-check (all already in project)
- Patterns: Unit test con DI + mocks, integration test con real PG, WebSocket real server
- Pitfalls: Timer flaky, connection leak, DB pollution, pg-mem limitations, shouldStop dataset size

**Confidence breakdown:**
- Standard stack: HIGH — tutto già nel progetto, nessuna nuova dipendenza
- Architecture: HIGH — pattern esistenti consolidati (63 spec files), estensione naturale
- Pitfalls: HIGH — derivati da analisi diretta del codice e pattern noti
- Code examples: HIGH — basati su pattern reali del codebase + Context7/docs ufficiali

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 days — Vitest ecosystem stabile)
</metadata>

---

*Phase: 08-unit-integration-tests*
*Research completed: 2026-02-20*
*Ready for planning: yes*
