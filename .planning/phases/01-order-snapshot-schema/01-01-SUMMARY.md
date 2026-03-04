---
phase: 01-order-snapshot-schema
plan: 01
subsystem: database
tags: [postgresql, order-verification, snapshot, submit-order]

# Dependency graph
requires: []
provides:
  - order_verification_snapshots table schema
  - order_verification_snapshot_items table schema
  - saveOrderVerificationSnapshot repository function
  - getOrderVerificationSnapshot repository function
  - snapshot integration in submit-order handler
affects: [02-verification-engine, 03-auto-correction-bot, 05-verification-status-tracking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TxClient param for transactional repository functions"
    - "ON CONFLICT upsert for idempotent snapshot creation"
    - "CASCADE delete for parent-child table cleanup"

key-files:
  created:
    - archibald-web-app/backend/src/db/migrations/016-order-verification-snapshots.sql
    - archibald-web-app/backend/src/db/repositories/order-verification.ts
  modified:
    - archibald-web-app/backend/src/operations/handlers/submit-order.ts
    - archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts

key-decisions:
  - "TxClient instead of DbPool for transactional snapshot save"
  - "ON CONFLICT upsert for re-submit idempotency"
  - "DOUBLE PRECISION for all amounts (not strings like legacy order_records)"

patterns-established:
  - "TxClient param for functions called inside withTransaction"
  - "Batch INSERT with parameterized placeholders for snapshot items"

issues-created: []

# Metrics
duration: 3min
completed: 2026-03-05
---

# Phase 1 Plan 01: Order Snapshot Schema & Storage Summary

**Migration SQL con 2 tabelle snapshot + repository functions + integrazione in submit-order con skip warehouse orders**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-04T23:09:46Z
- **Completed:** 2026-03-04T23:13:00Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Migration `016-order-verification-snapshots.sql` con tabelle `order_verification_snapshots` + `order_verification_snapshot_items`, 3 indici, UNIQUE constraint, CASCADE delete
- Repository `order-verification.ts` con `saveOrderVerificationSnapshot` (batch INSERT con ON CONFLICT upsert) e `getOrderVerificationSnapshot` (JOIN query)
- Integrazione in `submit-order.ts`: snapshot salvato nella stessa transazione, skip per warehouse orders
- Tutti i 1576 test passano, build TypeScript OK

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 016-order-verification-snapshots.sql** - `376b4570` (feat)
2. **Task 2: Repository order-verification.ts** - `a7db1b9d` (feat)
3. **Task 3: Integrazione in submit-order.ts** - `66cdd510` (feat)

## Files Created/Modified

- `archibald-web-app/backend/src/db/migrations/016-order-verification-snapshots.sql` - Schema 2 tabelle + 3 indici
- `archibald-web-app/backend/src/db/repositories/order-verification.ts` - Save + get snapshot functions
- `archibald-web-app/backend/src/operations/handlers/submit-order.ts` - Integrazione snapshot nella transazione
- `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts` - Mock aggiornato per RETURNING id

## Decisions Made

- Usato `TxClient` (non `DbPool`) come tipo parametro per `saveOrderVerificationSnapshot` — necessario per la firma callback di `withTransaction`
- ON CONFLICT upsert per gestire re-submit idempotenti dello stesso ordine
- DOUBLE PRECISION per tutti gli amounts — evita il problema legacy delle stringhe in order_records

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tipo parametro TxClient invece di DbPool**
- **Found during:** Task 2 (Repository creation)
- **Issue:** Il piano specificava `tx: DbPool` ma la callback di `withTransaction` fornisce `TxClient`
- **Fix:** Usato `TxClient` come tipo del primo parametro
- **Verification:** Build compila, test passano

**2. [Rule 1 - Bug] Mock test aggiornato per RETURNING id**
- **Found during:** Task 3 (Integration)
- **Issue:** Il mock in submit-order.spec.ts restituiva righe vuote per tutte le query, ma il nuovo INSERT con RETURNING id richiede una riga con `id`
- **Fix:** Mock condizionale che restituisce `{ rows: [{ id: 1 }] }` per query con RETURNING id
- **Verification:** 1576 test passano

---

**Total deviations:** 2 auto-fixed (2 bug), 0 deferred
**Impact on plan:** Entrambi i fix necessari per la correttezza. Nessun scope creep.

## Issues Encountered

None

## Next Phase Readiness

- Schema snapshot pronto, repository functions esportate
- `getOrderVerificationSnapshot` già disponibile per Phase 2 (Verification Engine)
- Lo status `verification_status` (pending_verification/verified/mismatch_detected/auto_corrected/correction_failed) è già nello schema per Phase 2+
- Migration va eseguita in produzione prima del deploy

---
*Phase: 01-order-snapshot-schema*
*Completed: 2026-03-05*
