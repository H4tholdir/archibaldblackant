# ERP Post-Update Discovery & Sync — Design Spec
**Data**: 2026-05-10  
**Trigger**: Aggiornamento ERP Germania senza changelog (notte 2026-05-09/10)  
**Autore**: Francesco Formicola  

---

## Contesto

L'ERP Archibald è stato aggiornato dalla Germania senza rilascio di changelog o note ufficiali. Sono stati identificati almeno due cambiamenti sulla CUSTTABLE DetailView:

1. **Nuovo campo** nel tab Principale: `NUMERO MECCANOGRAFICO (FNOMCEO)`
2. **Nuovo tab**: "Altre informazioni" con 6 sezioni di dati storici/CRM/geo

L'obiettivo è:
- Fare una discovery completa di tutte le pagine ERP per mappare tutti i cambiamenti
- Produrre un JSON snapshot datato (baseline per diff futuri)
- Aggiornare la Bibbia ERP
- Sincronizzare i nuovi dati nel DB e renderli disponibili nella PWA

---

## Phase 1 — ERP Discovery

### 1.1 Metodologia

**Approccio**: esplorazione live via Playwright MCP in sessione + script autonomo per JSON snapshot finale.

**Cliente di test**: ID `55258` — Lab. D.B.S. Snc Di Maurizio Battipaglia E Angelo Sessa  
**URL ERP**: sempre via proxy `https://formicanera.com/Archibald/` (mai IP diretto)

**Per ogni pagina**:
1. Screenshot iniziale (visual record)
2. Dump tab presenti e loro nomi
3. Dump campi visibili: label, campo ERP, selettore DOM, tipo HTML, valore esempio
4. Per ListView: colonne visibili + analisi Column Chooser (colonne nascoste)
5. Test scrapabilità colonne nascoste (DOM vs XHR response)
6. Diff mentale con Bibbia 2026-03-29 → nota immediata differenze
7. Aggiornamento Bibbia ERP prima di passare alla pagina successiva

### 1.2 Perimetro e ordine

| # | Pagina | Tipo | Note |
|---|--------|------|------|
| 1 | Login page | Auth | Verifica funzionamento, eventuali nuovi campi |
| 2 | CUSTTABLE ListView | ListView | Column Chooser obbligatorio — colonne nuove nascoste |
| 3 | CUSTTABLE DetailView — Tab Principale | DetailView | FNOMCEO + verifica tutti i campi esistenti |
| 4 | CUSTTABLE DetailView — Tab Altre informazioni | DetailView | **NUOVO** — catalogo completo campi + selettori |
| 5 | CUSTTABLE DetailView — Tab Orari di consegna | DetailView | Verifica invarianza |
| 6 | CUSTTABLE DetailView — Tab Info CRM | DetailView | Verifica invarianza |
| 7 | CUSTTABLE DetailView — Tab Prezzi e sconti | DetailView | Verifica invarianza |
| 8 | SALESTABLE ListView | ListView | Column Chooser + verifica colonne |
| 9 | SALESTABLE DetailView | DetailView | Verifica tutti i tab + eventuali nuovi |
| 10 | CUSTPACKINGSLIPJOUR (DDT) ListView | ListView | Column Chooser + verifica |
| 11 | CUSTPACKINGSLIPJOUR DetailView | DetailView | Verifica |
| 12 | CUSTINVOICEJOUR (Fatture) ListView | ListView | Column Chooser + verifica |
| 13 | CUSTINVOICEJOUR DetailView | DetailView | Verifica |
| 14 | INVENTTABLE (Prodotti) ListView | ListView | Column Chooser + verifica |
| 15 | INVENTTABLE DetailView | DetailView | Verifica |
| 16 | PRICEDISCTABLE (Prezzi) ListView | ListView | Verifica |
| 17 | Line Discounts ListView | ListView | Verifica |

### 1.3 Column Chooser — Strategia a 3 livelli

**Livello 1 — Inventario**: aprire Column Chooser programmaticamente per enumerare TUTTE le colonne (visibili + nascoste) su ogni ListView.

**Livello 2 — Test scrapabilità senza abilitazione**: DevExpress XAF carica spesso i dati di tutte le colonne nel DOM / nelle response XHR anche se la colonna è nascosta nell'UI. Per ogni colonna nascosta verificare se il valore è nel DOM o nella response senza dover abilitare la colonna (che cambierebbe layout sessione agenti).

**Livello 3 — Classificazione**: ogni colonna nascosta viene classificata:
- `scrapable_without_chooser`: leggibile dal DOM senza abilitazione
- `requires_chooser`: richiede abilitazione Column Chooser (impatto sessione)
- `xhr_only`: disponibile solo via endpoint XHR separato

