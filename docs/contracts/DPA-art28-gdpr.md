# Data Processing Agreement (DPA)
## Accordo sul Trattamento dei Dati Personali — Art. 28 GDPR

**Versione**: 1.0
**Data**: [DA INSERIRE]
**Riferimento normativo**: Regolamento UE 2016/679 (GDPR), Art. 28
**Classificazione**: Riservato — uso contrattuale

---

## PREMESSE

Il presente Accordo sul Trattamento dei Dati Personali ("DPA" o "Accordo") è stipulato tra:

**TITOLARE DEL TRATTAMENTO (Controller)**
Komet Italia S.r.l.
P.IVA: [DA INSERIRE]
Sede legale: [DA INSERIRE]
Rappresentante legale: [DA INSERIRE]
Email DPO/Privacy: [DA INSERIRE]
(di seguito "**Titolare**")

**RESPONSABILE DEL TRATTAMENTO (Processor)**
Formicola Francesco
P.IVA: [DA INSERIRE]
Sede operativa: Napoli (NA), Italia
Email: [DA INSERIRE]
(di seguito "**Responsabile**")

**PREMESSO CHE**:
- Il Titolare ha incaricato il Responsabile di erogare il servizio SaaS "Archibald PWA" per la gestione degli ordini e della rete agenti, come disciplinato dal Master Service Agreement ("MSA") sottoscritto tra le parti in data [DA INSERIRE];
- Nell'ambito dell'erogazione del Servizio, il Responsabile tratta Dati Personali per conto del Titolare;
- L'Art. 28 GDPR richiede che il trattamento da parte di un responsabile sia regolato da un contratto scritto che imponga al Responsabile obblighi specifici nei confronti del Titolare;
- Le parti intendono formalizzare con il presente DPA i termini e le condizioni del trattamento dei Dati Personali;

**LE PARTI CONCORDANO QUANTO SEGUE**:

---

## ARTICOLO 1 — DEFINIZIONI

I termini definiti nel GDPR (Reg. UE 2016/679) hanno il medesimo significato nel presente DPA. In aggiunta:

**1.1 "Trattamento"**: qualsiasi operazione o insieme di operazioni eseguite sui Dati Personali, come la raccolta, la registrazione, l'organizzazione, la strutturazione, la conservazione, l'adattamento, la modifica, l'estrazione, la consultazione, l'uso, la comunicazione, la diffusione, la cancellazione o la distruzione.

**1.2 "Violazione dei Dati Personali"** (data breach): qualsiasi violazione della sicurezza che comporti accidentalmente o in modo illecito la distruzione, la perdita, la modifica, la divulgazione non autorizzata o l'accesso ai Dati Personali trasmessi, conservati o altrimenti trattati.

**1.3 "Interessato"**: la persona fisica i cui Dati Personali sono trattati nell'ambito del Servizio.

**1.4 "Sub-responsabile"** (sub-processor): qualsiasi soggetto terzo nominato dal Responsabile per eseguire specifiche attività di trattamento per conto del Titolare nell'ambito del Servizio.

**1.5 "Istruzione documentata"**: qualsiasi istruzione del Titolare al Responsabile in merito al trattamento dei Dati Personali, incluse le istruzioni fornite nel presente DPA e nel MSA.

---

## ARTICOLO 2 — OGGETTO, NATURA, FINALITÀ E DURATA DEL TRATTAMENTO

**2.1 Oggetto**: Il Responsabile tratta Dati Personali per conto del Titolare nell'ambito dell'erogazione del Servizio "Archibald PWA", piattaforma SaaS per la gestione degli ordini e della rete agenti Komet.

**2.2 Natura del trattamento**: Le operazioni di trattamento includono: raccolta, registrazione, organizzazione, strutturazione, conservazione, consultazione, utilizzo, modifica, comunicazione (tra utenti autorizzati), e cancellazione dei Dati Personali. Il trattamento avviene su infrastruttura informatica (VPS Hetzner, Germania) gestita dal Responsabile.

**2.3 Finalità del trattamento**: Il trattamento è eseguito esclusivamente per le seguenti finalità:
- (a) Gestione degli accessi degli agenti alla piattaforma (autenticazione e autorizzazione);
- (b) Gestione del ciclo ordine (creazione, sincronizzazione con ERP, storico);
- (c) Gestione dell'anagrafica clienti del Titolare;
- (d) Erogazione delle funzionalità operative del Servizio descritte nel MSA;
- (e) Attività di supporto tecnico, manutenzione e backup necessarie all'erogazione del Servizio;
- (f) Adempimento degli obblighi di sicurezza e logging previsti da normativa.

