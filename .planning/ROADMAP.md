# Roadmap: Archibald Black Ant

## Overview

Trasformare Archibald Black Ant da prototipo a PWA production-ready per agenti Komet. Il percorso parte da fondamenta sicure (security fixes, testing), costruisce l'MVP ordini con voice input affidabile, abilita multi-utente e offline-first, aggiunge storico e gestione ordini completa, e conclude con deployment professionale su archibaldblackant.it.

## Domain Expertise

None (full-stack web app con pattern standard)

## Phases

- [x] **Phase 1: Security Critical Fixes** - Eliminare vulnerabilità credenziali e bug runtime
- [x] **Phase 2: Code Quality Foundation** - Stabilire testing framework e rimuovere tech debt
- [ ] **Phase 3: MVP Order Form** - Completare form ordini production-ready
- [ ] **Phase 4: Voice Input Enhancement** - Voice hybrid affidabile con conferma visiva
- [ ] **Phase 5: Order Submission** - Invio ordine ottimizzato con tracking
- [ ] **Phase 6: Multi-User Authentication** - Login multi-agente con whitelist
- [ ] **Phase 7: Credential Management** - Storage sicuro credenziali su device
- [ ] **Phase 8: Offline Capability** - Cache IndexedDB e bozze persistenti
- [ ] **Phase 9: Offline Queue** - Coda ordini offline con sync manuale
- [ ] **Phase 10: Order History** - Storico ordini da Archibald
- [ ] **Phase 11: Order Management** - Modifica, duplica e tracking ordini
- [ ] **Phase 12: Deployment & Infrastructure** - Setup produzione VPS

## Phase Details

### Phase 1: Security Critical Fixes
**Goal**: Eliminare vulnerabilità security critical (credenziali test in chiaro, bug runtime) per fondamenta sicure
**Depends on**: Nothing (first phase)
**Research**: Unlikely (git history cleanup è procedura standard, fix bug è codice esistente)
**Plans**: 5 plans

Plans:
- [x] 01-01: Rotate test credentials in Archibald ERP
- [x] 01-02: Remove backend/.env from git history with BFG Repo-Cleaner
- [x] 01-03: Add .env to .gitignore and document required vars in .env.example
- [x] 01-04: Fix activeSyncType undefined bug in backend/src/index.ts
- [x] 01-05: Centralize all hardcoded URLs in backend/src/config.ts

### Phase 2: Code Quality Foundation
**Goal**: Stabilire testing framework e rimuovere tech debt per codebase maintainable
**Depends on**: Phase 1
**Research**: Unlikely (Vitest già configurato, pattern di testing standard)
**Plans**: 8 plans

Plans:
- [x] 02-01: Setup Vitest with first unit test (smoke test)
- [x] 02-02: Replace console.log in Core Services (customer/product/price sync)
- [x] 02-03: Replace console.log in Bot & Pool (archibald-bot, browser-pool, session-manager)
- [x] 02-04: Remove type any in Database Layer (customer-db, product-db, schemas, types)
- [x] 02-05: Remove type any in Services & Bot (sync services, archibald-bot)
- [x] 02-06: Remove Dead Code (product-sync-service, backup files)
- [x] 02-07: Unit Tests for Database Layer (TDD - CustomerDatabase, ProductDatabase)
- [x] 02-08: Integration Tests for Sync Services (TDD - sync services with mocked Puppeteer)

### Phase 3: MVP Order Form
**Goal**: Form ordini production-ready con selezione pacchetto automatica basata su quantità e validazione vincoli
**Depends on**: Phase 2
**Research**: Complete (03-01 - discovered unique variant IDs and package selection logic)
**Plans**: 8 plans (3/8 complete)
**CRITICAL BLOCKER**: 03-08 must be completed before any other Phase 3 plans

Plans:
- [x] 03-01: Package/Multiplier UI Discovery (Research - complete)
- [x] 03-02: Package Variant Database Functions (TDD - complete)
- [x] 03-03: Package Selection in Archibald Bot (search by variant ID - complete)
- [ ] 🔴 **03-08: CRITICAL - Refactor Archibald Bot Order Flow** (BLOCKS ALL PHASE 3 - top priority)
- [ ] 03-04: Quantity Validation Against Package Rules (blocked by 03-08)
- [ ] 03-05: Frontend Package Display in OrderForm (blocked by 03-08)
- [ ] 03-06: Frontend Quantity Validation & User Feedback (blocked by 03-08)
- [ ] 03-07: Integration Tests for Package Selection (blocked by 03-08)

