# Phase 1: Security Critical Fixes - Context

**Gathered:** 2026-01-11
**Status:** Ready for planning

<vision>
## How This Should Work

Pulizia completa e reset - nessun compromesso. Questa fase deve eliminare ogni traccia di vulnerabilità security dalle fondamenta del progetto. Non fix rapidi o workaround temporanei, ma una rimozione sistematica e definitiva dei problemi critici.

L'approccio è "zero tracce credenziali": git history completamente pulito come se le credenziali non fossero mai state committate, .env mai più nel repository, documentazione chiara per prevenire che ricapiti.

</vision>

<essential>
## What Must Be Nailed

- **Git history pulito** - Questo è il punto più critico. La git history deve essere completamente ripulita da ogni traccia delle credenziali committate. Non basta rimuovere il file corrente, serve rimuovere ogni commit storico che le conteneva. Come se non fossero mai esistite nel repository.

</essential>

<boundaries>
## What's Out of Scope

- **Refactoring architetturale** - Solo security fixes necessari, nessuna ristrutturazione di codice o cambio di pattern
- **Nuove feature security** - No audit completi, penetration testing, security headers avanzati - solo fix delle vulnerabilità note e documentate
- **Ottimizzazioni performance** - No fix di polling loop, N+1 queries o altre ottimizzazioni - focus esclusivo su security e stability
- **Testing approfondito** - Test minimi per validare i fix funzionano - la suite completa di testing è Fase 2
- **Code quality generale** - console.log() e type any sono tech debt ma non security critical - rimandati a Fase 2

</boundaries>

<specifics>
## Specific Ideas

Nessuna preferenza specifica su tool o processo - usare best practices standard per questo tipo di intervento. L'importante è il risultato: credenziali completamente rimosse dalla history, bug critici risolti, fondamenta sicure per procedere.

</specifics>

<notes>
## Additional Context

Le credenziali attualmente presenti in `backend/.env` sono credenziali personali di test dell'utente - non sono credenziali production leak da terzi. Questo semplifica la rotazione (basta cambiarle) ma non riduce l'importanza della pulizia git history.

Focus primario: eliminare ogni traccia dal repository. Secondario: rotare le credenziali in Archibald ERP. Terziario: documentare processo sicuro per il futuro.

</notes>

---

*Phase: 01-security-critical-fixes*
*Context gathered: 2026-01-11*
