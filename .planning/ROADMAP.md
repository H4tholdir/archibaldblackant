# Roadmap: Archibald Black Ant

## Overview

Trasformare Archibald Black Ant da prototipo a PWA production-ready per agenti Komet. Il percorso parte da fondamenta sicure (security fixes, testing), costruisce l'MVP ordini con voice input affidabile, abilita multi-utente e offline-first, aggiunge storico e gestione ordini completa, e conclude con deployment professionale su archibaldblackant.it.

## Domain Expertise

None (full-stack web app con pattern standard)

## Phases

- [x] **Phase 1: Security Critical Fixes** - Eliminare vulnerabilità credenziali e bug runtime
- [x] **Phase 2: Code Quality Foundation** - Stabilire testing framework e rimuovere tech debt
- [x] **Phase 3: MVP Order Form** - Completare form ordini production-ready ✅
- [x] **Phase 3.1: Bot Performance Profiling & Optimization (INSERTED)** - Sistema profiling e piano ottimizzazione dettagliato ✅
- [x] **Phase 3.2: Bot Performance Implementation (INSERTED)** - Ottimizzazioni critiche completate (9% improvement, bug fixes) ✅
- [x] **Phase 4: Voice Input Enhancement** - Voice hybrid affidabile con conferma visiva ✅
- [x] **Phase 4.1: Critical Production Fixes (INSERTED)** - 🔴 Fix blockers: backend pause ✓, price sync ✓, voice UX ✓, customer priority ✅
- [x] **Phase 6: Multi-User Authentication** - Login multi-agente con whitelist ✅ COMPLETE (7/7 plans)
- [x] **Phase 7: Credential Management** - Storage sicuro credenziali su device ✅ COMPLETE (6/6 plans)
- [x] **Phase 8: Offline Capability** - Cache IndexedDB e bozze persistenti ✅ COMPLETE (8/8 plans)
- [x] **Phase 9: Offline Queue** - Coda ordini offline con sync manuale ✅
- [x] **Phase 10: Order History** - Storico ordini da Archibald ✅ COMPLETE (7/7 plans)
- [x] **Phase 11: Order Management** - Tracking ordini, invio Milano, DDT e fatture ✅ COMPLETE (7/7 plans)
- [x] **Phase 12: Deployment & Infrastructure** - Setup produzione VPS ✅ COMPLETE (3/4 plans complete, Part D deferred)
- [x] **Phase 13: Security Audit & Sensitive Data Cleanup** - Audit completo e sanitizzazione ✅ COMPLETE (1/6 plans, rest optional)
- [x] **Phase 5: Order Submission** - Invio ordine ottimizzato con tracking ✅ COMPLETE (goals achieved via other phases)
- [x] **Phase 14: Fix IndexedDB Critical Error** - Risolvere errore IDBObjectStore 'put' ✅ COMPLETE
- [x] **Phase 15: Dashboard Homepage UI** - Layout, budget widgets, visualizzazioni progresso ✅ COMPLETE
- [x] **Phase 16: Target Wizard & Setup** - Wizard setup iniziale + modifica profilo ✅ COMPLETE
- [x] **Phase 17: Dashboard Metrics Backend** - API budget, ordini, progressi ✅ COMPLETE
- [x] **Phase 18.1: PDF Export Discovery & Validation (INSERTED)** - Validare possibilità estrazione dati da PDF ✅ COMPLETE
- [x] **Phase 18: Customers Sync Analysis & Optimization** - Migrazione da HTML a PDF sync ✅ COMPLETE
- [x] **Phase 19: Products Sync Analysis & Optimization** - Analisi + background + manual + images ✅ COMPLETE
- [x] **Phase 19.1: Product Cards UI Enhancement (INSERTED)** - Visualizzazione 26+ campi + gestione varianti ✅ COMPLETE
- [x] **Phase 20: Prices Sync Analysis & Optimization** - Analisi + background + manual + Excel listino ✅ COMPLETE
- [x] **Phase 21: Orders Sync Analysis & Optimization** - Analisi + background + manual ✅ COMPLETE
- [x] **Phase 22: Sync Orchestration Layer** - Coordinator anti-overlap, staggered scheduling ✅ COMPLETE
- [x] **Phase 23: Sync UI Controls** - Bottoni granulari + sync generale ✅ COMPLETE
- [x] **Phase 24: Background Sync Service** - Auto-sync abilitato con admin controls ✅ COMPLETE
- [x] **Phase 25: Sync Monitoring Dashboard** - Admin UI monitoraggio sync ✅ COMPLETE
- [x] **Phase 26: Universal Fast Login** - Login veloce per tutte le operazioni ✅ COMPLETE
- [x] **Phase 27: Bot Performance Profiling v2** - Profile dettagliato post optimizations ✅ COMPLETE
- [x] **Phase 28: Bot Performance Optimization v2** - Target < 60s per ordine ✅ COMPLETE
- [ ] **Phase 28.1: Fix Order Form Critical Bugs (INSERTED)** - 🔴 CRITICAL: Fix customer selection, product filtering, white screen crash (PAUSED - superseded by 28.2)
- [ ] **Phase 28.2: Rewrite OrderForm with Proper Architecture (INSERTED)** - 🔴 URGENT: Complete rewrite with 3-layer architecture (4/6 plans complete)
- [x] **Phase 29: WebSocket Server Infrastructure** - Setup Node.js WebSocket server con auth e connection manager ✅ COMPLETE
- [x] **Phase 30: WebSocket Client & Auto-Reconnect** - Frontend client con reconnection automatica ed event handling ✅ COMPLETE
- [x] **Phase 31: Draft Orders Real-Time Sync** - Migrazione draft da polling a WebSocket (CREATE/UPDATE/DELETE) ✅ COMPLETE
- [x] **Phase 32: Pending Orders Real-Time Sync** - Migrazione pending orders ed eliminazione UnifiedSyncService ✅ COMPLETE
- [x] **Phase 33: Direct Delete & Tombstone Removal** - Rimuovere tombstones, implementare direct DELETE ✅ COMPLETE
- [x] **Phase 34: E2E Testing & Multi-Device Validation** - Test suite completa e validazione multi-device ✅ COMPLETE
- [x] **Phase 35: Monitoring & Observability** - WebSocket health metrics e connection monitoring ✅ COMPLETE
- [x] **Phase 36: Performance Tuning & Optimization** - Load testing e latency optimization ✅ COMPLETE

