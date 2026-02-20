# Phase 7: Missing Feature Implementation - Context

**Gathered:** 2026-02-20
**Status:** Ready for research

<vision>
## How This Should Work

Il frontend chiama già tutti questi endpoint — createCustomerBot, subclients API, getNextFtNumber, exportArca — ma riceve risposte stub (501 o dati finti). Gli agenti in campo li usano attivamente e si trovano bloccati.

Questa fase è puramente "far funzionare ciò che già esiste": implementare il backend dietro ogni endpoint stub che il frontend già chiama. Nessuna UI nuova, nessun flusso nuovo — solo collegare i pezzi mancanti.

Per i sotto-clienti: i dati vengono caricati da un file Excel nella sezione admin. Non dal bot Puppeteer.

Per l'export Arca: deve seguire il formato ufficiale Arca Professional. L'utente può scaricare direttamente i file generati. Esiste un file MD nel progetto con le specifiche del formato Arca e la logica di numerazione FT da consultare.

</vision>

<essential>
## What Must Be Nailed

- **Ogni stub deve funzionare** — Tutte le feature sono usate attivamente dagli agenti, nessuno stub rotto è accettabile
- **createCustomerBot integrato in createApp** — Il flusso creazione clienti deve funzionare end-to-end
- **Subclients da Excel** — Import, ricerca, visualizzazione sotto-clienti caricati via admin
- **Export Arca formato ufficiale** — Il file generato deve essere importabile in Arca Professional senza manipolazioni manuali
- **Numerazione FT corretta** — Progressiva, persistente su PostgreSQL

</essential>

<boundaries>
## What's Out of Scope

- Niente UI nuova — solo implementare endpoint backend che il frontend già chiama
- Niente test approfonditi — i test dettagliati arrivano nella Phase 8
- Niente refactoring dell'interfaccia admin per l'upload Excel (se già esiste)

</boundaries>

<specifics>
## Specific Ideas

- I sotto-clienti vengono da Excel caricato in sezione admin (non dal bot)
- Export Arca deve seguire formato ufficiale Arca Professional
- Esiste un file MD nel progetto con info su formato Arca e numerazione FT — consultarlo durante la research
- L'utente scarica direttamente i file di export

</specifics>

<notes>
## Additional Context

Tutte le feature sono ugualmente prioritarie — gli agenti in campo le usano tutte quotidianamente. Ogni stub che ritorna 501 è un blocco operativo reale.

Le dipendenze dalla roadmap (Phase 3 browser pool + Phase 5 WebSocket) sono già completate, quindi il terreno è pronto per implementare queste feature.

</notes>

---

*Phase: 07-missing-features*
*Context gathered: 2026-02-20*