**Output per ListView**:
```json
{
  "entity": "CUSTTABLE",
  "visibleColumns": [...],
  "hiddenColumns": [...],
  "scrapableWithoutChooser": [...],
  "requiresChooser": [],
  "xhrOnly": []
}
```

**Nota VATVALIDE**: verificare se `VATVALIDE` (IVA Validata Sì/No) è disponibile come colonna nascosta nella CUSTTABLE ListView — se sì, integrarlo gratis nel sync normale senza Column Chooser.

---

## Phase 1 — Output Artifacts

### 1.4 JSON Snapshot

**File**: `docs/diagnostics/erp-full-autopsy-2026-05-10.json`

Struttura:
```json
{
  "snapshot_date": "2026-05-10",
  "erp_version_note": "post-update-germany-2026-05-10-no-changelog",
  "pages": {
    "CUSTTABLE_ListView": {
      "url_pattern": "/Archibald/CUSTTABLE_ListView_Agent/",
      "grid_suffix": "",
      "system_cell_offset": 0,
      "visible_columns": [
        {
          "erp_field": "",
          "label_it": "",
          "nth_child": 0,
          "type": "",
          "example_value": "",
          "is_new": false,
          "is_changed": false
        }
      ],
      "hidden_columns": [],
      "filters": [],
      "page_size_confirmed": 200
    },
    "CUSTTABLE_DetailView": {
      "tabs": [],
      "tab_Principale": {
        "fields": [
          {
            "erp_field": "",
            "label_it": "",
            "selector": "",
            "html_type": "",
            "example_value": "",
            "readonly": false,
            "is_new": false,
            "is_changed": false
          }
        ]
      },
      "tab_AltreInformazioni": {
        "is_new": true,
        "sections": {}
      }
    }
  }
}
```

I flag `is_new` e `is_changed` permettono diff automatico con autopsy 2026-03-29.

**Script autonomo**: `scripts/erp-autopsy-2026-05-10.mjs` — da eseguire su VPS via Docker, riproducibile per snapshot futuri.

### 1.5 Aggiornamento Bibbia ERP

Tre file di memoria aggiornati **in tempo reale** durante la discovery (non alla fine):

| File | Aggiornamenti |
|------|--------------|
| `memory/erp-bible.md` | Struttura per-pagina: tab, offset colonne, filtri, note critiche, data aggiornamento |
| `memory/erp-entities-field-map.md` | Mappa campi completa per ogni entità: ListView + tutti i tab DetailView |
| `memory/erp-customer-form-fields.md` | 31+N campi CUSTTABLE, nuova tab "Altre informazioni" con selettori certificati |

**Strategia**: ogni file viene aggiornato subito dopo l'esplorazione della pagina corrispondente — così se la sessione si interrompe, la documentazione è sempre in uno stato coerente.

---

## Phase 2 — Feature: Sync Nuovi Campi + PWA

> **Prerequisito**: Phase 1 completata. I selettori esatti e i nomi campo ERP vengono determinati durante la discovery.

### 2.1 DB Migration 091

Nuove colonne in `agents.customers`.

**Nota**: le sezioni Vendite + Ordini di "Altre informazioni" espongono dati **già presenti** nel DB dalla ListView:
- `customer_type` ← SALESACT (anno corrente, naming confuso ma esistente)
- `actual_sales` ← mai popolato dal sync (sempre 0), sarà allineato nella Phase 2
- `previous_sales_1/2` ← SALESPREV/SALESPREV2
- `actual_order_count`, `previous_order_count_1/2` ← ORDERCOUNTACT/PREV/PREV2
- `last_order_date` ← LASTORDERDATE

Migration 091 aggiunge solo i campi **genuinamente nuovi**:

```sql
-- Tab Principale (nuovo campo)
fnomceo                     TEXT,                   -- NUMERO MECCANOGRAFICO (FNOMCEO)

-- Altre informazioni — Esclusività (NUOVO, business-critical Komet)
exclusivity_preview         BOOLEAN,
exclusivity_end_date        DATE,
exclusivity_sales_forecast  NUMERIC(12,2),
exclusivity_sales_actual    NUMERIC(12,2),
exclusivity_active          BOOLEAN,

-- Altre informazioni — Rubrica / CRM (NUOVO)
crm_ref_id                  TEXT,
crm_old_ref_id              TEXT,
crm_account_commercial      TEXT,
crm_contact_type            TEXT,                   -- "Potential" | altri valori da scoprire

-- Altre informazioni — Campi sistema (NUOVO)
erp_created_at              DATE,
erp_created_by              TEXT,
erp_modified_at             DATE,
erp_modified_by             TEXT,

-- Altre informazioni — Indirizzo geografico (NUOVO)
geo_address                 TEXT,
geo_latitude                NUMERIC(10,7),
geo_longitude               NUMERIC(10,7),

-- Tracking sync
altre_info_synced_at        TIMESTAMPTZ
```