## Milestones

- ✅ **v3.0 WebSocket Real-Time Sync** - Phases 29-36 (SHIPPED 2026-02-05)
- ✅ **[v2.0 Agent Dashboard & Sync Reliability](milestones/v2.0-ROADMAP.md)** - Phases 14-28 (shipped 2026-01-22)
- ✅ **v1.0 MVP & Production Deployment** - Phases 1-13 (shipped 2026-01-17)

## Phase Details

<details>
<summary>✅ v1.0 MVP & Production Deployment (Phases 1-13) - SHIPPED 2026-01-17</summary>

See phases 1-13 below for complete details of v1.0 milestone.

</details>

<details>
<summary>✅ v2.0 Agent Dashboard & Sync Reliability (Phases 14-28) - SHIPPED 2026-01-22</summary>

**Milestone Goal**: Potenziare l'app con dashboard motivazionale per agenti, sistema di sync bulletproof con orchestrazione intelligente, e performance critiche ottimizzate per produttività massima.

**Full details:** See [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md)

**Key accomplishments:**
- Agent dashboard with budget widgets, target wizard, and real-time metrics
- PDF-based sync migration for all data types (customers, products, prices, orders, DDT, invoices)
- Sync orchestration layer with mutex locking and staggered scheduling
- Background auto-sync with admin controls and monitoring dashboard
- Universal fast login with BrowserPool context caching (50% faster)
- Bot performance optimization (~35s improvement, 100% reliability)

**Stats:** 17 phases, 52 plans, 5 days (2026-01-18 to 2026-01-22)

</details>

### 🚧 v3.0 WebSocket Real-Time Sync (In Progress)

**Milestone Goal:** Semplificare drasticamente l'architettura di sincronizzazione sostituendo polling HTTP (ogni 15s) + tombstones con WebSocket real-time bidirezionale, eliminando complessità, bug e raggiungendo latency <100ms per operazioni multi-device.

