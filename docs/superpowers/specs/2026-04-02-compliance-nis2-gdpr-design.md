# Archibald PWA — Compliance NIS 2 + GDPR: Design Spec

**Data**: 2026-04-02  
**Autore**: Formicola Francesco  
**Deadline**: 2026-04-14 (meeting Komet Germania + Italia)  
**Obiettivo**: portare la PWA Archibald a piena conformità GDPR e NIS 2 entro il 14 aprile, in vista della formalizzazione del contratto SaaS con Komet Italia S.r.l.

---

## Contesto

### Modello di business
- **Francesco Formicola** (P.IVA personale): SaaS provider, proprietario della PWA Archibald
- **Komet Italia S.r.l.** (24 dip., ~7.8M€ fatturato, Milano): cliente SaaS, data controller
- **Gebr. Brasseler GmbH & Co. KG / Komet Deutschland** (~1.500 dip., Lemgo): capogruppo, entità essenziale NIS 2 (settore dispositivi medici dentali, Allegato I Dir. 2022/2555)
- **Fresis** e altri dealer: sub-clienti Komet che usano la piattaforma

### Modello SaaS
Hosted su VPS Hetzner (Lemgo, Germania 🇩🇪). Francesco è **data processor** ai sensi di GDPR Art. 28. Tutti i dati dei clienti Komet risiedono sul VPS di Francesco.

### Normative applicabili
- **GDPR (Reg. EU 2016/679)**: Francesco come data processor per Komet (data controller)
- **NIS 2 (Dir. EU 2022/2555 / D.Lgs. 138/2024)**: Komet Deutschland è entità essenziale → impone requisiti supply chain ICT a Francesco per via contrattuale (Art. 21.2.d)
- **D.Lgs. 196/2003**: Codice Privacy italiano (complementare a GDPR)
- **D.P.R. 600/1973, art. 22**: obbligo conservazione dati commerciali/fiscali 10 anni

### Dati trattati dalla PWA
- Anagrafiche clienti Komet (dentisti/studi dentali): nome, P.IVA, indirizzo, email, telefono
- Ordini, prezzi, sconti
- Credenziali ERP degli agenti (cifrate AES-256-GCM)
- Sessioni utente, audit trail

---

## Approccio: Full Sprint Tecnico (12 giorni)

Implementazione completa in ordine di dipendenza, con documento compliance in parallelo.  
Buffer di 2 giorni (giorni 11-12) per fix, testing e deploy in produzione.

---

## Sezione 1 — Quick wins tecnici (Giorni 1-2)

### 1.1 Backup automatico PostgreSQL

**Obiettivo**: business continuity (NIS 2 Art. 21.2.c), disponibilità dati (GDPR Art. 32)

**Implementazione**:
- Nuovo container Docker `backup` in `docker-compose.yml` (Alpine + postgresql-client)
- Script `backup/backup.sh`: esegue `pg_dump`, comprime con gzip, nomina con timestamp `archibald_backup_YYYYMMDD_HHMMSS.sql.gz`
- Upload su **Hetzner Object Storage** (EU, stesso DPA del VPS) via `s3cmd` o `rclone`
- Cronjob: ogni notte alle 02:00 UTC
- Retention: ultimi 30 file (30 giorni di storia)
- Se backup fallisce: `sendSecurityAlert('backup_failed', details)` (vedi 1.2)

**File da creare/modificare**:
- `backup/Dockerfile`
- `backup/backup.sh`
- `docker-compose.yml` (nuovo service `backup`)
- `.env.production` (credenziali Hetzner Object Storage)

### 1.2 Alerting email per eventi critici di sicurezza

**Obiettivo**: rilevamento incidenti (NIS 2 Art. 21.2.b), prerequisito per rispettare i 72h GDPR

