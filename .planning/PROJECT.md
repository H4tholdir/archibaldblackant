# Archibald Black Ant - Stabilization & Bug Fix

## What This Is

Milestone di stabilizzazione della PWA Archibald Black Ant dopo due grandi refactoring: (1) eliminazione IndexedDB con backend-as-source-of-truth e (2) queue unificata BullMQ per operazioni e sync. L'obiettivo è fixare tutti i bug identificati dalla code review approfondita (23 bug, 10 file orfani), implementare gli stub attivamente usati dal frontend, e aggiungere test automatici completi (unit, integration, E2E) eseguibili anche in VPS.

## Core Value

Riportare la PWA a **perfetto funzionamento multi-utente e multi-dispositivo**, eliminando ogni race condition, stub silenzioso e feature rotta, con copertura test che garantisca stabilità nel tempo.

## Requirements

### Validated

- ✓ Frontend React PWA con routing completo (13 pagine) — existing
- ✓ Login/unlock flow con PIN e biometria — existing
- ✓ WebSocket context con reconnection e heartbeat — existing
- ✓ API layer frontend completo (9 moduli) — existing
- ✓ PostgreSQL schema con 4 migrazioni (shared, agents, system) — existing
- ✓ Repository layer con query parametrizzate (no SQL injection) — existing
- ✓ BullMQ operation queue con 15 tipi di operazione e priorità — existing
- ✓ Browser pool multi-browser con LRU eviction — existing
- ✓ Bot Archibald con operation tracking e performance reporting — existing
- ✓ Eliminazione completa Dexie/IndexedDB per dati applicativi — existing
- ✓ IndexedDB solo per credential store crittografato (legittimo) — existing
- ✓ localStorage solo per JWT, device ID, UI state (legittimo) — existing
- ✓ Handler factory pattern per tutte le 15 operazioni — existing
- ✓ Password cache con lazy-load da DB e AES-256-GCM — existing

### Active

**Bug Critici - Multi-device Sync:**
- [ ] BUG-1: Avviare sync scheduler con intervalli configurabili da admin + fix getActiveAgentIds
- [ ] BUG-2: Emettere tutti i 9 eventi WebSocket (PENDING_CREATED/UPDATED/DELETED/SUBMITTED, JOB_STARTED/PROGRESS, ORDER_NUMBERS_RESOLVED) da pending-orders e operation-processor
- [ ] BUG-3: Implementare SSE progress reale (onJobEvent) o rimuoverlo e riattivare UnifiedSyncProgress via WebSocket

**Bug Critici - Operation Queue & Preemption:**
- [ ] BUG-12: Implementare shouldStop() reale nei sync handlers collegato al meccanismo di preemption
- [ ] BUG-13: Fix race condition preemption nel processor (attendere stop effettivo, non timeout fisso 2s)
- [ ] BUG-14: Fix race condition browser pool user lock (lock rilasciato prima del completamento)
- [ ] BUG-16: Aggiungere timeout sui handler per prevenire pool exhaustion

**Bug Critici - Data Integrity:**
- [ ] BUG-5: IVA da database (inserita via excel admin + alert articoli) invece di hardcoded 22%
- [ ] BUG-15: Gestire fallimento transazione post-bot con compensating logic
- [ ] BUG-17: Proteggere customer sync da parser failures (non cancellare se PDF incompleto)
- [ ] BUG-18: Implementare deduplicazione idempotency key nella queue

**Bug Alti - Feature Rotte:**
- [ ] BUG-4: Passare createCustomerBot a createApp per abilitare route interattive clienti
- [ ] BUG-6: Persistere PDF su filesystem con TTL cleanup invece di in-memory Map
- [ ] BUG-7: Concurrency per-utente: utenti diversi in parallelo, 1 operazione alla volta per utente

**Bug Medi - Hardening:**
- [ ] BUG-19: Standardizzare hashing a SHA-256 (eliminare MD5 da order-sync e price-sync)
- [ ] BUG-20: Validare parseInt con isNaN su tutti i query params (orders.ts, admin.ts)
- [ ] BUG-21: Rate limiting su route costose (sync, PDF, import)

