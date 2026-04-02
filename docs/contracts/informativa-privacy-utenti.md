# Informativa sul Trattamento dei Dati Personali
## Piattaforma Archibald PWA — Utenti della Rete Agenti

*Ai sensi degli Artt. 13 e 14 del Regolamento UE 2016/679 (GDPR)*

**Versione**: 1.0
**Data ultima revisione**: [DA INSERIRE]
**Classificazione**: Documento pubblico — da consegnare agli utenti al momento dell'attivazione dell'account

---

## 1. TITOLARE DEL TRATTAMENTO

Il Titolare del trattamento dei dati personali raccolti e trattati nell'ambito della piattaforma Archibald PWA è:

**Komet Italia S.r.l.**
P.IVA: [DA INSERIRE]
Sede legale: [DA INSERIRE]
Email: [DA INSERIRE]
Telefono: [DA INSERIRE]
Sito web: [DA INSERIRE]

(di seguito "**Titolare**")

Per esercitare i tuoi diritti o per qualsiasi richiesta in materia di privacy, puoi contattare il Titolare all'indirizzo email: **[DA INSERIRE — email privacy/DPO]**

---

## 2. RESPONSABILE DEL TRATTAMENTO (ART. 28 GDPR)

Il Titolare si avvale, per l'erogazione tecnica del Servizio, di un Responsabile del trattamento designato ai sensi dell'Art. 28 GDPR:

**Formicola Francesco**
P.IVA: [DA INSERIRE]
Sede operativa: Napoli (NA), Italia
Email: [DA INSERIRE]

Il Responsabile gestisce l'infrastruttura tecnica della piattaforma (server, database, backup) e tratta i dati personali esclusivamente per conto e su istruzione del Titolare. Un accordo scritto (Data Processing Agreement) regola i rapporti tra Titolare e Responsabile nel rispetto del GDPR.

---

## 3. DATI PERSONALI TRATTATI

Nell'ambito dell'utilizzo della piattaforma Archibald PWA, vengono trattati le seguenti categorie di dati personali:

### 3.1 Dati di accesso e identità

| Dato | Finalità | Note |
|---|---|---|
| Nome e cognome | Identificazione utente nella piattaforma | Inserito al momento dell'attivazione dell'account |
| Username | Credenziale di accesso | Scelto dall'utente o assegnato dall'amministratore |
| Password | Autenticazione | Conservata in forma cifrata (hash bcrypt non reversibile) |
| Credenziali ERP | Automazione accesso al gestionale Komet | Conservate in forma cifrata (AES-256-GCM) |
| Secret TOTP (MFA) | Autenticazione a due fattori | Solo per ruoli admin/ufficio; cifrato AES-256-GCM |
| Codici di recovery MFA | Ripristino accesso MFA | Conservati in hash non reversibile |

### 3.2 Dati di attività e sessione

| Dato | Finalità | Note |
|---|---|---|
| Indirizzo IP di accesso | Sicurezza, prevenzione accessi non autorizzati | Registrato in audit log immutabile |
| Timestamp login/logout | Audit di sicurezza, monitoraggio attività | Registrato in audit log immutabile |
| Azioni eseguite nella piattaforma | Tracciabilità operazioni (ordini creati, clienti modificati, export, ecc.) | Conservato in audit log immutabile |
| Token di sessione (JWT) | Mantenimento della sessione di accesso | Scadenza automatica ogni 8 ore; invalidato al logout |
| Dati di navigazione tecnici | Log applicativi (solo URL, metodo HTTP, status code) | Nessun dato sensibile; rotazione a 90 giorni |

### 3.3 Dati relativi all'attività operativa

I dati relativi agli ordini inseriti, alle anagrafiche clienti gestite e alle operazioni commerciali eseguite sulla piattaforma sono trattati per finalità operative del Titolare. Questi dati possono includere riferimenti a persone fisiche (es. nome di un cliente o di un agente associato a un ordine).

---

## 4. FINALITÀ E BASI GIURIDICHE DEL TRATTAMENTO

| Finalità | Base giuridica | Dettaglio |
|---|---|---|
| Fornitura del Servizio (accesso e operatività) | **Art. 6.1.b GDPR** — Esecuzione del contratto | Il trattamento è necessario per consentire all'utente di accedere e utilizzare la piattaforma nell'ambito del rapporto lavorativo con Komet Italia |
| Sicurezza del sistema e prevenzione accessi non autorizzati | **Art. 6.1.f GDPR** — Legittimo interesse | Il Titolare ha un legittimo interesse a proteggere la piattaforma da accessi non autorizzati, attacchi informatici e usi illeciti. L'interesse del Titolare è bilanciato rispetto alla privacy degli utenti |
| Audit di sicurezza e conformità normativa | **Art. 6.1.c GDPR** — Obbligo legale | Conservazione audit log per obblighi NIS 2 (D.Lgs. 138/2024) e normative sulla sicurezza informatica |
| Conservazione dati commerciali e fiscali | **Art. 6.1.c GDPR** — Obbligo legale | D.P.R. 600/1973 art. 22 — conservazione decennale di documenti fiscali e commerciali |
| Risposta a richieste dell'autorità giudiziaria | **Art. 6.1.c GDPR** — Obbligo legale | Solo in presenza di ordini dell'autorità |