**2.4 Durata**: Il presente DPA ha la stessa durata del MSA e cessa con la cessazione del MSA per qualsiasi causa. Gli obblighi di cancellazione/restituzione dei dati di cui all'Articolo 10 sopravvivono alla cessazione.

---

## ARTICOLO 3 — TIPO DI DATI PERSONALI E CATEGORIE DI INTERESSATI

**3.1 Tipo di dati personali trattati**:

| Categoria | Esempi | Origine |
|---|---|---|
| Dati identificativi agenti | Nome, cognome, username | Inserimento diretto Titolare |
| Credenziali di accesso | Password (bcrypt hash), ERP password (AES-256-GCM) | Generazione automatica / inserimento utente |
| Dati di sessione e attività | IP di accesso, timestamp login/logout, azioni eseguite (audit log) | Generazione automatica del sistema |
| Dati identificativi clienti finali | Nome/ragione sociale, indirizzo, CAP, città, provincia | Sincronizzazione ERP / inserimento agente |
| Dati fiscali clienti finali | Partita IVA, Codice Fiscale | Sincronizzazione ERP / inserimento agente |
| Dati di contatto clienti finali | Email, numero di telefono | Sincronizzazione ERP / inserimento agente |
| Dati commerciali | Storico ordini, prezzi, sconti applicati | Sincronizzazione ERP / inserimento agente |
| Codici OTP/MFA | Secret TOTP cifrato, recovery codes (hash) | Generazione automatica per utenti admin |

**3.2 Dati particolari**: Il Responsabile non tratta categorie particolari di dati ai sensi dell'Art. 9 GDPR (dati sanitari, genetici, biometrici, politici, religiosi, sindacali, giudiziari). Qualora il Titolare dovesse richiedere il trattamento di tali categorie, le parti stipuleranno un addendum specifico.

**3.3 Categorie di interessati**:
- Agenti di vendita del Titolare (utenti della piattaforma);
- Personale amministrativo e dirigenziale del Titolare con accesso alla piattaforma;
- Clienti finali del Titolare (persone fisiche e rappresentanti di persone giuridiche) i cui dati sono registrati nella piattaforma.

---

## ARTICOLO 4 — OBBLIGHI DEL RESPONSABILE (Art. 28.3 GDPR)

### 4.a — Trattamento solo su istruzione documentata del Titolare

**4.a.1** Il Responsabile tratta i Dati Personali esclusivamente su istruzione documentata del Titolare. Le istruzioni del Titolare sono fornite: (i) nel presente DPA e nel MSA; (ii) nelle configurazioni del Servizio impostate dal Titolare; (iii) in eventuali istruzioni scritte aggiuntive comunicate via email o altro canale tracciabile.

**4.a.2** Qualora il Responsabile ritenga che un'istruzione del Titolare violi il GDPR o altra normativa applicabile, ne informa prontamente il Titolare per iscritto, sospendendo l'esecuzione dell'istruzione in attesa di chiarimento, salvo che la normativa applicabile imponga al Responsabile di procedere senza tale notifica.

**4.a.3** Il Responsabile non utilizza i Dati Personali del Titolare per finalità proprie, per la profilazione degli interessati, per la vendita a terzi o per qualsiasi altra finalità non espressamente autorizzata dal presente DPA.

### 4.b — Obbligo di riservatezza per le persone autorizzate

**4.b.1** Il Responsabile garantisce che le persone autorizzate a trattare i Dati Personali nell'ambito del Servizio (dipendenti, collaboratori, consulenti) abbiano sottoscritto impegni di riservatezza adeguati o siano soggette a obblighi di riservatezza di natura legale, e che abbiano ricevuto adeguata formazione in materia di protezione dei dati.

**4.b.2** Il Responsabile limita l'accesso ai Dati Personali del Titolare alle sole persone fisiche strettamente necessarie per l'erogazione del Servizio, nel rispetto del principio di minimizzazione dell'accesso.

**4.b.3** Attualmente, l'unica persona autorizzata ad accedere direttamente ai Dati del Titolare nel sistema del Responsabile è Formicola Francesco (sviluppatore e gestore del Servizio). Qualsiasi estensione dell'accesso a ulteriori collaboratori viene comunicata preventivamente al Titolare.

### 4.c — Misure di sicurezza ex Art. 32 GDPR

**4.c.1** Il Responsabile implementa e mantiene le misure tecniche e organizzative di sicurezza descritte nell'**Allegato Tecnico al presente DPA** (coincidente con l'Allegato B — SLA e Allegato Sicurezza del MSA), adeguate ai rischi presentati dal trattamento.