**Stub da Implementare (frontend li chiama attivamente):**
- [ ] Subclients API: getAll, search, getByCode, importSubclients (usato da SubClientSelector.tsx e AdminPage.tsx)
- [ ] getNextFtNumber: numerazione progressiva FT (usato da fresis-history API)
- [ ] exportArca: export dati Arca (usato da fresis-history API)
- [ ] Stub rimanenti: price history, importExcel prezzi/warehouse, admin sessions — valutare se usati

**Cleanup:**
- [ ] BUG-10/11: Spostare file orfani in cartella _deprecated/ (8 frontend + 2 backend)
- [ ] BUG-22: Rimuovere legacy localStorage keys (archibald_fullName, archibald_username)
- [ ] BUG-23: Fix naming inconsistency sentToMilanoAt → sentToVeronaAt
- [ ] Rimuovere dead code DDT sync ternary (false ? false : false)

**Testing:**
- [ ] Unit test per tutti i fix critici (operation processor, agent lock, sync handlers)
- [ ] Integration test per WebSocket events end-to-end
- [ ] Integration test per operation queue con preemption
- [ ] Integration test per sync services con DB
- [ ] E2E Playwright contro PWA deployata in VPS (login, ordini, sync, multi-device)
- [ ] CI/CD pipeline per eseguire test automaticamente

### Out of Scope

- Nuove feature (analytics, dashboard KPI, voice input migliorato) — milestone successiva
- Offline-first / service worker avanzato — milestone successiva
- Migrazione JWT a HttpOnly cookies — miglioramento futuro, non urgente
- Redesign UI — la UI funziona, focus su backend/logic
- Supporto altri ERP — solo Archibald
- Mobile app nativa — PWA basta

## Context

**Stato attuale:**
La PWA è deployata in produzione su VPS (formicanera.com) ed è usata attivamente dagli agenti Komet. Dopo due grandi refactoring (eliminazione IndexedDB + queue unificata BullMQ), una code review approfondita con 6 agenti paralleli ha identificato 23 bug di severità variabile. I più critici riguardano:

1. **Sync rotto**: Lo scheduler non parte mai, gli eventi WebSocket non vengono emessi, SSE è stub
2. **Preemption inoperativa**: shouldStop() sempre false, race conditions nel processor
3. **Data integrity**: Transazioni non atomiche tra bot e DB, customer sync aggressivo
4. **Stub silenziosamente rotti**: Il frontend chiama endpoint che ritornano array vuoti

**Architettura:**
- Frontend: React 19 PWA (Vite + TypeScript)
- Backend: Express + Puppeteer + BullMQ + Redis + PostgreSQL
- Deploy: Docker Compose su VPS (Nginx + Node + Redis + PostgreSQL)
- Automazione: Headless Chrome per interazione con Archibald ERP

**Multi-utente/multi-dispositivo:**
- Ogni utente logga con proprie credenziali Archibald
- Opera in autonomia (1 operazione alla volta per utente)
- Sync automatici viaggiano indipendentemente
- Può aprire la PWA da qualsiasi dispositivo e continuare il lavoro

## Constraints

- **Stack**: TypeScript + React + Express + Puppeteer + BullMQ + Redis + PostgreSQL — nessun cambio
- **Produzione attiva**: La PWA è in uso, i fix devono essere retrocompatibili
- **VPS risorse**: Budget minimo VPS, ottimizzare consumo risorse
- **Archibald ERP**: Nessuna API, solo browser automation via Puppeteer

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Concurrency per-utente (non globale) | Ogni utente opera 1 alla volta, ma utenti diversi in parallelo. Sync automatici indipendenti. Semplifica il lock system | — Pending |
| IVA da database (excel admin + alert articoli) | L'IVA viene caricata via excel nella pagina admin e corretta tramite alert nella pagina articoli, non hardcoded | — Pending |
| Sync intervals configurabili da admin | L'admin deve poter impostare gli intervalli dal pannello di controllo, non hardcoded | — Pending |
| File orfani cancellati direttamente | Git è il safety net — cancellazione diretta, no cartella _deprecated/ | Decided (Phase 1 planning) |
| PDF store su filesystem con TTL | Feature usata spesso dagli agenti (condivisione DDT, fatture via WhatsApp/Email), deve sopravvivere al restart | — Pending |
| Test E2E + integration su VPS | Sia Playwright E2E che integration test backend eseguiti contro la PWA in VPS per verifica completa | — Pending |

---
*Last updated: 2026-02-20 after initialization with comprehensive code review*
