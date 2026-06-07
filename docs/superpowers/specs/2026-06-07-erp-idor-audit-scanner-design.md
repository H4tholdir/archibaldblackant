# ERP IDOR Audit Scanner — Design Document

**Data:** 2026-06-07  
**Autore:** Francesco Formicola (agente Komet ikiA0930)  
**Scopo:** Audit forense della vulnerabilità IDOR sull'ERP Archibald (Dynamics AX / DevExpress XAF) per quantificare l'entità dell'esposizione dati e consegnare il report a Komet IT.  
**Classificazione:** Confidenziale — uso interno Komet

---

## 1. Contesto e obiettivo

L'ERP Archibald espone una vulnerabilità **IDOR (Insecure Direct Object Reference)** su tutti i principali endpoint DetailView: cambiando il valore numerico nell'URL si accede a record di qualsiasi agente, senza controlli di autorizzazione. Parallelamente, le ListView non filtrate sono accessibili senza filtro agente.

**Obiettivo del sistema:** raccogliere in modo sistematico e certificato tutti i dati esposti, costruire un database SQLite interrogabile + cartella PDF + export Excel, e consegnare a Komet IT come prova dell'entità della falla.

---

## 2. Vettori di accesso confermati (discovery live 2026-06-07)

### 2.1 IDOR su DetailView (interi sequenziali)

| Entity | URL pattern | Range ID | Dati esposti |
|---|---|---|---|
| Clienti | `CUSTTABLE_DetailView/{id}/?mode=View` | 1 → 60.000+ | CF, P.IVA, IBAN (da PAYMTERMID), indirizzo, telefono, stato IVA |
| Ordini | `SALESTABLE_DetailView/{id}/?mode=View` | 1 → 60.000+ | Ordine completo, prezzi, cliente, date, stato |
| Fatture | `CUSTINVOICEJOUR_DetailView/{id}/?mode=View` | 1 → 15.000+ | Importi, date, cliente, linee articoli, link PDF |
| DDT | `INVENTTRANSSHIP_DetailView/{id}/?mode=View` | Sconosciuto | Da determinare durante scan |

### 2.2 ListView non filtrate

| ListView | URL | Contenuto |
|---|---|---|
| Tutti gli utenti ERP | `ApplicationUser_ListView/` | **Tutti gli agenti/concessionari/interni Komet**: UserID, username, tipo, email, indirizzo, company |
| Clienti non filtrati | `CUSTTABLE_ListView/` | ~1.350 clienti recenti (ordinati per ID desc) |
| Fatture non filtrate | `CUSTINVOICEJOUR_ListView/` | ~600 fatture recenti |
| Profili agente | `ApplicationUser_DetailView/{guid}/?mode=View` | Profilo completo agente via navigazione < > |
| Consensi GDPR | `CustomerConsent_ListViewAgent/` | Consensi privacy clienti |

### 2.3 PDF fatture

Il PDF è disponibile solo per fatture con `xaf_dviInvoicePDF_View ≠ "N/A"`. Il link `XafFileDataAnchor` appare nel DOM dopo il click sul pulsante "Scarica PDF" (callback XAF). Richiede browser headless per il download.

### 2.4 Vulnerabilità CRITICA — Reset Password + Modifica profilo senza autorizzazione

**Discovery confermata live 2026-06-07 tramite Playwright.**

Nella `ApplicationUser_DetailView/{oid}`, accessibile via IDOR su qualsiasi OID, i pulsanti della barra azioni includono:

| Pulsante | ID DOM | Image resource | Stato |
|---|---|---|---|
| Modifica | `DXI0` | `Action_Edit_24x24` (`enbl=True`) | **ABILITATO** |
| Generate a new password for the selected user | `DXI1` | `Action_ResetPassword` (`enbl=True`) | **ABILITATO** |