#### Phase 29: WebSocket Server Infrastructure ✅ COMPLETE
**Goal**: Setup Node.js WebSocket server con autenticazione JWT, connection manager e broadcast per operazioni draft/pending
**Depends on**: Phase 28.2 (OrderForm rewrite complete)
**Research**: Completed (Level 1 - Quick verification, ws 8.19.0 already installed)
**Plans**: 1/1 complete
**Completed**: 2026-02-05

Plans:
- [x] 29-01: WebSocket Server with JWT Auth & Express Integration — 8min ✅

#### Phase 30: WebSocket Client & Auto-Reconnect ✅ COMPLETE
**Goal**: Frontend WebSocket client con auto-reconnect, exponential backoff, pending operations queue per offline support
**Depends on**: Phase 29
**Research**: Completed (Level 1 - Quick verification, standard WebSocket patterns)
**Plans**: 1/1 complete
**Completed**: 2026-02-05

Plans:
- [x] 30-01: WebSocket Client Hook & Offline Queue — 3min ✅

#### Phase 31: Draft Orders Real-Time Sync ✅ COMPLETE
**Goal**: Migrare draft orders da polling a WebSocket (CREATE_DRAFT, UPDATE_DRAFT, DELETE_DRAFT, DRAFT_CONVERTED events)
**Depends on**: Phase 30
**Research**: Unlikely (applying established WebSocket patterns from Phase 29-30)
**Plans**: 1/1 complete
**Completed**: 2026-02-05

Plans:
- [x] 31-01: Draft WebSocket Events & Real-Time Sync — 5min ✅

#### Phase 32: Pending Orders Real-Time Sync ✅ COMPLETE
**Goal**: Migrare pending orders a WebSocket, eliminare UnifiedSyncService e polling periodico (15s)
**Depends on**: Phase 31
**Research**: Unlikely (following Phase 31 patterns)
**Plans**: 1/1 complete
**Completed**: 2026-02-05

Plans:
- [x] 32-01: Pending Orders WebSocket & Sync Elimination — 6min ✅

#### Phase 33: Direct Delete & Tombstone Removal ✅ COMPLETE
**Goal**: Rimuovere sistema tombstones, implementare direct DELETE, semplificare codice (~90 righe eliminate)
**Depends on**: Phase 32
**Research**: Unlikely (simplification, no new technology)
**Plans**: 1/1 complete
**Completed**: 2026-02-05

Plans:
- [x] 33-01: Direct DELETE Implementation & Tombstone Removal — 4min ✅

#### Phase 34: E2E Testing & Multi-Device Validation ✅ COMPLETE
**Goal**: Test suite completa end-to-end, validazione multi-device con scenari real-world (2+ devices, offline/online)
**Depends on**: Phase 33
**Research**: Unlikely (testing patterns established, Playwright/Vitest in stack)
**Plans**: 1/1 complete
**Completed**: 2026-02-05

Plans:
- [x] 34-01: Playwright Setup & Multi-Device E2E Tests — 45min ✅

#### Phase 35: Monitoring & Observability ✅ COMPLETE
**Goal**: WebSocket health metrics, connection monitoring, latency tracking, dashboard per amministratori
**Depends on**: Phase 34
**Research**: Unlikely (extending existing monitoring from Phase 25)
**Plans**: 1/1 complete
**Completed**: 2026-02-05

Plans:
- [x] 35-01: WebSocket Health & Metrics Dashboard — 48min ✅

#### Phase 36: Performance Tuning & Optimization ✅ COMPLETE
**Goal**: Load testing con 10+ concurrent users, latency optimization (<100ms target), stress testing
**Depends on**: Phase 35
**Research**: Unlikely (benchmarking and tuning established patterns)
**Plans**: 1/1 complete
**Completed**: 2026-02-05

Plans:
- [x] 36-01: K6 Load Testing Infrastructure, Performance Analysis & Stress Testing — 12min ✅

---

#### Phase 14: Fix IndexedDB Critical Error ✅ COMPLETE
**Goal**: Risolvere completamente l'errore `IDBObjectStore 'put'` che appare su tutte le pagine della PWA
**Depends on**: Phase 13 (v1.0 complete)
**Research**: Unlikely (debugging existing IndexedDB implementation, standard error patterns)
**Plans**: 1/1 complete
**Completed**: 2026-01-18

