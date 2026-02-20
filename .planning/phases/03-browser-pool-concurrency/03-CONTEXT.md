# Phase 3: Browser Pool & Concurrency - Context

**Gathered:** 2026-02-20
**Status:** Ready for research

<vision>
## How This Should Work

Ogni agente deve poter usare la PWA in totale tranquillità, senza pensieri. Le operazioni di un agente sono completamente indipendenti da quelle degli altri — questo rispecchia il funzionamento di Archibald stesso.

L'agente usa la PWA su diversi dispositivi nel corso della giornata (tablet dal cliente, app in auto, desktop in ufficio, mobile in magazzino). Di norma un dispositivo alla volta, ma può capitare che la PWA sia aperta su più dispositivi contemporaneamente — il sistema deve gestirlo senza problemi.

Quando più agenti lavorano in parallelo, ognuno deve avere il proprio flusso indipendente. Agente Mario che crea un ordine e Agente Luigi che sincronizza i clienti devono procedere in parallelo, senza aspettarsi a vicenda.

Per i fallimenti: recupero automatico, ma con una regola fondamentale — prima di ritentare un'operazione, controllare SEMPRE su Archibald se l'operazione è già stata completata. Se il bot stava creando un ordine e qualcosa è andato storto, prima di ricreare l'ordine bisogna verificare se su Archibald l'ordine esiste già. Se esiste, passare al flusso di modifica anziché ricrearlo. Stesso principio per invio a Verona (verificare se già inviato), creazione clienti (verificare se già creato), e qualsiasi altra operazione che modifica stato su Archibald.

</vision>

<essential>
## What Must Be Nailed

- **Isolamento totale tra agenti** — L'operazione di un agente non deve MAI interferire con quella di un altro. Agenti diversi in parallelo, sempre.
- **Concurrency per-utente** — Un'operazione alla volta per agente, ma agenti diversi procedono senza attese.
- **Check-before-retry** — Su fallimento, verificare SEMPRE lo stato su Archibald prima di ritentare. Mai duplicare operazioni (ordini creati due volte, invii doppi a Verona, clienti duplicati).
- **Scalabilità** — Oggi 1 agente con 2-3 dispositivi, tra qualche mese 60+ agenti. La soluzione deve reggere fin da subito.

</essential>

<boundaries>
## What's Out of Scope

- Nessuna esclusione specifica indicata — tutto ciò che è nella roadmap per questa fase è in scope
- UI nuove per la gestione concurrency non richieste — fix sotto il cofano

</boundaries>

<specifics>
## Specific Ideas

- Ogni operazione su Archibald che può fallire a metà deve avere una logica di verifica stato: prima di ritentare, il sistema controlla se l'azione è già avvenuta sul gestionale
- Se un ordine risulta già creato su Archibald dopo un crash, il sistema deve passare automaticamente al flusso di modifica (non ricreazione)
- Lo stesso pattern "check-then-act" si applica a: submit-order, send-to-verona, creazione clienti, e altre operazioni che modificano stato su Archibald

</specifics>

<notes>
## Additional Context

- L'uso multi-dispositivo è naturale per gli agenti: tablet → auto → ufficio → magazzino nel corso della giornata
- La scala attuale (1 agente) non deve ingannare — il design deve prevedere 60+ agenti simultanei a breve
- Oggi esiste già un qualche feedback all'utente su errori, ma il dettaglio non è chiaro — da verificare in fase di ricerca

</notes>

---

*Phase: 03-browser-pool-concurrency*
*Context gathered: 2026-02-20*
