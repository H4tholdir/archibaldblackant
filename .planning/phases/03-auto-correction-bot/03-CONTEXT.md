# Phase 3: Auto-Correction via Bot - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<vision>
## How This Should Work

Quando il verification engine (Phase 2) rileva un mismatch, la correzione avviene **subito, nello stesso flusso del submit-order**. La progress bar continua con "Correzione ordine in corso..." e l'utente aspetta.

Il flusso completo inline è:
1. Submit ordine → snapshot → sync → verifica
2. Se mismatch → **correzione immediata** (bot modifica l'ordine su Archibald)
3. Dopo la correzione → **ri-sync + ri-verifica** (ciclo completo per confermare)
4. Se ri-verifica OK → status `auto_corrected`
5. Se ri-verifica fallisce → status `correction_failed`, **notifica utente e stop** (un solo tentativo, no retry)

La correzione deve essere **chirurgica**: il bot modifica solo le righe con discrepanza, non riscrive tutto l'ordine. Questo è più veloce anche se più complesso tecnicamente.

La progress bar mostra messaggi generici ma chiari: "Correzione ordine in corso...", non i dettagli tecnici come quale articolo sta correggendo.

</vision>

<essential>
## What Must Be Nailed

- **Correzione inline nel flusso submit**: stessa progress bar, nessun job separato
- **Un solo tentativo**: se la correzione + ri-verifica fallisce → `correction_failed` + notifica utente, stop
- **Correzione chirurgica**: solo righe con discrepanza, non tutto l'ordine
- **Ri-verifica obbligatoria**: correzione → re-sync → re-verifica per confermare che ha funzionato
- **Mai bloccare il submit**: se qualcosa va storto nella correzione, l'ordine resta su Archibald e l'utente viene avvisato

</essential>

<boundaries>
## What's Out of Scope

- Notifiche dettagliate all'utente con UI dedicata — Phase 4
- Dashboard stato verifica nel frontend — Phase 5
- Test end-to-end del flusso completo — Phase 6
- Secondo tentativo di correzione — un solo retry, poi stop
- Correzione di ordini vecchi (solo ordini appena piazzati nel flusso inline)

</boundaries>

<specifics>
## Specific Ideas

- Il bot `edit-order` già esiste — serve adattare le `modifications` per correggere solo le righe con mismatch
- Il tipo di mismatch determina la correzione: `missing` → aggiungi riga, `extra` → (non dovrebbe succedere), `quantity_diff` → aggiorna quantità, `price_diff` → aggiorna prezzo, `discount_diff` → aggiorna sconto
- Dopo edit-order → chiamare `performInlineOrderSync` di nuovo → `verifyOrderArticles` di nuovo
- Progress: correzione 95-97%, ri-sync 97-99%, ri-verifica 99%, risultato finale 100%

</specifics>

<notes>
## Additional Context

Il flusso completo nel submit-order diventa:
- 0-70%: bot crea ordine + DB save + snapshot
- 70-85%: sync inline articoli
- 85-90%: verifica snapshot vs sync
- 90-95%: [se mismatch] correzione bot
- 95-98%: [se mismatch] ri-sync + ri-verifica
- 98-100%: risultato finale

Il tempo extra per correzione + ri-verifica è accettabile. L'utente vede i messaggi nella progress bar e sa che il sistema sta lavorando per garantire la correttezza.

</notes>

---

*Phase: 03-auto-correction-bot*
*Context gathered: 2026-03-05*
