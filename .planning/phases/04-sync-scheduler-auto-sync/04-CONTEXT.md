# Phase 4: Sync Scheduler & Auto-Sync - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<vision>
## How This Should Work

I sync del Control Sync Panel devono girare in background in maniera completamente silente per l'utente, mantenendo la PWA sempre aggiornata rispetto ai dati estratti da Archibald. L'utente non deve accorgersi di nulla — i dati sono semplicemente sempre freschi.

Lo scheduler parte automaticamente al boot del server con gli intervalli salvati. L'admin ha pieno controllo dal pannello esistente (SyncControlPanel) e può fermare/riavviare lo scheduler, oltre a configurare gli intervalli per ogni tipo di sync individualmente.

Il pannello SyncControlPanel e il sync-scheduler backend esistono già. Il problema attuale è che lo scheduler non viene avviato nel bootstrap del server e `getActiveAgentIds` non funziona (non prende gli utenti reali dal DB). Inoltre manca la UI per configurare gli intervalli di sync.

</vision>

<essential>
## What Must Be Nailed

- **Dati sempre aggiornati** — La PWA deve avere sempre dati freschi rispetto ad Archibald, senza intervento manuale dell'utente
- **Silenzioso e affidabile** — Il sync gira in background senza interferire con l'utente, senza crash, senza rallentamenti
- **Controllo admin granulare** — L'admin configura l'intervallo per ogni tipo di sync individualmente (ordini, clienti, prodotti, prezzi, DDT, fatture) dalla UI
- **Protezione dati** — Se un sync fallisce (es. PDF incompleto), i dati esistenti non vengono toccati e l'admin viene avvisato con un warning nel pannello

</essential>

<boundaries>
## What's Out of Scope

- Nessuna esclusione specifica menzionata dall'utente
- Le funzionalità del SyncControlPanel che già funzionano (sync manuali, toggle on/off, cancella DB) non vengono toccate

</boundaries>

<specifics>
## Specific Ideas

- **Intervalli per tipo di sync**: un campo intervallo (in minuti) per ogni tipo di sync nel pannello admin — non due gruppi, ma granularità totale per tipo
- **Auto-start al boot**: lo scheduler parte automaticamente con gli ultimi intervalli salvati, senza intervento dell'admin
- **Cambio intervalli non invasivo**: quando l'admin cambia gli intervalli dalla UI, i nuovi tempi entrano in vigore dal prossimo ciclo, senza interrompere sync in corso
- **Persistenza**: gli intervalli configurati vengono salvati nel DB e sopravvivono ai restart del server
- **Alert parser failure**: se il customer sync fallisce per PDF incompleto, skip silenzioso dei dati + warning visibile nel pannello admin

</specifics>

<notes>
## Additional Context

Il SyncControlPanel frontend (`archibald-web-app/frontend/src/components/SyncControlPanel.tsx`) esiste già con: toggle auto-sync, sync individuali per tipo, cancella DB, visualizzazione coda operazioni. Va esteso con la configurazione intervalli per tipo.

Il sync-scheduler backend (`archibald-web-app/backend/src/sync/sync-scheduler.ts`) esiste già con `start`/`stop`/`isRunning`/`getIntervals`. Attualmente supporta solo due gruppi di intervalli (`agentSyncMs` e `sharedSyncMs`), va esteso per supportare intervalli per tipo individuale.

Il `getActiveAgentIds` attualmente non funziona correttamente — deve leggere gli utenti attivi dal DB.

</notes>

---

*Phase: 04-sync-scheduler-auto-sync*
*Context gathered: 2026-02-20*
