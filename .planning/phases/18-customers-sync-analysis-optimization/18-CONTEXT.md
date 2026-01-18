# Phase 18: Customers Sync Analysis & Optimization - Context

**Gathered:** 2026-01-18
**Status:** Ready for planning

<vision>
## How This Should Work

**Sostituzione completa dello scraping HTML con sistema PDF-based** per tutti i sync clienti (manuale, automatico, background). Il sistema scarica il PDF da Archibald, lo parsa con il parser Python già sviluppato, ed aggiorna il database locale in modo veloce (8-12s invece di 30-60s) e stabile.

### Background Sync Automatico

Il sistema parte **automaticamente ogni ~30 minuti** (frequenza da validare in base a performance e stabilità misurate) con **notifica proattiva all'utente**: banner fisso in alto (stile offline banner) che mostra "Aggiornamento clienti in corso... 2939 clienti" e scompare automaticamente al completamento. L'agente vede cosa sta succedendo ma non deve fare nulla.

### Sync Manuale Granulare

Due livelli di controllo:

1. **Bottone "Aggiorna Clienti" nella sezione Clienti** (in alto a destra accanto alla search bar): l'agente può forzare il sync quando serve, ad esempio "ho appena creato un cliente nuovo in Archibald, devo aggiornare la lista per fare un nuovo ordine". Sync completo immediato con notifica banner.

2. **Bottone generale "Sync Tutto" nella Dashboard** (fuori scope Phase 18, parte di Phase 23): sync completo di clienti + prodotti + prezzi + ordini per aggiornamento totale dell'app.

### Sync Intelligente (Delta-based)

Il parser identifica **solo i clienti nuovi, modificati o cancellati** confrontando il PDF con il DB locale, e aggiorna solo quelli invece di sovrascrivere tutto. Questo permette resync rapidi e frequenti senza sprecare risorse.

### Sistema di Rilevamento Cambiamenti

Il sistema deve distinguere tre scenari:
- **Clienti nuovi**: aggiungi al DB
- **Clienti modificati**: aggiorna record esistente
- **Nessun cambiamento**: skip aggiornamento, notifica "Già aggiornato"

</vision>

<essential>
## What Must Be Nailed

**Migrazione da HTML a PDF deve essere solida e affidabile** - questa è la priorità #1.

Il passaggio dal vecchio sistema di scraping HTML al nuovo sistema PDF-based deve:
- Funzionare perfettamente senza perdere dati
- Non creare bug o regressioni
- Mantenere compatibilità con schema DB esistente
- Preservare tutti i campi necessari (customerProfile, name, vatNumber, addresses, contacts, dates)

Tutto il resto (performance, UI, frequenza sync) è importante ma secondario rispetto alla solidità della migrazione.

</essential>

<boundaries>
## What's Out of Scope

### Esplicitamente escluso da Phase 18:

- **UI Dashboard sync generale** → Deferred to Phase 23 (Sync UI Controls). Phase 18 si concentra solo su clienti, non su orchestrazione multi-entità.

- **Gestione conflitti dati complessi** → Se un cliente è stato modificato localmente E nel PDF, per ora **sovrascrivere sempre con dati PDF** (PDF è source of truth). Merge intelligente o conflict resolution deferred a futuro se necessario.

- **Ottimizzazione parser PDF Python** → Il parser funziona già (2939 clienti estratti in ~5s), va bene così per Phase 18. Eventuali ottimizzazioni future se emerge necessità reale.

### Confini con altre fasi:

- Phase 19: Products sync (stesso approccio PDF)
- Phase 20: Prices sync (stesso approccio PDF)
- Phase 21: Orders sync (stesso approccio PDF)
- Phase 22: Sync orchestration (coordinamento anti-overlap tra sync)
- Phase 23: Sync UI controls (bottone generale dashboard)
- Phase 24: Background sync service (service worker automatico)

</boundaries>

<specifics>
## Specific Ideas

### UI/UX Specifici:

