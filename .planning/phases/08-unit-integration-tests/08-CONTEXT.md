# Phase 8: Unit & Integration Tests - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<vision>
## How This Should Work

Questa fase è una validazione concreta di tutto il lavoro fatto nelle fasi 2-7. Dopo aver fixato preemption, browser pool, sync scheduler, WebSocket, data integrity e feature mancanti, vogliamo confermare che tutto funziona davvero con test automatici.

Il focus è verificare il lavoro fatto adesso — non costruire una suite di test per proteggere il futuro, ma accertarsi che i fix critici e le feature core siano corretti. Ogni area del backend toccata nelle fasi precedenti riceve la sua copertura: operation processor, agent lock, sync handlers, eventi WebSocket, e sync services con database reale.

5 plan ben definiti, ognuno con il suo scope specifico:
1. Unit test operation processor (preemption, shouldStop, timeout, lock)
2. Unit test agent lock (acquire, release, setStopCallback, preemptable)
3. Unit test sync handlers (shouldStop interruption, progress, error handling)
4. Integration test WebSocket events (emit + receive per tutti gli eventi)
5. Integration test sync services con PostgreSQL reale

</vision>

<essential>
## What Must Be Nailed

- **Validazione completa dei fix fasi 2-7** — Ogni fix critico deve avere almeno un test che ne conferma il funzionamento
- **Tutte le aree coperte equamente** — Nessuna area è più importante delle altre: processor, lock, sync, WebSocket e DB devono essere tutti testati
- **Test che verificano comportamento reale** — Non test triviali, ma test che confermano che i bug fixati non si ripresentano

</essential>

<boundaries>
## What's Out of Scope

- Niente test E2E / Playwright — quello è Phase 9
- Niente test frontend (componenti React) — questa fase è puramente backend
- Non è un obiettivo di copertura percentuale — il focus è validare i fix, non raggiungere una metrica
- Non serve proteggere contro scenari ipotetici futuri — validare quello che c'è adesso

</boundaries>

<specifics>
## Specific Ideas

- La struttura a 5 plan del roadmap va bene così com'è
- Per i test di integrazione con PostgreSQL, nessuna preferenza specifica sulla gestione del DB di test — approccio migliore a discrezione del builder
- Nessun bug specifico di produzione da verificare — fidarsi del giudizio del builder su cosa testare basandosi sulla conoscenza del codice

</specifics>

<notes>
## Additional Context

Questa è una fase di conferma, non di esplorazione. Il codice è stato scritto e fixato nelle fasi precedenti — ora serve la prova che funziona. L'utente ha fiducia nel builder per scegliere i casi di test più significativi per ogni area.

</notes>

---

*Phase: 08-unit-integration-tests*
*Context gathered: 2026-02-20*
