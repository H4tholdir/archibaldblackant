# Roadmap: Order Verification System

## Overview

Sistema di verifica automatica che garantisce la correttezza degli ordini piazzati su Archibald ERP. Dopo ogni submit, uno snapshot dell'ordine atteso viene salvato e confrontato con i dati reali sincronizzati dall'ERP. In caso di discrepanza, il sistema tenta auto-correzione via bot e, se fallisce, notifica l'utente con dettaglio preciso.

## Domain Expertise

None (pattern interni al progetto, nessuna libreria esterna nuova)

## Milestones

- 🚧 **v1.0 Order Verification System** - Phases 1-6 (in progress)

## Phases

- [ ] **Phase 1: Order Snapshot Schema & Storage** - Tabella snapshot e salvataggio al submit
- [ ] **Phase 2: Verification Engine** - Motore di confronto snapshot vs articoli sincronizzati
- [ ] **Phase 3: Auto-Correction via Bot** - Correzione automatica via edit-order
- [ ] **Phase 4: User Notification System** - Notifiche real-time discrepanze all'utente
- [ ] **Phase 5: Verification Status Tracking** - Stato verifica visibile nel frontend
- [ ] **Phase 6: Integration Testing** - Test end-to-end del flusso completo

## Phase Details

### 🚧 v1.0 Order Verification System (In Progress)

**Milestone Goal:** Garantire che ogni ordine piazzato su Archibald corrisponda esattamente a ciò che l'utente ha inviato, con auto-correzione e notifica in caso di errore.

#### Phase 1: Order Snapshot Schema & Storage

**Goal**: Creare tabella `agents.order_verification_snapshots` per salvare lo stato atteso dell'ordine (articoli, quantità, sconti riga, sconto globale, totale atteso) al momento del submit-order. Integrare il salvataggio nel handler `submit-order.ts`.
**Depends on**: Nothing (first phase)
**Research**: Unlikely (pattern DB esistenti, PostgreSQL già in uso)

Plans:
- [ ] 01-01: Migration + Repository + Integrazione submit-order (3 task)

#### Phase 2: Verification Engine

**Goal**: Motore di confronto che, dopo `sync-order-articles`, compara lo snapshot con gli articoli effettivamente sincronizzati da Archibald. Rileva discrepanze su: articoli mancanti/extra, quantità diverse, sconti riga diversi, sconto globale diverso, totale divergente (con tolleranza arrotondamento).
**Depends on**: Phase 1
**Research**: Unlikely (logica di confronto pura, nessuna dipendenza esterna)

Plans:
- [ ] 02-01: Verification Engine Logic — TDD (verifyOrderArticles + updateVerificationStatus)
- [ ] 02-02: Inline Sync + Integration (submit-order + progress bar + main.ts wiring)

#### Phase 3: Auto-Correction via Bot

**Goal**: Quando il verification engine rileva discrepanze, enqueue automatico di un job `edit-order` per correggere l'ordine su Archibald. Un solo tentativo. Se la correzione riesce, ri-sincronizza e ri-verifica. Aggiornare lo stato della verifica.
**Depends on**: Phase 2
**Research**: Unlikely (edit-order handler e bot già esistenti)

Plans:
- [ ] 03-01: Build Corrections Logic — TDD (buildCorrections + mapping mismatches → modifications)
- [ ] 03-02: Integration Correction + Re-verify (performAutoCorrection + submit-order + main.ts)

#### Phase 4: User Notification System

**Goal**: Se l'auto-correzione fallisce (o non è possibile), notifica real-time all'utente via WebSocket con dettaglio preciso: quale articolo presenta discrepanza, valore atteso vs valore trovato, tipo di errore. Persistere le notifiche in DB per consultazione successiva.
**Depends on**: Phase 3
**Research**: Unlikely (WebSocket e event bus già esistenti nel progetto)

Plans:
- [ ] 04-01: Notification Formatting Logic — TDD (formatVerificationNotification pure function)
- [ ] 04-02: Backend API + WebSocket + Frontend Display (endpoint + event + inline card notification)

#### Phase 5: Verification Status Tracking

**Goal**: Aggiungere stato di verifica agli ordini (`pending_verification` / `verified` / `mismatch_detected` / `auto_corrected` / `correction_failed`) visibile nel frontend. Indicatore visivo nella lista ordini e nella pagina dettaglio. Mini-dashboard per monitorare la salute complessiva degli ordini.
**Depends on**: Phase 4
**Research**: Unlikely (componenti React e API pattern già stabiliti)

Plans:
- [ ] 05-01: TBD (run /gsd:plan-phase 5 to break down)

#### Phase 6: Integration Testing

**Goal**: Test end-to-end del flusso completo: submit → snapshot → sync → verify → auto-correct → notify. Coverage su edge case: ordini vuoti, note di credito (NC), warehouse orders (skip verification), ordini con solo sconto globale, ordini con sconti riga misti. Property-based testing per il verification engine.
**Depends on**: Phase 5
**Research**: Unlikely (Vitest già configurato, pattern di test esistenti)

Plans:
- [ ] 06-01: TBD (run /gsd:plan-phase 6 to break down)

## Progress

**Execution Order:** Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Order Snapshot Schema & Storage | v1.0 | 1/1 | Complete | 2026-03-05 |
| 2. Verification Engine | v1.0 | 2/2 | Complete | 2026-03-05 |
| 3. Auto-Correction via Bot | v1.0 | 2/2 | Complete | 2026-03-05 |
| 4. User Notification System | v1.0 | 1/2 | In progress | - |
| 5. Verification Status Tracking | v1.0 | 0/? | Not started | - |
| 6. Integration Testing | v1.0 | 0/? | Not started | - |
