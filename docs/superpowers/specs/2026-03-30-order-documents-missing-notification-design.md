# Spec: Notifica `order_documents_missing`

**Data:** 2026-03-30
**Stato:** approvata

---

## Problema

Alcuni ordini risultano in stati post-spedizione o post-fatturazione (es. `fatturato`, `consegnato`) ma non hanno DDT o fatture collegate nel DB. Questi casi possono indicare un mismatch tra l'ERP Archibald e il sistema AX di Verona. L'agente deve essere avvisato così da poter segnalare a Verona e richiedere verifica.

---

## Scope

- **Nuovo tipo notifica:** `order_documents_missing`
- **Destinatario:** solo agente (target `'user'`)
- **Dipendenza:** richiede migration `042-order-documents-tables.sql` in prod (`order_ddts` + `order_invoices`)

---

## Casi esclusi (leciti)

| Caso | Motivo esclusione |
|------|-------------------|
| `order_number LIKE 'NC/%'` | Note di credito — niente DDT né fattura attesi |
| `total_amount LIKE '-%'` | NC identificate per importo negativo |
| `creation_date < 2026-01-01` | Storico pre-attivazione sync DDT |
| `current_state` non in lista trigger | Ordini ancora open/pending |

---

## Trigger logic

### DDT mancante
Ordine con `current_state IN ('spedito', 'consegnato', 'parzialmente_consegnato', 'fatturato', 'pagamento_scaduto', 'pagato')` e nessuna riga in `agents.order_ddts` per quell'ordine.

### Fattura mancante
Ordine con `current_state IN ('fatturato', 'pagamento_scaduto', 'pagato')` e nessuna riga in `agents.order_invoices` per quell'ordine.

---

## SQL check

```sql
SELECT
  o.id, o.user_id, o.order_number, o.customer_name, o.current_state,
  NOT EXISTS (
    SELECT 1 FROM agents.order_ddts d
    WHERE d.order_id = o.id AND d.user_id = o.user_id
  ) AS missing_ddt,
  NOT EXISTS (
    SELECT 1 FROM agents.order_invoices i
    WHERE i.order_id = o.id AND i.user_id = o.user_id
  ) AS missing_invoice
FROM agents.order_records o
WHERE o.creation_date::date >= '2026-01-01'
  AND o.order_number NOT LIKE 'NC/%'
  AND (o.total_amount IS NULL OR o.total_amount NOT LIKE '-%')
  AND (
    (o.current_state IN ('spedito','consegnato','parzialmente_consegnato','fatturato','pagamento_scaduto','pagato')
     AND NOT EXISTS (SELECT 1 FROM agents.order_ddts d WHERE d.order_id = o.id AND d.user_id = o.user_id))
    OR
    (o.current_state IN ('fatturato','pagamento_scaduto','pagato')
     AND NOT EXISTS (SELECT 1 FROM agents.order_invoices i WHERE i.order_id = o.id AND i.user_id = o.user_id))
  )
  AND NOT EXISTS (
    SELECT 1 FROM agents.notifications n
    WHERE n.user_id = o.user_id
      AND n.type = 'order_documents_missing'
      AND (n.data->>'orderId') = o.id
      AND n.created_at > NOW() - INTERVAL '14 days'
  )
```

---

## Contenuto notifica

**Severity:** `warning`
**Dedup:** 14 giorni per ordine (via `NOT EXISTS` sulla tabella `notifications`)

| `missing` | `title` | `body` |
|---|---|---|
| `['ddt']` | `Spedizione senza DDT` | `Ordine {orderNumber} di {customerName} è in stato {currentState} ma non risulta nessun DDT collegato. Verifica con Verona se la spedizione è avvenuta.` |
| `['invoice']` | `Fattura mancante` | `Ordine {orderNumber} di {customerName} è in stato {currentState} ma non risulta nessuna fattura collegata. Segnala a Verona.` |
| `['ddt','invoice']` | `DDT e fattura mancanti` | `Ordine {orderNumber} di {customerName} è in stato {currentState} senza DDT né fattura collegati. Verifica con Verona.` |

**Payload `data`:**
```ts
{
  orderId: string;
  orderNumber: string;
  customerName: string;
  currentState: string;
  missing: ('ddt' | 'invoice')[];
}
```

---

## Architettura backend

### `notification-scheduler.ts`
Nuova funzione `checkMissingOrderDocuments(pool, deps)` aggiunta accanto a `checkCustomerInactivity`, `checkOverduePayments`, `checkBudgetMilestones`.

Registrata nel `setInterval` del `createNotificationScheduler` con gli altri check giornalieri.

### Tipo TS per le righe query
```ts
type MissingDocumentsRow = {
  id: string;
  user_id: string;
  order_number: string;
  customer_name: string;
  current_state: string;
  missing_ddt: boolean;
  missing_invoice: boolean;
};
```

La funzione itera le righe, costruisce `missing: ('ddt' | 'invoice')[]` da `missing_ddt` e `missing_invoice`, seleziona title/body appropriati, e chiama `createNotification`.

---

## Architettura frontend

### `notifications.service.ts`
`getNotificationRoute`: aggiungere `'order_documents_missing' → '/orders'`

### `NotificationsPage.tsx`
Nuova tab `"Documenti"` che filtra per `type === 'order_documents_missing'`, accanto alle tab esistenti `"Pagamenti"` e `"Clienti inattivi"`.

---

## Testing

### Unit test (`notification-scheduler.spec.ts`)
- Ordine `spedito` senza DDT → notifica `missing: ['ddt']`
- Ordine `fatturato` senza DDT né fattura → notifica `missing: ['ddt','invoice']`
- Ordine `fatturato` senza sola fattura → notifica `missing: ['invoice']`
- Ordine `NC/...` → nessuna notifica
- `total_amount` negativo → nessuna notifica
- `creation_date < 2026-01-01` → nessuna notifica
- Ordine `pending` (stato non in lista) → nessuna notifica
- Dedup: ordine già notificato < 14 gg → nessuna notifica

### Integration test
- Query eseguita su DB reale con fixture: verifica che solo i casi anomali producano notifiche

---

## Note deploy

- La migration `042-order-documents-tables.sql` deve essere applicata in prod **prima** di questo feature. Il check fa `NOT EXISTS` su `agents.order_ddts` e `agents.order_invoices`.
- Al primo run post-deploy, gli ordini anomali esistenti genereranno notifiche immediatamente (comportamento atteso — l'agente deve vedere subito le incongruenze pregresse dal 2026-01-01).