- **Banner fisso in alto** (come offline banner esistente) per notifiche sync
  - Appare durante sync: "Aggiornamento clienti in corso..."
  - Mostra count: "2939 clienti aggiornati"
  - Scompare automaticamente al completamento
  - Stile coerente con pattern esistenti nell'app

- **Bottone "Aggiorna Clienti"** nella sezione Clienti
  - Posizione: in alto a destra accanto alla search bar
  - Icona: refresh/sync icon
  - Tooltip: "Scarica ultimi clienti da Archibald"
  - Trigger: click → banner sync → refresh lista

### Performance Target:

- **Sync completo**: 8-12 secondi (vs 30-60s HTML scraping)
- **Delta sync**: < 5 secondi se pochi cambiamenti
- **No changes detected**: < 2 secondi (skip update)

### Frequenza Background Sync:

**Target iniziale: ogni 30 minuti** (da validare)

Processo decisionale:
1. Misurare tempi reali durante implementazione:
   - Full sync (tutti i clienti)
   - Delta sync (solo modificati)
   - No changes scenario
2. Monitorare risorse (CPU, memoria, network)
3. Validare stabilità (error rate, timeout rate)
4. Decidere frequenza ottimale finale

Rationale: clienti cambiano frequentemente (nuovi clienti creati, modifiche indirizzi/contatti), sync frequente necessario per avere dati freschi.

### Tecnologie:

- **Parser**: Python script esistente (`scripts/parse-clienti-pdf.py`)
- **Bot automation**: Playwright per download PDF
- **Storage**: SQLite customers.db esistente
- **Notifiche**: Banner component (reuse OfflineBanner pattern)

</specifics>

<notes>
## Additional Context

### Lavoro Già Completato (Questa Sessione):

Durante questa sessione è stata fatta una **scoperta importante**: Archibald permette di scaricare PDF export per tutte le entità di sync.

**Proof of Concept già realizzato:**
- ✅ Analisi completa struttura PDF (`.planning/phases/16-target-wizard-setup/PDF-SYNC-ANALYSIS.md`)
- ✅ Parser Python funzionante (`scripts/parse-clienti-pdf.py`)
- ✅ Test reale: 2939 clienti estratti da PDF 256 pagine in ~5 secondi
- ✅ Mapping completo campi PDF → Database schema
- ✅ Identificati tutti i campi disponibili (IDs, names, addresses, contacts, dates)

**Performance già validate:**
- PDF-based: 8-12s totali (download + parse + DB update)
- HTML scraping attuale: 30-60+ secondi
- Improvement: **~75% più veloce** e molto più stabile

### Architettura Proposta:

```
1. Bot → Login Archibald
2. Bot → Naviga sezione Clienti
3. Bot → Download PDF (Clienti.pdf)
4. Parser → Extract structured data (2939 customers)
5. Delta Logic → Identify new/modified/deleted
6. DB Update → Sync only changes
7. Cleanup → Remove temp PDF
8. Notify → Banner "Completato"
```

### Decisioni Architetturali da Prendere in Planning:

1. **Node.js wrapper vs Python microservice** per parser?
2. **Hash-based vs timestamp-based** delta detection?
3. **Transaction strategy** per DB updates (all-or-nothing vs incremental)?
4. **Error recovery**: retry logic, fallback HTML scraping se PDF fails?
5. **Scheduling mechanism**: cron, setTimeout, dedicated scheduler service?

### User Story Principale:

> "Come agente Komet, quando creo un nuovo cliente in Archibald via web, voglio cliccare 'Aggiorna Clienti' nella PWA e vedere il nuovo cliente disponibile in 10 secondi, così posso creare subito un ordine senza aspettare il sync automatico."

### Priority Ranking:

1. 🔴 **CRITICAL**: Migrazione HTML→PDF solida senza data loss
2. 🟠 **HIGH**: Bottone sync manuale funzionante
3. 🟡 **MEDIUM**: Background sync automatico con notifiche
4. 🟢 **NICE**: Delta sync intelligente per performance ottimali

</notes>

---

*Phase: 18-customers-sync-analysis-optimization*
*Context gathered: 2026-01-18*
