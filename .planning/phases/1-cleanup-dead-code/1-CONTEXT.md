# Phase 1: Cleanup & Dead Code Removal - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<vision>
## How This Should Work

Pulizia profonda e totale del codebase. Non solo i file orfani noti dalla roadmap, ma un'analisi completa per scovare TUTTO il dead code nascosto: file mai importati, funzioni esportate ma mai chiamate, tipi definiti ma mai usati.

Alla fine di questa fase, ogni riga di codice rimasta nel progetto deve servire a qualcosa. Navigare il codebase deve essere chiaro e immediato — niente più "questo file serve ancora?".

I file morti vengono cancellati direttamente. Git è il safety net: se serve qualcosa, si recupera dalla history. Niente cartella _deprecated/.

</vision>

<essential>
## What Must Be Nailed

- **Zero confusione** — Navigare il codebase e capire subito cosa è vivo e cosa no. Nessuna ambiguità.
- **Base solida per i fix** — Le fasi successive (queue, concurrency, sync) partono da un codebase pulito senza dead code che confonde.
- **Sicurezza nel cancellare** — Ogni rimozione deve essere verificata. Meglio un'analisi approfondita ora che un bug misterioso dopo.

</essential>

<boundaries>
## What's Out of Scope

- Niente refactoring — si rimuove e si rinomina, ma NON si ristruttura codice funzionante. Zero cambi di logica.
- Niente test nuovi — la pulizia non include scrivere test. Al massimo fixare test rotti dalla rimozione.
- Niente feature nuove — fase puramente sottrattiva: solo togliere, non aggiungere.

</boundaries>

<specifics>
## Specific Ideas

- Cancellazione diretta dei file morti (no _deprecated/, git è il safety net)
- Analisi deve coprire sia frontend che backend
- Include: file scollegati, export inutilizzati, import orfani, tipi mai usati, naming inconsistencies
- Fix naming (es. sentToMilanoAt) rientra nello scope come rinomina, non come refactoring

</specifics>

<notes>
## Additional Context

La roadmap originale prevedeva 2 plan per questa fase:
- 01-01: File orfani frontend (8) e backend (2), rimuovere ExcelPriceManager.css
- 01-02: Fix dead code (DDT sync ternary, legacy localStorage keys, sentToMilanoAt naming, UnifiedSyncProgress cleanup)

Con la visione "pulizia profonda", i plan potrebbero espandersi per includere dead code non ancora identificato nella roadmap. La ricerca/pianificazione determinerà l'entità reale.

</notes>

---

*Phase: 1-cleanup-dead-code*
*Context gathered: 2026-02-20*
