# Archibald Black Ant

## What This Is

PWA per agenti Komet che automatizza ordini, sync clienti/prodotti/prezzi, e gestione magazzino tramite browser automation su Archibald ERP. Deployata su VPS (formicanera.com), supporta multi-utente e multi-dispositivo con sync real-time via WebSocket.

## Core Value

**Perfetto funzionamento multi-utente e multi-dispositivo** — ogni agente opera in autonomia da qualsiasi dispositivo, con sync automatici, zero race condition, e copertura test che garantisce stabilità nel tempo.

## Requirements

### Validated

**Pre-existing (before v1.0):**
- ✓ Frontend React PWA con routing completo (13 pagine) — existing
- ✓ Login/unlock flow con PIN e biometria — existing
- ✓ WebSocket context con reconnection e heartbeat — existing
- ✓ API layer frontend completo (9 moduli) — existing
- ✓ PostgreSQL schema (shared, agents, system) — existing
- ✓ Repository layer con query parametrizzate (no SQL injection) — existing
- ✓ BullMQ operation queue con 15 tipi di operazione e priorità — existing
- ✓ Browser pool multi-browser con LRU eviction — existing
- ✓ Bot Archibald con operation tracking e performance reporting — existing
- ✓ Handler factory pattern per tutte le 15 operazioni — existing
- ✓ Password cache con lazy-load da DB e AES-256-GCM — existing

**v1.0 Stabilization:**
- ✓ Sync scheduler con intervalli configurabili da admin — v1.0 (Phase 4)
- ✓ 9 eventi WebSocket real-time (PENDING_*, JOB_*, ORDER_NUMBERS_RESOLVED) — v1.0 (Phase 5)
- ✓ shouldStop() reale nei sync handlers con preemption reattiva — v1.0 (Phase 2)
- ✓ Fix race condition preemption e timeout handler — v1.0 (Phase 2)
- ✓ Fix race condition browser pool user lock — v1.0 (Phase 3)
- ✓ IVA da database (excel admin + alert articoli) — v1.0 (Phase 6)
- ✓ Compensating transactions post-bot (check-save-clear pattern) — v1.0 (Phase 3)
- ✓ Customer sync protetto da parser failures (count validation) — v1.0 (Phase 4)
- ✓ Deduplicazione idempotency key nativa BullMQ — v1.0 (Phase 2)
- ✓ Concurrency per-utente nel worker BullMQ — v1.0 (Phase 3)
- ✓ PDF persistence su filesystem con TTL cleanup — v1.0 (Phase 6)
- ✓ createCustomerBot passato a createApp — v1.0 (Phase 7)
- ✓ Hashing standardizzato a SHA-256 — v1.0 (Phase 6)
- ✓ Validazione parseInt con isNaN su route params — v1.0 (Phase 6)
- ✓ Rate limiting a 3 tier (global, strict, auth) — v1.0 (Phase 6)
- ✓ Subclients API completa (getAll, search, getByCode, import) — v1.0 (Phase 7)
- ✓ getNextFtNumber con numerazione progressiva PostgreSQL — v1.0 (Phase 7)
- ✓ exportArca e importArca implementati — v1.0 (Phase 7)
- ✓ Tutti i 13 stub eliminati — v1.0 (Phase 7)
- ✓ File orfani rimossi, dead code eliminato — v1.0 (Phase 1)
- ✓ Naming consistency sentToVeronaAt — v1.0 (Phase 1)
- ✓ Unit test per operation processor, agent lock, sync handlers — v1.0 (Phase 8)
- ✓ Integration test WebSocket, sync services con PostgreSQL — v1.0 (Phase 8)
- ✓ E2E Playwright contro VPS (login, ordini, sync, multi-device) — v1.0 (Phase 9)
- ✓ Verifica completa produzione con 35 E2E test su live — v1.0 (Phase 10)

### Active

