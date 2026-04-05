# Archibald PWA — Security & Compliance Overview

**Documento**: Security & Compliance Overview v1.0
**Autore**: Formicola Francesco | P.IVA [inserire]
**Data**: Aprile 2026
**Preparato per**: Komet Italia S.r.l. / Gebr. Brasseler GmbH & Co. KG
**Classificazione**: Riservato — uso contrattuale

---

## 1. Executive Summary

Archibald è una piattaforma SaaS B2B per la gestione degli ordini e della rete agenti Komet, erogata come servizio hosted su infrastruttura europea (Hetzner, Germania). Formicola Francesco opera in qualità di **data processor** ai sensi del GDPR Art. 28, con responsabilità diretta su tutte le misure tecniche e organizzative di sicurezza.

Il sistema è progettato e configurato in conformità con:
- **GDPR (Reg. EU 2016/679)** — protezione dati personali e obblighi data processor
- **NIS 2 (Dir. EU 2022/2555 / D.Lgs. 138/2024)** — sicurezza reti e sistemi informativi
- **D.Lgs. 196/2003** — Codice Privacy italiano
- **D.P.R. 600/1973 art. 22** — conservazione dati commerciali e fiscali (10 anni)

---

## 2. Architettura e localizzazione dei dati

### Infrastruttura

| Componente | Tecnologia | Localizzazione |
|---|---|---|
| VPS hosting | Hetzner CPX32 (4 vCPU, 8 GB RAM) | Falkenstein, Germania 🇩🇪 |
| Database | PostgreSQL 16 (Docker) | VPS Hetzner |
| Job queue | Redis 7 + BullMQ | VPS Hetzner |
| Backup | Hetzner Object Storage | Germania 🇩🇪 |
| Frontend | React 19 PWA su Nginx | VPS Hetzner |
| Backend | Node.js 20 + Express | VPS Hetzner |

**Nessun dato transita fuori dall'Unione Europea** eccetto tracking numbers FedEx (dato non personale, solo codici alfanumerici di spedizione).

---

## 3. Misure di sicurezza tecniche implementate

### 3.1 Autenticazione e controllo accessi

| Misura | Stato | Dettaglio |
|---|---|---|
| Autenticazione JWT con scadenza | ✅ Attivo | Token con TTL 8h, refresh automatico |
| JWT ID univoco (jti) + revocation list Redis | ✅ Attivo | Logout invalida immediatamente il token |
| Rate limiting login | ✅ Attivo | 5 tentativi / 15 min per IP |
| Rate limiting refresh | ✅ Attivo | 20 refresh / ora per IP |
| MFA (TOTP) per ruoli admin/ufficio | ✅ Implementato | Google Authenticator compatibile, recovery codes |
| RBAC — 4 ruoli (agent, ufficio, concessionario, admin) | ✅ Attivo | Permessi per modulo configurabili per utente |
| Whitelist utenti | ✅ Attivo | Solo utenti esplicitamente abilitati possono accedere |
| Password cache ERP TTL | ✅ Ridotto a 4h | Le credenziali ERP vengono cancellate dalla memoria ogni 4 ore |

### 3.2 Protezione delle comunicazioni

| Misura | Stato | Dettaglio |
|---|---|---|
| HTTPS/TLS 1.3 | ✅ Attivo | Let's Encrypt, rinnovo automatico |
| HSTS | ✅ Attivo | via Nginx |
| Content Security Policy (CSP) | ✅ Attivo | default-src 'self', script senza inline, no frame |
| CORS whitelist | ✅ Attivo | Solo origini esplicite autorizzate |
| Rate limiting Nginx | ✅ Attivo | Protezione DoS layer infrastrutturale |

### 3.3 Protezione dati

| Misura | Stato | Dettaglio |
|---|---|---|
| Encryption at rest — password ERP | ✅ Attivo | AES-256-GCM, chiavi in env var |
| Encryption at rest — secret MFA | ✅ Attivo | AES-256-GCM, stesso schema ERP |
| Encryption at rest — recovery codes | ✅ Attivo | bcrypt hash |
| Redis password authentication | ✅ Attivo | Accesso Redis protetto da password |
| Backup PostgreSQL cifrato | ✅ Implementato | Upload a Hetzner Object Storage, cron giornaliero |
| Backup retention | ✅ Implementato | Ultimi 30 backup conservati, rotazione automatica |

### 3.4 Audit e monitoraggio

