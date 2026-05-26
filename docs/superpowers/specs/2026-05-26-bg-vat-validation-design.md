# Background VAT Validation — Design Spec
**Data:** 26 maggio 2026  
**Autore:** Francesco Formicola  
**Stato:** Approvato — pronto per implementazione

---

## Problema

Molti clienti hanno `vat_number` nel DB ma `vat_validated_at IS NULL`. Questo blocca l'invio degli ordini (`isCustomerComplete()` restituisce `false`) e costringe l'utente a cliccare "Valida ora" manualmente per ogni cliente prima di poter inviare. Con N ordini in attesa, il flusso è scomodo.

---

## Obiettivo

Validare automaticamente le P.IVA in background, in modo che l'utente trovi già i clienti validati quando arriva alla pagina "Ordini in Attesa".

---

## Data Model

**Nuova migration `027-vat-bg-check.sql`** — aggiunge due colonne a `agents.customers`:

```sql
ALTER TABLE agents.customers
  ADD COLUMN vat_last_bg_check_at TIMESTAMPTZ,
  ADD COLUMN vat_invalid BOOLEAN NOT NULL DEFAULT FALSE;
```

| Colonna | Scopo |
|---|---|
| `vat_last_bg_check_at` | Throttle: evita di reinserire in coda clienti già controllati di recente |
| `vat_invalid` | L'ERP ha confermato che la P.IVA è definitivamente non valida |

### Quattro stati cliente

| `vat_validated_at` | `vat_invalid` | Significato UI |
|---|---|---|
| NULL | false | ⚠ P.IVA non validata — candidata al BG |
| NOT NULL | false | ✅ Validata — ordine inviabile |
| NULL | true | ✕ P.IVA non valida — richiede intervento umano |

`vat_last_bg_check_at` non genera stato visivo, è solo un throttle interno.

---

## Pipeline a due fasi

Per ogni cliente candidato (`vat_number IS NOT NULL AND vat_validated_at IS NULL AND vat_invalid = false`):

```
Trigger
  │
  ▼
[Fase 1] read-vat-status (esistente, P=trigger-dipendente)
  ├── ERP dice "Sì" → updateVatValidatedAt() ✅ fine
  └── ERP dice "No" → enqueue bg-validate-vat
                           │
                           ▼
                    [Fase 2] bg-validate-vat (nuovo)
                      ├── "Sì" → updateVatValidatedAt() + broadcast VAT_BG_VALIDATED ✅
                      └── "No" → setVatInvalid() + broadcast VAT_BG_INVALID ❌
```

**Fase 1** (`read-vat-status`) usa `readCustomerVatStatus()` — legge `VATVALIEDE_I` dalla ListView ERP senza aprire il form. ~5s. Recupera tutti i clienti che l'ERP già conosce come validati ma il DB non ha ancora il timestamp (es. clienti pre-migrazione colonna).

**Fase 2** (`bg-validate-vat`) apre la scheda cliente in edit mode, chiama `submitVatAndReadAutofill()` (già implementata), cancella il form senza salvare, legge il risultato. ~30s per cliente. Serializzato: 1 cliente alla volta.

---

## Tre Trigger

### Trigger A — Creazione ordine in attesa (P25)

**Punto di iniezione:** `pending-orders.ts` route `POST /`, blocco `result.action === 'created'` (riga ~80).

**Logica:** dopo la creazione, chiama `enqueueVatBgValidationIfNeeded(userId, order.customerId)` (nuova dep iniettata nel router). La funzione controlla in DB se `vat_number IS NOT NULL AND vat_validated_at IS NULL AND vat_invalid = false` e, se vero, enqueue `read-vat-status` con priorità P25.

Throttle: skip se `vat_last_bg_check_at > NOW() - INTERVAL '30 minutes'` (evita reinserimenti su salvataggi multipli dello stesso ordine).

L'utente crea l'ordine → la validazione parte subito in background.

### Trigger B — Sweep periodico (P500)

**Punto di iniezione:** `sync-scheduler.ts`, nuovo slot ogni 30 minuti.

**Query candidati:**
```sql
SELECT erp_id, vat_number FROM agents.customers
WHERE user_id = $1
  AND vat_number IS NOT NULL
  AND vat_validated_at IS NULL
  AND vat_invalid = false
  AND (vat_last_bg_check_at IS NULL
       OR vat_last_bg_check_at < NOW() - INTERVAL '2 hours')
```

Enqueue `read-vat-status` per ciascuno (P500 — bloccato da VPN gate, gira solo quando connessi).

### Trigger C — Durante sync clienti (P500)

**Punto di iniezione:** dopo che `sync-customers` persiste un cliente.

**Logica:** se il cliente ha `vat_number IS NOT NULL AND vat_validated_at IS NULL AND vat_invalid = false` → enqueue `read-vat-status` (P500).

Catch-all per clienti nuovi o aggiornati dalla sync normale.

---

## Nuova funzione bot: `openCustomerAndValidateVat(erpId, vatNumber)`

Unica implementazione nuova lato bot. Passi:

1. Naviga CUSTTABLE_ListView → filtra per `erpId` → apre scheda in **edit mode**
2. Chiama `submitVatAndReadAutofill(vatNumber)` (già esistente)
3. Cancella il form senza salvare
4. Ritorna `VatLookupResult`

