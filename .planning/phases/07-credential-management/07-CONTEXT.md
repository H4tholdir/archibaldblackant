# Phase 7: Credential Management - Context

**Gathered:** 2026-01-14
**Status:** Ready for planning

<vision>
## How This Should Work

Quando l'agente fa login per la prima volta, trova un checkbox "Ricorda credenziali su questo device" sotto i campi username/password. Se lo seleziona, dopo un login riuscito l'app gli chiede di configurare un sistema di sblocco sicuro.

L'esperienza è simile a una banking app (Intesa, UniCredit): su mobile usa Face ID/Touch ID se disponibile, altrimenti PIN a 6 cifre. Su desktop usa sempre PIN a 6 cifre.

Quando l'agente torna nell'app (dopo aver chiuso e riaperto), non deve digitare username/password. Invece:
1. L'app mostra schermata di sblocco con logo/username
2. L'agente sblocca con PIN o biometrica
3. L'app fa login automatico ad Archibald usando le credenziali salvate cifrate
4. L'agente entra direttamente nell'app, pronto a creare ordini

Tutto deve funzionare perfettamente cross-platform: Android, iOS, iPad, Windows, Mac - stesso comportamento, stessa esperienza.

Le credenziali sono cifrate con Web Crypto API e salvate in IndexedDB locale. Il backend NON salva mai le password - rimane completamente stateless. Valida le credenziali solo al momento del login, poi scarta tutto.

</vision>

<essential>
## What Must Be Nailed

**Tre aspetti fondamentali - tutti ugualmente critici:**

1. **Sicurezza cifrazione massima**
   - Credenziali cifrate con Web Crypto API (standard browser)
   - Se qualcuno accede al device o ispeziona IndexedDB, non può leggere le password
   - Chiave di cifratura derivata dal PIN/biometrica, mai salvata in chiaro

2. **UX fluida cross-platform**
   - Funziona perfettamente su tutti i device (Android, iOS, Windows, Mac)
   - Mobile: biometrica (Face ID/Touch ID) come prima scelta, fallback a PIN
   - Desktop: PIN a 6 cifre
   - Esperienza consistente come banking app (Intesa, UniCredit)

3. **Backend stateless (no credential storage)**
   - Backend non salva MAI le password
   - Credenziali esistono solo cifrate sul device dell'agente
   - Backend valida al momento del login via Puppeteer, poi scarta
   - Architettura session-per-request: ogni richiesta porta JWT, backend usa credenziali decrypt sul device

</essential>

<boundaries>
## What's Out of Scope

**Esplicitamente escluso da Phase 7:**

- **Sync credenziali tra device** - Ogni device salva le proprie credenziali localmente. Se l'agente usa telefono + tablet, deve configurare entrambi separatamente. Non sincronizziamo credenziali via cloud/backend.

- **Recupero password dimenticata Archibald** - Se l'agente dimentica la password del suo account Archibald ERP, deve contattare amministratore per reset. Non implementiamo funzionalità di password recovery Archibald.

- **Gestione scadenza/rotazione credenziali Archibald** - Se Archibald ERP richiede cambio password lato sistema, l'agente deve manualmente aggiornare nell'app. Non gestiamo rotazione automatica o notifiche scadenza password.

- **Codice recovery per PIN dimenticato** - Se l'agente dimentica il PIN configurato nell'app, fa reset completo: cancella credenziali salvate e re-inserisce username/password Archibald da zero.

</boundaries>

<specifics>
## Specific Ideas

**Riferimento UX: Banking App italiana (Intesa Sanpaolo, UniCredit)**
- PIN a 6 cifre su desktop e come fallback su mobile
- Face ID / Touch ID su mobile come metodo primario
- Schermata di sblocco pulita: logo app, username, prompt biometrica o tastierino PIN
- Transizione fluida: sblocco → spinner "Accesso in corso..." → homepage app

**Checkbox "Ricorda credenziali"**
- Posizionato sotto i campi username/password nel form di login
- Label: "Ricorda credenziali su questo device"
- Quando checkata: dopo login successo, l'app mostra setup wizard per configurare PIN/biometrica

**Comportamento logout**
- Pulsante "Esci" logout solo la sessione JWT corrente
- Le credenziali rimangono salvate cifrate sul device
- Prossimo accesso: sblocco con PIN/biometrica e login automatico
- Per cancellare completamente credenziali: menu impostazioni con pulsante "Dimentica credenziali" (non parte del logout normale)

**Gestione PIN dimenticato**
- Schermata sblocco mostra link "PIN dimenticato?"
- Tap su link → conferma: "Cancellare le credenziali salvate? Dovrai inserire di nuovo username e password Archibald"
- Conferma → reset completo → torna a login manuale

**Fallback biometrica non disponibile**
- Se device non supporta Face ID/Touch ID, setup mostra solo opzione PIN
- Se biometrica configurata ma fallisce (3 tentativi), fallback automatico a tastierino PIN

</specifics>

<notes>
## Additional Context

**Priority delle feature**:
Le prime due opzioni discusse sono entrambe valide: checkbox "Ricorda credenziali" + setup PIN/biometrica. La combinazione dei due approcci offre flessibilità:
- Checkbox dà controllo all'agente (opt-in esplicito)
- Setup PIN/biometrica dopo primo login garantisce esperienza guidata

**Cross-platform considerations**:
L'app deve girare su:
- Mobile: Android (telefoni e tablet), iOS (iPhone e iPad)
- Desktop: Windows, macOS

Ogni piattaforma ha le sue API biometriche native. Dobbiamo usare Web Authentication API (WebAuthn) dove disponibile, fallback a PIN quando biometrica non supportata.

**Backend refactoring scope**:
Attualmente (Phase 6) il backend salva temporaneamente password in PasswordCache per validazione. In Phase 7:
- Frontend decifra credenziali localmente quando serve
- Backend riceve credenziali solo per validazione immediata via Puppeteer
- Nessuna cache backend, nessun storage persistente
- Session-per-request pattern: ogni chiamata porta JWT + credenziali decifrate al bisogno

**Security audit requirement**:
Phase 7 introduce crittografia lato client. Prima di considerare completa, serve:
- Verifica implementazione Web Crypto API corretta
- Test penetration su storage IndexedDB
- Audit che chiave derivazione PIN sia robusta
- Conferma che password in chiaro non finiscono mai in logs/console/storage non cifrato

</notes>

---

*Phase: 07-credential-management*
*Context gathered: 2026-01-14*
