# Project Milestones: Archibald — Unified Operation Queue Migration

## v1.2 Production Parity (Shipped: 2026-02-24)

**Delivered:** Chiusi tutti i 25 gap trovati nell'audit 1:1 master vs branch — bootstrap, subclient system, fresis history, Excel import, admin sessions, SSE, sync enhancements.

**Phases completed:** 11-16 (14 plans total)

**Key accomplishments:**

- Production bootstrap completo (main.ts, migrations, graceful shutdown, background services)
- Subclient CRUD + Excel import con reconciliation e 15 campi
- Fresis history: Arca export/import, FT numbering atomico, bulk discounts
- Price/VAT Excel import con sibling variant propagation
- Admin session impersonation + SSE real-time event bus
- Sync checkpoint/resume, retry con backoff, delta sync, slowdown optimizer

**Stats:**

- 450 files created/modified (cumulative with v1.0/v1.1)
- 45,913 lines added / 68,544 lines removed (cumulative)
- 6 phases, 14 plans
- ~6 hours from start to ship

**Git range:** `feat(11-01)` → `feat(16-03)`

**What's next:** Merge branch `feat/unified-operation-queue` into master — full production parity achieved.

---

## v1.1 Full Feature Parity (Shipped: 2026-02-23)

**Delivered:** Implementati i 5 elementi rimasti per parità funzionale completa — DI wiring, device registration, price management system con PostgreSQL.

**Phases completed:** 8-10 (7 plans total)

**Key accomplishments:**

- DI wiring completato per resetSyncCheckpoint, createTestBot, audit log
- Device registration con repository CRUD e hook nel login handler
- Price management: parseItalianPrice, matchVariant, PriceMatchingService
- Price history migrata a PostgreSQL con repository pattern
- sync-prices operation handler wired nel processor

**Stats:**

- 7 plans completati
- 3 phases
- ~3 hours from start to ship

**Git range:** `feat(08-01)` → `feat(10-04)`

**What's next:** v1.2 Production Parity — chiudere i 25 gap rimanenti.

---

## v1.0 Endpoint Parity (Shipped: 2026-02-23)

**Delivered:** Migrazione architetturale da monolite a backend modulare con 100% parità endpoint — 42 elementi riprogettati verificati, 18 endpoint implementati, frontend migrato, 353 test di validazione.

**Phases completed:** 1-7 (20 plans total)

**Key accomplishments:**

- Architettura modulare con DI pattern e PostgreSQL
- 42 elementi riprogettati verificati per parità funzionale
- 18 endpoint mancanti implementati (critical, admin, monitoring, debug)
- Frontend migrato ai path API unificati
- 289 endpoint parity tests + 44 API contract tests + 20 cross-flow tests

**Stats:**

- 20 plans completati
- 7 phases
- 4 days from start to ship (2026-02-19 → 2026-02-23)

**Git range:** `build: add pg` → `feat(07-03)`

**What's next:** v1.1 Full Feature Parity — completare i 5 elementi rimasti.

---
