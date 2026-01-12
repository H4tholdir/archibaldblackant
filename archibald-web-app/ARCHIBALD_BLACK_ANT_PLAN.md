# Archibald Black Ant - Documento Operativo

## 1) Obiettivo
Creare una nuova interfaccia (PWA) moderna, fluida e mobile-first per Archibald,
usando il backend esistente di Archibald, da distribuire agli agenti Komet.

Nome prodotto: Archibald Black Ant

## 2) Contesto e problema attuale
- Archibald e' macchinoso, lento e poco usabile su mobile/tablet.
- Difficile trovare informazioni utili.
- UI obsoleta e non adatta a flussi veloci di ordine.

## 3) Requisiti funzionali concordati
### 3.1 Creazione ordine
- L'utente seleziona il cliente (dati letti da Archibald).
- L'utente seleziona gli articoli dal catalogo Archibald.
- L'utente inserisce solo quantita' e sconto di riga.
- Prezzo e listino sono sempre gestiti da Archibald (read-only in PWA).
- Nessun campo indirizzo/data: Archibald carica i dettagli cliente.

### 3.2 Articoli e listino
- Catalogo articoli letto da Archibald.
- Prezzi letti dal listino Archibald e mostrati in PWA.
- La PWA non gestisce listino o anagrafica.

### 3.3 Confezioni e multipli
- La PWA deve rispettare vincoli di confezione:
  - minimo ordine e multipli per articolo.
- Il campo esatto in Archibald verra' identificato in fase di sviluppo.

### 3.4 Storico ordini e tracking (fase successiva)
- Da leggere direttamente da Archibald.
- Dettagli e schermate da definire in fase di sviluppo.

### 3.5 Multi-utente
- Ogni agente usa le proprie credenziali Archibald.
- Le credenziali vengono salvate in modo sicuro sul device.

### 3.6 Offline
- Cache locale di clienti/prodotti/prezzi.
- Coda ordini offline con invio manuale (consenso utente).
- Sync automatico dati quando torna la rete.

## 4) Decisioni tecniche chiave
### 4.1 Architettura
- PWA pubblica (URL HTTPS), installabile su iOS/Android/desktop.
- Backend gateway Node/Puppeteer su VPS pubblico.
- Archibald e' accessibile da internet, quindi niente VPN necessaria.

### 4.2 Hosting e dominio
- Dominio dedicato: archibaldblackant.it
- VPS scelto: 2 vCPU / 4 GB RAM (economico ma stabile)
- Un solo server per frontend + backend (Nginx + Node + HTTPS).

### 4.3 Credenziali
- Salvataggio cifrato sul device (PIN/biometria).
- Backend non salva le credenziali.
- Il backend crea la sessione Archibald solo al bisogno.

## 5) Stato attuale del progetto (da codice)
### Frontend
- React/Vite PWA con form ordine, autocomplete clienti/prodotti, voice input.
- Tracking job ordine via API (queue).
- Sync UI con WebSocket per clienti/prodotti/prezzi.

### Backend
- Express + BullMQ + Puppeteer.
- Sync clienti/prodotti/prezzi in SQLite locale.
- Creazione ordine automatizzata in Archibald.

## 6) Gap tra requisiti e codice
- Prezzo oggi e' input editabile e obbligatorio: va reso read-only.
- Articolo: oggi `articleCode` usa il nome, serve ID canonico.
- Mancano vincoli di confezione/multipli in UI.
- Sessione Archibald e' globale (non per-utente).
- Offline non completo (cache API limitata, nessuna coda ordini locale).
- Storico/Tracking non implementati.

## 7) Roadmap operativa
### Fase 1 - MVP Ordini (prioritaria)
- Ricerca clienti e prodotti da Archibald.
- Prezzo visibile read-only.
- Quantita' + sconto riga.
- Invio ordine con stato job.

### Fase 2 - Offline
- Cache locale (IndexedDB) per clienti/prodotti/prezzi.
- Bozze ordine persistenti.
- Coda ordini offline con invio manuale.

### Fase 3 - Storico e Tracking
- Lettura ordini Archibald.
- Stato ordine e tracking.
- Filtri per cliente/data/stato.

## 8) Backlog tecnico (MVP)
- Frontend: usare ID articolo come `articleCode`.
- Frontend: prezzo read-only, rimuovere input.
- Backend: schema ordine senza prezzo obbligatorio.
- Backend: tipi allineati con payload reale.

## 9) Backlog tecnico (Post-MVP)
- Autenticazione per-utente e sessioni separate.
- Offline completo: cache + coda ordini.
- Validazione confezioni/multipli (appena individuato il campo).
- Storico/Tracking: parsing schermate Archibald.

## 10) Rischi e mitigazioni
- Puppeteer instabile: usare queue + retry + logging.
- Picchi richieste: coda ordini con attesa accettata.
- Cambi UI Archibald: selettori robusti + test periodici.

## 11) Domande aperte
- Campo esatto per confezione/multipli in Archibald.
- Dettagli delle schermate storico/tracking.
- Policy definitiva di cache offline (tempi/gerarchia sync).

## 12) Prossimi step immediati
1) Implementare MVP nel repo.
2) Definire campo confezione/multipli.
3) Registrare dominio archibaldblackant.it.
4) Provisioning VPS e setup HTTPS.
