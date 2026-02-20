# Phase 9: E2E Tests & VPS Validation - Context

**Gathered:** 2026-02-20
**Status:** Ready for research

<vision>
## How This Should Work

I test E2E girano direttamente sul VPS dove la PWA è deployata. Claude li esegue tutti in modo automatico e ne controlla i risultati — è una verifica una tantum per confermare che tutti i refactoring fatti nelle fasi 1-8 funzionano correttamente nel sistema reale.

Non servono utenti di test dedicati né account specifici. Lo scopo è validare che la PWA funzioni end-to-end: login, gestione ordini, sync multi-device. Una volta confermato che tutto è a posto, i test hanno fatto il loro lavoro.

</vision>

<essential>
## What Must Be Nailed

- **Tutti i flussi verificati** — login, ordini e multi-device sync hanno tutti la stessa priorità, nessuno è più importante degli altri
- **Esecuzione automatica** — Claude esegue i test e ne verifica i risultati autonomamente
- **Test contro il sistema reale** — i test girano sul VPS contro la PWA deployata, non in un ambiente simulato

</essential>

<boundaries>
## What's Out of Scope

- Suite permanente da mantenere — è una verifica una tantum, non una test suite da rieseguire
- CI/CD pipeline o automazione post-deploy
- Performance/load test — solo verifica funzionale
- Creazione di utenti di test dedicati o fixture complesse

</boundaries>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. L'importante è che sia una verifica completa e automatica dei flussi critici della PWA dopo i refactoring.

</specifics>

<notes>
## Additional Context

Il contesto è chiaro: dopo 8 fasi di refactoring (cleanup, fix bug, feature implementation, unit/integration tests), questa fase serve come validazione finale sul campo. L'utente vuole conferma che tutto funziona nel sistema reale prima di procedere alla Phase 10 (Final Review & Stabilization).

La natura una tantum suggerisce un approccio pragmatico: script Playwright eseguiti direttamente sul VPS, verifica dei risultati, e via. Non serve investire in infrastruttura test permanente.

</notes>

---

*Phase: 09-e2e-tests-vps-validation*
*Context gathered: 2026-02-20*