Plans:
- [x] 14-01: IndexedDB Error Audit & Fix (sanitize undefined fields, structured logging) — 8min

#### Phase 15: Dashboard Homepage UI ✅ COMPLETE
**Goal**: Creare layout homepage dashboard con budget widgets e visualizzazioni progresso motivazionali
**Depends on**: Phase 14
**Research**: Unlikely (React components with existing patterns, UI libraries already in stack)
**Plans**: 4/4
**Completed**: 2026-01-18

Plans:
- [x] 15-01: Homepage Layout & Navigation (Dashboard route, DashboardNav global, cleanup) — 45min
- [x] 15-02: Budget Progress Widget (color-coded progress bar, status badge) — 15min
- [x] 15-03: Orders Summary Widget (temporal breakdown, clickable navigation) — 20min
- [x] 15-04: Target Visualization Widget (circular chart, motivational messages) — 25min

#### Phase 16: Target Wizard & Setup ✅
**Goal**: Wizard setup iniziale target agente (obbligatorio primo accesso) + UI modifica da profilo
**Depends on**: Phase 15
**Research**: Unlikely (form wizard pattern, localStorage persistence - established patterns)
**Plans**: 4/4 complete

Plans:
- [x] 16-01: Backend Storage & API (monthlyTarget, currency, REST endpoints) — 21min
- [x] 16-02: First-Time Wizard UI (3-step onboarding modal, banking app UX) — 51min
- [x] 16-03: Profile Target Editor (ProfilePage component, /profile route, Profilo nav link) — 2min
- [x] 16-04: Dashboard Integration & Real Data (fetch target API, replace mock data, Modifica target link) — 3min

#### Phase 17: Dashboard Metrics Backend
**Goal**: API backend per metriche dashboard (budget, ordini mensili, progressi vs target)
**Depends on**: Phase 16
**Research**: Unlikely (REST API endpoints, database queries - existing patterns)
**Plans**: 1/1 complete
**Status**: Complete ✅
**Completed**: 2026-01-18

Plans:
- [x] 17-01: Dashboard Metrics Backend API (GET /api/metrics/budget, GET /api/metrics/orders, Dashboard integration) — 3min

#### Phase 18.1: PDF Export Discovery & Validation (INSERTED) ✅
**Goal**: Validare la possibilità di estrarre dati completi da PDF Archibald invece di scraping HTML
**Depends on**: Phase 17
**Research**: High (exploring PDF export capabilities, data completeness, parsing libraries)
**Plans**: 0 plans (discovery only)
**Status**: ✅ COMPLETE - Discovery validated feasibility
**Completed**: 2026-01-19

Discovery Results:
- ✅ PDF parsing is HIGHLY RECOMMENDED - **100% field coverage (26/26 business fields)**
- ✅ Performance: 15-20s (PDF) vs 30-60s (HTML) - **50-67% faster**
- ✅ Stability: High (file format stable) vs Low (UI-dependent)
- ✅ Data: 1,515 valid customers, **ALL business fields covered**
- ✅ Structure: 8-page cycles (pages 0-7) with complete analytics & accounts
- ✅ Parser: Python script working (`scripts/parse-clienti-pdf.py`) - needs 8-page update
- ✅ Database: Cleaned schema (removed legacy `internalId`) - 30 fields total
- See: `.planning/phases/18.1-pdf-export-discovery-validation/DISCOVERY.md`

**Rationale**: Scoperta game-changing della funzionalità di esportazione PDF in Archibald validata con successo. PDF parsing è più veloce, stabile e manutenibile del scraping HTML. Phase 18 procederà con implementazione PDF-based.

#### Phase 18: Customers Sync Analysis & Optimization
**Goal**: Migrazione completa da HTML scraping a PDF-based sync: parser 8-page, bot download, delta sync, manual UI, background scheduler
**Depends on**: Phase 17
**Research**: Completed (Phase 18.1 - PDF feasibility validated with 100% field coverage)
**Plans**: 5/5 complete ✅ PHASE COMPLETE

