# Allegato B — Service Level Agreement e Allegato Sicurezza
## Archibald PWA — SLA e Misure Tecniche ex Art. 32 GDPR

**Versione**: 1.0
**Data**: [DA INSERIRE]
**Allegato al**: Master Service Agreement (MSA) Archibald PWA
**Classificazione**: Riservato — uso contrattuale

---

# PARTE I — SERVICE LEVEL AGREEMENT (SLA)

---

## 1. DEFINIZIONI SLA

**1.1 "Uptime"**: percentuale di tempo nel Periodo di Misurazione in cui il Servizio è disponibile e funzionante normalmente, calcolata come: `(Minuti totali nel periodo − Minuti di downtime) / Minuti totali nel periodo × 100`.

**1.2 "Downtime"**: periodo durante il quale il Servizio è completamente non disponibile (impossibilità di login o di eseguire operazioni core) per tutti gli Utenti Autorizzati, rilevato tramite monitoraggio proattivo con intervalli di **cinque (5) minuti**.

**1.3 "Periodo di Misurazione"**: il mese solare di calendario.

**1.4 "Manutenzione Programmata"**: attività di manutenzione, aggiornamento o upgrade annunciata con preavviso scritto di almeno **quarantotto (48) ore**, eseguita esclusivamente nelle **finestre di manutenzione** definite al punto 5.

**1.5 "Incidente Confermato"**: degrado o interruzione del Servizio verificato e documentato dal Fornitore mediante il sistema di monitoraggio o segnalato dal Cliente e confermato dalla diagnostica tecnica.

**1.6 "Tempo di Ripristino"** (RTO — Recovery Time Objective): il tempo massimo tra il rilevamento di un Incidente P1 critico e il pieno ripristino del Servizio, pari a **quattro (4) ore**.

**1.7 "Punto di Recupero"** (RPO — Recovery Point Objective): la massima perdita di dati accettabile in caso di disaster recovery, pari a **ventiquattro (24) ore** (corrispondente alla frequenza dei backup giornalieri).

---

## 2. OBIETTIVI DI UPTIME

| Indicatore | Valore |
|---|---|
| **Uptime target** (obiettivo) | 99,5% mensile |
| **Uptime garantito** (SLA minimo) | 99,0% mensile |
| **Downtime massimo tollerato al mese** (99,0%) | ≤ 7 ore e 18 minuti/mese |
| **Downtime massimo tollerato al mese** (99,5%) | ≤ 3 ore e 39 minuti/mese |

---

## 3. MISURAZIONE UPTIME E ESCLUSIONI

**3.1 Metodo di misurazione**: Il Fornitore monitora la disponibilità del Servizio mediante probe automatici ogni **cinque (5) minuti**, verificando la raggiungibilità dell'endpoint principale e la disponibilità delle funzionalità core (autenticazione, caricamento ordini). I risultati sono conservati per almeno **dodici (12) mesi**.

**3.2 Esclusioni dal calcolo del downtime**: Il downtime per i seguenti eventi **non è conteggiato** nel calcolo dell'uptime ai fini delle penali:

- **(a) Manutenzione Programmata**: attività annunciate con preavviso ≥ 48 ore, nelle finestre definite al punto 5, per massimo **quattro (4) ore al mese**;
- **(b) Forza Maggiore**: calamità naturali, guerre, attacchi informatici di portata straordinaria (DDoS distribuiti), pandemie;
- **(c) Outage Hetzner**: interruzioni dell'infrastruttura Hetzner certificate dal provider (comunicato ufficiale Hetzner Status), che esulino dal controllo del Fornitore;
- **(d) Problemi di connettività del Cliente**: interruzioni lato rete internet del Cliente o degli Utenti Autorizzati;
- **(e) Azioni del Cliente**: errori, configurazioni errate o abuso del Servizio imputabili al Cliente o agli Utenti Autorizzati;
- **(f) Fattori terzi**: malfunzionamenti del sistema ERP del Cliente che impattino il Servizio.

**3.3 Contestazione**: Il Cliente può contestare per iscritto la misurazione entro **quindici (15) giorni** dalla ricezione del report mensile. Le contestazioni vengono esaminate entro **dieci (10) giorni lavorativi**.