Il risultato del check P.IVA è persistito internamente dall'ERP in `VATVALIEDE_I` indipendentemente dal salvataggio del form.

---

## Nuovo operation handler: `bg-validate-vat`

**File:** `src/operations/handlers/bg-validate-vat.ts`

```
data: { erpId: string, vatNumber: string }

onProgress(10, "Apertura scheda cliente ERP")
result = bot.openCustomerAndValidateVat(erpId, vatNumber)
onProgress(80, "Lettura risultato P.IVA")

updateVatLastBgCheckAt(pool, userId, erpId)  // sempre

if result.vatValidated === "Sì" | "Si":
  updateVatValidatedAt(pool, userId, erpId)
  broadcast VAT_BG_VALIDATED { erpId }
elif result !== null AND result.vatValidated !== "Sì" AND result.vatValidated !== "Si":
  // ERP ha risposto ma nega la validità → flag definitivo
  setVatInvalid(pool, userId, erpId)
  broadcast VAT_BG_INVALID { erpId, vatNumber }
// result null = timeout/errore bot → nessun flag, ritentato al prossimo sweep

onProgress(100, "Validazione completata")
```

**Registrazione obbligatoria** (dogma CONDUCTOR_OPERATIONS):
- `backend/src/operations/queue-router.ts` → aggiungere `'bg-validate-vat'`
- `frontend/src/api/operations.ts` → aggiungere `'bg-validate-vat'`

**Priorità:** P25 se triggerato da creazione ordine, P500 se da sweep/sync.

---

## WebSocket Events

| Evento | Emesso quando | Payload |
|---|---|---|
| `VAT_BG_VALIDATED` | Phase 1 o 2 conferma "Sì" | `{ erpId: string }` |
| `VAT_BG_INVALID` | Phase 2 conferma P.IVA non valida | `{ erpId: string, vatNumber: string }` |

### Comportamento frontend

**Su `VAT_BG_VALIDATED`:**
- Refetch silenzioso del cliente (`GET /api/customers/:erpId`)
- Il banner "⚠ P.IVA non validata" sparisce automaticamente

**Su `VAT_BG_INVALID`:**
- Banner cambia: giallo "⚠ P.IVA non validata" → rosso "✕ P.IVA non valida — contatta il cliente"
- Il bottone "Valida ora" sparisce (non ha senso riprovare su P.IVA rifiutata dall'ERP)

**Il bottone "Valida ora" manuale rimane** per `vat_invalid = false AND vat_validated_at IS NULL` — l'utente può sempre forzare una rivalidazione dopo aver corretto il numero nel profilo cliente.

**Nessuna notifica intrusiva** (nessun toast, nessun modal) — il banner si aggiorna in place.

---

## File da creare/modificare

| File | Tipo | Descrizione |
|---|---|---|
| `backend/src/db/migrations/027-vat-bg-check.sql` | Nuovo | Migration: `vat_last_bg_check_at`, `vat_invalid` |
| `backend/src/db/repositories/customers.ts` | Modifica | Aggiungere `updateVatLastBgCheckAt()`, `setVatInvalid()` |
| `backend/src/bot/archibald-bot.ts` | Modifica | Aggiungere `openCustomerAndValidateVat()` |
| `backend/src/operations/handlers/bg-validate-vat.ts` | Nuovo | Operation handler Fase 2 |
| `backend/src/operations/queue-router.ts` | Modifica | Registrare `bg-validate-vat` |
| `frontend/src/api/operations.ts` | Modifica | Registrare `bg-validate-vat` |
| `backend/src/sync/sync-scheduler.ts` | Modifica | Aggiungere sweep periodico 30 min |
| `backend/src/operations/handlers/submit-order.ts` (o pending order) | Modifica | Trigger A: enqueue dopo creazione ordine |
| `backend/src/operations/handlers/sync-customers.ts` | Modifica | Trigger C: enqueue dopo sync cliente |
| `frontend/src/types/customer.ts` | Modifica | Aggiungere `vatInvalid: boolean`, `vatLastBgCheckAt` |
| `frontend/src/utils/customer-completeness.ts` | Modifica | Distinguere badge "non validata" vs "non valida" |
| `frontend/src/pages/PendingOrdersPage.tsx` | Modifica | Gestire `VAT_BG_VALIDATED` / `VAT_BG_INVALID` via WS |
| `frontend/src/components/OrderFormSimple.tsx` | Modifica | Stessa gestione WS |

---

## Vincoli e rischi

- **Serializzazione obbligatoria:** 1 cliente alla volta per `bg-validate-vat` — stesso pattern di article sync. Il Conductor gestisce la concorrenza via priorità.
- **Timeout/errori rete:** non impostano `vat_invalid` — verranno ritentati al prossimo sweep. Solo risposte ERP definitive ("No", "non trovato") impostano il flag.
- **P.IVA corretta dall'utente:** se l'utente corregge il `vat_number` sul profilo, `vat_invalid` va resettato a `false`. Il salvataggio del profilo cliente deve includere questo reset.
- **VPN gate:** Trigger B e C (P500) sono bloccati quando `sync_paused_users` è attivo. Trigger A (P25) passa sempre.
