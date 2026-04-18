# PDF Export Ordini Scaduti — Design Spec

**Data:** 2026-04-18  
**Autore:** Francesco Formicola  
**Stato:** Approvato

---

## Obiettivo

Aggiungere un pulsante "PDF Scaduti" nella pagina `/orders` che esporti **tutti** gli ordini con pagamento scaduto dell'agente loggato in un PDF A4, raggruppati per cliente e con lista articoli, per facilitare il controllo e il sollecito pagamenti.

---

## Requisiti

- Esporta **tutti** gli ordini scaduti dell'agente, indipendentemente dai filtri attivi nella UI
- Layout: raggruppato per cliente (nome + email), con subtotale per cliente e totale generale
- Per ogni ordine: numero ordine, numero fattura, data consegna, data scadenza, giorni di ritardo
- Per ogni ordine: tabella articoli con codice, descrizione, quantità, prezzo unitario, totale riga
- Il pulsante appare in alto a destra nella pagina `/orders`, affianco al bottone "Leggi gli stati"
- Durante il fetch+generazione PDF il pulsante mostra uno spinner
- Il PDF viene scaricato automaticamente dal browser

---

## Architettura

### Flusso dati

```
[Bottone "PDF Scaduti"] 
  → GET /api/orders/overdue-report (JWT auth)
  → Query PostgreSQL (JOIN order_records + order_invoices + order_articles + customers)
  → JSON strutturato per cliente
  → overdue-pdf.service.ts genera PDF A4 con jsPDF
  → Download automatico browser
```

### Nuovi file

| File | Scopo |
|------|-------|
| `backend/src/db/repositories/overdue-report.ts` | Query PostgreSQL, funzione `getOverdueReport(pool, userId)` |
| `backend/src/routes/overdue-report.ts` | Router Express, `GET /api/orders/overdue-report` |
| `frontend/src/services/overdue-pdf.service.ts` | Fetch dati + generazione PDF con jsPDF |

### File modificati

| File | Modifica |
|------|----------|
| `backend/src/routes/index.ts` | Registra `overdueReportRouter` su `/api/orders/overdue-report` |
| `frontend/src/pages/OrderHistory.tsx` | Aggiunge bottone "PDF Scaduti" affianco a "Leggi gli stati" |

---

## Backend

### Repository: `getOverdueReport(pool, userId)`

```sql
SELECT
  c.name        AS customer_name,
  c.email       AS customer_email,
  o.id          AS order_id,
  o.order_number,
  o.created_at  AS order_date,
  i.invoice_number,
  i.due_date    AS invoice_due_date,
  i.remaining_amount,
  a.product_id,
  a.product_name,
  a.quantity,
  a.unit_price,
  a.line_total
FROM agents.order_records o
JOIN agents.customers c
  ON  c.account_num = o.customer_account_num
  AND c.user_id     = o.user_id
  AND c.deleted_at  IS NULL
JOIN agents.order_invoices i
  ON  i.order_id = o.id
  AND i.due_date < NOW()
  AND (i.remaining_amount > 0 OR i.closed = false)
LEFT JOIN agents.order_articles a
  ON  a.order_id = o.id
WHERE o.user_id = $1
ORDER BY c.name, o.id, a.id
```

**Tipo di ritorno (TypeScript):**

```ts
type OverdueArticle = {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

type OverdueOrder = {
  orderId: string
  orderNumber: string
  orderDate: string
  invoiceNumber: string
  invoiceDueDate: string
  remainingAmount: number
  articles: OverdueArticle[]
}

type OverdueCustomer = {
  customerName: string
  customerEmail: string | null
  orders: OverdueOrder[]
  subtotal: number
}

type OverdueReportData = {
  customers: OverdueCustomer[]
  grandTotal: number
  generatedAt: string
}
```

La funzione raggruppa le righe flat per cliente → ordine → articoli e calcola subtotali.

### Route: `GET /api/orders/overdue-report`

- Middleware: `authenticateToken` (JWT, pattern esistente)
- Chiama `getOverdueReport(pool, req.user.id)`
- Restituisce `200 OK` con `OverdueReportData` JSON
- In caso di errore: `500` con messaggio generico

---

## Frontend

### Servizio: `overdue-pdf.service.ts`

Funzione `exportOverduePDF(): Promise<void>`:

1. `fetch('/api/orders/overdue-report')` con header Authorization
2. Riceve `OverdueReportData`
3. Genera PDF A4 con jsPDF (portrait, mm, a4)
4. Usa solo caratteri ASCII (regola Helvetica: no frecce, no simboli Unicode fuori Latin-1)
5. Struttura PDF:

**Header (prima pagina e ogni pagina):**
- Titolo "ORDINI SCADUTI" in rosso (#c0392b)
- Data generazione, nome agente
- Totale scaduto complessivo

**Per ogni cliente:**
- Intestazione con sfondo rosso chiaro: nome cliente + email + subtotale
- Per ogni ordine del cliente:
  - Riga info: numero ordine · numero fattura · data consegna · "Scad: DD/MM/YYYY · N gg fa"
  - Tabella articoli con colonne: Codice | Descrizione | Q.ta | Prezzo | Totale
  - Totale ordine a destra

**Footer ogni pagina:**
- "Formicanera - Uso interno · Pagina X / Y"

**Totale generale** nell'ultima pagina.

**Filename download:** `ordini-scaduti-YYYYMMDD.pdf`

### Bottone in `OrderHistory.tsx`

Posizione: top-right, affianco al bottone "Leggi gli stati" esistente.

```tsx
const [exportingPDF, setExportingPDF] = useState(false)

const handleExportOverduePDF = async () => {
  setExportingPDF(true)
  try {
    await exportOverduePDF()
  } finally {
    setExportingPDF(false)
  }
}

// Nel JSX, accanto a "Leggi gli stati":
<button
  onClick={handleExportOverduePDF}
  disabled={exportingPDF}
  style={{ /* stile coerente con "Leggi gli stati" */ }}
>
  {exportingPDF ? 'Generando...' : 'PDF Scaduti'}
</button>
```

---

## Testing

- **Unit test** per la funzione di raggruppamento righe flat → struttura `OverdueReportData` (pura, testabile senza DB)
- **Nessun integration test obbligatorio** — endpoint read-only, nessun effetto collaterale
- **Test manuale** prima del deploy: verifica che i 41 ordini scaduti siano presenti nel PDF con articoli e email corrette

---

## Vincoli e note

- `window.confirm` non usato (bloccato in iOS Safari standalone — regola `feedback_no_window_confirm.md`)
- Solo ASCII nel PDF (regola `feedback_pdf_export_bugs.md`) — "gg fa" non "giorni fa" con emoji
- La query usa `c.deleted_at IS NULL` sul JOIN clienti (regola `feedback_soft_delete_join_filter.md`)
- Il servizio PDF è separato da `pdf-export.service.ts` (quello gestisce i preventivi FT/KT, logica diversa)