**Nuovo service**: `src/services/security-alert-service.ts`
- Funzione `sendSecurityAlert(event: SecurityAlertEvent, details: Record<string, unknown>): Promise<void>`
- Usa `nodemailer` (già in dipendenze)
- Destinatario: `SECURITY_ALERT_EMAIL` da env (Francesco)
- Non blocca mai: try/catch con swallow degli errori (un alert fallito non deve bloccare l'operazione)

**Eventi alertati**:

| Evento | Trigger | Soglia per ruolo |
|---|---|---|
| `login_failed_admin` | Login fallito su account admin/ufficio | 1 tentativo → alert immediato |
| `login_failed_agent` | Login fallito su account agent/concessionario | 5 tentativi in 10 min → alert |
| `circuit_breaker_triggered` | Circuit breaker scatta su qualsiasi agente | Immediato |
| `backup_failed` | pg_dump o upload fallisce | Immediato |
| `rate_limit_triggered_admin` | Rate limit colpito su account admin/ufficio | Immediato |
| `high_error_rate` | >10 errori HTTP 500 in 5 minuti | Immediato |

**Integrazioni** (modifiche a file esistenti):
- `src/sync/circuit-breaker.ts`: chiama `sendSecurityAlert` quando circuit breaker scatta
- `src/middleware/auth.ts`: chiama `sendSecurityAlert` su login falliti ripetuti (role-aware)
- `src/server.ts`: error handler globale conta errori 500, chiama alert se soglia superata

### 1.3 CSP e CORS corretti

**Obiettivo**: protezione XSS e cross-origin (NIS 2 Art. 21.2.e)

**CSP**: riabilitare `contentSecurityPolicy` in Helmet (`src/server.ts`, oggi `false`)
- Policy: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (necessario per inline styles esistenti), `img-src 'self' data:`, `connect-src 'self' wss:`
- Testare che non rompa il frontend prima del deploy

**CORS**: whitelist esplicita invece di wildcard
- Nuova env var `CORS_ORIGINS` (lista domini separati da virgola)
- `src/server.ts`: `cors({ origin: process.env.CORS_ORIGINS?.split(',') ?? [] })`

**File modificati**: `src/server.ts`, `.env.production`

### 1.4 Rate limiting applicativo su auth

**Obiettivo**: seconda linea di difesa dopo Nginx (NIS 2 Art. 21.2.i)

**Libreria**: `express-rate-limit` (aggiungere a `package.json`)

**Limiti**:
- `POST /api/auth/login`: 5 tentativi / 15 min per IP
- `POST /api/auth/refresh`: 20 tentativi / ora per IP
- Risposta: `429 Too Many Requests` con header `Retry-After`

**File modificati**: `src/routes/auth.ts`, `package.json`

### 1.5 npm audit in CI

**Obiettivo**: supply chain security (NIS 2 Art. 21.2.d)

**GitHub Actions**: aggiungere step a workflow CI esistente
- `npm audit --audit-level=high` su backend
- `npm audit --audit-level=high` su frontend
- Pipeline si blocca su vulnerabilità `high` o `critical`

**File modificato**: `.github/workflows/` (workflow CI esistente)

### 1.6 mailto: link su email clienti (UX)

**Obiettivo**: permettere agli utenti di aprire l'app email del proprio dispositivo direttamente dalla scheda cliente, senza configurazioni server.

**Implementazione**: sostituire il testo email statico con `<a href="mailto:email@example.com">` ovunque compaia un indirizzo email nella PWA (scheda cliente, CustomerProfilePage, form ordine). Il browser/PWA delega all'OS che apre l'app email predefinita del dispositivo (Gmail, Apple Mail, Outlook, ecc.).

**File toccati**: componenti frontend dove appare l'email cliente (CustomerProfilePage e affini).  
**Stima**: ~30 minuti.

---

## Sezione 2 — Audit log immutabile (Giorni 3-4)

**Obiettivo**: tracciabilità accessi e modifiche (GDPR Art. 5.2 accountability, NIS 2 Art. 21)

### 2.1 Schema DB: `system.audit_log`

**Migration**: `045-audit-log.sql`

```sql
CREATE TABLE system.audit_log (
  id            BIGSERIAL PRIMARY KEY,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id      TEXT,
  actor_role    TEXT,        -- 'admin' | 'agent' | 'ufficio' | 'concessionario' | 'system'
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  ip_address    INET,
  user_agent    TEXT,
  metadata      JSONB
);

CREATE INDEX idx_audit_log_occurred_at ON system.audit_log (occurred_at DESC);
CREATE INDEX idx_audit_log_actor_id ON system.audit_log (actor_id);
CREATE INDEX idx_audit_log_action ON system.audit_log (action);

-- Immutabilità: il DB user dell'app non può mai modificare o cancellare log
REVOKE UPDATE, DELETE ON system.audit_log FROM archibald;
```

**Retention**: job mensile (BullMQ `shared-sync`) cancella record con `occurred_at < NOW() - INTERVAL '2 years'`  
*(Solo per audit log. I dati commerciali hanno retention 10 anni — vedi Sezione 4.)*

### 2.2 Evento completo loggato

| Categoria | Azione (`action`) |
|---|---|
| **Auth** | `auth.login_success`, `auth.login_failed`, `auth.logout`, `auth.token_refresh`, `auth.rate_limit_triggered` |
| **MFA** | `mfa.enrollment_completed`, `mfa.verify_success`, `mfa.verify_failed`, `mfa.recovery_code_used`, `user.mfa_disabled` |
| **Utenti** | `user.whitelist_added`, `user.whitelist_removed`, `user.role_changed`, `user.modules_changed` |
| **Clienti** | `customer.created`, `customer.updated`, `customer.erased` |
| **Ordini** | `order.created`, `order.sent_to_verona`, `order.deleted` |
| **Admin** | `admin.impersonation_start`, `admin.impersonation_end` |
| **Sistema** | `system.circuit_breaker_triggered`, `system.backup_completed`, `system.backup_failed` |

### 2.3 Funzione di audit

**Nuovo repository**: `src/db/repositories/audit-log.ts`

```ts
type AuditEvent = {
  actorId?: string
  actorRole?: string
  action: string
  targetType?: string
  targetId?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

export async function audit(pool: DbPool, event: AuditEvent): Promise<void>
```

**Regole d'uso**:
- Chiamata esplicita nei punti chiave — non middleware generico
- Sempre wrappata in try/catch: un log fallito non deve mai bloccare l'operazione principale
- Non blocca la request: `await audit(...)` ma con swallow degli errori

### 2.4 Route di consultazione (admin only)

`GET /api/admin/audit-log` con query params: `actorId`, `action`, `targetType`, `targetId`, `from`, `to`  
Paginata: 50 per pagina, `?page=N`  
Solo ruolo `admin`.

---

## Sezione 3 — Sistema ruoli + MFA (Giorni 5-6)

### 3.0 Modello ruoli e whitelist per moduli

**4 ruoli** (espansione da 2 attuali):

| Ruolo | Chi | Moduli accessibili |
|---|---|---|
| `admin` | Francesco (per ora) | Tutto |
| `agent` | Agenti Komet | Ordini, clienti territorio, catalogo |
| `ufficio` | Staff ufficio Komet | Vista gestionale, dati aggregati |
| `concessionario` | Dealer (es. Fresis) | Ordini, warehouse, storico proprio |

**JWT payload aggiornato**:
```ts
{
  userId: string
  role: 'admin' | 'agent' | 'ufficio' | 'concessionario'
  modules: string[]   // es. ['orders', 'warehouse', 'customers']
  erpUsername: string
  jti: string         // per revocation list (sezione 5.1)
}
```

**Migration**: `046-roles-modules-mfa.sql`
```sql
-- Espansione ruoli
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ufficio';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'concessionario';

-- Moduli per utente
ALTER TABLE agents.users ADD COLUMN modules JSONB NOT NULL DEFAULT '[]';

-- MFA
ALTER TABLE agents.users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agents.users ADD COLUMN mfa_secret_encrypted TEXT;
ALTER TABLE agents.users ADD COLUMN mfa_secret_iv TEXT;
ALTER TABLE agents.users ADD COLUMN mfa_secret_auth_tag TEXT;

CREATE TABLE agents.mfa_recovery_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TIMESTAMPTZ
);
```

### 3.1 MFA: scope per ruolo

| Ruolo | MFA |
|---|---|
| `admin` | **Obbligatorio** — enforcement 24h post-deploy |
| `ufficio` | **Obbligatorio** — accesso a dati aggregati multi-agente |
| `agent` | Opzionale — abilitabile dal profilo |
| `concessionario` | Opzionale — abilitabile dal profilo |

**Library**: `otpauth` (npm, 0 dipendenze, 12KB)

### 3.2 Enrollment flow

1. Login con username + password → backend vede `mfa_enabled = false` su ruolo obbligatorio
2. Risposta `{ status: 'mfa_setup_required', setupToken: <jwt monouso 5min> }`
3. Backend genera TOTP secret → cifra con AES-256-GCM (stesso sistema password ERP) → salva in DB
4. Frontend mostra QR code (`otpauth://totp/Archibald:<username>?secret=...`)
5. Admin inserisce primo codice 6 cifre per confermare scansione
6. Backend genera 8 recovery codes (random hex 16 byte ciascuno) → salvati come hash bcrypt
7. Frontend mostra recovery codes una sola volta: "Salvali in un posto sicuro"
8. `mfa_enabled = true` → audit log `mfa.enrollment_completed`

### 3.3 Login flow post-enrollment

```
username + password → credenziali ok?
                              ↓
                      mfa_enabled = true?
                      ↙              ↘
                    no               sì
                     ↓                ↓
               JWT emesso      { status: 'mfa_required', mfaToken: <jwt 5min> }
                                      ↓
                              POST /api/auth/mfa-verify { mfaToken, code }
                                      ↓
                              codice TOTP valido → JWT sessione
                              recovery code → JWT + recovery code bruciato
```

### 3.4 Whitelist admin UI

Nuova schermata "Gestione accessi" nell'admin panel:
- Lista utenti whitelistati
- Per ognuno: ERP username, nome, ruolo (dropdown), moduli (checkbox), stato MFA, tasto "Revoca"
- Aggiunta nuovo utente: form con ERP username + ruolo + moduli

**Nuovi file**: `src/services/mfa-service.ts`, `frontend/src/pages/AccessManagementPage.tsx`, `frontend/src/components/MfaSetupPage.tsx`, `frontend/src/components/MfaVerifyStep.tsx`

---

## Sezione 4 — GDPR data lifecycle (Giorni 7-8)

### 4.1 Retention policy

**Regole** (GDPR Art. 5.1.e + D.P.R. 600/1973 art. 22):

| Tipo di dato | Retention | Azione |
|---|---|---|
| Dati ordini (importi, date, prodotti) | 10 anni dalla data ordine | Nessuna cancellazione prima |
| Anagrafiche clienti (nome, indirizzo, email, tel., CF) | 10 anni dall'ultima transazione | Poi anonimizzazione automatica |
| Audit log | 2 anni | Cancellazione automatica |
| Sessioni / token scaduti | 90 giorni | Cancellazione automatica |
| Password ERP utenti rimossi | Immediata alla rimozione | Cancellazione |
| Backup Hetzner Object Storage | 30 giorni rolling | Rotazione automatica |

**Migration**: `047-retention-policy.sql`
- Aggiunge `last_activity_at TIMESTAMPTZ` a `agents.customers` (aggiornata ad ogni ordine)

**Scheduler BullMQ** (job mensile, coda `shared-sync`):
1. Anonimizza clienti con `last_activity_at < NOW() - INTERVAL '10 years'`
2. Cancella `system.audit_log` con `occurred_at < NOW() - INTERVAL '2 years'`
3. Cancella sessioni scadute da >90 giorni
4. Log in `system.audit_log` con azione `system.retention_job_completed`

**Anonimizzazione**: sostituisce `name`, `address`, `email`, `phone`, `fiscal_code` con `[GDPR_ERASED_<timestamp>]`. Mantiene `vat_number` (necessario riconciliazione fiscale) e tutti i record ordini.

### 4.2 Right to erasure endpoint

**Route**: `POST /api/admin/customers/:id/gdpr-erase`  
**Auth**: solo ruolo `admin`

**Body richiesto**:
```json
{ "reason": "Richiesta scritta del titolare ricevuta il 2026-XX-XX" }
```

**Logica**:
1. Verifica assenza ordini attivi (pending/in-corso) → `409 Conflict` se presenti
2. Esegue anonimizzazione (stessa logica retention job)
3. Cancella eventuali foto/allegati del cliente
4. Scrive `customer.erased` in audit log con `metadata: { reason, fields_erased: [...] }`
5. Restituisce attestato JSON:
```json
{
  "customerId": "...",
  "erasedAt": "2026-...",
  "fieldsErased": ["name", "address", "email", "phone", "fiscal_code"],
  "retainedFor": "fiscal_obligation_10y",
  "reason": "..."
}
```
L'attestato va salvato dall'admin come prova documentale.

### 4.3 Sub-processor register

File: `docs/compliance/sub-processors.md`

| Sub-processor | Ruolo | Dati trattati | Sede | GDPR |
|---|---|---|---|---|
| Hetzner Online GmbH | VPS hosting + Object Storage backup | Tutto il DB, log, backup | Germania 🇩🇪 | ✅ EU, DPA disponibile |
| FedEx Corporation | Tracking API | Solo tracking numbers (no dati personali) | USA 🇺🇸 | ✅ dati minimi, DPA |
| Provider SMTP (da definire) | Email alert sistema | Email destinatario + corpo alert | Da verificare | Da verificare |
| Dropbox Inc. *(solo modulo Fresis/Arca)* | Storage documenti Arca | File PDF/documenti Fresis | USA 🇺🇸 | ✅ SCC + DPA, scoped |

**Da fare**: identificare provider SMTP usato in produzione e verificare DPA.  
**Aggiornamento**: il registro va aggiornato ogni volta che si aggiunge una dipendenza esterna.

---

## Sezione 5 — Session & secrets hardening (Giorni 7-8, in parallelo con S4)

### 5.1 JWT revocation list via Redis

**Problema**: token JWT rimangono validi fino a scadenza (8h) anche dopo logout o revoca utente.

**Soluzione**: blocklist Redis basata su `jti` (JWT ID univoco per token).

```ts
// auth-utils.ts: aggiungere jti al payload JWT
const jti = crypto.randomUUID()
const token = await new SignJWT({ ...payload, jti })

// Al logout o revoca utente:
await redis.set(`revoked:${jti}`, '1', 'EX', remainingTtlSeconds)

// middleware/auth.ts: dopo verifica firma
const isRevoked = await redis.exists(`revoked:${jti}`)
if (isRevoked) return res.status(401).json({ error: 'TOKEN_REVOKED' })
```

**Quando viene revocato**:
- Logout esplicito
- Admin rimuove utente dalla whitelist → revoca tutti i token attivi di quell'utente
- Admin cambia ruolo/moduli → revoca forzata (utente rifà login con nuovi permessi)

**Performance**: `EXISTS` Redis è O(1), <1ms di overhead per request.

**File modificati**: `src/auth-utils.ts`, `src/middleware/auth.ts`, `src/routes/auth.ts`

### 5.2 Cache password ERP: TTL 24h → 4h

**File**: `src/services/password-cache.ts`  
**Modifica**: costante TTL da `24 * 60 * 60 * 1000` a `4 * 60 * 60 * 1000`  
**Motivazione**: copre una giornata lavorativa, minimizza esposizione in caso di processo compromesso.

### 5.3 Rimozione PIN dai file di memoria

Il PIN di accesso PWA (`2611`) è attualmente scritto in chiaro nel file `memory/MEMORY.md`.  
Va rimosso immediatamente e spostato in `VPS-ACCESS-CREDENTIALS.md` (già in `.gitignore`) o in un password manager.

**File modificato**: `memory/MEMORY.md` (rimozione voce PIN)

### 5.4 Redis password interna

**Problema**: Redis non ha autenticazione interna — accessibile da qualsiasi container compromesso.

**Fix**:
- `docker-compose.yml`: aggiungere `--requirepass ${REDIS_PASSWORD}` al command Redis
- `.env.production`: aggiungere `REDIS_PASSWORD=<random 32 byte hex>`
- `src/db/redis.ts` (o equivalente): configurare ioredis con `password: process.env.REDIS_PASSWORD`
- BullMQ: passare la stessa password nelle opzioni di connessione

---

## Sezione 6 — Incident response procedure (Giorno 9)

File: `docs/compliance/incident-response-procedure.md`

### Classificazione incidenti

| Livello | Descrizione | Esempi |
|---|---|---|
| **P1 — Critico** | Dati personali esposti/rubati, accesso non autorizzato confermato | DB dump esfiltrato, credenziali compromesse, ransomware |
| **P2 — Alto** | Servizio non disponibile >4h, sospetto accesso anomalo | VPS down, circuit breaker bloccato, login anomali ripetuti |
| **P3 — Medio** | Degradazione servizio, anomalia non confermata | Backup fallito, errori 500 elevati |

### Procedura di risposta

```
Incidente rilevato (alert automatico via email o rilevamento manuale)
           ↓
    Francesco valuta livello (P1/P2/P3)
           ↓
   P1 → entro 4h:
     1. Notifica Komet Italia: [referente da definire in contratto]
     2. Isola il sistema se necessario: docker stop backend
     3. Entro 24h: Early warning ACN → acn.gov.it/segnalazione
     4. Entro 72h: Notifica Garante Privacy se dati personali coinvolti
          → garanteprivacy.it/web/guest/notifica-data-breach

   P2 → entro 24h:
     1. Notifica Komet Italia
     2. Valuta se escalare a P1

   P3 → entro 72h:
     1. Documenta l'anomalia nel log interno
     2. Comunica a Komet in report mensile
```

### Template notifica a Komet (P1)

```
Oggetto: [SICUREZZA] Incidente Archibald PWA - <data>

Si notifica un incidente di sicurezza rilevato in data <data> alle <ora>.

Natura: <descrizione>
Dati coinvolti: <categorie e stima numero interessati>
Impatto: <accesso non autorizzato / perdita dati / indisponibilità>

Misure adottate:
- <lista azioni in corso>

Misure preventive pianificate:
- <lista>

Prossimo aggiornamento entro: <24h / 72h>

Formicola Francesco
```

### Post-incident report

Entro 7 giorni: `docs/compliance/incidents/YYYY-MM-DD-incident.md` con:
- Timeline completa
- Root cause analysis
- Impatto effettivo
- Misure correttive implementate
- Misure preventive per il futuro

---

## Sezione 7 — Security & Compliance Overview (Giorno 10)

File: `docs/compliance/archibald-security-compliance-overview.md`  
Formato presentazione: PDF (generato da markdown)

### Struttura documento

1. **Copertina**: titolo, autore (Formicola Francesco + P.IVA), versione 1.0, aprile 2026, preparato per Komet
2. **Executive Summary**: SaaS B2B hosted EU, data processor GDPR, allineato NIS 2 e GDPR
3. **Architettura e localizzazione dati**: Hetzner Germania, stack, TLS, backup, nessun dato fuori EU (eccetto tracking FedEx)
4. **Misure di sicurezza** (tabella NIS 2 Art. 21 — tutte ✅)
5. **GDPR compliance**: dati trattati, base legale, retention 10 anni + anonimizzazione, right to erasure, audit trail 2 anni, sub-processors, breach notification procedure
6. **Incident response**: sintesi procedura P1/P2/P3
7. **Prossimi passi contrattuali**: DPA (Art. 28), contratto SaaS, pen test annuale

---

## Timeline implementazione

| Giorni | Sezione | Output |
|---|---|---|
| 1-2 | Quick wins tecnici | Backup, alerting, CSP, CORS, rate limit, npm audit |
| 3-4 | Audit log immutabile | Migration 045, audit-log.ts, integrazioni |
| 5-6 | Ruoli + MFA | Migration 046, mfa-service.ts, frontend MFA, whitelist UI |
| 7-8 | GDPR lifecycle + Hardening | Migration 047, retention job, gdpr-erase, JWT revocation, Redis auth |
| 9 | Incident response | docs/compliance/incident-response-procedure.md |
| 10 | Compliance Overview | docs/compliance/archibald-security-compliance-overview.md |
| 11-12 | Buffer | Testing, fix, deploy produzione, verifica finale |

**Deadline**: 2026-04-14 (meeting Komet)

---

## Dipendenze npm da aggiungere

**Backend**:
- `express-rate-limit` — rate limiting applicativo
- `otpauth` — TOTP per MFA
- `bcrypt` o `@node-rs/bcrypt` — hash recovery codes MFA

**Nessuna nuova dipendenza frontend** — tutto gestibile con React esistente.

---

## Prossimi passi post-14 aprile (fuori scope questo sprint)

1. **DPA con Komet Italia** — allegato contratto, Art. 28 GDPR
2. **Contratto SaaS** — SLA, responsabilità, condizioni uso
3. **Penetration test annuale** — provider esterno
4. **DPIA** — valutare se necessaria (Art. 35 GDPR)
5. **Provider SMTP** — verificare DPA e valutare alternativa EU
6. **Trivy** — vulnerability scanning immagini Docker in CI