---

## 4. CLASSIFICAZIONE E TEMPI DI RISPOSTA AGLI INCIDENTI

### 4.1 Classificazione degli Incidenti

| Livello | Descrizione | Esempi |
|---|---|---|
| **P1 — Critico** | Il Servizio è completamente non disponibile per tutti gli utenti, oppure si è verificata una Violazione dei Dati Personali confermata o altamente probabile | Impossibilità di accesso alla piattaforma, database offline, accesso non autorizzato confermato, compromissione credenziali, ransomware |
| **P2 — Alto** | Il Servizio è gravemente degradato o non disponibile per un sottoinsieme significativo di utenti; funzionalità core impattate | Lentezza estrema, impossibilità di piazzare ordini, errori sistematici nelle sincronizzazioni, backup fallito per 24h consecutive |
| **P3 — Medio** | Degrado non critico, funzionalità secondarie impattate, anomalie non confermate | Notifiche ritardate, report non aggiornati, alert di sistema singoli |

### 4.2 Tempi di Risposta Garantiti

| Livello | Tempo di prima risposta | Aggiornamento di stato | RTO |
|---|---|---|---|
| **P1 — Critico** | ≤ **1 ora** dal rilevamento | Ogni **1 ora** fino a risoluzione | ≤ **4 ore** |
| **P2 — Alto** | ≤ **4 ore** (ore lavorative) | Ogni **4 ore** fino a risoluzione | ≤ **8 ore** lavorative |
| **P3 — Medio** | ≤ **24 ore** (giorni lavorativi) | Al momento della risoluzione | Best effort |

*Ore lavorative: lunedì–venerdì 09:00–18:00 CET, esclusi festivi nazionali italiani.*
*Per P1: reperibilità 7 giorni su 7, 24h su 24.*

### 4.3 Canale di Segnalazione Incidenti

| Canale | Utilizzo |
|---|---|
| Email prioritaria: [DA INSERIRE] | P1, P2 — risposta garantita entro i tempi SLA |
| Email standard: [DA INSERIRE] | P3 e richieste generali |
| Telefono/WhatsApp: [DA INSERIRE] | Solo P1 critico, in aggiunta all'email |

---

## 5. MANUTENZIONE PROGRAMMATA

**5.1 Finestre di manutenzione**: Gli interventi di manutenzione programmata vengono eseguiti preferibilmente nelle seguenti finestre orarie:
- **02:00 – 06:00 UTC** (04:00 – 08:00 CET / 03:00 – 07:00 CEST)
- Qualsiasi giorno della settimana, preferibilmente nei fine settimana

**5.2 Preavviso**: Il Fornitore comunica per iscritto la manutenzione programmata con preavviso di almeno **quarantotto (48) ore**, specificando: data, orario di inizio e fine previsti, impatto atteso sul Servizio, motivazione.

**5.3 Durata massima**: La manutenzione programmata non supera **quattro (4) ore per mese solare**. Interventi di maggiore durata richiedono accordo scritto preventivo del Cliente.

**5.4 Emergenze**: In caso di patch di sicurezza critica che richieda intervento immediato senza il preavviso standard, il Fornitore notifica il Cliente contestualmente all'inizio dell'intervento, minimizzando la durata e ripristinando il Servizio nel minor tempo possibile.

---

## 6. PENALI SLA

**6.1 Calcolo penali**: In caso di uptime mensile inferiore al **99,0% garantito** (escluse le esclusioni di cui al punto 3.2), si applicano le seguenti penali sul canone mensile:

| Uptime mensile | Penale sul canone mensile |
|---|---|
| 98,5% – 99,0% (escluso) | − 5% |
| 98,0% – 98,5% (escluso) | − 10% |
| 97,5% – 98,0% (escluso) | − 15% |
| Inferiore al 97,5% | − 20% (massimo) |

**6.2 Tetto massimo**: Le penali SLA non possono eccedere il **20% del canone mensile** nel singolo Periodo di Misurazione.

**6.3 Modalità di applicazione**: Le penali sono applicate come **nota di credito** sulla fattura del mese successivo a quello in cui si è verificato il mancato rispetto degli SLA, previa verifica e conferma dei dati di monitoraggio.

