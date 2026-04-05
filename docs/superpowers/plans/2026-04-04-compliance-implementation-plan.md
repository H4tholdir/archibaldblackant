# Piano di Implementazione Compliance — Archibald PWA
**Data:** 2026-04-04  
**Target:** Meeting Komet Italia — 14 aprile 2026  
**Branch attivo:** `feat/compliance-nis2-gdpr`

---

## Contesto e Decisioni Architetturali di Base

Prima di leggere le fasi, queste due decisioni impattano tutto il piano:

1. **SMTP → niente.** Gli alert di sicurezza vengono loggati nel database (`system.audit_log` con `action = 'security.alert'`) e visualizzati in un pannello admin. Ogni alert mostra un link `mailto:` per l'invio manuale. Zero dipendenze SMTP, zero sub-processor email da dichiarare nel DPA.

2. **Komet = Titolare del trattamento.** Komet gestisce i dati degli agenti e dei clienti nel proprio ERP. La PWA è uno strumento che facilita quel trattamento. Formicola Francesco è il **Responsabile del trattamento** (Art. 28 GDPR). Questo è già correttamente rispecchiato nel DPA — ma semplifica molto il perimetro degli obblighi: non bisogna gestire consensi degli interessati, basi giuridiche dei trattamenti, o diritti degli interessati in prima persona. Komet lo fa. La nostra responsabilità è garantire sicurezza e correttezza del trattamento per conto di Komet.

---

## Sezione 0 — Situazione Legale e Commerciale di Formicola Francesco

> **Urgenza massima: da risolvere entro il 7 aprile.**  
> Senza una partita IVA o una società, non è possibile emettere fatture né firmare contratti commerciali validi come operatore economico.

### Il problema attuale

Francesco è dipendente di Fresis Soc. Coop. Non ha una propria partita IVA né una propria società. Il contratto MSA è redatto a nome "Formicola Francesco" con placeholder `[PARTITA IVA DA INSERIRE]`. Per firmare ed emettere la prima fattura serve una delle soluzioni sotto.

### Opzione A — Partita IVA individuale (RACCOMANDATA per il 14 aprile)

**Che cos'è:** Un numero di identificazione fiscale che permette di svolgere attività professionale autonoma o commerciale in proprio.

**Come si apre:**  
1. Accedere a `fisconline.agenziaentrate.gov.it` con SPID o CIE  
2. Compilare il modello **AA9/12** online  
3. Scegliere il codice ATECO: **62.01.09** — "Produzione di altri programmi informatici non connessi all'editoria"  
4. Indicare regime: **forfettario** (se prevedi reddito annuo < €85.000)  
5. La partita IVA è attiva entro 1-3 giorni lavorativi (spesso lo stesso giorno)

**Vantaggi del regime forfettario:**  
- Tassazione sostitutiva al **15%** sul reddito imponibile (calcolato come: ricavi × coefficiente di redditività 78% per codice 62.01.09 → redditività effettiva ≈ 11.7% su ricavi)  
- **5% per le prime 5 annualità** se non hai mai svolto attività autonoma prima  
- Fatture senza IVA (esenzione ex art. 1, L. 190/2014) — più semplice per il cliente  
- Nessuna contabilità ordinaria richiesta (registro fatture + modello Redditi PF)  
- Non serve un commercialista per aprirla (consigliato per la gestione)

**INPS:** Come dipendente Fresis + libero professionista, ti iscrivi alla **Gestione Separata INPS** (~26.23% del reddito netto da attività autonoma). La contribuzione è deducibile dal reddito forfettario. Se ricavi annui sono bassi i contributi sono proporzionali.

**Verifica contratto Fresis:** Prima di aprire la partita IVA, controlla il tuo contratto di lavoro con Fresis (e il CCNL applicato):  
- C'è una clausola di **non concorrenza**? La PWA non compete con Fresis (Fresis è agente Komet, tu sviluppi software per Komet) → il rischio conflitto è basso.  
- C'è una clausola di **esclusiva** o obbligo di informare il datore? Molti CCNL Commercio/Terziario permettono attività freelance purché non in concorrenza.  
- In ogni caso, **la trasparenza è consigliata**: informa il presidente (tuo padre) di questa attività autonoma parallela.

### Opzione B — SRLS (Società a Responsabilità Limitata Semplificata)

**Quando conviene:** Quando il volume di fatturato giustifica i costi fissi, o quando è necessaria la **limited liability** (protezione del patrimonio personale da possibili richieste di risarcimento contrattuale).

