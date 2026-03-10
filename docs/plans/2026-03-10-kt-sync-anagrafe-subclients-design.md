# KT Sync + ANAGRAFE Bidirezionale + Tab Sottoclienti — Design

## Obiettivo

Estendere il sistema Arca Sync per:
1. Inserire ordini dalla pagina `/orders` in ArcaPro come documenti `TIPODOC="KT"`
2. Sincronizzare bidirezionalmente l'anagrafica clienti (ANAGRAFE.DBF ↔ `agents.sub_clients`)
3. Aggiungere una tab "Sottoclienti" nella pagina `/fresis-history`

## Architettura

```
ANAGRAFE.DBF ←→ agents.sub_clients
                        ↓ (lookup CODICECF via matching)
order_records + order_articles → generateArcaDataFromOrder() → ArcaData TIPODOC="KT"
fresis_history (source='app') → generateArcaData() → ArcaData TIPODOC="FT"
                                        ↓
                        performArcaSync() → VBS unico (FT + KT)
                                        ↓
                        EXECSCRIPT → doctes + docrig + SCADENZE
```

Due punti di ingresso per il sync:
- `/fresis-history` — "Sync Arca" include FT + tutti i KT non sincronizzati
- `/orders` — long-press + "Sync KT con Arca" → picker COOP16 → VBS immediato

---

## Fase 1 — Database

### Nuova tabella `agents.sub_clients`

```sql
CREATE TABLE agents.sub_clients (
  codicecf        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  ragione_soc     TEXT,
  suppl_rag_soc   TEXT,
  indirizzo       TEXT,
  cap             TEXT,
  localita        TEXT,
  provincia       TEXT,
  cod_nazione     TEXT DEFAULT 'IT',
  partita_iva     TEXT,
  codice_fisc     TEXT,
  telefono        TEXT,
  fax             TEXT,
  email           TEXT,
  zona            TEXT,
  agente          TEXT,
  pag             TEXT,
  listino         TEXT,
  banca           TEXT,
  matched_customer_profile_id TEXT,
  match_confidence            TEXT,  -- 'vat' | 'multi-field' | 'manual' | null
  arca_synced_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (codicecf, user_id)
);
```

### Nuova colonna su `order_records`

```sql
ALTER TABLE agents.order_records ADD COLUMN arca_kt_synced_at TIMESTAMPTZ;
```

### Contatore condiviso

La tabella `agents.ft_counter` resta invariata. La funzione `getNextFtNumber` viene rinominata
`getNextDocNumber` (con alias retrocompatibile). Sia FT che KT incrementano lo stesso contatore
per esercizio.

---

## Fase 2 — Sync bidirezionale ANAGRAFE

### Import (Arca → PWA)

Durante il sync Arca, `ANAGRAFE.DBF` è già uploadata dal browser:

1. Parsare tutti i record ANAGRAFE con tutti i campi rilevanti
2. Upsert in `agents.sub_clients` con `ON CONFLICT (codicecf, user_id) DO UPDATE`
3. Aggiornare `arca_synced_at` ad ogni sync

### Matching automatico con clienti Archibald

Dopo l'upsert, per ogni sub_client con `matched_customer_profile_id IS NULL`:

1. **Match per P.IVA**: cerca in `agents.customers` un cliente con stessa partita IVA
   → `match_confidence = 'vat'`
2. **Match multi-campo**: se P.IVA non trova match, calcola punteggio su: nome (fuzzy),
   telefono, indirizzo → se score ≥ soglia → `match_confidence = 'multi-field'`

### Export (PWA → Arca)

Se un sottocliente viene creato o modificato nella PWA e non esiste in ANAGRAFE.DBF:

1. Il VBS include INSERT in ANAGRAFE (EXECSCRIPT + row buffering)
2. Solo sottoclienti con `arca_synced_at IS NULL` (nuovi) o `updated_at > arca_synced_at` (modificati)
3. CODICECF per nuovi clienti: prossimo codice disponibile (pattern `C` + 5 cifre)

### Match manuale dalla UI

Nella tab Sottoclienti, per ogni sottocliente non matchato:
- Icona "link" → dropdown di ricerca tra i clienti Archibald
- Selezione → `match_confidence = 'manual'`
- Bottone "Scollega" per rimuovere un match errato

---

## Fase 3 — Generazione KT da ordini

### `generateArcaDataFromOrder()`

Riceve `order_record` + `order_articles[]` + `sub_client`, produce `ArcaData` con `TIPODOC="KT"`.

#### Mappatura testata

| Campo Arca | Sorgente |
|-----------|----------|
| TIPODOC | `"KT"` |
| CODICECF | `sub_client.codicecf` |
| DATADOC | `order.creation_date` |
| NUMERODOC | `getNextDocNumber(esercizio)` |
| ESERCIZIO/ESANNO | anno da `creation_date` |
| SCONTI/SCONTIF | da `order.discount_percent` |
| TOTMERCE/TOTNETTO/TOTIVA/TOTDOC | calcolati dalle righe |
| ZONA | `sub_client.zona` |
| PAG | `sub_client.pag` (default "0001") |
| NOTE | `order.remaining_sales_financial` |
| CODCNT | `"001"` |
| CODCAUMAG | `"99"` |
| MAGPARTENZ/MAGARRIVO | `"00001"` |
| LISTINO | `sub_client.listino` (default "1") |
| TIPOMODULO | `"F"` |
| EUROCAMBIO | `1` |