**6.4 Procedura di richiesta**: Il Cliente richiede le penali per iscritto entro **trenta (30) giorni** dalla fine del Periodo di Misurazione, allegando documentazione dei downtime riscontrati. Il Fornitore verifica e risponde entro **quindici (15) giorni lavorativi**.

**6.5 Rimedio esclusivo**: Le penali SLA costituiscono il rimedio contrattuale esclusivo e limitato del Cliente per il mancato rispetto degli obiettivi di uptime, salvo dolo o colpa grave del Fornitore.

---

## 7. REPORT MENSILE

**7.1** Il Fornitore invia al Cliente, entro il **quinto giorno lavorativo** di ogni mese, un report mensile contenente:
- Uptime effettivo del mese precedente;
- Elenco degli Incidenti Confermati con data, durata, classificazione e risoluzione adottata;
- Eventuale penale SLA maturata;
- Stato dei backup (successi/fallimenti);
- Eventuali aggiornamenti di sicurezza applicati.

---

# PARTE II — ALLEGATO SICUREZZA
## Misure Tecniche e Organizzative ex Art. 32 GDPR

---

## 8. CONTROLLO DEGLI ACCESSI E AUTENTICAZIONE

### 8.1 Autenticazione

| Misura | Stato | Dettaglio |
|---|---|---|
| Autenticazione JWT | Attivo | Token con TTL 8 ore, refresh automatico |
| JWT ID univoco (jti) + revocation list Redis | Attivo | Logout invalida immediatamente il token; i token revocati sono tenuti in Redis fino alla loro scadenza naturale |
| Rate limiting accesso | Attivo | 5 tentativi / 15 minuti per IP; blocco automatico |
| Rate limiting refresh token | Attivo | 20 refresh / ora per IP |
| MFA (TOTP) | Attivo per admin/ufficio | Google Authenticator compatibile; obbligatorio per ruoli admin e ufficio; recovery codes con hash bcrypt |
| Whitelist utenti | Attivo | Solo utenti esplicitamente abilitati dall'admin possono accedere; nessuna registrazione self-service |

### 8.2 Controllo degli Accessi (RBAC)

**Ruoli disponibili e relativi accessi**:

| Ruolo | Perimetro di accesso |
|---|---|
| **agent** | Solo propri clienti, propri ordini, proprie statistiche |
| **ufficio** | Accesso read/write a tutti gli ordini; gestione clienti; report completi |
| **concessionario** | Accesso dedicato al modulo Fresis (anagrafica + storico specifico) |
| **admin** | Accesso completo incluso gestione utenti, whitelist, audit log, GDPR erase |

**Principio del privilegio minimo**: ciascun utente è configurato con il ruolo minimo necessario allo svolgimento delle proprie mansioni.

### 8.3 Gestione credenziali ERP

| Misura | Dettaglio |
|---|---|
| Password ERP cifrate | AES-256-GCM, chiavi in variabili d'ambiente; non accessibili da frontend |
| TTL cache password ERP | 4 ore; le credenziali vengono cancellate dalla memoria ogni 4 ore |
| Accesso alle password | Solo il processo backend; mai esposte in log o risposte API |

---

## 9. CRITTOGRAFIA E PROTEZIONE DATI IN TRANSITO E A RIPOSO

| Dato | Metodo | Chiavi |
|---|---|---|
| Password ERP agenti | AES-256-GCM | Env var `ENCRYPTION_KEY` (256 bit) sul VPS |
| Secret TOTP MFA | AES-256-GCM | Stesso schema ERP |
| Recovery codes MFA | bcrypt (hash non reversibile) | N/A |
| Password utenti piattaforma | bcrypt (costo factor adeguato) | N/A |
| Dati in transito (browser ↔ server) | TLS 1.3 | Let's Encrypt, rinnovo automatico |
| Dati in transito (server → Hetzner Object Storage) | HTTPS/TLS | Hetzner SDK |
| Backup PostgreSQL | Cifratura a livello di Object Storage | Hetzner Object Storage encryption at rest |

