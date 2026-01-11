# Archibald Black Ant

## What This Is

Una PWA moderna e mobile-first che permette agli agenti Komet di creare ordini in Archibald ERP in modo fluido e veloce tramite voice input e UI touch-optimized, superando la macchinosità dell'interfaccia web legacy di Archibald su dispositivi mobili.

## Core Value

Rendere la creazione ordini Archibald **veloce, affidabile e mobile-friendly** per agenti in movimento, riducendo drasticamente il tempo e la frustrazione rispetto al processo manuale attuale.

## Requirements

### Validated

<!-- Funzionalità già implementate nel codebase esistente -->

- ✓ Sincronizzazione clienti da Archibald ERP — existing (`backend/src/customer-sync-service.ts`)
- ✓ Sincronizzazione prodotti da Archibald ERP — existing (`backend/src/product-sync-service.ts`)
- ✓ Sincronizzazione prezzi da Archibald ERP — existing (`backend/src/price-sync-service.ts`)
- ✓ Browser automation pool per performance — existing (`backend/src/browser-pool.ts`)
- ✓ Job queue con BullMQ per ordini asincroni — existing (`backend/src/queue-manager.ts`)
- ✓ WebSocket real-time per sync progress — existing (`backend/src/index.ts`)
- ✓ React PWA con service worker configurato — existing (`frontend/vite.config.ts`)
- ✓ Voice input con Web Speech API — existing (`frontend/src/hooks/useVoiceInput.ts`)
- ✓ Cache locale SQLite per clienti/prodotti — existing (`backend/data/*.db`)
- ✓ Checkpoint/resume per sync interrotte — existing (`backend/src/sync-checkpoint.ts`)

### Active

<!-- MVP Ordini - Fase 1 prioritaria -->

**Order Creation (MVP):**
- [ ] Ricerca clienti con autocomplete da cache locale
- [ ] Ricerca articoli con autocomplete da catalogo Archibald
- [ ] Visualizzazione prezzi read-only da listino Archibald (no edit)
- [ ] Input quantità + sconto di riga per articolo
- [ ] Gestione confezioni multiple (es: articolo h129fsq.104.023 in conf da 1 o 5 pezzi)
- [ ] Selezione tipo confezione e multipli per articolo
- [ ] Voice input hybrid: dettatura → compilazione form → conferma tap
- [ ] Validazione vincoli confezione/multipli prima invio
- [ ] Invio ordine ad Archibald via Puppeteer automation
- [ ] Tracking stato job con feedback real-time
- [ ] Error recovery con retry automatico (BullMQ già presente)

**Multi-User Access:**
- [ ] Whitelist agenti autorizzati (gestione manuale)
- [ ] Login con credenziali Archibald per-agente
- [ ] Salvataggio credenziali cifrato su device (Web Crypto API)
- [ ] Sessioni Puppeteer per-utente (vs sessione globale attuale)
- [ ] Backend non salva credenziali (session-per-request)

**Security & Stability:**
- [ ] Fix credenziali hardcoded in `backend/.env` (CRITICAL)
- [ ] Rotazione credenziali ERP dopo leak
- [ ] Rimozione `.env` da git history (BFG Repo-Cleaner)
- [ ] Centralizzare tutti URL hardcoded in `config.ts`
- [ ] Fix bug `activeSyncType` undefined in `backend/src/index.ts`
- [ ] Rimuovere dead code in `product-sync-service.ts`
- [ ] Sostituire `console.log()` con `logger` (30+ istanze)
- [ ] Rimuovere type `any` con interfacce tipate

**Testing Foundation:**
- [ ] Unit test suite per service layer (Vitest)
- [ ] Integration test per sync services
- [ ] Integration test per queue manager
- [ ] E2E test per order creation flow (Playwright)
- [ ] Mock Puppeteer per test isolati

**Deployment:**
- [ ] VPS con budget minimo (raccomandato: 2 vCPU / 4 GB RAM)
- [ ] Docker Compose setup (Nginx + Node + Redis)
- [ ] SSL con Let's Encrypt per archibaldblackant.it
- [ ] CI/CD pipeline per deploy automatico
- [ ] Health check endpoint (`/health`)
- [ ] Graceful shutdown con wait per operazioni in-progress

<!-- Offline Capability - Fase 2 -->

**Offline-First (Post-MVP):**
- [ ] IndexedDB cache per clienti/prodotti/prezzi
- [ ] Service worker con offline strategy
- [ ] Bozze ordine persistenti in locale
- [ ] Coda ordini offline con sync manuale (consenso utente)
- [ ] Sync automatico quando torna la rete
- [ ] Conflict resolution per dati stale

<!-- Order History & Tracking - Fase 3 -->

**Order History:**
- [ ] Visualizzare storico ordini da Archibald
- [ ] Filtri per cliente/data/stato ordine
- [ ] Dettaglio ordine completo (articoli, quantità, prezzi, totale)
- [ ] Tracking stato ordine (in lavorazione/spedito/consegnato)
- [ ] Modifica ordini pendenti (se non ancora evasi)
- [ ] Duplica ordine ("Ripeti ultimo ordine")

<!-- Analytics - Fase 4 (post-MVP) -->

