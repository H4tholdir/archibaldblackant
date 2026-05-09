# Piano Integrità Dati ERP↔PWA — Esecuzione Prossima Sessione

> **Obiettivo**: Integrità 100% di tutti i dati ERP→DB. Zero esclusioni, zero approssimazioni.
> **Metodo**: Subagent-driven-development con verifica Playwright diretta su ERP prod.
> **Partire da**: questo documento + `memory/project_data_integrity_plan.md`

---

## Contesto Tecnico Essenziale

### Stack
- ERP: `https://4.231.124.90/Archibald/` (DevExpress XAF, autenticazione ikiA0930/Fresis26@)
- VPS: `formicanera.com` (91.98.136.198), SSH key in `VPS-ACCESS-CREDENTIALS.md`
- DB: PostgreSQL in Docker, schema `agents.*` e `shared.*`
- Scraper: Puppeteer v22 + `scrapeListView()` con DOM extraction
- Verifica: Playwright Python scripts

### Principi di Audit
1. **Filtro sempre "Tutti/All"** — rilevato dinamicamente via `ctrl.GetValue()`, mai hardcoded
2. **Page size 200** — via `ASPx.POnPageSizeBlur()` o API grid
3. **IDs ERP** = interi italiani con `.` come migliaia separator (`1.317`=1317, `54.416`=54416)
4. **Date** = formato italiano DD/MM/YYYY → già fixato nel parser
5. **Confronto**: ogni ERP ID deve esistere nel DB, campo per campo

---

## Bug Critici da Fixare (in ordine di priorità)

### BUG-1 [CRITICO] — ID ERP come decimali (trailing zeros persi)

**Problema**: `parseNumber('1.610')` = `1.61`, `String(1.61)` = `'1.61'` ≠ `'1.610'`
- File: `archibald-web-app/backend/src/sync/scraper/configs/orders.ts` riga 11
- Anche: `customers.ts`, `ddt.ts`, `invoices.ts`, `prices.ts`
- **80 ordini** hanno questo problema (IDs tipo 1.610, 10.880, 10.890...)

**Fix**:
```typescript
// In ogni config scraper, per il campo ID:
parser: (raw) => {
  // ERP IDs usano . come migliaia IT: 1.317=1317, 54.416=54416
  const cleaned = raw.trim().replace(/\./g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? raw.trim() : String(num);
}
```

**Migration DB richiesta**: aggiornare gli ID esistenti (da `'1.317'`→`'1317'`, etc.)
```sql
-- Per ogni tabella con id ERP:
UPDATE agents.order_records SET id = regexp_replace(id, '\.', '', 'g')::bigint::text WHERE id ~ '\.';
```

**Attenzione**: il cambio ID modifica la chiave primaria. Testare prima su copia.

---

### BUG-2 [CRITICO] — DDT: URL sbagliata, dati fermi al 2023

**Situazione attuale**:
- URL configurata: `CUSTPACKINGSLIPJOUR_ListView/` → 864 DDT, TUTTI del 2023 (Fresis storico)
- DB: 25 DDT dal 2023
- DDT 2024-2026 non accessibili da questa URL

**Task per Explore Agent**:
1. Navigare ERP con Playwright, menu principale
2. Trovare la voce che mostra DDT degli ordini RECENTI (2026)
3. Testare `WMSPACKINGSLIP_ListView_Agent/` (attualmente mostra 0 ma potrebbe avere filtro attivo)
4. Testare alternative come `CUSTPACKINGSLIP_ListView_Agent/` o simili
5. Una volta trovata la URL corretta, verificare il link ordine (campo SALESID)

**Comandi Playwright da usare**:
```python
# Naviga il menu laterale e cerca voci DDT
menu_items = page.evaluate("()=>Array.from(document.querySelectorAll('[id*=\"mainMenu\"] a, [id*=\"navBar\"] a')).map(a=>({text:a.innerText.trim(),href:a.href}))")
```

---

### BUG-3 [CRITICO] — Fatture: 2 record su 306

