# Phase 1: Order Snapshot Schema & Storage - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<vision>
## How This Should Work

Quando un agente piazza un ordine tramite la PWA, il sistema deve "fotografare" esattamente cosa l'utente voleva inviare — ogni articolo, quantità, prezzo, sconto riga, sconto globale e totale atteso. Questo snapshot è la "ricevuta" dell'intenzione dell'utente.

Lo snapshot viene salvato nel momento del submit-order, PRIMA che l'ordine venga effettivamente piazzato su Archibald. È lo stato atteso, non lo stato inserito dal bot. Questo perché il problema principale non è nella digitazione del bot, ma nella **selezione dell'articolo dal dropdown**: il bot digita il codice corretto, ma Archibald potrebbe selezionare un articolo diverso dal dropdown DevExpress.

Non serve uno snapshot "post-bot" (cosa il bot ha digitato) perché il bot crede di aver inserito l'articolo giusto — l'errore avviene lato ERP nella selezione. L'unico confronto che conta è: **cosa l'utente voleva** vs **cosa Archibald ha effettivamente registrato** (dati dal sync articoli).

Il confronto avverrà solo su importi netti (senza IVA), perché Archibald fornisce solo il Sum netto. Le colonne Archibald rilevanti sono:
- NOME ARTICOLO (codice articolo)
- QTÀ ORDINATA (quantità)
- UNITÀ DI PREZZO (prezzo unitario)
- SCONTO % (sconto globale, dalla scheda "Prezzi e sconti")
- APPLICA SCONTO % (sconto su singola riga)
- IMPORTO DELLA LINEA (importo netto calcolato per riga)
- Sum (totale netto ordine)

</vision>

<essential>
## What Must Be Nailed

- **Zero ordini sbagliati non rilevati**: la priorità assoluta è che NESSUN errore passi inosservato. Meglio un falso positivo che un errore mancato.
- **Auto-correzione affidabile**: non basta rilevare, deve anche correggere automaticamente senza intervento umano quando possibile.
- **Snapshot completo e accurato**: deve salvare TUTTO ciò che serve per il confronto — codice articolo, quantità, prezzo unitario, sconto riga, sconto globale, totale netto atteso.
- **Visibilità**: oggi non ci sono dati precisi sulla frequenza degli errori. Il sistema darà finalmente visibilità reale su quanto succede.

</essential>

<boundaries>
## What's Out of Scope

- Confronto con articoli sincronizzati da Archibald — quello è Phase 2 (Verification Engine)
- Auto-correzione via bot — Phase 3
- Notifiche all'utente — Phase 4
- UI per stato verifica — Phase 5
- IVA nel confronto — Archibald fornisce solo netto, quindi lo snapshot salva solo netto

</boundaries>

<specifics>
## Specific Ideas

- Lo snapshot deve essere salvato come parte della transazione del submit-order (stessa transaction DB)
- Dati da salvare per ogni riga: article_code, quantity, unit_price, line_discount_percent, expected_line_amount
- Dati globali: global_discount_percent, expected_gross_amount, expected_total_amount
- Lo snapshot deve essere collegato all'order_id per il confronto successivo in Phase 2
- Warehouse orders (id che inizia con `warehouse-`) probabilmente non necessitano verifica (skip)

</specifics>

<notes>
## Additional Context

Il problema principale osservato è nella selezione articolo dal dropdown DevExpress: il bot digita il codice corretto ma l'ERP seleziona un articolo diverso. La frequenza non è quantificata — il sistema di verifica serve anche per capire quanto è diffuso il problema.

Archibald ha due colonne sconto nella griglia ordini:
- "SCONTO %" → sconto globale (applicato dalla scheda "Prezzi e sconti")
- "APPLICA SCONTO %" → sconto per singola riga articolo

Il totale Sum mostrato da Archibald è già al netto di entrambi gli sconti.

</notes>

---

*Phase: 01-order-snapshot-schema*
*Context gathered: 2026-03-04*