| Misura | Stato | Dettaglio |
|---|---|---|
| Audit log immutabile | ✅ Attivo | Tabella PostgreSQL con REVOKE UPDATE/DELETE, conservazione indefinita |
| Audit eventi tracciati | ✅ Attivo | Login/logout, MFA, GDPR erase, impersonation, ruoli, whitelist |
| Alert sicurezza automatici | ✅ Implementato | Email su: circuit breaker, login falliti admin, backup falliti, rate limit |
| Log applicativi strutturati | ✅ Attivo | Persistiti in /app/logs sul VPS |

---

## 4. Conformità GDPR

### 4.1 Ruolo e basi giuridiche

- **Ruolo di Formicola Francesco**: Data Processor ai sensi del GDPR Art. 28
- **Data Controller**: Komet Italia S.r.l.
- **Dati trattati**: Anagrafica agenti, anagrafica clienti (nome, indirizzo, email, telefono, P.IVA/CF), storico ordini
- **Base giuridica del trattamento**: Esecuzione contratto (Art. 6.1.b) + Obblighi legali (Art. 6.1.c, D.P.R. 600/1973)

### 4.2 Diritti degli interessati

| Diritto | Supporto tecnico |
|---|---|
| Diritto di accesso (Art. 15) | Audit log consultabile da admin; dati cliente visualizzabili |
| Diritto di cancellazione (Art. 17) | Endpoint `POST /api/admin/customers/:id/gdpr-erase` — anonimizza i dati PII |
| Eccezione obbligo fiscale | I dati relativi a fatturazione e ordini vengono conservati 10 anni (D.P.R. 600/1973 art. 22) anche dopo erase |

### 4.3 Sub-processor

Vedi `docs/compliance/sub-processors.md` per il registro completo.

### 4.4 Data retention

- **Clienti inattivi**: `last_activity_at` tracciata per ogni cliente; policy di revisione annuale da implementare
- **Audit log**: conservazione indefinita (obblighi normativi NIS 2)
- **Log applicativi**: conservazione 90 giorni (implementazione manuale raccomandata via cron)

---

## 5. Conformità NIS 2

### 5.1 Misure di gestione del rischio (Art. 21)

| Requisito NIS 2 | Misura implementata |
|---|---|
| Politiche di sicurezza e gestione del rischio | Questo documento + incident-response-procedure.md |
| Gestione degli incidenti | Procedura formale in `docs/compliance/incident-response-procedure.md` |
| Business continuity | Backup giornalieri + procedura di restore documentata |
| Sicurezza della supply chain ICT | Sub-processor register + DPA con Hetzner |
| Sicurezza nell'acquisizione e sviluppo | TDD, security audit CI/CD (npm audit), code review |
| Politiche sull'uso della crittografia | AES-256-GCM per dati sensibili, TLS 1.3 in transito |
| Gestione accessi e autenticazione | RBAC + MFA + JWT revocation + whitelist |
| Sicurezza delle risorse umane | Accesso limitato a whitelist esplicita; credenziali ERP criptate |

### 5.2 Obblighi di notifica (Art. 23)

Soglia: incidenti significativi (impatto rilevante su continuità del servizio o confidenzialità dei dati).

- **Preavviso entro 24 ore**: segnalazione iniziale ad ACN/CSIRT
- **Notifica entro 72 ore**: notifica completa ad ACN
- **Relazione finale entro 1 mese**: analisi completa dell'incidente

Per la procedura dettagliata: `docs/compliance/incident-response-procedure.md`

---

## 6. Penetration testing e vulnerability management

| Attività | Frequenza raccomandata | Stato attuale |
|---|---|---|
| npm audit (dipendenze) | Ad ogni commit (CI) | ✅ Automatizzato |
| Review codice sicurezza | Ad ogni feature significativa | ✅ Processo in atto |
| Penetration test esterno | Annuale | ⏳ Da pianificare |
| Review accessi e permessi | Semestrale | ⏳ Da pianificare |

---

## 7. Contatti e responsabilità

| Ruolo | Nominativo | Responsabilità |
|---|---|---|
| Titolare del trattamento (Controller) | Komet Italia S.r.l. | Definisce finalità e mezzi del trattamento |
| Responsabile del trattamento (Processor) | Formicola Francesco | Gestione tecnica e sicurezza del sistema |
| Referente tecnico | Formicola Francesco | Incident response, aggiornamenti sicurezza |

---

*Documento soggetto a revisione annuale o in seguito a modifiche significative dell'architettura o della normativa applicabile.*