### 2.2 VATVALIDE — Auto-sync da ERP

**Problema corrente**: `vat_validated_at` viene impostato solo via operazione manuale `read-vat-status` (utente preme "Valida IVA"). Se l'ERP già dice `VATVALIDE = Sì`, la PWA non lo sa.

**Soluzione**: dipende da findings Phase 1:

**Caso A — VATVALIDE è colonna nascosta ListView** (scrapable senza Column Chooser):
- Aggiungere `{ fieldName: 'VATVALIDE', targetField: 'vatValidated' }` alla `customersConfig`
- Nel sync upsert: se `vatValidated === 'Sì'` e `vat_validated_at IS NULL` → `vat_validated_at = NOW()`
- Zero costo aggiuntivo — arriva con il sync normale

**Caso B — VATVALIDE solo in DetailView**:
- Aggiungere step dedicato `sync-customer-vat-status` nel Conductor
- Eseguito solo per clienti con `vat_validated_at IS NULL`
- Legge DetailView tab Principale → campo `VATVALIDE`
- Se `Sì` → `vat_validated_at = NOW()`

### 2.3 Sync Logic

Il sync clienti esistente (ListView scraper) viene esteso:

1. **Colonne nuove ListView** (se scrapabili senza Column Chooser): aggiunte a `customersConfig`
2. **Tab "Altre informazioni"**: nuovo step nel flusso sync DetailView — dopo il tab Principale, naviga su "Altre informazioni" e legge tutte le sezioni
3. **Campo FNOMCEO**: letto dal tab Principale (DetailView)
4. **Flag `altre_info_synced_at`**: aggiornato dopo ogni sync riuscito delle nuove sezioni

**Esclusività — priorità elevata**: i dati di esclusività (`exclusivity_active`, `exclusivity_end_date`) verranno letti e se `exclusivity_active = true` triggerano una notifica via il sistema esistente `customer_inactive`.

### 2.4 PWA — Display

Nuova sezione collassabile **"Storico & Analisi"** nella pagina dettaglio cliente, visibile solo se `altre_info_synced_at IS NOT NULL`.

**Layout**:
```
┌─ Storico & Analisi ─────────────────────────────────┐
│                                                       │
│  Vendite          Ordini                              │
│  Anno corrente    Anno corrente                       │
│  Anno precedente  Anno precedente                     │
│  2 anni fa        2 anni fa                           │
│  Ultimo ordine: [data]                                │
│                                                       │
│  [Badge ESCLUSIVITÀ ATTIVA fino al XX/XX/XXXX]        │  ← solo se active
│  Previsione: X€ | Realizzato: X€                      │
│                                                       │
│  Info CRM                                             │
│  Account: IN00050424 | Tipo: Potential                │
│  Rif-ID: -2 | Rif-ID vecchio CRM: 41.959             │
│                                                       │
│  [📍 Vedi su mappa]  ← solo se lat/lon ≠ 0           │
└───────────────────────────────────────────────────────┘
```

**Badge esclusività**: rosso se `exclusivity_end_date < oggi + 30gg`, giallo se < 90gg, verde se attiva e distante.

---

## Sequenza di Esecuzione

```
Phase 1a: Discovery live via Playwright MCP
  └─ Per ogni pagina: esplora → aggiorna Bibbia
  
Phase 1b: Script JSON snapshot autonomo
  └─ erp-autopsy-2026-05-10.mjs → erp-full-autopsy-2026-05-10.json

Phase 2a: Migration 091 (DB)
Phase 2b: Extend customersConfig (ListView nuove colonne + VATVALIDE)
Phase 2c: Sync "Altre informazioni" (DetailView step)
Phase 2d: PWA "Storico & Analisi" component
```

---

## Rischi e Note

| Rischio | Mitigazione |
|---------|-------------|
| Selettori nuovi tab non certificati | Certificare durante Phase 1 prima di scrivere codice |
| Column Chooser per-sessione altera layout agenti | Solo se necessario — preferire scrapabilità senza |
| VATVALIDE solo in DetailView = costo alto | Step dedicato solo per `vat_validated_at IS NULL` |
| Campi vendite/ordini duplicati (ListView + DetailView) | Unico campo in DB, ListView come fonte primaria, DetailView come cross-check |
| `exclusivity_end_date` può essere null | Guard in migration + null-check nel sync |
