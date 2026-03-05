# Phase 5: Verification Status Tracking - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<vision>
## How This Should Work

Quando un ordine viene piazzato su Archibald e la verifica rileva discrepanze non risolvibili, oltre alla notifica sulla scheda pending (fase 4), l'ordine creato nello Storico (/orders) deve mostrare un badge rosso che indica la presenza di errori da verificare.

Cliccando sull'ordine, nel dettaglio, le righe degli articoli discrepanti sono evidenziate in rosso con una nota che spiega la discrepanza (atteso vs trovato). L'utente capisce immediatamente quale articolo/quantita'/sconto e' sbagliato.

Il badge e le evidenziazioni rosse persistono finche' l'ordine non viene:
- Inviato a Verona (completato)
- Cancellato su Archibald

I dati di verifica NON devono essere sovrascritti dalla sync periodica degli ordini. La sync aggiorna i dati dell'ordine ma il flag di errore di verifica resta intatto.

Nessuna azione manuale nella PWA per "risolvere" l'errore — il badge sparisce solo con l'invio a Verona o la cancellazione dell'ordine.

</vision>

<essential>
## What Must Be Nailed

- **Badge rosso sulla card ordine** nella pagina Storico (/orders) per ordini con discrepanze non risolte
- **Righe articolo in rosso** nel dettaglio ordine, con tooltip/nota che spiega la discrepanza specifica (articolo sbagliato, quantita' diversa, sconto diverso)
- **Persistenza**: la sync ordini non sovrascrive il flag di errore di verifica
- **Auto-risoluzione**: il badge sparisce solo quando l'ordine viene inviato a Verona o cancellato

</essential>

<boundaries>
## What's Out of Scope

- Niente dashboard/statistiche sulla salute complessiva degli ordini — solo badge sugli ordini individuali
- Niente azione manuale nella PWA per risolvere l'errore (no bottone "Ho corretto")
- Niente ri-verifica automatica alla sync — il flag resta finche' l'ordine non viene completato/cancellato
- Niente notifiche sulla Home — solo nella pagina Storico /orders

</boundaries>

<specifics>
## Specific Ideas

- Il badge e' sulla card dell'ordine nella lista Storico, non in una sezione separata
- Nel dettaglio, la riga dell'articolo discrepante e' evidenziata in rosso — non serve una sezione riepilogo separata
- I dati di verifica sono gia' in `order_verification_snapshots` con `verification_status` e `verification_notes` (JSON mismatches)
- La sync ordini (sync-order-articles) non deve sovrascrivere `verification_status` o `verification_notes`

</specifics>

<notes>
## Additional Context

La fase 4 ha stabilito il pattern: `order_verification_snapshots` contiene status e mismatches dettagliati. La fase 5 porta questa informazione nella UI dello Storico ordini.

Il flusso di risoluzione e' esterno alla PWA: l'utente va su Archibald, corregge/cancella l'ordine, e quando la sync periodica rileva che l'ordine e' stato inviato a Verona o cancellato, il badge sparisce.

Bug noto del bot: inserisce H379.104.014 invece di 379.104.014 — il sistema di verifica lo rileva correttamente.

</notes>

---

*Phase: 05-verification-status-tracking*
*Context gathered: 2026-03-05*