Plans:
- [x] 18-01: PDF Parser Enhancement & Node.js Integration (8-page cycle support, 26 business fields, Node wrapper, health check) ✅ COMPLETE (62min)
- [x] 18-02: PDF Download Bot Flow (bot download method, CustomerSyncService refactor, hash delta detection, test scripts) ✅ COMPLETE (45min)
- [x] 18-03: Manual Sync UI & API Endpoint (🔄 button, ManualSyncBanner component, JWT-protected POST /api/customers/sync) ✅ COMPLETE (60min)
- [x] 18-04: Background Sync Scheduler & Monitoring (30min interval, retry logic, metrics endpoint, admin controls, VPS verified) ✅ COMPLETE (90min)
- [x] 18-05: Comprehensive Testing & Performance Validation (test suite created: 8 unit + 15 integration tests, benchmark script, UAT checklist) ✅ COMPLETE (45min)

#### Phase 19: Products Sync Analysis & Optimization ✅ COMPLETE
**Goal**: Migrazione completa da HTML scraping a PDF-based sync: parser 8-page, bot download, delta sync, manual UI, background scheduler, eliminazione gestione immagini
**Depends on**: Phase 18
**Research**: Completed (Phase 18.1 - PDF approach proven, reuse patterns)
**Plans**: 5/5 complete ✅ COMPLETE

Plans:
- [x] 19-01: PDF Parser Enhancement & Node.js Integration (8-page cycle, 26+ fields, no images, Node wrapper, health check) ✅ COMPLETE (45min)
- [x] 19-02: PDF Download Bot Flow & ProductSyncService Refactor (bot download, eliminate HTML scraping, hash delta, eliminate ImageDownloader) ✅ COMPLETE (4min)
- [x] 19-03: Manual Sync UI & API Endpoint (🔄 button, ManualSyncBanner, JWT-protected POST /api/products/sync) ✅ COMPLETE (40min)
- [x] 19-04: Background Sync Scheduler & Monitoring (30min interval, retry logic, metrics endpoint, admin controls) ✅ COMPLETE (60min)
- [x] 19-05: Comprehensive Testing & Performance Validation (8 unit + 13 integration tests, benchmark <60s, UAT checklist) ✅ COMPLETE (45min)

#### Phase 19.1: Product Cards UI Enhancement (INSERTED)
**Goal**: Visualizzare tutti i 26+ campi nelle schede articolo e unificare varianti (stesso ID, diverso contenuto imballaggio)
**Depends on**: Phase 19-02 (Products sync working)
**Research**: Unlikely (UI components, variant grouping logic - standard React patterns)
**Plans**: 3/3
**Priority**: HIGH - Users need to see complete product data
**Status**: Planned ⏳

**Key Requirements:**
- Show all 26+ PDF fields in product cards (Figura, Grandezza, Quantità Standard, Sconti, ecc.)
- Unify products with same base ID but different `packageContent` into single card
- Variant selector for package options (5 colli vs 1 collo)
- Display price/VAT from database (already populated by Phase 4.1-02)
- ProductDetailModal with complete info
- Mobile-responsive layout

Plans:
- [x] 19.1-01: Backend Variant Grouping API (getProductVariants, grouped mode, frontend API client) — 5min
- [x] 19.1-02: ProductCard Enhancement with All 26+ Fields (6 sections, price badges, variant badges) — 5min
- [x] 19.1-03: Variant Selector & ArticoliList Deduplication (VariantSelector, ProductDetailModal, grouped ArticoliList) — 16min

#### Phase 20: Prices Sync Analysis & Optimization ✅ COMPLETE
**Goal**: Analisi completa sync prezzi + background sync + sync manuale + Excel listino integration
**Depends on**: Phase 19.1 (Product UI complete)
**Research**: Unlikely (analyzing existing sync + Excel parsing already integrated in v1.0)
**Plans**: 6/6 complete ✅
**Completed**: 2026-01-20

Plans:
- [x] 20-01: PDF Parser Enhancement & Node.js Integration (Prices) — 45min
- [x] 20-02: PDF Download Bot Flow & Separate Prices Database — 105min
- [x] 20-03: Excel IVA Upload Enhancement & Price Matching — 30min
- [x] 20-04: Price History Tracking System — 30min
- [x] 20-05: Price Variations Dashboard & Notifications UI — 60min
- [x] 20-06: Manual Sync UI & Comprehensive Testing — 60min

