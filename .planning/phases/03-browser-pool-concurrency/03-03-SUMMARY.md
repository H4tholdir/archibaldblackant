---
phase: 03-browser-pool-concurrency
plan: 03
subsystem: api
tags: [compensating-transactions, bot-results, recovery, idempotency]

# Dependency graph
requires:
  - phase: 03-browser-pool-concurrency/02
    provides: Worker concurrency 10, agentLock serializzazione per-utente
provides:
  - Tabella agents.bot_results per tracking risultati bot
  - Pattern check-save-clear su 4 handler per recovery post-crash
  - Prevenzione duplicati su Archibald dopo fallimento transazione DB
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [check-save-clear, compensating-transaction, idempotent-recovery]

key-files:
  created:
    - archibald-web-app/backend/src/db/migrations/006-bot-results.sql
    - archibald-web-app/backend/src/operations/bot-result-store.ts
    - archibald-web-app/backend/src/operations/bot-result-store.spec.ts
  modified:
    - archibald-web-app/backend/src/operations/handlers/submit-order.ts
    - archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts
    - archibald-web-app/backend/src/operations/handlers/send-to-verona.ts
    - archibald-web-app/backend/src/operations/handlers/send-to-verona.spec.ts
    - archibald-web-app/backend/src/operations/handlers/create-customer.ts
    - archibald-web-app/backend/src/operations/handlers/create-customer.spec.ts
    - archibald-web-app/backend/src/operations/handlers/delete-order.ts
    - archibald-web-app/backend/src/operations/handlers/delete-order.spec.ts

key-decisions:
  - "bot_results table con UNIQUE constraint su (user_id, operation_type, operation_key)"
  - "3 funzioni pure (checkBotResult, saveBotResult, clearBotResult) senza classe"
  - "clearBotResult DOPO la transazione DB, non dentro"
  - "INSERT ON CONFLICT DO UPDATE per idempotenza saveBotResult"

patterns-established:
  - "check-save-clear: check bot_result -> skip/call bot -> save result -> DB transaction -> clear"
  - "Recovery path: se bot_result esiste, skip bot call e usa dati salvati"
  - "Persist on failure: se DB transaction fallisce, bot_result resta per recovery successivo"

issues-created: []

# Metrics
duration: 6min
completed: 2026-02-20
---

# Phase 3 Plan 03: Compensating Transactions Summary

**Tabella bot_results, utility recovery, 4 handler protetti con pattern check-save-clear per prevenire duplicati su Archibald**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T12:47:40Z
- **Completed:** 2026-02-20T12:54:13Z
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 8

## Accomplishments
- Migration 006 crea tabella agents.bot_results con UNIQUE constraint e indice lookup
- bot-result-store con 3 funzioni esportate: checkBotResult, saveBotResult, clearBotResult
- 4 handler protetti: submit-order, send-to-verona, create-customer, delete-order
- Pattern check-save-clear previene duplicati su Archibald se DB transaction fallisce post-bot
- 20 nuovi test: 4 store + 16 handler (4 per handler: recovery path, normal path, clear, persist)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration bot_results + utility recovery** - `a6e5217` (feat)
2. **Task 2: Pattern recovery su 4 handler** - `0041139` (feat)

## Files Created
- `archibald-web-app/backend/src/db/migrations/006-bot-results.sql` - Migration tabella agents.bot_results
- `archibald-web-app/backend/src/operations/bot-result-store.ts` - checkBotResult, saveBotResult, clearBotResult
- `archibald-web-app/backend/src/operations/bot-result-store.spec.ts` - 4 test unitari per store

## Files Modified
- `archibald-web-app/backend/src/operations/handlers/submit-order.ts` - Recovery pattern con operation_key=pendingOrderId
- `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts` - 4 nuovi test recovery
- `archibald-web-app/backend/src/operations/handlers/send-to-verona.ts` - Recovery pattern con operation_key=orderId
- `archibald-web-app/backend/src/operations/handlers/send-to-verona.spec.ts` - 4 nuovi test recovery
- `archibald-web-app/backend/src/operations/handlers/create-customer.ts` - Recovery pattern con operation_key=name
- `archibald-web-app/backend/src/operations/handlers/create-customer.spec.ts` - 4 nuovi test recovery
- `archibald-web-app/backend/src/operations/handlers/delete-order.ts` - Recovery pattern con operation_key=orderId
- `archibald-web-app/backend/src/operations/handlers/delete-order.spec.ts` - 4 nuovi test recovery

## Decisions Made
- bot_results table con UNIQUE(user_id, operation_type, operation_key) per idempotenza
- 3 funzioni pure senza classe, consistente con pattern codebase
- clearBotResult eseguito DOPO la transazione DB (non dentro), se clear fallisce recovery resta idempotente
- INSERT ON CONFLICT DO UPDATE per saveBotResult gestisce retry multipli

## Deviations from Plan
None

## Test Results
- **777 tests passed** (761 pre-existing + 4 store + 16 handler)
- **12 skipped** (pre-existing)
- TypeScript build passes

## Phase 3 Completion
Phase 03-browser-pool-concurrency is now complete with all 3 plans executed:
- 03-01: Browser pool tracking con protezione eviction context in-use
- 03-02: Worker concurrency 10 con backoff esponenziale
- 03-03: Compensating transactions con pattern check-save-clear

---
*Phase: 03-browser-pool-concurrency*
*Completed: 2026-02-20*