**Situazione attuale**:
- URL: `CUSTINVOICEJOUR_ListView/` → 306 fatture dal 2026
- DB: 2 fatture dal 2023
- `syncInvoice` cerca ordine per `order_number` ma il campo SALESID nelle fatture usa formato diverso

**Task**:
1. Navigare ERP invoice page
2. Identificare esattamente il campo che linka alla fattura all'ordine (SALESID? CUSTINVOICETRANS.SALESID?)
3. Verificare quale valore ha questo campo per una fattura nota (es. CF1/26000881)
4. Controllare se quel valore corrisponde a `agents.order_records.order_number`
5. Fix nel codice `syncInvoice` (o nel config scraper aggiungendo il campo corretto)

---

### BUG-4 [MEDIO] — Ordini: 850 ERP vs 1026 DB

**Ipotesi**: 
- 176 ordini in DB non più visibili in ERP (eliminati/archiviati)
- Oppure la vista ERP ha un filtro data implicito che esclude ordini molto vecchi

**Task**:
1. Trovare i 176 IDs "extra" in DB non presenti in ERP
2. Verificare se esistono nell'ERP cercandoli per order_number
3. Implementare soft-delete: `deleted_at = NOW()` per ordini non più in ERP
4. Non eliminare hard dal DB (storico prezioso)

---

### BUG-5 [BASSO] — Customer lastOrderDate formato testo

**Fix semplice**: verificare perché `parseDate` non viene applicato nel sync-customers.
File: `archibald-web-app/backend/src/sync/scraper/configs/customers.ts`
Verifica che il campo `LASTORDERDATE` con `parser: parseDate` venga effettivamente applicato nella `buildRowExtractor`.

---

## Script di Verifica (da usare PRIMA e DOPO ogni fix)

### Script Playwright di Audit (da eseguire localmente)

```bash
# Prima di ogni fix
python3 /tmp/orders_exact_audit.py    # Confronto ID per ID ordini
python3 /tmp/full_integrity_check.py  # Check completo tutti i tipi

# Dopo ogni fix (attendi sync ~5min poi ri-esegui)
python3 /tmp/orders_exact_audit.py
```

Gli script sono in `/tmp/` — ricrearli se la sessione è nuova (codice è nei messaggi precedenti).

### Script DB (da eseguire su VPS)

```bash
# Conteggio per tipo
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose ... psql ... -c 'SELECT COUNT(*) FROM agents.order_records;'"

# Verifica ID trailing zeros  
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose ... psql ... -c \"SELECT id FROM agents.order_records WHERE id ~ '0$' LIMIT 20;\""
```

---

## Piano di Esecuzione con Subagents

### Task 1: Fix ID Parser (BUG-1)
```
Subagent: general-purpose (implementer)
Files: src/sync/scraper/configs/{orders,customers,ddt,invoices,prices}.ts
       src/db/migrations/085-normalize-erp-ids.sql
Reviewer: feature-dev:code-reviewer
Verifica: Playwright audit PRIMA e DOPO
```

### Task 2: Audit DDT (BUG-2)  
```
Subagent: Explore (navigazione ERP via Playwright)
Output: URL corretta + struttura colonne DDT
Poi: general-purpose per fixare config + sync
```

### Task 3: Fix Fatture (BUG-3)
```
Subagent: Explore (analisi struttura fatture ERP)
Output: campo SALESID/link ordine
Poi: general-purpose per fix syncInvoice
```

### Task 4: Verifica Finale
```
Subagent: general-purpose con Playwright
Esegui audit su TUTTI i tipi
Output: report JSON con count ERP vs DB per ogni tipo
Target: 0 mancanti, 0 campi errati
```

---

## Ultimo Commit in Prod
`9e1a17c3` — fix(sync): ON CONFLICT su id ERP invece di order_number
Migration: `084-order-id-unique-index.sql`

## Script per Aprire Nuova Sessione
```
Messaggio iniziale: "Procedi con il Piano Integrità Dati ERP↔PWA dalla memoria project_data_integrity_plan.md. 
Parti da BUG-1 (ID trailing zeros), poi BUG-2 (DDT), poi BUG-3 (Fatture). 
Usa subagent-driven-development. Verifica ogni fix con Playwright diretto sull'ERP."
```