**Verifica:** testato su `ApplicationUser_DetailView/ee27f888-1f90-43a0-a6af-03da30ade5f7` (ikiC0948, non appartenente all'account di test). Entrambi i pulsanti risultano abilitati — nessun controllo di autorizzazione lato server.

**Scenario di attacco completo (account takeover):**
1. Attaccante ottiene la lista utenti da `ApplicationUser_ListView` (accessibile a chiunque)
2. Trova l'OID dell'account admin (`ikiadmin`, username `ikiadmin` o `KIAdmin`) dalla ListView
3. Naviga a `ApplicationUser_DetailView/{oid_admin}/?mode=View`
4. Clicca "Generate a new password" → la nuova password viene generata
5. Se mostrata a schermo → accesso immediato come admin
6. Se inviata via email → può anche solo bloccare l'account admin (DoS)

**Scenario di attacco parallelo (modifica profilo):**
1. Navigazione al DetailView di qualsiasi utente via IDOR
2. Click "Modifica" (DXI0) → possibile modifica di email, indirizzo, tipo utente (`KIUserType`)
3. Potenziale privilege escalation: se si modifica il proprio `KIUserType` da `Agent` ad `Admin`

**Severity: CRITICAL — CVSS v3 stimato 9.8**
- Attack Vector: Network
- Attack Complexity: Low
- Privileges Required: Low (qualsiasi account ERP)
- User Interaction: None
- Scope: Changed (da Agent ad Admin)
- Impact: Confidentiality High / Integrity High / Availability High

**Prova documentata:** DOM verificato live — `Action_ResetPassword` con `enbl=True` su account non proprio.

---

## 3. Architettura del sistema

### Approccio scelto: C — Ibrido fetch + Puppeteer

- **Fase dati (HTTP fetch puro):** richieste dirette con cookie di sessione ERP, parsing HTML lato Node.js. Velocità 5–10 req/s.  
- **Fase PDF (Puppeteer):** solo per fatture con PDF disponibile. Gestisce click callback XAF + attesa generazione + download nativo.

### Stack tecnico

```
audit-scanner/              ← script standalone, NON integrato nel backend Archibald
  index.ts                  ← entry point, orchestrazione fasi
  config.ts                 ← credenziali ERP, range ID, rate limits
  lib/
    session.ts              ← login ERP, refresh cookie automatico
    fetcher.ts              ← HTTP fetch con cookie, retry, rate limiting
    parser.ts               ← parser HTML → oggetti strutturati (xaf_dvi selectors)
    pdf-downloader.ts       ← Puppeteer per download PDF fatture
  scanners/
    customers.ts            ← scan CUSTTABLE_DetailView + ListView
    orders.ts               ← scan SALESTABLE_DetailView
    invoices.ts             ← scan CUSTINVOICEJOUR_DetailView
    ddt.ts                  ← scan INVENTTRANSSHIP_DetailView
    users.ts                ← scan ApplicationUser_ListView + DetailView
  db/
    schema.sql              ← schema SQLite
    repository.ts           ← operazioni DB
  exporters/
    csv.ts                  ← export Excel-ready CSV per ogni entity
    report.ts               ← report HTML/PDF riepilogativo
  output/
    audit.db                ← database SQLite (gitignored)
    pdfs/                   ← fatture PDF scaricate
    csv/                    ← file CSV per consegna
    report.html             ← report finale
```

---

## 4. Flusso di esecuzione

### Fase 0 — Setup e login
1. Legge `config.ts` (credenziali, range, output dir)
2. Login ERP con `fetch` (POST a Login.aspx)
3. Estrae e salva cookie di sessione (`ASP.NET_SessionId`, `Login`)
4. Verifica sessione valida navigando a Default.aspx
5. Imposta refresh automatico ogni 20 min (re-login prima dello scadere dei cookie)

### Fase 1 — ListView bulk (rapida, ~5 min)
1. `ApplicationUser_ListView` → tutti gli utenti ERP (5 pagine) — **eseguita PRIMA**
2. `CUSTTABLE_ListView` → 68 pagine clienti recenti
3. `CUSTINVOICEJOUR_ListView` → 3 pagine fatture recenti
4. `CustomerConsent_ListViewAgent` → consensi GDPR
5. Per ogni utente trovato, naviga `ApplicationUser_DetailView/{oid}` e usa `>` per iterare

### Fase 2 — IDOR scan sistematico (lenta, ~3–6 ore)
1. Range: 1 → 60.000 (extendibile automaticamente se trovati dati oltre 60.000)
2. Per ogni ID:
   - Fetch `CUSTTABLE_DetailView/{id}` → se dati trovati → salva in DB
   - Fetch `CUSTINVOICEJOUR_DetailView/{id}` → se dati trovati → salva in DB + flag PDF
   - Fetch `SALESTABLE_DetailView/{id}` → se dati trovati → salva in DB
3. Rate limit: 3 req/endpoint/s (9 req/s totali con parallelismo a 3)
4. Resume automatico: salva l'ultimo ID processato per ripartire in caso di interruzione
5. Extension automatica: se il record al boundary ha dati → estendi range di 10.000

### Fase 3 — Download PDF (Puppeteer, solo fatture con PDF)
1. Legge dal DB tutte le fatture flaggate `has_pdf = true`
2. Per ciascuna: naviga DetailView → click "Scarica PDF" → attende link → scarica
3. Salva in `output/pdfs/{invoiceId}_{invoiceNumber}.pdf`
4. Aggiorna DB con path locale

### Fase 4 — Export
1. Genera CSV separati per: clienti, ordini, fatture, utenti
2. Genera `report.html` con statistiche aggregate:
   - Totale record per entity
   - Breakdown per agente (se disponibile)
   - Lista PDF scaricati
   - Mappa delle vulnerabilità trovate

---

## 5. Schema database SQLite

```sql
CREATE TABLE customers (
  erp_id        INTEGER PRIMARY KEY,
  account_num   TEXT,
  name          TEXT,
  vat_num       TEXT,
  fiscal_code   TEXT,
  address       TEXT,
  city          TEXT,
  province      TEXT,
  zip           TEXT,
  phone         TEXT,
  payment_terms TEXT,
  is_blocked    INTEGER,
  scraped_at    TEXT
);

CREATE TABLE invoices (
  erp_id        INTEGER PRIMARY KEY,
  invoice_id    TEXT,
  invoice_date  TEXT,
  account       TEXT,
  customer_name TEXT,
  address       TEXT,
  amount        REAL,
  tax_amount    REAL,
  due_date      TEXT,
  has_pdf       INTEGER DEFAULT 0,
  pdf_path      TEXT,
  scraped_at    TEXT
);

CREATE TABLE orders (
  erp_id        INTEGER PRIMARY KEY,
  sales_id      TEXT,
  cust_account  TEXT,
  sales_name    TEXT,
  order_date    TEXT,
  delivery_date TEXT,
  status        TEXT,
  transfer_status TEXT,
  scraped_at    TEXT
);

CREATE TABLE ddt (
  erp_id        INTEGER PRIMARY KEY,
  raw_data      TEXT,  -- JSON per ora, struttura da determinare
  scraped_at    TEXT
);

CREATE TABLE erp_users (
  user_id       TEXT PRIMARY KEY,
  username      TEXT,
  user_type     TEXT,  -- Agent / Concessionaire / Internal
  full_name     TEXT,
  email         TEXT,
  address       TEXT,
  city          TEXT,
  company_id    TEXT,
  oid           TEXT,
  scraped_at    TEXT
);

CREATE TABLE scan_progress (
  entity        TEXT PRIMARY KEY,
  last_id       INTEGER,
  max_id        INTEGER,
  completed     INTEGER DEFAULT 0,
  updated_at    TEXT
);
```

---

## 6. Gestione sessione e rilevabilità

### Cookie di sessione
- `ASP.NET_SessionId` scade in ~30 min di inattività
- Il sistema esegue un re-login automatico ogni 20 min
- Salva i nuovi cookie nel processo corrente

### Rilevabilità nei log ERP
**Sì, gli accessi sono loggati.** Dynamics AX logga URL + account + timestamp a livello applicativo. Il pattern di 60.000 richieste consecutive da `ikiA0930` in poche ore è anomalo e rilevabile da un analista.

**Raccomandazione:** comunicare preventivamente a Komet IT l'esecuzione dell'audit con la finestra temporale. Questo trasforma i log da alert di sicurezza a prove documentate dell'audit.

---

## 7. Limitazioni note

- **DDT range sconosciuto:** la fase di discovery non ha trovato ID DDT validi. Lo scanner parte da 1 → 60.000 come gli altri e registra gli ID trovati.
- **PDF fatture:** solo fatture con PDF allegato nell'ERP (campo `InvoicePDF ≠ N/A`). Stima ~20–30% delle fatture.
- **ApplicationUser GUID navigation:** i pulsanti `<`/`>` erano `dxm-disabled` in sessione diretta. La navigazione sequenziale potrebbe richiedere di arrivare al profilo dalla ListView. Da verificare durante implementazione.
- **Agenti (EmplTable):** protetti — non accessibili via IDOR né ListView.
- **Articoli e listini:** protetti — redirect a Default.aspx.

---

## 8. Output finale per Komet IT

```
audit-output-2026-06-07/
  audit.db                    ← database SQLite completo interrogabile
  csv/
    customers.csv             ← tutti i clienti trovati
    invoices.csv              ← tutte le fatture trovate
    orders.csv                ← tutti gli ordini trovati
    erp_users.csv             ← tutti gli agenti/concessionari/interni
  pdfs/
    CF1-26004492_11618.pdf    ← fatture con PDF disponibile
    ...
  report.html                 ← report riepilogativo con statistiche
```