(Nessun requisito attivo — milestone v1.0 completato. I requisiti per il prossimo milestone verranno definiti in `/gsd:discuss-milestone`.)

### Out of Scope

- Nuove feature (analytics, dashboard KPI, voice input migliorato) — milestone successiva
- Offline-first / service worker avanzato — milestone successiva
- Migrazione JWT a HttpOnly cookies — miglioramento futuro, non urgente
- Redesign UI — la UI funziona, focus su backend/logic
- Supporto altri ERP — solo Archibald
- Mobile app nativa — PWA basta
- CI/CD pipeline automatico — test eseguibili manualmente, CI da valutare

## Context

**Stato attuale (post v1.0):**
PWA stabile e verificata in produzione su VPS (formicanera.com). Tutti i 23 bug dalla code review sono stati risolti, tutti i 13 stub sostituiti con implementazioni reali, e 1,381 test automatici coprono l'intero stack. 7 container Docker operativi e healthy.

**Codebase:**
- ~114K LOC TypeScript (55K backend + 59K frontend)
- 386 source files (196 backend + 190 frontend)
- 10 database migrations (PostgreSQL, 3 schemi)
- 1,381 test (921 unit backend + 22 integration + 403 unit frontend + 35 E2E)

**Architettura:**
- Frontend: React 19 PWA (Vite + TypeScript)
- Backend: Express + Puppeteer + BullMQ + Redis + PostgreSQL
- Deploy: Docker Compose su VPS Hetzner (Nginx + Node + Redis + PostgreSQL + Prometheus + Grafana)
- Automazione: Headless Chrome per interazione con Archibald ERP
- Real-time: WebSocket server per sync multi-dispositivo (9 tipi di evento)

**Multi-utente/multi-dispositivo:**
- Ogni utente logga con proprie credenziali Archibald
- Opera in autonomia (1 operazione alla volta per utente, utenti diversi in parallelo)
- Sync automatici con intervalli configurabili da admin
- Qualsiasi dispositivo con sync real-time via WebSocket

## Constraints

- **Stack**: TypeScript + React + Express + Puppeteer + BullMQ + Redis + PostgreSQL — nessun cambio
- **Produzione attiva**: La PWA è in uso quotidiano dagli agenti Komet
- **VPS risorse**: Budget minimo VPS Hetzner, ottimizzare consumo risorse
- **Archibald ERP**: Nessuna API, solo browser automation via Puppeteer

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Concurrency per-utente (non globale) | Utenti diversi in parallelo, 1 op/utente. Semplifica lock system | ✓ Good — Worker concurrency 10, backoff esponenziale |
| IVA da database (excel admin + alert) | IVA caricata via excel, corretta tramite alert articoli | ✓ Good — products.service shape fixed, dead VAT code removed |
| Sync intervals configurabili da admin | Admin imposta intervalli dal pannello, non hardcoded | ✓ Good — Per-type timers, DB persistence, API routes |
| File orfani cancellati direttamente | Git è il safety net, no _deprecated/ | ✓ Good — 82+ files removed cleanly |
| PDF store su filesystem con TTL | Sopravvive al restart, condivisione DDT/fatture | ✓ Good — .pdf/.meta.json sidecar, 2h TTL |
| BullMQ native deduplication | Simple mode per sync, Throttle 30s per writes | ✓ Good — Replaced broken timestamp idempotencyKey |
| bot_results compensating transactions | check-save-clear pattern per 4 handler critici | ✓ Good — No duplicate bot calls after DB failure |
| SHA-256 hashing (no MD5) | Sicurezza e consistenza | ✓ Good — All sync services migrated |
| MemoryStore per rate limiting | Single-process VPS, no Redis needed | ✓ Good — 3-tier limiting operational |
| E2E + integration test su VPS | Verifica completa su ambiente reale | ✓ Good — 35 E2E + 22 integration passing |

---
*Last updated: 2026-02-21 after v1.0 milestone*