**Analytics (Future):**
- [ ] Dashboard KPI agente (totale venduto, trend)
- [ ] Top prodotti ordinati per agente
- [ ] Top clienti attivi per agente
- [ ] Statistiche periodo selezionabile

### Out of Scope

- **Gestione prezzi/listini** — Archibald resta master dei prezzi, PWA solo read-only
- **Gestione anagrafica clienti** — Solo lettura da Archibald, no CRUD clienti in PWA
- **Multi-tenant enterprise SaaS** — Un'istanza VPS per Komet, no multi-company complesso
- **Integrazione altri ERP** — Solo Archibald, no supporto SAP/Odoo/altro
- **Gestione ordini fornitore** — Solo ordini cliente (vendita), no ordini acquisto
- **DDT e documenti logistica** — Focus su ordini vendita, documenti trasporto fuori scope
- **Preventivi/offerte** — Solo ordini confermati, no workflow preventivi
- **Mobile app nativa** — PWA installabile basta, no sviluppo iOS/Android nativo

## Context

**Problema attuale:**
- Archibald ERP ha UI web obsoleta, lenta e macchinosa su mobile/tablet
- Agenti Komet faticano a creare ordini in mobilità
- Processo attuale richiede troppi step, campi obbligatori inutili, navigation complessa
- Limitazioni strutturali del DB Archibald rendono UI poco flessibile

**Utenti target:**
- Agenti commerciali Komet che usano Archibald per ordini clienti
- Device: smartphone/tablet Android e iOS, desktop Mac/Windows
- Contesto d'uso: in movimento, visite clienti, fiere, ufficio

**Architettura esistente:**
- Backend Node.js + Express + Puppeteer per browser automation
- Frontend React 19 PWA con Vite
- Automazione Archibald via headless Chrome (sessioni pre-autenticate)
- Cache locale SQLite per performance (customers.db, products.db, prices.db)
- Job queue BullMQ + Redis per ordini asincroni
- WebSocket per sync progress real-time

**Codebase concerns (da CONCERNS.md):**
- ⚠️ **CRITICAL:** Credenziali production hardcoded in `backend/.env` committato (username: [REDACTED-USERNAME], password: [REDACTED-PASSWORD])
- Bug: Variable `activeSyncType` undefined causa runtime error
- Tech debt: 30+ `console.log()` invece di logger, 10+ type `any`, dead code
- Testing: 0 unit tests, 0 integration tests, 0 E2E tests (solo manual scripts)
- Performance: Polling loop busy-wait, N+1 query pattern in price sync

**Stato attuale del codice:**
- MVP parziale: form ordini, autocomplete clienti/prodotti, voice input base
- Mancante: prezzi read-only, vincoli confezione, multi-utente, sessioni per-agente
- Sync services funzionanti ma sessione globale (non per-utente)
- Offline non completo (solo cache API, no IndexedDB, no coda ordini locale)

## Constraints

- **Budget Hosting**: Minimizzare costi VPS mantenendo affidabilità (target: €10-20/mese VPS + dominio)
- **Compatibilità Device**: Android phone/tablet, iOS phone/tablet (Safari iOS 14.5+), macOS desktop, Windows desktop
- **Performance**: Ordine completato "il più veloce possibile" mantenendo stabilità e affidabilità (no target specifico, ottimizzare senza compromettere reliability)
- **Tech Stack**: TypeScript + React (frontend), Node.js + Express (backend), Puppeteer (automation) — già scelto, mantenere
- **ERP Integration**: Solo Archibald ERP raggiungibile via HTTPS pubblico (https://4.231.124.90/Archibald) — no VPN, no altri ERP
- **Deployment**: Dominio archibaldblackant.it già scelto, serve setup VPS con HTTPS

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PWA vs Native App | PWA installabile funziona su tutti device (iOS/Android/desktop) senza doppio sviluppo, costi minori | — Pending |
| Puppeteer Browser Automation | Archibald non ha API, unica via è browser automation headless per leggere/scrivere dati | ✓ Good — funziona, performance accettabili con browser pool |
| SQLite Cache Locale | Cache clienti/prodotti/prezzi riduce latency, funziona offline, no dipendenza cloud DB | ✓ Good — sync veloce, no costi extra |
| BullMQ Job Queue | Ordini asincroni con retry, no blocking UI, scalabile con Redis backend | — Pending |
| Voice Input Hybrid | Dettatura popola form, utente rivede visivamente, conferma tap finale — massima affidabilità vs errori voice recognition | — Pending |
| Session per-User | Ogni agente usa proprie credenziali Archibald, backend crea sessione on-demand, no salvataggio credenziali server | — Pending |
| Whitelist Agenti | Lista autorizzati gestita manualmente vs sistema abbonamento automatico — semplicità MVP | — Pending |
| Docker Deployment | Docker Compose (Nginx + Node + Redis) su VPS per portabilità, facilità deploy, ambiente riproducibile | — Pending |
| React 19 + Vite | Stack moderno, fast refresh, PWA plugin built-in, TypeScript strict mode | ✓ Good — setup esistente funzionante |

---
*Last updated: 2026-01-11 after initialization with codebase mapping*