**Configurazione TLS**:
- Versione minima: TLS 1.2 (raccomandata TLS 1.3)
- Cipher suite: configurazione moderna (no RC4, no DES, no 3DES, no NULL)
- HSTS abilitato via Nginx (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
- OCSP Stapling: abilitato

---

## 10. INTESTAZIONI DI SICUREZZA HTTP E PROTEZIONE APPLICATIVA

| Intestazione / Misura | Configurazione |
|---|---|
| Content Security Policy (CSP) | `default-src 'self'`; script senza inline; no frame embedding |
| CORS whitelist | Solo origini esplicite autorizzate; no `*` |
| Rate limiting Nginx | Protezione DoS a livello infrastrutturale |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |

---

## 11. AUDIT LOG E MONITORAGGIO

### 11.1 Audit Log Immutabile

**Implementazione**: tabella PostgreSQL `system.audit_log` con `REVOKE UPDATE` e `REVOKE DELETE` per l'utente applicativo — i record non possono essere modificati o cancellati dal processo backend.

**Eventi tracciati**:

| Categoria | Esempi di eventi |
|---|---|
| Autenticazione | Login riuscito, login fallito, logout, refresh token |
| MFA | Attivazione MFA, verifica TOTP riuscita/fallita, uso recovery code |
| Gestione utenti | Creazione utente, modifica ruolo, modifica whitelist |
| GDPR | `gdpr-erase` (anonimizzazione cliente), visualizzazione audit log |
| Operazioni critiche | Impersonation admin, export dati massivo |
| Sicurezza | Rate limit colpito, pattern anomali |

**Conservazione**: **Indefinita** per audit log (obblighi normativi NIS 2, D.Lgs. 138/2024).

### 11.2 Log Applicativi

**Tipo**: log strutturati (JSON) dei processi backend, persistiti in `/app/logs` sul VPS.
**Conservazione**: **90 giorni** con rotazione automatica.
**Contenuto**: richieste HTTP (URL, metodo, status code, tempo risposta), errori applicativi, job queue events.
**Dati personali nei log**: minimizzati — nessun dato sensibile (password, token) loggato in chiaro.

### 11.3 Security Alerts Automatici

Il sistema invia alert email a `SECURITY_ALERT_EMAIL` per:
- Circuit breaker scattato su qualsiasi agente ERP
- 1+ login falliti su account admin/ufficio
- 5+ login falliti consecutivi su account agent
- Backup PostgreSQL fallito
- Rate limit colpito su account admin
- Più di 10 errori HTTP 500 in 5 minuti

---

## 12. BACKUP E CONTINUITÀ OPERATIVA

### 12.1 Politica di Backup

| Parametro | Valore |
|---|---|
| Frequenza backup | Giornaliera (cron notturno, 01:00 UTC) |
| Tipo backup | PostgreSQL full dump (`pg_dump`) + compressione |
| Destinazione | Hetzner Object Storage, Falkenstein, Germania 🇩🇪 |
| Retention | 30 backup; rotazione automatica (il 31° sostituisce il più vecchio) |
| Cifratura backup | At-rest su Hetzner Object Storage |
| Verifica backup | Controllo di integrità automatico post-upload |

### 12.2 Obiettivi di Continuità

| Metrica | Valore garantito |
|---|---|
| RPO (Recovery Point Objective) | ≤ 24 ore (al massimo 1 giorno di dati persi) |
| RTO (Recovery Time Objective) | ≤ 4 ore dal dichiarazione di disaster |
| Test di restore | Almeno una volta all'anno su ambiente di staging |

### 12.3 Procedura di Disaster Recovery

In caso di perdita totale del VPS:
1. Provisioning nuovo VPS Hetzner (≤ 1 ora)
2. Ripristino da backup PostgreSQL più recente (≤ 1 ora)
3. Ripristino configurazione applicativa (env vars, Docker) (≤ 1 ora)
4. Verifica funzionamento e comunicazione al Cliente (≤ 30 minuti)

---

## 13. GESTIONE DELLE VULNERABILITÀ E SVILUPPO SICURO

### 13.1 Dipendenze e Supply Chain

| Attività | Frequenza | Dettaglio |
|---|---|---|
| `npm audit` automatico | Ad ogni commit (CI/CD) | Blocco deploy se vulnerabilità critiche non risolte |
| Patch vulnerabilità critiche | Entro **24 ore** dalla scoperta | CVE con score CVSS ≥ 9.0 |
| Patch vulnerabilità alte | Entro **7 giorni lavorativi** | CVE con score CVSS 7.0–8.9 |
| Patch vulnerabilità medie/basse | Con il prossimo ciclo di release | CVE con score CVSS < 7.0 |

### 13.2 Pratiche di Sviluppo Sicuro

| Pratica | Dettaglio |
|---|---|
| Test-Driven Development (TDD) | Ogni funzionalità è accompagnata da test automatici prima dell'implementazione |
| TypeScript strict mode | Strict type checking abilitato; riduce classi di errori runtime |
| Code review | Ogni modifica significativa è soggetta a revisione prima del deploy |
| Separazione ambienti | Sviluppo, staging e produzione separati; dati reali mai in sviluppo |
| Principio del privilegio minimo | L'utente DB applicativo ha solo i permessi strettamente necessari |
| Validazione input | Tutti gli input esterni sono validati e sanificati prima del processing |
| Parameterized queries | Tutte le query SQL usano parametri; nessuna concatenazione stringa SQL |

### 13.3 Penetration Testing e Review

| Attività | Frequenza | Stato |
|---|---|---|
| Penetration test esterno | Annuale | Da pianificare entro [DA INSERIRE] |
| Review accessi e permessi | Semestrale | Da pianificare |
| Security code review interna | Ad ogni feature significativa | Attivo |
| Revisione configurazione TLS | Annuale | Attivo |

---

## 14. INCIDENT RESPONSE

### 14.1 Procedura Formale

Il Fornitore adotta la procedura di incident response documentata in `docs/compliance/incident-response-procedure.md`, riassunta qui per riferimento:

**Incidente P1 (critico — dati personali potenzialmente coinvolti)**:
1. Entro **1 ora**: valutazione, isolamento se necessario, raccolta evidenze (NO cancellazione)
2. Entro **4 ore**: notifica al Cliente (Komet Italia)
3. Entro **24 ore**: early warning ACN/CSIRT se applicabile NIS 2
4. Entro **72 ore**: notifica al Garante Privacy (se dati personali confermati — Art. 33 GDPR)
5. Entro **7 giorni**: post-incident report completo

**Incidente P2 (alto)**:
1. Entro **24 ore**: notifica al Cliente
2. Valutazione escalation a P1
3. Documentazione

**Incidente P3 (medio)**:
1. Documentazione interna
2. Comunicazione al Cliente nel report mensile

### 14.2 Contatti di Emergenza

| Ruolo | Contatto |
|---|---|
| Referente tecnico (Fornitore) | [DA INSERIRE — email + telefono] |
| Referente sicurezza Komet | [DA INSERIRE al momento della firma] |
| ACN CSIRT Italia | incidenti@csirt.gov.it |
| Garante Privacy | https://www.garanteprivacy.it/web/guest/notifica-data-breach |

---

## 15. LOCALIZZAZIONE E SEGREGAZIONE DEI DATI

**15.1 Localizzazione**: Tutti i Dati del Cliente sono trattati e conservati **esclusivamente in territorio tedesco** (Hetzner, Falkenstein, Germania), all'interno dell'Unione Europea.

**15.2 Segregazione**: I dati del Cliente sono logicamente separati da eventuali dati di altri clienti del Fornitore mediante schema PostgreSQL dedicato e namespace applicativo isolato.

**15.3 Nessun trasferimento extra-UE**: Nessun dato personale del Cliente viene trasmesso fuori dall'UE nell'ambito del Servizio standard, a eccezione dei soli tracking numbers FedEx (codici anonimi non personali).

---

## 16. REVISIONE E AGGIORNAMENTO

**16.1** Il presente Allegato Sicurezza è soggetto a revisione annuale o in seguito a modifiche significative dell'architettura, della normativa applicabile o del profilo di rischio del trattamento.

**16.2** Il Fornitore notifica al Cliente le modifiche significative alle misure di sicurezza con preavviso di **trenta (30) giorni** dalla loro implementazione.

---

*Fine del documento — Allegato B SLA e Sicurezza v1.0*