---

## 5. PERIODO DI CONSERVAZIONE

| Categoria di dati | Periodo di conservazione | Motivazione |
|---|---|---|
| Dati account utente (credenziali, profilo) | Per tutta la durata del rapporto di utilizzo della piattaforma + **1 anno** successivo alla cessazione | Gestione eventuali contestazioni post-contratto |
| Log di sicurezza (audit log — login, logout, azioni critiche) | **Conservazione indefinita** | Obblighi normativi NIS 2 (D.Lgs. 138/2024); disponibile per audit di sicurezza |
| Log applicativi tecnici (richieste HTTP, errori) | **90 giorni** con rotazione automatica | Necessari per diagnostica tecnica; minimizzati e privi di dati sensibili |
| Dati operativi (ordini, clienti, documenti commerciali) | **10 anni** dalla data del documento | D.P.R. 600/1973 art. 22 — conservazione obbligatoria documentazione fiscale e commerciale |
| Token di sessione JWT | **8 ore** (scadenza automatica) + tempo di revoca in Redis | Sicurezza sessioni; revocati immediatamente al logout |

*Nota*: i periodi di conservazione si applicano anche in caso di richiesta di cancellazione, quando la conservazione sia obbligatoria per legge. In tal caso, i dati sono conservati in forma minimizzata e non utilizzati per finalità diverse dall'adempimento dell'obbligo normativo.

---

## 6. DESTINATARI DEI DATI

I dati personali trattati nell'ambito della piattaforma possono essere comunicati o accessibili a:

**6.1 Persone interne al Titolare**: dipendenti e collaboratori del Titolare che hanno necessità di accedere ai dati per svolgere le proprie mansioni (es. responsabili IT, responsabili commerciali), nel rispetto del principio del privilegio minimo.

**6.2 Responsabile del trattamento (Formicola Francesco)**: come descritto al punto 2, per la gestione tecnica della piattaforma, nell'ambito del DPA Art. 28.

**6.3 Sub-responsabili del trattamento**: soggetti terzi che operano per conto del Responsabile tecnico nell'erogazione del Servizio:
- **Hetzner Online GmbH** (Germania): hosting del server e storage dei backup; i dati rimangono in Germania;
- **[Provider SMTP — DA COMPLETARE]**: per l'invio di eventuali notifiche tecniche al personale amministrativo (non ai clienti finali).

**6.4 Autorità pubbliche**: ove richiesto da obblighi di legge, ordini giudiziari o amministrativi.

I dati non vengono ceduti, venduti o comunicati a terzi per finalità di marketing o profilazione commerciale.

---

## 7. TRASFERIMENTI INTERNAZIONALI DI DATI

I dati personali trattati nell'ambito della piattaforma Archibald PWA **non vengono trasferiti fuori dall'Unione Europea**.

Tutta l'infrastruttura è localizzata in Germania (Hetzner, Falkenstein), territorio UE, con piena applicabilità del GDPR.

L'unica eccezione riguarda i **tracking numbers FedEx** (codici alfanumerici di spedizione): trattasi di dati non personali (non associati a persona fisica identificata) trasmessi all'API FedEx (USA) per il monitoraggio delle spedizioni. Questa comunicazione non riguarda i dati personali degli utenti della piattaforma.

---

## 8. DIRITTI DEGLI INTERESSATI

In qualità di interessato, hai il diritto di:

| Diritto | Descrizione | Come esercitarlo |
|---|---|---|
| **Accesso** (Art. 15) | Ottenere conferma del trattamento e copia dei tuoi dati personali | Richiesta scritta al Titolare |
| **Rettifica** (Art. 16) | Rettificare dati inesatti o incompleti | Richiesta scritta al Titolare o modifica diretta in piattaforma (ove consentita dal ruolo) |
| **Cancellazione** (Art. 17) | Richiedere la cancellazione dei tuoi dati, salvo obblighi di legge | Richiesta scritta al Titolare — vedi nota sui limiti al punto 8.1 |
| **Limitazione** (Art. 18) | Richiedere la limitazione del trattamento in determinati casi | Richiesta scritta al Titolare |
| **Portabilità** (Art. 20) | Ricevere i tuoi dati in formato strutturato e leggibile da macchina | Richiesta scritta al Titolare |
| **Opposizione** (Art. 21) | Opporti al trattamento basato su legittimo interesse | Richiesta scritta al Titolare con motivazione |
| **Revoca del consenso** | Non applicabile — il trattamento non si basa sul consenso ma su base contrattuale/legale | N/A |
| **Reclamo** | Presentare reclamo all'autorità di controllo | Garante per la protezione dei dati personali: **www.garanteprivacy.it** |