**4.c.2** Le misure includono, senza limitazione: pseudonimizzazione e cifratura (AES-256-GCM, TLS 1.3, bcrypt), controllo degli accessi (RBAC, MFA, JWT con revocation), audit log immutabile, backup giornalieri cifrati, procedure formali di incident response.

**4.c.3** Il Responsabile effettua revisioni periodiche delle misure di sicurezza e le aggiorna in funzione dei rischi identificati, dell'evoluzione tecnologica e dei requisiti normativi.

### 4.d — Sub-responsabili

**4.d.1 Autorizzazione generale**: Il Titolare autorizza il Responsabile ad avvalersi dei sub-responsabili elencati nell'**Allegato 1 al presente DPA** (Lista Sub-responsabili Autorizzati). L'utilizzo di sub-responsabili non elencati richiede previa autorizzazione scritta del Titolare.

**4.d.2 Comunicazione preventiva**: Prima di aggiungere o sostituire un sub-responsabile, il Responsabile notifica il Titolare per iscritto con preavviso di **trenta (30) giorni**, specificando: identità del sub-responsabile, sede, dati trattati, misure di sicurezza adottate. Il Titolare può opporsi per iscritto entro **quindici (15) giorni** dalla notifica, adducendo motivazioni fondate in materia di protezione dei dati.

**4.d.3 Obblighi a valle**: Il Responsabile impone a ciascun sub-responsabile obblighi di protezione dei dati equivalenti a quelli del presente DPA, mediante contratto scritto. Il Responsabile rimane pienamente responsabile verso il Titolare per l'adempimento degli obblighi da parte dei sub-responsabili.

**4.d.4 Audit sub-responsabili**: Il Responsabile verifica periodicamente la conformità dei sub-responsabili agli obblighi imposti, acquisendo le relative certificazioni (es. ISO 27001, SOC 2) ove disponibili, e comunica al Titolare eventuali criticità rilevate.

### 4.e — Assistenza al Titolare per i diritti degli interessati

**4.e.1** Il Responsabile assiste il Titolare nel dare seguito alle richieste degli interessati relative all'esercizio dei diritti previsti dal GDPR (Artt. 15-22), nei limiti di quanto tecnicamente fattibile:

| Diritto | Misura tecnica disponibile |
|---|---|
| Accesso (Art. 15) | Consultazione audit log e dati cliente da interfaccia admin |
| Rettifica (Art. 16) | Modifica dati cliente dall'interfaccia della piattaforma |
| Cancellazione (Art. 17) | Endpoint `POST /api/admin/customers/:id/gdpr-erase` — anonimizzazione PII |
| Portabilità (Art. 20) | Esportazione dati cliente in formato strutturato (su richiesta) |
| Opposizione (Art. 21) | Disabilitazione account / cancellazione dati |

**4.e.2** Il Responsabile trasferisce al Titolare, entro **quarantotto (48) ore** dalla ricezione, qualsiasi richiesta di esercizio dei diritti pervenuta direttamente all'indirizzo del Responsabile.

**4.e.3** I dati relativi a fatturazione, ordini e documenti fiscali sono conservati per **dieci (10) anni** ai sensi del D.P.R. 600/1973 art. 22, anche in caso di richiesta di cancellazione. Il Responsabile informa il Titolare di tale limitazione tecnica all'esercizio del diritto di cancellazione.

### 4.f — Assistenza per obblighi Art. 32-36 GDPR

**4.f.1 Sicurezza (Art. 32)**: Il Responsabile fornisce al Titolare, su richiesta scritta, la documentazione relativa alle misure di sicurezza implementate, ai fini della valutazione del rischio da parte del Titolare.

**4.f.2 Data Breach — Notifica (Art. 33-34)**: Il Responsabile notifica al Titolare qualsiasi Violazione dei Dati Personali entro **ventiquattro (24) ore** dalla scoperta, secondo il template definito in `docs/compliance/incident-response-procedure.md`. La notifica include: (a) natura della violazione; (b) categorie e numero approssimativo di interessati coinvolti; (c) categorie e numero approssimativo di dati coinvolti; (d) misure adottate o proposte per porre rimedio. Il Responsabile assiste il Titolare nella predisposizione della notifica al Garante (Art. 33) e nell'eventuale comunicazione agli interessati (Art. 34).

**4.f.3 DPIA (Art. 35)**: Il Responsabile assiste il Titolare, su richiesta, nella conduzione di valutazioni d'impatto sulla protezione dei dati (DPIA), fornendo le informazioni tecniche necessarie.

**4.f.4 Consultazione preventiva (Art. 36)**: Il Responsabile assiste il Titolare nella consultazione preventiva con l'autorità di controllo, ove richiesta a seguito di DPIA.

