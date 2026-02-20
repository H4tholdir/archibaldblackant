# Phase 5: WebSocket & Real-time Events - Context

**Gathered:** 2026-02-20
**Status:** Ready for research

<vision>
## How This Should Work

Quando un utente crea, modifica o cancella un ordine su un dispositivo, tutti gli altri dispositivi connessi vedono il cambio istantaneamente. Stesso discorso per le operazioni: quando un job parte (invio a Verona, sync clienti/prodotti/prezzi), il progresso e il risultato appaiono in tempo reale su ogni dispositivo, senza bisogno di refresh.

L'esperienza deve essere completamente real-time per tutto: ordini pending (CRUD), stato dei job (started, progress, done/error), risultati sync, warning. Nessun dispositivo deve restare indietro.

Ogni agente usa tipicamente 1 dispositivo alla volta, ma può capitare di arrivare a 2-3 dispositivi per utente. La scala è contenuta ma il sync deve essere affidabile.

</vision>

<essential>
## What Must Be Nailed

- **Multi-device sync ordini istantaneo** — Due dispositivi dello stesso utente devono vedere lo stesso stato ordini in tempo reale, senza conflitti o dati stale
- **Feedback operazioni live** — Quando un'operazione gira (invio Verona, sync), il progresso e il risultato appaiono in real-time su tutti i dispositivi, senza refreshare
- **Dati sempre corretti** — Nessun ordine fantasma, nessuno stato vecchio. I dati mostrati devono essere sempre quelli reali
- **Resilienza alle disconnessioni** — Se un dispositivo perde connessione e si riconnette, deve recuperare tutto quello che ha perso. Niente buchi
- **Leggerezza** — Il real-time non deve rallentare l'app o intasare il browser

</essential>

<boundaries>
## What's Out of Scope

- Nessuna esclusione esplicita dal utente — i confini saranno definiti durante research/planning in base a cosa ha senso tecnicamente per questa phase vs le successive

</boundaries>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Nessuna preferenza su riferimenti a altre app o comportamenti particolari. L'importante è che funzioni in modo fluido e affidabile.

La scelta tra WebSocket puro vs WebSocket+SSE è delegata alla fase di research/planning — scegliere l'approccio tecnicamente migliore.

</specifics>

<notes>
## Additional Context

- Esiste già un WebSocket server nel progetto — questa phase lo estende, non lo ricrea
- La roadmap menziona SSE come alternativa/complemento — la decisione tecnica va presa durante planning
- Lo stato attuale del frontend (come gestisce aggiornamenti) va verificato dal codice durante research
- L'utente ha enfatizzato che dati fantasma, disconnessioni con buchi, e rallentamenti sono tutti inaccettabili

</notes>

---

*Phase: 05-websocket-realtime-events*
*Context gathered: 2026-02-20*
