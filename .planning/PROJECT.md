# Archibald Black Ant

## What This Is

Una PWA moderna e mobile-first che permette agli agenti Komet di creare ordini in Archibald ERP in modo fluido e veloce tramite voice input e UI touch-optimized, superando la macchinosità dell'interfaccia web legacy di Archibald su dispositivi mobili. Il backend è stato completamente migrato a un'architettura modulare con DI pattern, PostgreSQL, e unified operation queue.

## Core Value

Rendere la creazione ordini Archibald **veloce, affidabile e mobile-friendly** per agenti in movimento, riducendo drasticamente il tempo e la frustrazione rispetto al processo manuale attuale.

## Requirements

### Validated

- ✓ Sincronizzazione clienti da Archibald ERP — v1.0
- ✓ Sincronizzazione prodotti da Archibald ERP — v1.0
- ✓ Sincronizzazione prezzi da Archibald ERP — v1.0
- ✓ Browser automation pool per performance — v1.0
- ✓ Job queue con BullMQ per ordini asincroni — v1.0
- ✓ WebSocket real-time per sync progress — v1.0
- ✓ React PWA con service worker configurato — v1.0
- ✓ Voice input con Web Speech API — v1.0
- ✓ Checkpoint/resume per sync interrotte — v1.0
- ✓ Backend modulare con DI pattern e PostgreSQL — v1.0
- ✓ Unified operation queue (sostituisce job queue multipli) — v1.0
- ✓ 100% endpoint parity con master (42 elementi verificati, 18 endpoint aggiunti) — v1.0
- ✓ Frontend migrato ai path API unificati — v1.0
- ✓ Device registration con tracking al login — v1.1
- ✓ Price management system (parseItalianPrice, matchVariant, PriceMatchingService) — v1.1
- ✓ Production bootstrap (main.ts, migrations, graceful shutdown, background services) — v1.2
- ✓ Subclient CRUD + Excel import con reconciliation — v1.2
- ✓ Fresis history (Arca export/import, FT numbering atomico, bulk discounts) — v1.2
- ✓ Price/VAT Excel import con sibling variant propagation — v1.2
- ✓ Admin session impersonation + SSE real-time events — v1.2
- ✓ Sync enhancements (checkpoint/resume, retry, delta sync, optimizer) — v1.2
- ✓ Test suite: 1,473 backend + 441 frontend = 1,914 test — v1.2

### Active

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

**Offline-First (Post-MVP):**
- [ ] IndexedDB cache per clienti/prodotti/prezzi
- [ ] Service worker con offline strategy
- [ ] Bozze ordine persistenti in locale
- [ ] Coda ordini offline con sync manuale (consenso utente)
- [ ] Sync automatico quando torna la rete
- [ ] Conflict resolution per dati stale

**Order History:**
- [ ] Visualizzare storico ordini da Archibald
- [ ] Filtri per cliente/data/stato ordine
- [ ] Dettaglio ordine completo (articoli, quantità, prezzi, totale)
- [ ] Tracking stato ordine (in lavorazione/spedito/consegnato)
- [ ] Modifica ordini pendenti (se non ancora evasi)
- [ ] Duplica ordine ("Ripeti ultimo ordine")

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

**Current State (post v1.2):**
- Backend completamente migrato a architettura modulare con DI, PostgreSQL, unified operation queue
- 1,914 test passing (1,473 backend + 441 frontend)
- 450 file modificati, 45K+ linee aggiunte, 68K+ linee rimosse
- Branch `feat/unified-operation-queue` pronto per merge in master

**Utenti target:**
- Agenti commerciali Komet che usano Archibald per ordini clienti
- Device: smartphone/tablet Android e iOS, desktop Mac/Windows
- Contesto d'uso: in movimento, visite clienti, fiere, ufficio

**Architettura attuale (post-migration):**
- Backend Node.js + Express modulare con DI pattern
- PostgreSQL per tutti i dati (migrato da SQLite)
- Unified operation queue con BullMQ + Redis
- main.ts bootstrap → createApp(deps) pattern
- Frontend React 19 PWA con Vite
- Automazione Archibald via headless Chrome (BrowserPool)
- SSE + WebSocket per eventi real-time
- Sync checkpoint/resume, retry con backoff, delta sync

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
| PWA vs Native App | PWA installabile funziona su tutti device senza doppio sviluppo | ✓ Good — funziona su tutti device |
| Puppeteer Browser Automation | Archibald non ha API, unica via è browser automation headless | ✓ Good — funziona, performance accettabili con browser pool |
| PostgreSQL migration (da SQLite) | Supporto concorrenza, transazioni ACID, scalabilità | ✓ Good — v1.0-v1.2 |
| DI pattern con optional dependencies | Graceful degradation con 501 status, testabilità | ✓ Good — v1.0 |
| Unified operation queue | Singola coda per tutte le operazioni vs job queue multipli | ✓ Good — v1.0 |
| createApp(deps) + main.ts bootstrap | Separazione app creation da bootstrap per testabilità | ✓ Good — v1.2 |
| Handler map pattern per operation processor | 10+ handler types senza switch/case | ✓ Good — v1.1 |
| Factory function pub/sub per SSE | Nessuna classe necessaria, composabilità | ✓ Good — v1.2 |
| Binary search optimizer per sync | Complementare a AdaptiveTimeoutManager | ✓ Good — v1.2 |
| Sync modes via query parameter | Backward compatibility con endpoint esistenti | ✓ Good — v1.2 |
| BullMQ Job Queue | Ordini asincroni con retry, no blocking UI, scalabile | ✓ Good — validato in produzione |
| React 19 + Vite | Stack moderno, fast refresh, PWA plugin built-in, TypeScript strict | ✓ Good — setup funzionante |

---
*Last updated: 2026-02-24 after v1.2 milestone completion*