**Come si apre:**  
1. Notaio (atto SRLS con statuto standardizzato) → costo ~€300-600 + IVA  
2. Registro Imprese Camera di Commercio → €200-300  
3. Apertura conto corrente aziendale  
4. Totale: €600-900, 2-4 settimane

**Vantaggi:**  
- Responsabilità limitata al capitale sociale  
- Più credibile per contratti corporate (Komet Germania potrebbe preferirla)  
- Titolare degli asset software in modo più chiaro (IP nella società, non nella persona fisica)  
- Eventuale ingresso di soci o investor futuro è più semplice

**Svantaggi:**  
- Costi fissi annui: commercialista (~€1.500-3.000/anno), INPS come socio-amministratore (~€3.800/anno fissi), tassa camera di commercio (~€120/anno)  
- Non fattibile in tempo per il 14 aprile

### Opzione C — Operare attraverso Fresis Soc. Coop.

**SCONSIGLIATA.** Tre problemi:  
1. **Conflitto di interessi strutturale:** Fresis è un agente Komet → Komet non vorrà che il loro agente sia anche il fornitore del software che gestisce tutti i loro agenti  
2. **Oggetto sociale:** Una cooperativa agricola/commerciale probabilmente non include sviluppo software — il contratto potrebbe essere contestato  
3. **Autonomia:** Francesco non ha controllo diretto sulla cooperativa; ogni decisione commerciale richiede il consenso del CdA

### Decisione consigliata

**Entro 7 aprile:** Apri la partita IVA individuale (regime forfettario). È l'unica opzione fattibile per il 14 aprile.  
**Entro settembre 2026:** Valuta la SRLS quando la situazione è stabile e il volume giustifica i costi.

**Come si riflette nei contratti:** I placeholder `[PARTITA IVA DA INSERIRE]` vengono compilati con la tua nuova partita IVA individuale. Il contratto resta a nome "Formicola Francesco (P.IVA XXXXXXXXXXX)" — valido e sufficiente per un contratto di durata annuale.

---

## FASE A — Fix Tecnici nel Branch Corrente

> Questi sono **modifiche al codice** da completare prima del deploy.  
> Sono ordinati per priorità decrescente ma possono essere eseguiti in parallelo.

---

### A.1 — Rimozione nodemailer: sistema alert log + mailto

**Perché:** Nessun SMTP. Gli alert vengono scritti nell'audit_log e visualizzati nel pannello admin con un link mailto: per la segnalazione manuale.

**File coinvolti:**
- `backend/src/services/security-alert-service.ts` — riscrivere completamente
- `backend/src/services/security-alert-service.spec.ts` — aggiornare i test
- `backend/src/config.ts` — rimuovere blocco `smtp`
- `backend/src/main.ts` — rimuovere `import nodemailer`, rimuovere istanziazione SecurityAlertService con SMTP
- `backend/package.json` — rimuovere dipendenza `nodemailer` e `@types/nodemailer`
- `backend/src/routes/auth.ts` — il `sendSecurityAlert` dep rimane ma cambia tipo: non async, non richiede SMTP
- `frontend/src/pages/AccessManagementPage.tsx` — aggiungere sezione "Security Alerts" con link mailto

**Implementazione:**

Il nuovo `security-alert-service.ts` non usa più nodemailer. Scrive nel database (tramite `audit`) e genera un `mailto:` URL.

```typescript
// Nuovo security-alert-service.ts
import { audit } from '../db/repositories/audit-log';
import type { DbPool } from '../db/pool';

export type SecurityAlertEvent =
  | 'login_failed_admin'
  | 'login_failed_agent'
  | 'circuit_breaker_triggered'
  | 'backup_failed'
  | 'backup_completed'
  | 'rate_limit_triggered_admin'
  | 'high_error_rate';

export function buildMailtoLink(
  alertEmail: string,
  event: SecurityAlertEvent,
  details: Record<string, unknown>,
): string {
  const subject = encodeURIComponent(`[ARCHIBALD SECURITY] ${event} — ${new Date().toISOString()}`);
  const body = encodeURIComponent(`Evento: ${event}\n\nDettagli:\n${JSON.stringify(details, null, 2)}`);
  return `mailto:${alertEmail}?subject=${subject}&body=${body}`;
}

export function createSecurityAlertService(pool: DbPool) {
  function send(event: SecurityAlertEvent, details: Record<string, unknown>): void {
    void audit(pool, {
      action: 'security.alert',
      actorRole: 'system',
      metadata: { event, ...details },
    });
  }
  return { send };
}
```

Il frontend (AccessManagementPage o nuova SecurityAlertsPage) chiama `GET /api/admin/audit-log?action=security.alert` e per ogni evento costruisce il mailto: link client-side. L'env `SECURITY_ALERT_EMAIL` può essere esposta come config pubblica admin (non è un segreto).