### 4.g — Cancellazione o restituzione dei dati a fine contratto

**4.g.1** Alla cessazione del DPA e del MSA per qualsiasi causa, il Responsabile, a scelta del Titolare comunicata per iscritto entro **quindici (15) giorni** dalla cessazione:
- (a) Restituisce al Titolare tutti i Dati Personali in formato esportabile (CSV/JSON), oppure
- (b) Cancella in modo sicuro tutti i Dati Personali dai propri sistemi (inclusi backup e sistemi di log).

**4.g.2** Le operazioni di cui al comma 4.g.1 vengono eseguite entro **trenta (30) giorni** dalla comunicazione del Titolare. Il Responsabile fornisce al Titolare attestazione scritta dell'avvenuta cancellazione o restituzione.

**4.g.3** In deroga a quanto sopra, il Responsabile può conservare i dati strettamente necessari ad adempiere obblighi di legge (es. conservazione fiscale decennale), dandone comunicazione scritta al Titolare con indicazione della base giuridica.

### 4.h — Messa a disposizione informazioni e audit

**4.h.1** Il Responsabile mette a disposizione del Titolare tutte le informazioni necessarie a dimostrare il rispetto degli obblighi del presente DPA, inclusi il presente documento, l'Allegato Tecnico e i certificati dei sub-responsabili.

**4.h.2 Diritto di audit**: Il Titolare, o un revisore da esso incaricato e soggetto a obbligo di riservatezza, ha il diritto di effettuare verifiche della conformità del Responsabile agli obblighi del presente DPA, previa comunicazione scritta con preavviso di **trenta (30) giorni** e nel rispetto delle seguenti condizioni: (a) max una verifica all'anno, salvo ragionevole sospetto di violazione; (b) la verifica non compromette la sicurezza dei sistemi o la riservatezza dei dati di altri clienti del Responsabile; (c) i costi della verifica sono a carico del Titolare.

**4.h.3** In alternativa all'audit fisico, il Responsabile può soddisfare l'obbligo di cui al comma 4.h.2 fornendo al Titolare: report di security audit recenti, certificazioni ISO 27001 o equivalenti (ove ottenute), questionari di sicurezza compilati.

---

## ARTICOLO 5 — TRASFERIMENTI DI DATI PERSONALI EXTRA-UE

**5.1** Il Responsabile garantisce che i Dati Personali siano trattati e conservati **esclusivamente nell'Unione Europea** (VPS Hetzner, Falkenstein, Germania). Nessun dato personale viene trasferito fuori dall'UE nell'ambito dell'operatività ordinaria del Servizio.

**5.2 Eccezione FedEx**: L'unico dato trasmesso a un soggetto extra-UE (FedEx Corporation, USA) è il tracking number di spedizione, che non costituisce dato personale ai sensi del GDPR (trattandosi di codice alfanumerico non associato a persona fisica identificata). Il Responsabile ha verificato che tali dati siano minimizzati e privi di informazioni identificative.

**5.3 Dropbox (solo modulo Fresis)**: Il sub-responsabile Dropbox Inc. (USA) è attivo esclusivamente per il modulo opzionale di integrazione ArcaPro/Fresis, non applicabile al servizio standard erogato al Titolare. Qualora il Titolare dovesse attivare tale modulo, le parti stipuleranno un addendum specifico con Clausole Contrattuali Standard (SCC) ai sensi dell'Art. 46.2 GDPR.

**5.4** Il Responsabile notifica prontamente al Titolare qualsiasi obbligo di trasferimento imposto da autorità giudiziarie o amministrative, salvo che la normativa lo vieti.

---

## ARTICOLO 6 — NOTIFICA VIOLAZIONI DEI DATI PERSONALI

**6.1** Il Responsabile adotta le misure tecniche e organizzative necessarie a rilevare tempestivamente le Violazioni dei Dati Personali.

**6.2** Il Responsabile notifica al Titolare qualsiasi Violazione dei Dati Personali **entro ventiquattro (24) ore** dalla scoperta, utilizzando il template di notifica definito nella procedura di incident response.

**6.3 Contenuto minimo della notifica**:
- (a) Descrizione della natura della violazione;
- (b) Categorie e numero approssimativo di interessati coinvolti;
- (c) Categorie e numero approssimativo di dati coinvolti;
- (d) Probabili conseguenze della violazione;
- (e) Misure adottate o proposte per porre rimedio, incluse le misure per attenuare i possibili effetti negativi.

**6.4** Qualora non siano disponibili tutte le informazioni entro le 24 ore, il Responsabile fornisce un avviso preliminare con le informazioni disponibili, completando la notifica con informazioni supplementari non appena disponibili.