#### Mappatura righe

| Campo Arca | Sorgente |
|-----------|----------|
| CODICEARTI | `article_code` |
| DESCRIZION | `article_description` |
| QUANTITA/QUANTITARE | `quantity` |
| PREZZOUN | `unit_price` |
| PREZZOTOT/PREZZOTOTM | `line_amount` |
| ALIIVA | `vat_percent` (stringa) |
| SCONTI | `discount_percent` (se > 0) |
| CONTOSCARI | `"01"` |
| FATT | `1` |
| CODCAUMAG | `"99"` |
| MAGPARTENZ/MAGARRIVO | `"00001"` |
| GRUPPO | `"00001"` |

### Gestione casi limite

**Ordini senza `order_articles`:** il sistema triggera automaticamente `sync-order-articles` per
quegli ordini, attende il completamento, poi riprova la generazione KT. Se fallisce, salta con warning.

**Ordini senza match CODICECF:**
- Da `/orders` (manuale): dialog inline "Seleziona il sottocliente per [cliente X]" con dropdown ricerca
- Da `/fresis-history` (automatico): riepilogo ordini non matchati con match inline prima di procedere

---

## Fase 4 — Due modalità sync KT

### Modalità A — Da /fresis-history (insieme alle FT)

1. Utente clicca "Sync Arca"
2. Backend `performArcaSync()` esteso:
   - Query KT-eligible: `sent_to_verona_at >= '2026-03-09' AND arca_kt_synced_at IS NULL
     AND customer_name != 'Fresis Soc Cooperativa'`
   - Trigger sync articoli per ordini senza `order_articles`
   - Ritorna lista ordini non matchati al frontend
3. Frontend: riepilogo "3 FT + 5 KT pronti. 2 ordini richiedono match:" → dialog match inline
4. Rigenera VBS con FT + KT + SCADENZE
5. Scrive nella cartella COOP16, watcher esegue
6. Aggiorna `arca_kt_synced_at` sugli ordini sincronizzati

### Modalità B — Da /orders (selezione manuale)

1. Long-press su scheda ordine → modalità selezione (come stacking)
2. Barra azioni: "Crea pila" (esistente) + **"Sync KT con Arca"**
3. Click "Sync KT con Arca":
   - Trigger sync articoli se mancanti
   - Dialog match CODICECF se necessario
   - Apre picker cartella COOP16 (File System Access API)
   - Genera e scrive VBS solo per ordini selezionati
   - Aggiorna `arca_kt_synced_at`
4. Badge "KT" sulle schede ordine già sincronizzate

---

## Fase 5 — Tab Sottoclienti in /fresis-history

### Struttura pagina

`/fresis-history` passa da vista singola a 2 tab:
- **"Documenti"** (default) — contenuto attuale invariato
- **"Sottoclienti"** — nuova, stile identico a `/customers`

### Tab Sottoclienti

**Barra ricerca:** input di testo con ricerca debounce fulltext su TUTTI i campi della tabella
sub_clients (ragione sociale, P.IVA, codice fiscale, indirizzo, CAP, località, provincia,
telefono, fax, email, zona, codice Arca, agente, pagamento, listino, banca, etc.)

**Lista cards** (`SubClientCard`):
- Nome (ragione sociale), codice Arca, P.IVA
- Indirizzo, località, provincia
- Zona, telefono
- Badge match: "P.IVA" (verde), "Multi-campo" (giallo), "Manuale" (blu), "Non matchato" (rosso)
- Bottone link/unlink per match manuale

**Detail modal:**
- Tutti i campi ANAGRAFE
- Storico ordini del sottocliente
- Link al cliente Archibald matchato

**Azioni:**
- Crea nuovo sottocliente
- Modifica sottocliente
- Match manuale (link/unlink)

---

## Note tecniche

### KT strutturalmente identico a FT
Confermato dall'analisi dei 4 KT reali in ArcaPro 2026: stessi campi, stessi valori, stessi codici.
Unica differenza: `TIPODOC="KT"` in doctes/docrig e `TIPOMOD="KT"` in SCADENZE.

### SCADENZE per KT
Stessa struttura delle FT: 1 scadenza per documento, `IMPEFF=TOTDOC`, `IMPONIBILE=TOTNETTO`,
`DATASCAD = fine mese dopo data+30gg`, `TRANSIT=.T.`, `TIPO="A"`.

### Numeratore condiviso
FT e KT condividono lo stesso contatore per esercizio. Esempio: FT 200 → KT 201 → FT 202.
Il contatore viene aggiornato anche durante l'import Arca→PWA con `GREATEST(last_number, maxFromDBF)`
per entrambi i TIPODOC.

### Cutoff data
Solo ordini con `sent_to_verona_at >= '2026-03-09'`. Ordini precedenti non vengono toccati.

### Esclusione Fresis
Ordini con `customer_name = 'Fresis Soc Cooperativa'` sono esclusi dal KT sync (gestiti come FT
dallo storico Fresis).