**Admin endpoint da aggiungere in admin.ts:**
```
GET /api/admin/security-alerts
→ query su audit_log WHERE action = 'security.alert' AND occurred_at > NOW() - 7 days
→ ritorna array con evento, timestamp, metadata, e un mailtoUrl pre-costruito
```

**Test:** Aggiornare `security-alert-service.spec.ts` — mockare `audit`, verificare che venga chiamata con `action: 'security.alert'`.

**Rimozione dipendenze:**
```bash
npm uninstall nodemailer @types/nodemailer --prefix archibald-web-app/backend
```

---

### A.2 — Rate limiting su /mfa-setup e /mfa-confirm

**Perché:** Senza rate limit, un attaccante con un `setupToken` valido può tentare codici TOTP a forza bruta durante la fase di enrollment.

**File coinvolti:** `backend/src/routes/auth.ts`

**Dove:** Aggiungere due rate limiter subito sotto quello per `/mfa-verify` (linee ~107-114 del file attuale).

```typescript
const mfaSetupRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip ?? 'unknown',
  message: { error: 'Troppi tentativi di setup MFA. Riprova tra 15 minuti.' },
  legacyHeaders: false,
});
```

Applicare a entrambe le route:
```typescript
router.post('/mfa-setup',   mfaSetupRateLimiter, createMfaTokenMiddleware(), ...)
router.post('/mfa-confirm', mfaSetupRateLimiter, createMfaTokenMiddleware(), ...)
```

**Test:** Aggiungere test in `auth.spec.ts` — dopo 5 richieste in 15 minuti, risposta 429.

---

### A.3 — Disclaimer GDPR su campi note liberi (frontend)

**Perché:** Il campo `notes` in CustomerProfilePage potrebbe ricevere dati sanitari, dati di terzi, o informazioni non pertinenti. Serve un warning visibile che ricordi all'agente di non inserire dati personali sensibili di terzi.

**File coinvolti:** `frontend/src/pages/CustomerProfilePage.tsx` (e qualsiasi altro componente con textarea libera, incluso `OrderNotes.tsx`)

**Implementazione:** Aggiungere sotto ogni `<textarea>` libera un testo hint:

```tsx
<small style={{ color: '#888', fontSize: 11 }}>
  Non inserire dati sanitari, referenze mediche o informazioni personali di terzi.
</small>
```

In edit mode, aggiungere un `title` (tooltip) sul campo che ricordi la stessa cosa. Non serve un modal o una UX invasiva — solo un hint visibile e persistente.

**Dove esattamente:**
- `CustomerProfilePage.tsx`: il `FieldCell` con `editKey="notes"` e `isTextarea`
- `OrderNotes.tsx` (o componente equivalente): qualsiasi textarea per note ordine

---

### A.4 — Self-hosting Google Fonts

**Perché:** La chiamata a `fonts.googleapis.com` trasmette l'IP del dispositivo a Google senza consenso — tecnicamente un trasferimento di dato personale (IP = dato personale per GDPR). La soluzione più semplice è includere i font nel bundle.

**File coinvolti:** `frontend/vite.config.ts`, eventuale CSS che importa da Google Fonts

**Step 1:** Identificare quale/i font vengono caricati.
```bash
grep -r "googleapis\|gstatic" archibald-web-app/frontend/src/
grep -r "googleapis\|gstatic" archibald-web-app/frontend/index.html
```