#### Phase 21: Orders Sync Analysis & Optimization ✅ COMPLETE
**Goal**: Migrazione completa da HTML scraping a PDF-based sync: parser multi-cycle (orders 7-page, DDT 6-page, invoices 7-page), 3 database separati (orders/ddt/invoices), tracking URLs, order matching, manual sync UI
**Depends on**: Phase 20
**Research**: Completed (Discovery: 3 PDFs analizzati, cycle patterns identificati, matching strategies definite)
**Plans**: 5/5 complete ✅
**Completed**: 2026-01-20

Plans:
- [x] 21-01: Orders PDF Parser & Separate Database (90min) — 7-page cycle, 20 campi, orders.db, delta detection ✅
- [x] 21-02: DDT PDF Parser & Separate Database with Tracking (8min) — 6-page cycle, tracking URLs, ddt.db, courier normalization ✅
- [x] 21-03: Invoices PDF Parser & Database with Order Matching (45min) — 7-page cycle, invoices.db, many-to-many matching ✅
- [x] 21-04: PDF Download Bot Flows (90min) — 3 download methods, sync services integration, Italian locale forcing ✅
- [x] 21-05: Manual Sync UI & Order History Enhancements (120min) — Sync buttons, filter updates (Spediti/Consegnati/Fatturati), toggle essenziali, invoice download ✅

#### Phase 22: Sync Orchestration Layer
**Goal**: Coordinator centrale per evitare overlap sync + staggered scheduling (15min intervals)
**Depends on**: Phase 21
**Research**: Likely (distributed coordination patterns, staggered scheduling algorithms)
**Research topics**: Job scheduling patterns, mutex/locking mechanisms, distributed coordination, event-driven architectures
**Plans**: TBD

Plans:
- [x] 22-01: Core Sync Orchestration (COMPLETE 2026-01-22)
- [x] 22-02: Staggered Scheduling (COMPLETE 2026-01-22)
- [x] 22-03: Comprehensive Testing & Verification (COMPLETE 2026-01-22)

#### Phase 23: Sync UI Controls ✅ COMPLETE
**Goal**: Bottoni UI granulari per ogni singolo sync + bottone sync generale
**Depends on**: Phase 22
**Research**: Unlikely (UI buttons and controls, existing React patterns)
**Plans**: 1/1 complete
**Completed**: 2026-01-22

Plans:
- [x] 23-01: Unified Sync Management UI (COMPLETE 2026-01-22)

#### Phase 24: Background Sync Service ✅ COMPLETE
**Goal**: Auto-sync abilitato con admin controls per gestione scheduling automatico
**Depends on**: Phase 23
**Research**: Not needed (infrastructure from Phase 22-02 already implemented)
**Plans**: 1/1 complete
**Completed**: 2026-01-22

Plans:
- [x] 24-01: Enable Auto-Sync on Startup with Admin Controls (COMPLETE 2026-01-22) — 15min

#### Phase 25: Sync Monitoring Dashboard ✅ COMPLETE
**Goal**: UI admin per monitorare sync status, tempi esecuzione, errori
**Depends on**: Phase 24
**Research**: Unlikely (admin UI with metrics display, existing monitoring patterns from v1.0 Phase 12)
**Plans**: 3/3 complete ✅ PHASE COMPLETE
**Completed**: 2026-01-22

Plans:
- [x] 25-01: Sync History Tracking in SyncOrchestrator (COMPLETE 2026-01-22) — 3min
- [x] 25-02: Backend API Endpoints for Monitoring (COMPLETE 2026-01-22) — 3min
- [x] 25-03: Frontend Monitoring Dashboard Component (COMPLETE 2026-01-22) — 18min

#### Phase 26: Universal Fast Login ✅ COMPLETE
**Goal**: Login veloce (come login iniziale) per tutte le operazioni (sync, bot, queries, reconnect)
**Depends on**: Phase 25
**Research**: None (optimized existing Puppeteer login flow with context caching)
**Plans**: 1/1 complete
**Completed**: 2026-01-22

Plans:
- [x] 26-01: Persistent Authenticated Context Pool (context reuse, session validation, LRU eviction, 50% faster) — 25min

