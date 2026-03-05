# Phase 4: User Notification System - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<vision>
## How This Should Work

Quando un ordine viene inviato e la verifica rileva una discrepanza che l'auto-correzione non riesce a risolvere, il dettaglio del problema appare direttamente sulla card del pending order nella pagina pending orders.

Il flusso per l'utente:
1. Invia l'ordine — la progress bar mostra il progresso (submit, sync, verifica)
2. Se tutto OK (o auto-correzione riesce) — silenzio, nessuna notifica
3. Se c'e' un problema non risolvibile — la card dell'ordine mostra inline il dettaglio completo della discrepanza

La notifica e' contestuale: vive sulla card dell'ordine, non in un centro notifiche separato. L'utente deve capire immediatamente cosa e' andato storto senza click aggiuntivi.

Se l'utente e' sulla pagina, la notifica arriva in real-time via WebSocket. Se l'utente naviga via e torna dopo, la notifica viene caricata dal DB.

</vision>

<essential>
## What Must Be Nailed

- **Chiarezza del messaggio**: il dettaglio dell'errore deve essere cristallino — quale articolo, valore atteso vs trovato, tipo di discrepanza. L'utente capisce subito senza interpretare.
- **Tempestivita' real-time**: la notifica appare appena la verifica finisce, mentre l'utente e' sulla pagina.
- **Persistenza in DB**: le notifiche sono salvate per consultazione futura, anche se l'utente non era online al momento della verifica.

</essential>

<boundaries>
## What's Out of Scope

- Niente centro notifiche dedicato (campanella/pagina notifiche) — tutto sulla card dell'ordine
- Niente notifiche esterne (email, push notification mobile)
- Niente azioni correttive dalla UI (l'utente vede il problema ma non puo' ri-tentare correzione dalla UI)
- Niente feedback visivo per auto-correzione riuscita — silenzioso se OK
- La notifica vive quanto la card — quando l'ordine esce dai pending orders, il dato resta solo in DB

</boundaries>

<specifics>
## Specific Ideas

- Il progresso della verifica e' gia' integrato nella progress bar dell'invio ordine (70-100% dalla fase 2) — non serve aggiungere progress separato
- Il dettaglio inline sulla card deve essere super dettagliato: articolo, campo in errore, valore atteso, valore trovato, tipo di mismatch
- Dual delivery: WebSocket per real-time + query DB per quando l'utente ricarica la pagina

</specifics>

<notes>
## Additional Context

Le fasi 1-3 sono complete: snapshot al submit, verification engine, auto-correction via bot. Questa fase chiude il loop comunicando all'utente i casi irrisolti.

Il WebSocket e l'event bus esistono gia' nel progetto (src/realtime/). La progress bar dell'invio ordine e' gia' estesa nella fase 2 per includere la verifica.

</notes>

---

*Phase: 04-user-notification*
*Context gathered: 2026-03-05*
