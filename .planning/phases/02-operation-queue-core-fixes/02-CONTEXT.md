# Phase 2: Operation Queue Core Fixes - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<vision>
## How This Should Work

La operation queue deve essere il cuore affidabile della PWA. Ogni operazione lanciata da qualsiasi utente — invio ordine, creazione cliente, invio a Verona, sync — deve andare a buon fine, sempre. Zero operazioni perse, zero fallimenti silenziosi.

Archibald (il gestionale) è lento, scritto male, caotico e difficile da usare. La PWA esiste per risolvere questi problemi: deve essere l'opposto — affidabile, prevedibile, infallibile. L'utente non deve mai chiedersi "ha funzionato?" — deve saperlo.

Quando un sync lungo è in corso e serve fare qualcosa di urgente (es. submit ordine), il sync si ferma davvero e cede il posto. Nessuna attesa lunga, nessun timeout misterioso. Il comportamento post-interruzione dipende dal tipo di sync: alcuni possono riprendere da dove erano, altri ripartono da zero.

Se un job fallisce, la queue riprova automaticamente con backoff intelligente. Se dopo tutti i retry l'operazione continua a fallire, l'utente viene informato chiaramente e può ritentare manualmente con un tap. Mai un buco nero dove l'operazione sparisce nel nulla.

Sicurezza prima della velocità, sempre. Meglio 2 secondi in più che rischiare un errore o una perdita di dati.

</vision>

<essential>
## What Must Be Nailed

- **Nessuna operazione persa mai** — Se un utente chiede di fare qualcosa, quella cosa DEVE succedere. Retry automatico con backoff, recovery dopo fallimenti, nessun job fantasma.
- **Feedback sempre presente** — L'utente deve sempre sapere cosa sta succedendo. Niente attese mute o timeout silenziosi. Stato chiaro in ogni momento.
- **Interrompibilità reale** — Un sync lungo deve poter essere interrotto per un'operazione urgente. La preemption deve funzionare davvero, non solo in teoria.
- **Infallibilità delle operazioni critiche** — Submit ordine, creazione cliente, invio a Verona: queste operazioni devono funzionare sempre, anche con retry automatici.

</essential>

<boundaries>
## What's Out of Scope

- UI di stato operazioni (progress bar, notifiche visive) — quello è Phase 5 WebSocket & Real-time Events
- Gestione multi-utente parallelo e browser pool — quello è Phase 3 Browser Pool & Concurrency
- Sync scheduler e intervalli configurabili — quello è Phase 4

</boundaries>

<specifics>
## Specific Ideas

- Retry automatico con backoff intelligente: se fallisce, riprova con intervalli crescenti
- Dopo esaurimento retry: notifica esplicita all'utente con possibilità di retry manuale (un tap)
- Preemption post-interruzione: comportamento diverso per tipo di sync (ripresa vs restart)
- Trade-off velocità/sicurezza: sempre sicurezza — meglio lento e affidabile che veloce e fragile
- Nessun job duplicato: deduplicazione rigorosa per evitare operazioni doppie nel gestionale

</specifics>

<notes>
## Additional Context

In produzione oggi: 1 utente su più dispositivi (max 2 contemporaneamente). Entro pochi mesi si stima di arrivare a 60+ utenti. La queue deve essere solida fin da ora per supportare questa crescita.

Problemi riscontrati in produzione: fallimenti intermittenti durante invio ordini, creazione clienti, invio a Verona. A volte funzionano, a volte no, anche con retry. Nessun pattern chiaro — fallimenti casuali che minano la fiducia nell'applicazione.

L'obiettivo fondamentale: la PWA deve essere il contrario di Archibald. Dove Archibald è caotico e inaffidabile, la PWA deve essere solida e prevedibile.

</notes>

---

*Phase: 02-operation-queue-core-fixes*
*Context gathered: 2026-02-20*