**Step 2:** Usare [google-webfonts-helper](https://gwfh.mranftl.com/) o `@fontsource` npm per scaricare i font localmente.

Se il font è Inter, Roboto, o simile:
```bash
npm install @fontsource/inter --prefix archibald-web-app/frontend
```
Poi in `main.tsx`:
```typescript
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
```

**Step 3:** Rimuovere la cache Workbox per Google Fonts dal `vite.config.ts` (blocco righe ~93-104).

**Step 4:** Verificare che il bundle non faccia più chiamate esterne. Strumento: DevTools Network tab con `Disable cache`, filtrare per `fonts.gstatic` o `googleapis`.

---

### A.5 — GDPR-erase esteso a shared.sub_clients

**Perché:** La tabella `shared.sub_clients` contiene `cod_fiscale`, `email`, `telefono`, `pers_da_contattare` — dati personali non coperti dall'attuale `eraseCustomerPersonalData()` che opera solo su `agents.customers`.

**File coinvolti:**
- `backend/src/db/repositories/gdpr.ts`
- `backend/src/routes/admin.ts` (endpoint POST `/customers/:id/gdpr-erase`)

**Analisi preliminare:** Prima di scrivere il codice, leggere `006-subclients.sql` per verificare la chiave di join tra `agents.customers` e `shared.sub_clients`. La relazione è probabilmente via `customer_profile` o `erp_id`.

**Implementazione:** Aggiungere in `eraseCustomerPersonalData()` una seconda query che anonimizza i sotto-clienti associati:

```typescript
// Dopo l'UPDATE su agents.customers:
await tx.query(
  `UPDATE shared.sub_clients SET
     pers_da_contattare = CASE WHEN pers_da_contattare IS NOT NULL THEN $1 ELSE NULL END,
     email              = CASE WHEN email IS NOT NULL THEN $1 ELSE NULL END,
     email_amministraz  = CASE WHEN email_amministraz IS NOT NULL THEN $1 ELSE NULL END,
     telefono           = CASE WHEN telefono IS NOT NULL THEN $1 ELSE NULL END,
     cod_fiscale        = CASE WHEN cod_fiscale IS NOT NULL THEN $1 ELSE NULL END,
     partita_iva        = CASE WHEN partita_iva IS NOT NULL THEN $1 ELSE NULL END
   WHERE customer_profile_id = $2`,  -- verificare nome colonna
  [erasedMarker, customerProfile],
);
```

**Test:** Aggiungere caso di integrazione in `gdpr.spec.ts` (o creare il file): verificare che dopo `eraseCustomerPersonalData()`, anche i sub_clients abbiano i campi anonimizzati.

---

### A.6 — Endpoint portabilità dati cliente (Art. 15/20 GDPR)

**Perché:** Come Responsabile del trattamento, dobbiamo poter rispondere a una richiesta di Komet (che a sua volta risponde all'interessato) per l'esportazione di tutti i dati relativi a un cliente. Senza questo endpoint, la risposta è "export manuale dal DB" — non scalabile.

**File coinvolti:**
- `backend/src/db/repositories/gdpr.ts` — nuova funzione `exportCustomerData()`
- `backend/src/routes/admin.ts` — nuovo endpoint `GET /customers/:id/export`

**Dati da includere nell'export:**
- Tutti i campi di `agents.customers` (dati anagrafici)
- Tutti gli `agents.order_records` associati (storico ordini)
- Tutti gli `agents.order_articles` degli ordini
- Tutti i `shared.sub_clients` associati
- Nessun dato di sistema (no audit_log, no encrypted secrets)

**Formato:** JSON (struttura: `{ customer: {...}, orders: [...], subClients: [...] }`). Niente PDF — il JSON è machine-readable e soddisfa il requisito di portabilità Art. 20.

**Implementazione endpoint:**
```
GET /api/admin/customers/:id/export
Authorization: Bearer <admin JWT>
Response: 200 application/json
Content-Disposition: attachment; filename="customer-export-<id>-<date>.json"
```

**Audit:** Loggare `customer.data_exported` con actorId, targetId, metadata `{ reason }`.

**Test:** Integration test — verifica che l'export contenga tutti i campi e che sia auditato.

---

### A.7 — Retention scheduler (BullMQ cron job)

**Perché:** La migration 047 aggiunge `last_activity_at` ma nessun processo automatico decide cosa farne. Per GDPR, i dati di clienti inattivi devono essere gestiti secondo la retention policy (notifica, o anonimizzazione se il Titolare lo richiede).

**Nota importante:** Poiché Komet è il Titolare, la **decisione** di cancellare/anonimizzare i dati di un cliente inattivo deve venire da Komet, non automaticamente dalla PWA. Il nostro scheduler ha senso per **notificare** l'admin di clienti inattivi, non per cancellare autonomamente.

**File coinvolti:**
- Nuovo file: `backend/src/db/repositories/retention.ts`
- `backend/src/main.ts` — registrare il job cron

**Funzione da implementare:**
```typescript
// retention.ts
export async function getInactiveCustomers(
  pool: DbPool,
  userId: string,
  thresholdMonths: number,  // es. 24 = 2 anni
): Promise<Array<{ customerProfile: string; name: string; lastActivityAt: Date }>>

export async function getCustomersNeverActive(
  pool: DbPool,
  userId: string,
  olderThanMonths: number,  // es. 12 = 1 anno senza mai un ordine
): Promise<Array<{ customerProfile: string; name: string; createdAt: Date }>>
```

**Job cron:** Eseguire ogni domenica alle 03:00 UTC. Per ogni utente, se ci sono clienti inattivi > 24 mesi: creare una notifica `customer_inactive_retention` con lista clienti.

```typescript
// main.ts — aggiungere tra i cron jobs esistenti
cronScheduler.add('retention-check', '0 3 * * 0', async () => {
  const users = await usersRepo.getAllAgents(pool);
  for (const user of users) {
    const inactive = await getInactiveCustomers(pool, user.id, 24);
    if (inactive.length > 0) {
      await createNotification(pool, {
        userId: user.id,
        type: 'customer_inactive_retention',
        metadata: { count: inactive.length, customerProfiles: inactive.map(c => c.customerProfile) },
      });
    }
  }
});
```

**Non fare:** Delete automatico. Il delete richiede autorizzazione esplicita di Komet per ogni cliente.

**Test:** Unit test per `getInactiveCustomers` con date di test controllate.

---

## FASE B — Infrastruttura e Deploy

> Queste sono operazioni sul VPS da eseguire **dopo** che tutti i fix tecnici della Fase A sono mergiati.

### B.1 — Variabili d'ambiente VPS (aggiornate)

Rispetto alla checklist originale, le variabili SMTP sono **rimosse**. La lista aggiornata da aggiungere a `.env` in produzione:

```env
# Redis (obbligatorio)
REDIS_PASSWORD=<generare con: openssl rand -hex 32>

# Security alert email (usato solo per generare i mailto: link nel frontend)
SECURITY_ALERT_EMAIL=<tua email>

# Hetzner Object Storage (backup)
HETZNER_BUCKET=archibald-backups
HETZNER_S3_ENDPOINT=https://fsn1.your-objectstorage.com
HETZNER_ACCESS_KEY=<chiave accesso Hetzner>
HETZNER_SECRET_KEY=<chiave segreta Hetzner>
```

Le seguenti variabili della checklist originale **non servono più:**
- ~~SMTP_HOST~~
- ~~SMTP_PORT~~
- ~~SMTP_USER~~
- ~~SMTP_PASS~~
- ~~SMTP_FROM~~
- ~~SMTP_SECURE~~

### B.2 — Hetzner Object Storage: creazione bucket

1. Accedere a `console.hetzner.com`  
2. Object Storage → New Bucket  
3. Nome: `archibald-backups`, Regione: `fsn1` (Frankfurt — UE ✅)  
4. Creare Access Key e Secret Key  
5. Inserire in `.env` (vedi B.1)

### B.3 — Migrazioni database

Eseguire in ordine sul DB di produzione:
```bash
# 1. Migration 045 — audit_log immutabile
# 2. Migration 046 — ruoli espansi + MFA
# 3. Migration 047 — retention policy (last_activity_at)

ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "cd /home/deploy/archibald-app && docker compose exec -T backend node -e \
  \"const { runMigrations } = require('./dist/db/migrate'); \
    const { createPool } = require('./dist/db/pool'); \
    const pool = createPool({ host: process.env.PG_HOST, database: process.env.PG_DATABASE, \
      user: process.env.PG_USER, password: process.env.PG_PASSWORD, maxConnections: 5 }); \
    runMigrations(pool).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });\""
```

### B.4 — Deploy branch

1. Merge `feat/compliance-nis2-gdpr` → `master` (o PR)  
2. CI/CD GitHub Actions → build images → push GHCR  
3. Deploy automatico su VPS  
4. Verificare logs: `docker compose logs --tail 100 backend`  
5. Verificare Redis con password: il backend deve connettersi senza errori di autenticazione

### B.5 — Test post-deploy

- [ ] Login admin → forzato a fare MFA setup (primo accesso post-migration)  
- [ ] Completare setup MFA con Google Authenticator / Authy / 1Password  
- [ ] Verificare che gli agenti si loghino normalmente (MFA non obbligatorio per loro a meno di `mfa_enabled = true`)  
- [ ] Eseguire backup manuale e verificare che appaia nel bucket Hetzner:  
  ```bash
  docker compose --profile backup run --rm backup
  ```  
- [ ] Verificare `GET /api/admin/audit-log` — deve restituire eventi di login  
- [ ] Verificare `GET /api/admin/security-alerts` — deve funzionare senza SMTP  
- [ ] Configurare cron per backup notturno:  
  ```bash
  # Sul VPS come utente deploy: crontab -e
  0 2 * * * cd /home/deploy/archibald-app && docker compose --profile backup run --rm backup >> /home/deploy/archibald-app/logs/backup.log 2>&1
  ```

---

## FASE C — Documentazione Governance (Non Codice)

> Questi sono **documenti da redigere** — non richiedono programmazione.  
> Possono essere fatti in parallelo con la Fase A.

### C.1 — Registro dei trattamenti (Art. 30.2 GDPR)

**Chi è obbligato:** Formicola Francesco in quanto **Responsabile del trattamento** (data processor) deve tenere un registro dei trattamenti ex Art. 30.2 GDPR. L'obbligo scatta quando non si è "occasionali" — e un contratto SaaS continuativo non è occasionale.

**Contenuto minimo del registro (Art. 30.2):**
- Nome e dati di contatto del Responsabile (Formicola Francesco + P.IVA)  
- Dati di contatto del/dei Titolari per conto dei quali si tratta (Komet Italia S.r.l.)  
- Categorie di trattamenti effettuati per conto del Titolare  
- Trasferimenti a paesi terzi e garanzie adottate  
- Misure di sicurezza ex Art. 32

**Dove salvarlo:** `docs/compliance/registro-trattamenti-responsabile.md`

**Template da creare** (due sezioni):

| Campo | Valore |
|---|---|
| Responsabile | Formicola Francesco, P.IVA XXXXXXXX |
| Titolare | Komet Italia S.r.l., P.IVA XXXXXXXX |
| Finalità trattamento | Gestione ordini agenti, anagrafica clienti Komet, tracciamento consegne, sync ERP |
| Categorie dati trattati | Dati anagrafici clienti finali (nome, indirizzo, P.IVA, CF, email, tel), dati operativi ordini, credenziali agenti ERP |
| Categorie interessati | Agenti commerciali Komet, clienti finali degli agenti |
| Destinatari | Solo Komet Italia (Titolare), nessun terzo salvo sub-processor autorizzati |
| Sub-processor | Hetzner Online GmbH (hosting VPS + backup), FedEx (tracking numeri spedizione) |
| Trasferimenti extra-UE | FedEx (USA) — tracking numbers pseudo-anonimi. Hetzner: Germania (UE) |
| Misure di sicurezza | TLS 1.3, AES-256-GCM, RBAC, MFA, audit log immutabile, backup criptato Hetzner |
| Data inizio | Data firma DPA |

### C.2 — DPIA Screening

**Che cos'è:** Una valutazione d'impatto sulla protezione dei dati è obbligatoria (Art. 35 GDPR) quando un trattamento è "ad alto rischio". Il primo step è uno screening per capire se è obbligatoria.

**Criteri da verificare** (almeno 2 su 9 per scattare l'obbligo):
1. ☐ Valutazione/profilazione persone → **NO** (non valutiamo agenti o clienti)  
2. ☐ Decisioni automatizzate → **NO**  
3. ☐ Monitoraggio sistematico → **FORSE** (last_activity_at + audit log agenti — ma in contesto B2B, non sorveglianza privata)  
4. ☐ Dati sensibili ex Art. 9 → **NO** (nessun dato sanitario, biometrico, etc. nel sistema — solo se inseriti in note libere → A.3 mitiga)  
5. ☐ Dati su larga scala → **NO** (pochi agenti, clienti locali)  
6. ☐ Abbinamento dataset → **NO**  
7. ☐ Interessati vulnerabili → **NO**  
8. ☐ Uso innovativo tecnologia → **NO**  
9. ☐ Impedimento diritto/contratto → **NO**

**Conclusione probabile:** 0-1 criteri soddisfatti → DPIA **non obbligatoria** ma consigliata come best practice.

**Azione:** Creare `docs/compliance/dpia-screening.md` con questa analisi firmata e datata. Il documento serve a dimostrare che la valutazione è stata fatta, anche se si conclude che la DPIA completa non è necessaria.

### C.3 — Completamento placeholder contratti

**45 placeholder totali** da compilare prima della firma. Priorità per il meeting:

**Indispensabili per firmare:**
| Placeholder | Dove | Azione |
|---|---|---|
| P.IVA Formicola Francesco | MSA, DPA, note IP | Da aprire entro 7 aprile (vedi Sezione 0) |
| Ragione sociale + P.IVA Komet Italia | MSA, DPA, informativa | Chiedere a referente Komet per email prima del meeting |
| Importo canone mensile | MSA Art. 4.1 | Da negoziare — definire prima del 14 aprile |
| Data decorrenza contratto | MSA, DPA | Fissare: es. 1 maggio 2026 o data firma |
| Email contatto supporto | SLA | La tua email o una dedicata |
| Provider SMTP sub-processor | sub-processors.md | **NON PIÙ NECESSARIO** — rimosso dal piano |

**Da completare ma non bloccanti per la firma:**
- Telefono, email, siti web delle parti (facili da compilare)  
- Data revisione documenti (data odierna)  
- Contatti DPO Komet (da chiedere a Komet)  
- Data prima creazione software (es. 2024 o 2025)

**Strumento pratico:** Fare una sessione di 2 ore con find-and-replace su tutti i file `docs/contracts/*.md`, sostituendo ogni `[DA INSERIRE]` o `[inserire]` con i dati reali.

### C.4 — Aggiornamento sub-processor list

**File:** `docs/compliance/sub-processors.md`

**Rimuovere:** Qualsiasi riferimento a SMTP provider (placeholder `[DA COMPLETARE]` per sub-processor #3).

**Lista finale sub-processor:**
1. **Hetzner Online GmbH** — hosting VPS + Object Storage (Francoforte, Germania, UE) ✅  
2. **FedEx Corporation** — tracking spedizioni (solo tracking number, dato pseudo-anonimo) ⚠️ USA → nota TIA  
3. **Dropbox Inc.** — (opzionale, modulo Fresis) ⚠️ USA → SCC da verificare se attivo

**Per FedEx (Transfer Impact Assessment semplificato):**  
Aggiungere una nota nel DPA e nel sub-processor register:  
> "I tracking number condivisi con FedEx sono codici alfanumerici non riconducibili a persone fisiche senza accesso ai dati ordine. La trasmissione costituisce trasferimento di dato pseudo-anonimo. Rischio: basso. Base giuridica: Art. 6.1(b) GDPR (esecuzione contratto di consegna)."

### C.5 — Informativa agenti: Statuto Lavoratori Art. 4

**Perché:** Il sistema traccia `last_activity_at` degli utenti e mantiene un audit log di tutte le operazioni. Se questi dati venissero usati per valutare la produttività degli agenti (es. "l'agente non si è loggato per 3 giorni"), siamo nel perimetro dell'Art. 4 Statuto dei Lavoratori — che richiede informazione preventiva ai lavoratori o accordo sindacale.

**Azione minima:** Aggiungere una nota nell'informativa privacy agli agenti (Art. 13 GDPR, che è già nel repository) specificando:
- Che vengono tracciati: orario ultimo accesso, operazioni eseguite (tipo, non contenuto), eventi di sicurezza  
- Che questi dati vengono usati per: sicurezza del sistema, supporto tecnico, compliance GDPR  
- Che **non** vengono usati per: valutazione della produttività, gestione del rapporto di lavoro

Questa chiarezza protegge sia Komet (che distribuisce l'informativa) sia Formicola Francesco (che gestisce i log).

---

## FASE D — Preparazione Meeting 14 Aprile

### D.1 — Documenti da preparare

**Da firmare al meeting:**
- `docs/contracts/DPA-art28-gdpr.md` → stampare 2 copie, firmare entrambe le parti
- `docs/contracts/MSA-contratto-saas.md` → stampare 2 copie, firmare entrambe le parti

**Da consegnare/illustrare:**
- `docs/compliance/archibald-security-compliance-overview.md` → 1 copia per Komet (overview tecnica)
- `docs/contracts/SLA-allegato-sicurezza.md` → allegare al MSA come Allegato B
- `docs/contracts/informativa-privacy-utenti.md` → distribuire agli agenti prima/durante il meeting

**Consigliato ma opzionale:**
- `docs/contracts/note-legali-ip-titolarita.md` → avere a disposizione ma non necessario firmare subito

### D.2 — Demo live da preparare

1. **Audit log admin** — `GET /api/admin/audit-log` con filtri: mostrare login, operazioni, eventi security
2. **Security alerts panel** — nuovo pannello admin con lista alert e link mailto
3. **AccessManagementPage** — mostrare ruoli, moduli, MFA status degli utenti
4. **GDPR erase endpoint** — dimostrare in staging (non produzione): `POST /api/admin/customers/:id/gdpr-erase` con body `{ reason: "Richiesta Art. 17 GDPR" }`
5. **Backup Hetzner** — mostrare il bucket con i file `.sql.gz` e la data dell'ultimo backup

### D.3 — Questioni da risolvere al meeting (o prima)

**Prima del meeting:**
- [ ] P.IVA Komet Italia (richiederla per email entro 10 aprile)
- [ ] Importo canone mensile (allineamento commerciale)
- [ ] Se Komet ha un DPO nominato → dati di contatto per i contratti
- [ ] Confermare che Gebr. Brasseler firma il MSA come terza parte o è solo Komet Italia il contraente (impatta il foro competente)

**Al meeting:**
- Foro competente: Tribunale di Napoli (proposto) — verificare se accettabile per Komet
- Data di decorrenza contratto: 1 maggio 2026 o altra
- Canale di comunicazione per manutenzione programmata (per SLA)
- Piano penetration test: obbligatorio contrattualmente o raccomandazione?

---

## Timeline Operativa

| Data | Azione |
|---|---|
| **7 aprile** | ✅ Apertura Partita IVA individuale di Formicola Francesco |
| **7 aprile** | ✅ Fix A.1 (alert service senza SMTP) + A.2 (rate limit mfa-setup/confirm) |
| **7 aprile** | ✅ Fix A.4 (Google Fonts self-hosted) |
| **8 aprile** | ✅ Fix A.3 (disclaimer note), A.5 (gdpr-erase sub_clients), A.6 (portabilità dati) |
| **8 aprile** | ✅ Fix A.7 (retention scheduler) — se fattibile, altrimenti entro 10 |
| **8 aprile** | ✅ Hetzner bucket + variabili d'ambiente VPS |
| **8 aprile** | ✅ Migrazioni DB 045/046/047 in produzione |
| **8 aprile** | ✅ Deploy branch + test MFA + backup manuale |
| **9 aprile** | ✅ Compilazione placeholder contratti (sessione 2h) |
| **9 aprile** | ✅ Invio bozze MSA + DPA a Komet per revisione preliminare |
| **9 aprile** | ✅ Redazione registro trattamenti + DPIA screening |
| **10 aprile** | ✅ Revisione avvocato clausole MSA/DPA (se possibile) |
| **11-12 aprile** | ✅ Distribuzione informativa privacy agenti |
| **13 aprile** | ✅ Stampa documenti, preparazione demo live |
| **14 aprile** | 🎯 **MEETING KOMET** |

---

## Riepilogo Gap per Priorità

| # | Task | Tipo | Urgenza |
|---|---|---|---|
| 0 | Aprire Partita IVA individuale | Legale | 🔴 CRITICO — sblocca contratti |
| A.1 | Alert service: nodemailer → audit_log+mailto (**in prod gli alert sono silenziosamente scartati**) | Tecnico | 🔴 CRITICO |
| A.2 | Rate limit /mfa-setup e /mfa-confirm + **rimuovere `secret` dalla response** (solo `uri`) | Tecnico | 🔴 CRITICO — security bypass |
| A.2b 🆕 | `createMfaTokenMiddleware()` → risolvere username vuoto nel QR code | Tecnico | 🔴 CRITICO — UX MFA rotta |
| A.8 🆕 | CI: aggiungere `npm test` backend in `ci.yml` — attualmente zero test girano in CI | Tecnico | 🔴 CRITICO — quality gate assente |
| B | Deploy + migrazioni + Hetzner bucket | Infra | 🔴 CRITICO — sblocca produzione |
| C.3 | Compilare 45 placeholder contratti | Documenti | 🔴 CRITICO — sblocca firma |
| A.3 | Disclaimer note libere (frontend) | Tecnico | 🟡 IMPORTANTE |
| A.4 | Self-host Google Fonts | Tecnico | 🟡 IMPORTANTE — GDPR |
| A.5 | GDPR-erase → sub_clients (aggiungere campi: ragione_sociale, telefono2/3, email_amministraz, pers_da_contattare) | Tecnico | 🟡 IMPORTANTE |
| A.6 | Endpoint portabilità dati (Art. 15/20) | Tecnico | 🟡 IMPORTANTE |
| A.7 | Retention scheduler (notifica) | Tecnico | 🟡 IMPORTANTE |
| A.9 🆕 | Riscrivere `gdpr.spec.ts` — assert sul SQL, non solo su `withTransaction` | Tecnico | 🟡 IMPORTANTE |
| A.10 🆕 | `/api/admin/audit-log`: aggiungere `total` count nella response | Tecnico | 🟡 IMPORTANTE |
| A.11 🆕 | Rimuovere `DATABASE_PATH=/app/data` da `docker-compose.yml` (residuo SQLite) | Tecnico | 🟡 |
| A.12 🆕 | Guard `actorId !== targetId` su `PATCH /users/:id` per role change | Tecnico | 🟡 IMPORTANTE |
| C.1 | Registro dei trattamenti (Art. 30.2) | Documenti | 🟡 IMPORTANTE |
| C.2 | DPIA screening | Documenti | 🟢 CONSIGLIATO |
| C.4 | Aggiornamento sub-processor list | Documenti | 🟢 CONSIGLIATO |
| C.5 | Informativa agenti (Art. 4 SL) | Documenti | 🟢 CONSIGLIATO |

---

*Piano generato il 2026-04-04. Da aggiornare man mano che i punti vengono completati.*
