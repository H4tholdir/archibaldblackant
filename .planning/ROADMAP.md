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
- [ ] **Phase 24: Background Sync Service** - Service worker sync automatici silent
- [ ] **Phase 25: Sync Monitoring Dashboard** - Admin UI monitoraggio sync
- [ ] **Phase 26: Universal Fast Login** - Login veloce per tutte le operazioni
- [ ] **Phase 27: Bot Performance Profiling v2** - Profile dettagliato post optimizations
- [ ] **Phase 28: Bot Performance Optimization v2** - Target < 60s per ordine

## Milestones

- ✅ **v1.0 MVP & Production Deployment** - Phases 1-13 (shipped 2026-01-17)
- 🚧 **v2.0 Agent Dashboard & Sync Reliability** - Phases 14-28 (in progress)

## Phase Details

<details>
<summary>✅ v1.0 MVP & Production Deployment (Phases 1-13) - SHIPPED 2026-01-17</summary>

See phases 1-13 below for complete details of v1.0 milestone.

</details>

### 🚧 v2.0 Agent Dashboard & Sync Reliability (In Progress)

**Milestone Goal**: Potenziare l'app con dashboard motivazionale per agenti, sistema di sync bulletproof con orchestrazione intelligente, e performance critiche ottimizzate per produttività massima.

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

#### Phase 24: Background Sync Service
**Goal**: Service worker per sync automatici silent in background ogni 30min
**Depends on**: Phase 23
**Research**: Likely (Service Worker API for background operations, silent sync patterns)
**Research topics**: Service Worker lifecycle, Background Sync API, PWA background tasks, silent notifications
**Plans**: TBD

Plans:
- [ ] 24-01: TBD

#### Phase 25: Sync Monitoring Dashboard
**Goal**: UI admin per monitorare sync status, tempi esecuzione, errori
**Depends on**: Phase 24
**Research**: Unlikely (admin UI with metrics display, existing monitoring patterns from v1.0 Phase 12)
**Plans**: TBD

Plans:
- [ ] 25-01: TBD

#### Phase 26: Universal Fast Login
**Goal**: Login veloce (come login iniziale) per tutte le operazioni (sync, bot, queries, reconnect)
**Depends on**: Phase 25
**Research**: Unlikely (optimizing existing Puppeteer login flow, caching strategies already known)
**Plans**: TBD

Plans:
- [ ] 26-01: TBD

#### Phase 27: Bot Performance Profiling v2
**Goal**: Profile dettagliato post Phase 3.1 optimizations per identificare nuovi colli di bottiglia
**Depends on**: Phase 26
**Research**: Unlikely (extending existing profiling system from Phase 3.1, same patterns)
**Plans**: TBD

Plans:
- [ ] 27-01: TBD

#### Phase 28: Bot Performance Optimization v2
**Goal**: Raggiungere target < 60s per ordine (attualmente ~82s, riduzione -22s)
**Depends on**: Phase 27
**Research**: Unlikely (applying optimizations to existing bot code, leveraging Phase 3.1 analysis)
**Plans**: TBD

Plans:
- [ ] 28-01: TBD

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
| 24. Background Sync Service | v2.0 | 0/? | Not started | - |
| 25. Sync Monitoring Dashboard | v2.0 | 0/? | Not started | - |
| 26. Universal Fast Login | v2.0 | 0/? | Not started | - |
| 27. Bot Performance Profiling v2 | v2.0 | 0/? | Not started | - |
| 28. Bot Performance Optimization v2 | v2.0 | 0/? | Not started | - |