### Phase 4: Voice Input Enhancement
**Goal**: Voice hybrid affidabile (dettatura → form → conferma tap) per ridurre errori input
**Depends on**: Phase 3
**Research**: Unlikely (Web Speech API già implementato, miglioramento pattern esistenti)
**Plans**: 5 plans

Plans:
- [ ] 04-01: Refactor voice parser for reliable entity extraction (cliente, articolo, quantità)
- [ ] 04-02: Add visual feedback during voice recognition (real-time transcription)
- [ ] 04-03: Populate form fields from voice input (pre-fill, not submit)
- [ ] 04-04: Add tap confirmation requirement before order creation
- [ ] 04-05: Add manual edit capability for voice-populated fields

### Phase 5: Order Submission
**Goal**: Invio ordine Puppeteer ottimizzato con tracking real-time e error recovery robusto
**Depends on**: Phase 4
**Research**: Unlikely (Puppeteer automation già funzionante, ottimizzazione pattern esistenti)
**Plans**: 6 plans

Plans:
- [ ] 05-01: Optimize Puppeteer order submission flow (reduce latency)
- [ ] 05-02: Enhance WebSocket real-time job progress tracking
- [ ] 05-03: Add detailed error messages for common failure modes
- [ ] 05-04: Implement exponential backoff retry strategy (BullMQ config)
- [ ] 05-05: Add E2E test for complete order flow (Playwright)
- [ ] 05-06: Add order success confirmation with Archibald order ID

### Phase 6: Multi-User Authentication
**Goal**: Abilitare login multi-agente con whitelist e sessioni Puppeteer separate per-utente
**Depends on**: Phase 5
**Research**: Likely (session management architecture decision)
**Research topics**: Puppeteer multi-session patterns, session isolation strategies, credential flow architecture
**Plans**: 8 plans

Plans:
- [ ] 06-01: Research Puppeteer multi-session architecture patterns
- [ ] 06-02: Design per-user session architecture (DB schema, backend API)
- [ ] 06-03: Create agent whitelist management (admin backend endpoint)
- [ ] 06-04: Implement login UI with Archibald credentials input
- [ ] 06-05: Add backend authentication endpoint (validate against whitelist)
- [ ] 06-06: Refactor BrowserPool to support per-user sessions
- [ ] 06-07: Update order creation to use authenticated user session
- [ ] 06-08: Add logout and session cleanup

### Phase 7: Credential Management
**Goal**: Salvataggio cifrato credenziali su device con Web Crypto API, backend stateless
**Depends on**: Phase 6
**Research**: Likely (Web Crypto API usage for secure storage)
**Research topics**: Web Crypto API best practices, IndexedDB encryption patterns, device-local credential storage
**Plans**: 6 plans

Plans:
- [ ] 07-01: Research Web Crypto API encryption best practices
- [ ] 07-02: Implement IndexedDB credentials store with encryption
- [ ] 07-03: Add PIN/biometric unlock UI for credential access
- [ ] 07-04: Refactor backend to session-per-request (no credential storage)
- [ ] 07-05: Add credential expiry and re-authentication flow
- [ ] 07-06: Add security audit and penetration test checklist

### Phase 8: Offline Capability
**Goal**: Cache IndexedDB per clienti/prodotti/prezzi e bozze ordine persistenti
**Depends on**: Phase 7
**Research**: Likely (offline-first PWA patterns)
**Research topics**: IndexedDB schema design, service worker caching strategies, Workbox configuration for Vite
**Plans**: 8 plans

Plans:
- [ ] 08-01: Research IndexedDB schema for customers/products/prices
- [ ] 08-02: Implement IndexedDB wrapper with Dexie.js
- [ ] 08-03: Migrate sync services to populate IndexedDB (not just SQLite backend)
- [ ] 08-04: Update frontend to read from IndexedDB cache
- [ ] 08-05: Implement service worker with offline-first strategy
- [ ] 08-06: Add draft order persistence to IndexedDB
- [ ] 08-07: Add offline indicator UI (network status)
- [ ] 08-08: Test offline scenarios (airplane mode, flaky network)