#### Phase 27: Bot Performance Profiling v2 ✅ COMPLETE
**Goal**: Profile dettagliato post Phase 3.1 optimizations per identificare nuovi colli di bottiglia
**Depends on**: Phase 26
**Research**: Unlikely (extending existing profiling system from Phase 3.1, same patterns)
**Plans**: 4/4 complete ✅
**Status**: Complete (via manual optimization approach)
**Completed**: 2026-01-22

Plans:
- [x] 27-01: UI Optimization + Slowdown Infrastructure (direct paste article field, SlowdownConfig interface) — 24min ✅ COMPLETE
- [x] 27-02: Binary Search Slowdown Optimizer (SlowdownOptimizer class with crash detection and bot restart) — 35min ✅ COMPLETE
- [x] 27-03: Manual Timeout Optimization (manual approach, ~35s improvement, 8/8 test orders) — 180min ✅ COMPLETE
- [x] 27-04: Dashboard Enhancement (skipped, not needed for manual optimization) — 0min ✅ COMPLETE

#### Phase 28: Bot Performance Optimization v2 ✅ COMPLETE
**Goal**: Raggiungere target < 60s per ordine (attualmente ~82s, riduzione -22s)
**Depends on**: Phase 27
**Research**: Unlikely (applying optimizations to existing bot code, leveraging Phase 3.1 analysis)
**Plans**: 1/1 complete ✅
**Status**: Complete (objectives achieved via Phase 27)
**Completed**: 2026-01-22

Plans:
- [x] 28-01: Bot Performance Optimization v2 (objectives achieved via Phase 27 manual optimization, ~35s improvement exceeds <60s target) — 0min ✅ COMPLETE

#### Phase 28.1: Fix Order Form Critical Bugs (INSERTED)
**Goal**: Risolvere bug critici nella scheda ordini: selezione clienti non funziona, filtro articoli fallisce, schermata bianca on submit
**Depends on**: Phase 28
**Research**: Unlikely (debugging existing React components, standard error handling patterns)
**Plans**: 4 plans (in execution)
**Priority**: 🔴 CRITICAL - Blocca completamente la creazione ordini
**Status**: In execution (Plan 28.1-02 at checkpoint)

Plans:
- [x] 28.1-01: Fix customer selection race condition — COMPLETE
- [ ] 28.1-02: Fix product filtering bug — IN PROGRESS (at checkpoint, IndexedDB empty discovered)
- [ ] 28.1-03: Fix white screen crash
- [ ] 28.1-04: Comprehensive testing & regression

#### Phase 28.2: Rewrite OrderForm with Proper Architecture (INSERTED)
**Goal**: Riscrivere OrderForm da zero con architettura pulita, gestione dati affidabile, e offline support robusto
**Depends on**: Phase 28 (not 28.1 - parallel urgent work)
**Research**: Complete (comprehensive codebase analysis)
**Plans**: 1/6 complete (Plan 01: Analysis & Design ✅)
**Priority**: 🔴 URGENT - Tempo e soldi persi su bugs inaccettabili
**Status**: In Progress - Ready for Plan 02 (Data Layer & Services)

**Business Impact:**
- Tempo e soldi persi su problematiche ricorrenti
- Form instabile con bug critici (customer selection, product filtering, IndexedDB vuoto)
- Architettura attuale difficile da debuggare e mantenere

**Requirements (from user):**
1. **Customer Selection**: Match per NOME cliente, sistema veloce e preciso
2. **Product Selection**: Match per NOME ARTICOLO, stesse indicazioni di customer
3. **Multi-Article Support**: Da 1 a N articoli per ordine
4. **Quantity + Variants**: Sistema must gestire varianti e multipli correttamente
5. **Discount Support**: Sconto in linea (per articolo) + sconto globale (calcolo reverse per target totale)
6. **Real-time Summary**: Lista articoli inseriti con nome, descrizione, prezzo, IVA, totali (senza IVA e con IVA)
7. **Edit/Delete Items**: Modifica e cancellazione articoli inseriti
8. **Pending Orders Queue**: Schermata ordini da inviare con selezione multipla e bot batch
9. **Offline Support**: Creazione ordini offline, queue locale, sync quando online

**Data Sources:**
- Official data: Database pages (products, customers) sempre aggiornati da sync orchestrator
- IndexedDB: Deve essere sempre popolato dal sync automatico
- Sync mechanism: Automatico tramite orchestrator + sync control panel