**6.5** Il Responsabile assiste il Titolare negli adempimenti di notifica al Garante Privacy entro **settantadue (72) ore** dalla scoperta (Art. 33 GDPR), fornendo tutte le informazioni necessarie.

---

## ARTICOLO 7 — RESPONSABILITÀ E INDENNITÀ

**7.1** Il Responsabile è responsabile verso il Titolare per i danni causati dal trattamento in violazione del presente DPA o del GDPR, imputabili a colpa o dolo del Responsabile.

**7.2** In caso di azione risarcitoria avanzata da un interessato nei confronti del Titolare per fatti imputabili al Responsabile, il Responsabile indennizza il Titolare delle somme liquidate, purché: (a) il Titolare abbia notificato tempestivamente il Responsabile della richiesta; (b) il Responsabile abbia la facoltà di gestire o partecipare alla difesa.

**7.3** Le limitazioni di responsabilità di cui all'Art. 8 del MSA si applicano anche alle obbligazioni derivanti dal presente DPA, nei limiti consentiti dalla normativa applicabile.

---

## ARTICOLO 8 — CLAUSOLE FINALI

**8.1** Il presente DPA prevale sul MSA in caso di conflitto per quanto attiene ai profili di protezione dei dati personali.

**8.2** Il presente DPA è disciplinato dalla legge italiana e dal GDPR. Per quanto non previsto, si applicano le disposizioni del MSA.

**8.3** Il presente DPA può essere modificato solo mediante accordo scritto di entrambe le parti.

**8.4** Qualora sopravvenissero modifiche normative che richiedano aggiornamenti al presente DPA, le parti si impegnano a negoziare in buona fede un addendum entro **trenta (30) giorni** dalla relativa richiesta scritta.

---

## FIRME

Il presente DPA è parte integrante del MSA sottoscritto tra le parti in data [DA INSERIRE].

Luogo e data: ________________________

**Il Titolare del trattamento**
Komet Italia S.r.l.

Firma: ________________________________
Nome, Cognome e Qualifica: ________________________________

**Il Responsabile del trattamento**
Formicola Francesco

Firma: ________________________________

---

## ALLEGATO 1 — LISTA SUB-RESPONSABILI AUTORIZZATI

*Ai sensi dell'Art. 28.3(d) GDPR*

| # | Sub-responsabile | Ruolo | Dati trattati | Sede | Trasf. extra-UE | Base giuridica |
|---|---|---|---|---|---|---|
| 1 | Hetzner Online GmbH | VPS hosting + Object Storage (backup) | Tutti i dati (PostgreSQL, log, backup cifrati) | Gunzenhausen, Germania 🇩🇪 | No | DPA Hetzner (hetzner.com/legal/privacy) |
| 2 | FedEx Corporation | API tracking spedizioni | Tracking numbers (non personali) | Memphis, USA 🇺🇸 | Sì — solo codici anonimi | Minimizzazione — no dato personale |
| 3 | [Provider SMTP — DA COMPLETARE] | Invio email alert sicurezza sistema | Email admin sistema (non dati clienti finali) | [DA VERIFICARE] | [DA VERIFICARE] | [DA COMPLETARE] |

**Note**: La lista è aggiornata almeno ogni sei mesi. Il Titolare è notificato preventivamente (30 giorni) di qualsiasi modifica.

---

## ALLEGATO 2 — MISURE TECNICHE E ORGANIZZATIVE DI SICUREZZA

*Si rimanda all'**Allegato B — SLA e Allegato Sicurezza** del MSA per la descrizione completa delle misure tecniche e organizzative implementate ai sensi dell'Art. 32 GDPR.*

In sintesi, le misure includono:
- Controllo degli accessi: RBAC 4 ruoli, MFA obbligatorio per ruoli admin/ufficio, whitelist utenti, JWT con revocation list Redis
- Crittografia: AES-256-GCM per dati sensibili (password ERP, secret MFA), TLS 1.3 in transito, bcrypt per recovery codes
- Audit e monitoraggio: audit log immutabile PostgreSQL (REVOKE UPDATE/DELETE), security alerts automatici, log 90 giorni
- Backup: giornalieri su Hetzner Object Storage (Germania), retention 30 backup, RPO ≤ 24h, RTO ≤ 4h
- Incident response: procedura formale documentata, notifica entro 24h al Titolare, notifica Garante entro 72h
- Sviluppo sicuro: TDD, npm audit in CI/CD, TypeScript strict, code review obbligatoria

---

*Fine del documento — DPA Art. 28 GDPR v1.0*