### Phase 9: Offline Queue
**Goal**: Coda ordini offline con invio manuale e conflict resolution per dati stale
**Depends on**: Phase 8
**Research**: Likely (conflict resolution patterns)
**Research topics**: Offline queue persistence, sync conflict detection, reconciliation strategies for stale data
**Plans**: 7 plans

Plans:
- [ ] 09-01: Research offline queue and conflict resolution patterns
- [ ] 09-02: Design offline order queue schema (IndexedDB)
- [ ] 09-03: Implement queue when order created offline
- [ ] 09-04: Add manual sync UI with user consent prompt
- [ ] 09-05: Implement background sync when network returns
- [ ] 09-06: Add conflict detection (stale price/product data)
- [ ] 09-07: Implement conflict resolution UI (notify user, allow re-confirmation)

### Phase 10: Order History
**Goal**: Lettura storico ordini da Archibald con filtri e dettaglio completo
**Depends on**: Phase 9
**Research**: Likely (Archibald order history UI parsing)
**Research topics**: Archibald order list selectors, pagination patterns, order detail extraction
**Plans**: 6 plans

Plans:
- [ ] 10-01: Research Archibald order history UI and selectors
- [ ] 10-02: Implement Puppeteer scraper for order list (pagination support)
- [ ] 10-03: Implement order detail extraction (articoli, quantità, prezzi, totale)
- [ ] 10-04: Create backend API endpoint for order history
- [ ] 10-05: Build frontend order history UI with filters (cliente, data, stato)
- [ ] 10-06: Add order detail view with full information

### Phase 11: Order Management
**Goal**: Modifica ordini pendenti, duplica ordine e tracking stato spedizione
**Depends on**: Phase 10
**Research**: Likely (Archibald order modification workflows)
**Research topics**: Edit order flow in Archibald, order status tracking, duplication patterns
**Plans**: 7 plans

Plans:
- [ ] 11-01: Research Archibald order edit workflow and constraints
- [ ] 11-02: Implement order status tracking (in lavorazione/spedito/consegnato)
- [ ] 11-03: Add backend endpoint for order status updates
- [ ] 11-04: Build order status UI with real-time updates
- [ ] 11-05: Implement edit pending order (if not yet processed)
- [ ] 11-06: Implement duplicate order ("Ripeti ultimo ordine")
- [ ] 11-07: Add order action audit log (chi ha modificato cosa, quando)

### Phase 12: Deployment & Infrastructure
**Goal**: Setup produzione VPS con Docker, CI/CD e archibaldblackant.it SSL
**Depends on**: Phase 11
**Research**: Likely (VPS setup and Docker orchestration)
**Research topics**: Docker Compose best practices, Nginx reverse proxy config, Let's Encrypt automation, CI/CD for mono-repo
**Plans**: 10 plans

Plans:
- [ ] 12-01: Research VPS providers (budget €10-20/mese, 2 vCPU / 4 GB RAM)
- [ ] 12-02: Create Dockerfile for backend (multi-stage build)
- [ ] 12-03: Create Dockerfile for frontend (Nginx serve static)
- [ ] 12-04: Create docker-compose.yml (frontend, backend, redis, nginx)
- [ ] 12-05: Configure Nginx reverse proxy and SSL (Let's Encrypt)
- [ ] 12-06: Setup domain DNS for archibaldblackant.it
- [ ] 12-07: Add health check endpoint (/health) and monitoring
- [ ] 12-08: Implement graceful shutdown with operation wait
- [ ] 12-09: Create CI/CD pipeline (GitHub Actions or GitLab CI)
- [ ] 12-10: Production deployment and smoke test

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Critical Fixes | 5/5 | ✅ Complete | 2026-01-12 |
| 2. Code Quality Foundation | 8/8 | ✅ Complete | 2026-01-12 |
| 3. MVP Order Form | 3/7 | 🔄 In progress | - |
| 4. Voice Input Enhancement | 0/5 | Not started | - |
| 5. Order Submission | 0/6 | Not started | - |
| 6. Multi-User Authentication | 0/8 | Not started | - |
| 7. Credential Management | 0/6 | Not started | - |
| 8. Offline Capability | 0/8 | Not started | - |
| 9. Offline Queue | 0/7 | Not started | - |
| 10. Order History | 0/6 | Not started | - |
| 11. Order Management | 0/7 | Not started | - |
| 12. Deployment & Infrastructure | 0/10 | Not started | - |

**Total Plans**: 83 across 12 phases