**Performance Target:**
- ~1500 clienti, ~5000 prodotti (con varianti)
- Esperienza ottimale, veloce, responsive

Plans:
- [x] 28.2-01: Codebase Analysis & Architecture Design (research) — 120min
- [x] 28.2-02: Data Layer & Services (Week 1)
- [x] 28.2-03: Customer & Product Selection (Week 2)
- [x] 28.2-04: Multi-Article & Discounts (Week 2-3)
- [ ] 28.2-05: Pending Queue & Offline (Week 3-4)
- [ ] 28.2-06: Integration & Testing (Week 4-5)

**Critical Discovery (Plan 28.2-01):**
- **Root Cause Identified**: IndexedDB completely empty (0 products) - no code populates from API responses
- **Architecture Designed**: 3-layer architecture (11 components vs 1 monolith, 4 hooks, 4 services)
- **NEW: SyncService**: Fixes empty IndexedDB by populating on app startup
- **User Decision**: Voice input EXCLUDED from Phase 28.2, deferred to Phase 28.3 with better tools (LLM-based, zero errors)
- **Migration Strategy**: Feature flag with 6-week phased rollout (Internal → 10% → 100%)
- **Timeline**: 4-5 weeks implementation + 4 weeks rollout = 9 weeks total

**Details:**
See `.planning/phases/28.2-rewrite-orderform-with-proper-architecture/28.2-01-SUMMARY.md`

---

### v1.0 Completed Phases (For Reference)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 14. Fix IndexedDB Critical Error | v2.0 | 1/1 | Complete | 2026-01-18 |
| 15. Dashboard Homepage UI | v2.0 | 4/4 | Complete | 2026-01-18 |
| 16. Target Wizard & Setup | v2.0 | 4/4 | Complete | 2026-01-18 |
| 17. Dashboard Metrics Backend | v2.0 | 1/1 | Complete | 2026-01-18 |
| 18.1. PDF Export Discovery & Validation (INSERTED) | v2.0 | 0 (discovery) | Complete | 2026-01-19 |
| 18. Customers Sync Analysis & Optimization | v2.0 | 5/5 | Complete | 2026-01-20 |
| 19. Products Sync Analysis & Optimization | v2.0 | 5/5 | Complete | 2026-01-20 |
| 19.1. Product Cards UI Enhancement (INSERTED) | v2.0 | 3/3 | Complete | 2026-01-20 |
| 20. Prices Sync Analysis & Optimization | v2.0 | 6/6 | Complete | 2026-01-20 |
| 21. Orders Sync Analysis & Optimization | v2.0 | 5/5 | Complete | 2026-01-20 |
| 22. Sync Orchestration Layer | v2.0 | 3/3 | Complete | 2026-01-22 |
| 23. Sync UI Controls | v2.0 | 1/1 | Complete | 2026-01-22 |
| 24. Background Sync Service | v2.0 | 1/1 | Complete | 2026-01-22 |
| 25. Sync Monitoring Dashboard | v2.0 | 3/3 | Complete | 2026-01-22 |
| 26. Universal Fast Login | v2.0 | 1/1 | Complete | 2026-01-22 |
| 27. Bot Performance Profiling v2 | v2.0 | 4/4 | Complete | 2026-01-22 |
| 28. Bot Performance Optimization v2 | v2.0 | 1/1 | Complete | 2026-01-22 |
| 29. WebSocket Server Infrastructure | v3.0 | 1/1 | Complete | 2026-02-05 |
| 30. WebSocket Client & Auto-Reconnect | v3.0 | 1/1 | Complete | 2026-02-05 |
| 31. Draft Orders Real-Time Sync | v3.0 | 1/1 | Complete | 2026-02-05 |
| 32. Pending Orders Real-Time Sync | v3.0 | 1/1 | Complete | 2026-02-05 |
| 33. Direct Delete & Tombstone Removal | v3.0 | 1/1 | Complete | 2026-02-05 |
| 34. E2E Testing & Multi-Device Validation | v3.0 | 1/1 | Complete | 2026-02-05 |
| 35. Monitoring & Observability | v3.0 | 1/1 | Complete | 2026-02-05 |
| 36. Performance Tuning & Optimization | v3.0 | 0/? | Not started | - |
