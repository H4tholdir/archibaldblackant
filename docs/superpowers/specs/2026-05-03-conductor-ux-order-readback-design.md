# Conductor UX + Order Read-Back Design

## Ambito

Due aree di miglioramento strettamente correlate al flusso di piazzamento ordine:

1. **UX Schede Pending** — fix badge serializzazione, distinzione visiva Komet/Fresis, rimozione "In Attesa", lock ordine
2. **Order Read-Back post-piazzamento** — lettura dati da ERP DetailView dopo il salvataggio per popolare scheda ordine in `/orders` con dati autoritativi ERP

---

## Sezione 1 — UX Schede Pending (`/pending-orders`)

### 1.1 Fix badge serializzazione batch

**Problema**: quando l'agente seleziona N ordini e clicca "Invia (N)", tutte le card mostrano "In Elaborazione" invece di 1 attivo + N-1 in coda.

**Root cause**: `PendingOrdersPage.tsx` usa `result.taskIds[i] ?? result.taskIds[0]` come fallback. Se un taskId è undefined, più ordini condividono lo stesso jobId; quando arriva `JOB_STARTED` per quel jobId, tutti passano ad "active".

**Fix**: rimuovere il fallback `?? result.taskIds[0]`. Se `result.taskIds[i]` è undefined, non assegnare jobId a quell'ordine.

**Comportamento corretto post-fix**:
- 1 card: badge "In Elaborazione" (giallo), progress bar blu animata
- N card restanti: badge "In Coda #2", "In Coda #3", ecc. (grigio), barra grigia a 0%, testo "In attesa del turno..."
- Le card in coda hanno opacity leggermente ridotta per comunicare "non ancora il tuo turno"

### 1.2 Distinzione visiva Komet vs Fresis

**Regola di business**: gli ordini Fresis hanno `sub_client_name` valorizzato (Fresis acquista da Komet e rivende a sottoclienti); gli ordini diretti Komet hanno `sub_client_name = null`.

**Komet (diretto)**:
- Background: `#eff6ff` (blu pastello)
- Bordo: `#93c5fd`
- Striscia sinistra 4px: gradiente `#1565C0 → #42a5f5`
- Badge: `● Komet` sfondo `#1565C0`

**Fresis (con sottocliente)**:
- Background: `#fffbeb` (giallo pastello)
- Bordo: `#fbbf24`
- Striscia sinistra 4px: gradiente `#d97706 → #fcd34d`
- Badge: `● Fresis` sfondo `#d97706`
- Riga aggiuntiva sotto il nome cliente: `→ [sub_client_name]` in `#92400e` grassetto

