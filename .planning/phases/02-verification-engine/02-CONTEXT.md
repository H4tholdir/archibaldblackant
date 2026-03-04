# Phase 2: Verification Engine - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<vision>
## How This Should Work

Il verification engine deve essere **parte integrante del flusso di submit-order**, non un job separato in background. Appena l'ordine viene piazzato su Archibald e salvato nel DB con lo snapshot, deve partire subito:

1. Sync articoli dall'ordine appena creato su Archibald (download PDF + parse)
2. Confronto snapshot vs articoli sincronizzati
3. Se mismatch → auto-correzione immediata (Phase 3, ma integrata nello stesso flusso)
4. Risultato visibile nella progress bar: "Verifica ordine in corso..."

L'utente vede tutto nella progress bar del submit come step espliciti. Non deve sapere i dettagli tecnici, ma deve sapere che il sistema sta verificando. Il tempo extra è accettabile — l'utente può aspettare, l'importante è che veda il progresso e sappia che si sta verificando.

Il confronto è su TUTTI i campi, tutte le discrepanze sono ugualmente critiche:
- Codice articolo diverso (il più frequente — errore selezione dropdown DevExpress)
- Quantità diversa
- Prezzo unitario diverso
- Sconto riga diverso
- Totale riga diverso
- Totale ordine divergente

Archibald NON aggiunge mai articoli extra automaticamente. Se ci sono righe extra, è un errore.

Se il sync immediato fallisce (PDF non ancora disponibile), retry con breve delay. Tutto deve essere integrato nel flusso senza impiegare troppo tempo extra.

</vision>

<essential>
## What Must Be Nailed

- **Flusso integrato nel submit-order**: sync + verifica devono essere parte dello stesso flusso, non job separati in background
- **Progress bar esplicita**: l'utente deve vedere "Verifica ordine in corso..." come step nella barra di progresso
- **Confronto completo**: tutti i campi confrontati, tutte le discrepanze ugualmente critiche
- **Retry intelligente**: se il PDF non è disponibile subito, retry con delay breve
- **Risultato persistito**: aggiornare lo snapshot con verification_status e dettagli discrepanze

</essential>

<boundaries>
## What's Out of Scope

- Auto-correzione via bot edit-order — Phase 3 (ma il trigger partirà da qui)
- Notifiche all'utente delle discrepanze — Phase 4
- UI per stato verifica — Phase 5
- Test end-to-end — Phase 6
- Gestione warehouse orders (già skippati in Phase 1)
- Gestione note di credito (NC) — non hanno articoli, skip naturale

</boundaries>

<specifics>
## Specific Ideas

- Il sync-order-articles attuale è un job separato nello scheduler. Per il flusso integrato, serve una versione "inline" che gira dentro il submit-order handler
- La progress bar attuale va da 0-100% per il submit. Bisogna estendere il range per includere: submit (0-80%) → sync (80-90%) → verifica (90-95%) → correzione se serve (95-100%)
- Il confronto deve salvare i dettagli precisi della discrepanza: quale articolo, campo atteso vs trovato
- Se il sync riesce e la verifica passa (tutto OK), lo status diventa "verified"
- Se il sync riesce ma la verifica trova discrepanze, lo status diventa "mismatch_detected" e deve scatenare Phase 3

</specifics>

<notes>
## Additional Context

Cambio architetturale importante: il flusso attuale è asincrono (scheduler ogni 10 min), il nuovo flusso è sincrono (inline nel submit). Questo richiede di riadattare la logica di sync-order-articles per funzionare sia come job schedulato (per ordini vecchi) sia come step inline (per ordini nuovi).

L'utente ha confermato che il tempo extra è accettabile purché la barra mostri cosa sta succedendo. Non c'è fretta di "velocizzare" — la priorità è la correttezza.

</notes>

---

*Phase: 02-verification-engine*
*Context gathered: 2026-03-05*