### 8.1 Limiti al diritto di cancellazione

Il diritto di cancellazione è soggetto a limitazioni nei seguenti casi:

- **Obblighi fiscali e contabili**: i dati relativi a ordini e documenti commerciali/fiscali devono essere conservati per **10 anni** ai sensi del D.P.R. 600/1973 art. 22, anche a seguito di richiesta di cancellazione. In tali casi, i dati sono anonimizzati nella misura possibile pur mantenendo gli obblighi normativi.
- **Audit log di sicurezza**: i log di sicurezza non possono essere cancellati per obblighi NIS 2.
- **Richieste dell'autorità giudiziaria**: i dati oggetto di sequestro o ordine dell'autorità non possono essere cancellati.

### 8.2 Come esercitare i diritti

Per esercitare qualsiasi diritto, invia una richiesta scritta a:

**Email**: [DA INSERIRE — email privacy]
**Oggetto**: "Esercizio diritti GDPR — [tuo nome e cognome]"

Il Titolare risponde entro **trenta (30) giorni** dalla ricezione della richiesta (prorogabili di ulteriori 60 giorni in casi complessi, con comunicazione motivata).

---

## 9. SICUREZZA DEI DATI

Il Responsabile del trattamento (Formicola Francesco) implementa misure tecniche e organizzative adeguate a garantire la sicurezza dei dati personali, tra cui:

- **Cifratura**: le password sono conservate in hash non reversibile (bcrypt); le credenziali ERP e i secret MFA sono cifrati con AES-256-GCM;
- **Comunicazioni sicure**: tutte le comunicazioni tra browser e server avvengono via HTTPS/TLS 1.3;
- **Controllo accessi**: RBAC con ruoli differenziati, MFA obbligatorio per ruoli privilegiati, whitelist utenti;
- **Monitoraggio**: audit log immutabile, alert automatici per anomalie di sicurezza;
- **Backup**: backup giornalieri cifrati, conservati in Germania.

Per ulteriori dettagli sulle misure di sicurezza, consulta l'**Allegato B — SLA e Allegato Sicurezza** disponibile su richiesta presso il Titolare.

---

## 10. DATA PROTECTION OFFICER (DPO)

**Nomina DPO**: [DA VERIFICARE — indicare se il Titolare ha nominato un DPO e i relativi dati di contatto, oppure specificare che la nomina non è obbligatoria per il Titolare in base alla propria attività]

In assenza di DPO nominato, il punto di contatto per le questioni di privacy è:

**Email**: [DA INSERIRE — email privacy Komet]

---

## 11. MODIFICHE ALL'INFORMATIVA

Il Titolare si riserva il diritto di aggiornare la presente Informativa in caso di:
- Modifiche alle finalità o alle modalità del trattamento;
- Modifiche normative che richiedano adeguamenti;
- Introduzione di nuovi servizi o tecnologie.

Le modifiche significative vengono comunicate agli utenti tramite:
- Notifica in piattaforma al successivo accesso;
- Email all'indirizzo registrato in piattaforma (ove disponibile).

La versione aggiornata è sempre disponibile nella piattaforma nella sezione dedicata alla privacy.

**Data ultima revisione**: [DA INSERIRE]
**Versione**: 1.0

---

## 12. RECLAMO ALL'AUTORITÀ DI CONTROLLO

Se ritieni che il trattamento dei tuoi dati personali violi il GDPR, hai il diritto di presentare reclamo all'autorità di controllo competente:

**Garante per la protezione dei dati personali (Italia)**
Piazza Venezia, 11 — 00187 Roma
Tel: +39 06.69677.1
Web: www.garanteprivacy.it
Email: garante@gpdp.it
PEC: protocollo@pec.gpdp.it

In alternativa, puoi rivolgerti all'autorità di controllo del paese di tua residenza abituale o del luogo in cui si è verificata la presunta violazione.

---

*Fine del documento — Informativa Privacy Utenti PWA v1.0*

*Documento preparato ai sensi degli Artt. 13 e 14 del Regolamento UE 2016/679 (GDPR). Aggiornamento previsto: annuale o in seguito a modifiche significative.*