**Card in coda (#N)**: sfondo e bordo in tono grigio, badge brand in `#64748b`, opacity ~0.85.

### 1.3 Rimozione tag "In Attesa"

Il badge arancione "In Attesa" viene rimosso. Lo stato di attesa è comunicato dal colore della card e dall'assenza di progress bar. Non serve un'etichetta testuale ridondante.

I soli badge testuali rimasti sono: "In Elaborazione", "In Coda #N", "🔒 Bloccato", "Errore", "Da Magazzino".

### 1.4 Lock ordine

**Scopo**: l'agente può bloccare un pending in attesa di una decisione del cliente, per evitare che venga selezionato, inviato o unito accidentalmente.

**DB**: aggiungere colonna `is_locked BOOLEAN NOT NULL DEFAULT FALSE` su `agents.pending_orders`.

**API**: endpoint `PATCH /api/pending/:id/lock` con body `{ locked: true | false }`.

**Comportamento UI**:
- Ogni card ha un pulsante 🔓/🔒 sempre visibile (non dentro ⋯ Azioni)
- Card sbloccata: pulsante 🔓, checkbox abilitato, selezionabile normalmente
- Card bloccata:
  - Pulsante 🔒 (sfondo `#fee2e2`)
  - Border dashed, opacity 0.55
  - Badge rosso "🔒 Bloccato"
  - Checkbox disabilitato (`disabled`, `cursor: not-allowed`)
  - Banner rosso in basso: "🔒 Bloccato — tocca 🔒 per sbloccare"
  - Esclusa dalla selezione "Seleziona Tutti"
  - Esclusa dal merge Fresis
- Il lock è persistito in DB → sopravvive a reload, cambio device, chiusura PWA

---

## Sezione 2 — Order Read-Back post-piazzamento

### 2.1 Obiettivo

Oggi `order_records` viene popolato immediatamente da dati PWA (spesso con campi null) e si aggiorna ~10min dopo col sync ERP. Con il nuovo sistema, dopo che il bot ha salvato l'ordine su ERP, **legge direttamente dal DetailView ERP** e popola `order_records` con dati autoritativi ERP in un solo passaggio.

Risultato: la scheda in `/orders` compare con tutti i dati corretti (numero ORD/XXXXXX, indirizzo, note ERP, articoli) **senza aspettare il sync**.

### 2.2 Nuovo metodo bot: `readOrderFromDetailView`

**Pattern navigazione** (da memory confermata):
```
1. goto(SALESTABLE_ListView_Agent/)     ← sempre da ListView
2. goto(SALESTABLE_DetailViewAgent/{orderId_senza_punti}/?mode=View)
3. waitForDevExpressReady(15s)
```

**Dati letti — Tab Panoramica** (selettori `[id*="xaf_dvi{FIELD}_View"]`):
- `ID` → `id` (conferma orderId)
- `SALESID` → `order_number` (es. "ORD/26007984")
- `CUSTACCOUNT` → `customer_account_num`
- `SALESNAME` → `customer_name`
- `ORDERDATE` → `creation_date`
- `DELIVERYDATE` → `delivery_date`
- `DELIVERYNAME` → `delivery_name`
- `DLVADDRESS` → `delivery_address`
- `PURCHORDERFORMNUM` → `order_description`
- `CUSTOMERREF` → `customer_reference`
- `TEXTEXTERNAL` → `notes`
- `TEXTINTERNAL` → `text_internal` (campo nuovo)
- `SALESSTATUS` (`_VI`) → `sales_status`
- `DOCUMENTSTATUS` (`_VI`) → `document_status`
- `TRANSFERSTATUS` (`_VI`) → `transfer_status`
- `TRANSFERREDDATE` → `transfer_date`
- `COMPLETEDDATE` → `completion_date`
- `SALESTYPE` → `order_type`

**Tab Panoramica — no click necessario per i campi sopra.**

**SALESLINES grid** (selettori `tr[id*="SALESLINEs"][id*="DXDataRow"]`):
- Struttura celle in VIEW mode (nessuna ghost column):
  - Cell[0] = LINEA (numero riga)
  - Cell[1] = NOME ARTICOLO (codice articolo)
  - Cell[2] = QTÀ ORDINATA
  - Cell[3] = UNITÀ PREZZO (es. "32,46 €")
  - Cell[4] = SCONTO % (es. "23,30 %")
  - Cell[5] = APPLICA SCONTO % (sconto globale)
  - Cell[6] = IMPORTO DELLA LINEA (es. "124,48 €")
  - Cell[7] = NOME articolo con descrizione
- Footer `tr[id*="SALESLINEs"][id*="DXFooterRow"]`: `"Count=N Sum=QTY    Sum=TOTAL €"` → `total_amount`
- Paginazione: impostare page size a 200 prima di leggere per avere tutte le righe in una pagina

**Righe da skipare**:
- Righe il cui Cell[1] (codice) non matcha il regex `/^[A-Z0-9]+[\.\-][A-Z0-9\.\-]+$/i` (es. "Spese di trasporto K3") → spedizione gestita da Verona, non da comparare né inserire come articolo PWA

**Calcoli derivati**:
- `total_amount` = footer Sum con €
- `gross_amount` = somma di (Cell[2] × Cell[3] senza €) per ogni riga articolo
- `total_with_vat` = calcolato da `Σ lineAmount × (1 + vatRate)` usando i dati degli articoli

**Timeout e fallback**: se `readOrderFromDetailView` fallisce o torna `null` (timeout, ERP irraggiungibile) → fallback ai dati PWA come oggi. Il fallimento del read-back non blocca il completamento dell'ordine.

### 2.3 Integrazione in `submit-order.ts`

**Flusso attuale**:
```
erp_save_done → INSERT order_records (da PWA) + INSERT order_articles (da PWA) → db_committed
```

**Flusso nuovo**:
```
erp_save_done
  → readOrderFromDetailView(orderId)      ← lettura ERP (max 30s)
  → INSERT order_records (da ERP)         ← dati autoritativi
  → INSERT order_articles (da SALESLINES) ← articoli ERP, articles_synced_at = NOW()
  → db_committed
```

Se `readOrderFromDetailView` fallisce → fallback al comportamento attuale (dati PWA).

### 2.4 DB migration

**Migration `080-pending-orders-lock.sql`**:
```sql
ALTER TABLE agents.pending_orders
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
```

**Migration `081-order-records-text-internal.sql`**:
```sql
ALTER TABLE agents.order_records
  ADD COLUMN IF NOT EXISTS text_internal TEXT;
```

### 2.5 Display scheda ordine `/orders` — nuovi dati

**Nessun cambio al layout grafico** — stessa struttura `OrderCardNew.tsx` esistente.

**Nuovi dati popolati e mostrati**:

*Header già esistente ma ora immediato*:
- `order_number`: "ORD/26007984" (non più "PENDING-53912")
- `delivery_name` + `delivery_address`: da ERP, non più null
- `sales_status`: "Ordine aperto" (non più null)

*Indirizzo consegna* — logica display:
```
Se delivery_address_id IS NULL → badge verde "✓ Standard" + delivery_name + delivery_address
Se delivery_address_id IS NOT NULL → badge giallo "⚡ Alternativo" + delivery_address_snapshot (strutturato)
```

*Note smart display* — logica:
```typescript
const three = [order.orderDescription, order.notes, order.textInternal].filter(Boolean);
const unique = [...new Set(three)];
if (unique.length <= 1) {
  // Mostra una riga sola (senza etichetta)
} else {
  // Mostra tutte e tre con etichette: "Descrizione", "Nota esterna", "Nota interna"
}
```

Il campo `text_internal` viene aggiunto alla risposta API `/api/pending` e `/api/orders`.

### 2.6 Sync ordini — aggiornamento sync-orders

Il `sync-orders` periodico continua a girare e aggiorna `order_records` quando Verona modifica lo stato (es. "Ordine aperto" → "Fatturato"). Con il nuovo sistema, il sync non aggiorna più `notes`/`order_description` da zero (già valorizzati) ma li aggiorna se Verona li modifica.

Il campo `text_internal` viene aggiornato dal sync-orders quando cambia su ERP.

`articles_synced_at` è già settato da `readOrderFromDetailView` → `sync-order-articles` skippa gli ordini con `articles_synced_at IS NOT NULL` (già corretto).

---

## Sezione 3 — Architettura globale

```
[PWA crea pending] → [Bot piazza ordine su ERP]
  → erp_save_done
  → readOrderFromDetailView (bot legge DetailView ERP)
  → db_committed (order_records + order_articles da ERP)
  → 100% completato

[sync-orders ogni 10min] → aggiorna stati + totali ERP
[sync-ddt ogni 10min]    → aggiunge DDT + tracking
[sync-invoices]          → aggiunge fatture
[sync-tracking]          → aggiorna barra FedEx
```

---

## Sezione 4 — Scope escluso

- Note di credito (NC): generate solo da Verona, non dalla PWA — nessuna modifica
- Spese di trasporto: gestite da Verona → lette come articoli extra dal sync-order-articles
- Tab "Prezzi e sconti" (MANUALDISCOUNT): non necessario per read-back — lo sconto è già nelle SALESLINES per riga
- Email consegna (DLVEMAIL), P.IVA (VATNUM): non mostrate nell'header — disponibili in tab panoramica della scheda ordine

---

## Componenti da modificare

| File | Tipo | Cambiamento |
|------|------|-------------|
| `agents.pending_orders` | DB migration 080 | + `is_locked` |
| `agents.order_records` | DB migration 081 | + `text_internal` |
| `backend/src/bot/archibald-bot.ts` | Bot | + `readOrderFromDetailView()` |
| `backend/src/operations/handlers/submit-order.ts` | Handler | usa ERP data post-save |
| `backend/src/db/repositories/orders.ts` | Repository | + `text_internal` in SELECT/INSERT |
| `backend/src/routes/pending-orders.ts` | Route | + `PATCH /api/pending/:id/lock` |
| `frontend/src/pages/PendingOrdersPage.tsx` | Frontend | fix badge bug, Komet/Fresis, lock |
| `frontend/src/hooks/usePendingSync.ts` | Frontend | fix `?? taskIds[0]` |
| `frontend/src/components/OrderCardNew.tsx` | Frontend | smart notes, address indicator |
| `frontend/src/api/pending-orders.ts` | API client | + `is_locked`, `text_internal` |
