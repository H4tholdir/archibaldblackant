# Order Draft Persistence — Design

**Data:** 2026-04-17  
**Autore:** Francesco Formicola  
**Status:** Draft approvato, in attesa di implementation plan

---

## Problema

Lo stato dell'ordine in creazione in `/order` (`OrderFormSimple.tsx`) vive interamente in memoria (useState). Un deploy, un refresh, una navigazione verso un'altra pagina, o la chiusura della PWA cancellano l'ordine parziale senza possibilità di recupero.

Requisiti:
- L'ordine in bozza sopravvive a refresh, deploy, navigazione e chiusura PWA
- Accessibile da qualsiasi dispositivo su cui l'agente è loggato (multi-device)
- Editing simultaneo real-time tra sessioni dello stesso agente (es. agente al PC + collaboratore su tablet con le stesse credenziali)

---

## Approccio scelto: Draft PostgreSQL + WebSocket real-time (delta-based)

Nuova tabella `agents.order_drafts` con persistenza server-side. Le modifiche vengono sincronizzate tra sessioni tramite il WebSocket esistente usando operazioni delta atomiche. Nessuna dipendenza aggiuntiva.

---

## 1. Data Layer

### Migration 062: `agents.order_drafts`

```sql
CREATE TABLE agents.order_drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);
```

`UNIQUE(user_id)` impone il vincolo "un solo draft attivo per agente" direttamente in DB.

Il campo `payload` JSONB contiene l'intero stato persistibile del form:

```typescript
type DraftPayload = {
  customer: Customer | null;
  subClientCodice: string | null;
  items: OrderItem[];
  globalDiscountPercent: string;
  notes: string;
  deliveryAddressId: number | null;
  noShipping: boolean;
};
```

### Repository: `src/db/repositories/order-drafts.repo.ts`

Tutte le funzioni accettano `DbPool` come primo parametro (convenzione del progetto).

| Funzione | Comportamento |
|---|---|
| `getDraftByUserId(pool, userId)` | Restituisce draft attivo o `null` |
| `createDraft(pool, userId, payload)` | `INSERT … ON CONFLICT(user_id) DO UPDATE SET payload = $2, updated_at = NOW()` — idempotente |
| `applyItemDelta(pool, draftId, op, item)` | Operazione JSONB atomica su `payload.items` (add/remove/edit) |
| `applyScalarUpdate(pool, draftId, field, value)` | `SET payload = payload \|\| jsonb_build_object($field, $value), updated_at = NOW()` |
| `deleteDraft(pool, userId)` | Elimina per userId (non draftId — più sicuro lato auth) |

#### Operazioni JSONB atomiche su `payload.items`

Le operazioni sono eseguite interamente in SQL per evitare race condition tra sessioni simultanee:

**add:**
```sql
UPDATE agents.order_drafts
SET payload = jsonb_set(payload, '{items}', (payload->'items') || $item::jsonb),
    updated_at = NOW()
WHERE id = $draftId
```

**remove:**
```sql
UPDATE agents.order_drafts
SET payload = jsonb_set(
  payload, '{items}',
  COALESCE(
    (SELECT jsonb_agg(item)
     FROM jsonb_array_elements(payload->'items') item
     WHERE item->>'id' != $itemId),
    '[]'::jsonb
  )
),
updated_at = NOW()
WHERE id = $draftId
```

**edit:**
```sql
UPDATE agents.order_drafts
SET payload = jsonb_set(
  payload, '{items}',
  (SELECT jsonb_agg(
    CASE WHEN item->>'id' = $itemId
         THEN item || $changes::jsonb
         ELSE item
    END)
   FROM jsonb_array_elements(payload->'items') item)
),
updated_at = NOW()
WHERE id = $draftId
```

### REST routes: `src/routes/drafts.router.ts`

Le modifiche in-session passano via WebSocket. Le route REST servono solo per caricamento iniziale e ciclo di vita.

| Method | Path | Scopo |
|---|---|---|
| `GET` | `/api/drafts/active` | Mount del form: carica draft esistente o `null` |
| `POST` | `/api/drafts` | Crea draft (triggerato dalla prima selezione cliente) |
| `DELETE` | `/api/drafts/active` | Discard esplicito o pulizia post-submit |

---

## 2. Protocollo WebSocket

### Nuovi tipi di messaggio

**Client → Server:**

```
draft:delta  { draftId, op, payload, seq }
```

`op` valori: `item:add` | `item:remove` | `item:edit` | `scalar:update`  
`seq`: intero incrementale per-sessione, usato per ACK tracking.

**Server → Client:**

| Messaggio | Destinatario | Trigger |
|---|---|---|
| `draft:ack` | solo sessione originante | dopo aver applicato il delta al DB |
| `draft:delta:applied` | tutte le altre sessioni dello stesso userId | subito dopo l'ACK |
| `draft:submitted` | tutte le sessioni dello stesso userId | quando una sessione fa submit |

### Routing lato server

Il WS server (`src/realtime/`) espone una funzione `broadcastToUser(userId, message, excludeSocketId?)` che itera le socket connesse per quel userId. La funzione:
- senza `excludeSocketId` → broadcast a tutte le sessioni (usato per `draft:submitted`)
- con `excludeSocketId` → esclude la sessione originante (usato per `draft:delta:applied`)

### Delta queue lato client

Vive in `useRef` nel hook (non useState — non deve triggerare rerenderizzazioni).

```
pendingDeltas: { seq, op, payload }[]
seqCounter: number

sendDelta(op, payload):
  seq = ++seqCounter
  pendingDeltas.push({ seq, op, payload })
  ws.send({ type: 'draft:delta', draftId, op, payload, seq })

onMessage('draft:ack', { seq }):
  pendingDeltas = pendingDeltas.filter(d => d.seq > seq)

onMessage('draft:delta:applied', { op, payload }):
  applica delta a draftState locale (senza passare da sendDelta)

onReconnect():
  serverDraft = await GET /api/drafts/active
  setDraftState(serverDraft)            // stato canonico dal server
  for delta in pendingDeltas:           // riproduci i non-ACKati
    ws.send({ type: 'draft:delta', ...delta })
```

### Debounce per scalari

I campi scalari (note, sconto globale, indirizzo) vengono applicati localmente in modo ottimistico immediato, ma `sendDelta` viene eseguito con **debounce 800ms** — evita un delta per ogni keystroke. Le operazioni item (`add`/`remove`/`edit`) sono inviate istantaneamente (trigger da click esplicito, non da typing).

---

## 3. Frontend

### Hook `src/hooks/useOrderDraft.ts`

Gestisce esclusivamente lo stato persistibile del draft. Lo stato effimero del form (ricerca prodotto, quantità in digitazione, risultati ricerca, ecc.) rimane in `OrderFormSimple` con i propri useState.

**Interfaccia pubblica:**

```typescript
type UseOrderDraftReturn = {
  draftState: DraftPayload;
  draftId: string | null;
  isLoading: boolean;
  hasDraft: boolean;
  addItem: (item: OrderItem) => void;
  removeItem: (itemId: string) => void;
  editItem: (itemId: string, changes: Partial<OrderItem>) => void;
  updateScalar: <K extends keyof DraftScalarFields>(field: K, value: DraftScalarFields[K]) => void;
  discardDraft: () => Promise<void>;  // DELETE + reset state locale → usato da "Scarta e ricomincia"
  deleteDraft: () => Promise<void>;   // DELETE senza reset state → usato da handleSubmit dopo submit ok
};
```

**Ciclo di vita interno:**

1. Mount: `GET /api/drafts/active` → popola `draftState` (o stato vuoto se null)
2. Prima selezione cliente: `POST /api/drafts` → ottieni `draftId`
3. Ogni modifica: applica ottimisticamente a `draftState` + `sendDelta` via WS
4. `draft:ack` → rimuovi dalla coda
5. `draft:delta:applied` → applica delta da altra sessione
6. `draft:submitted` → navigate a `/pending-orders`
7. Submit completato: `DELETE /api/drafts/active`
8. `discardDraft()`: `DELETE /api/drafts/active` → reset `draftState` a vuoto

Il hook si abbona/disabbona ai messaggi WS tramite il `WebSocketContext` esistente.

**Disabilitato** quando il form è aperto in modalità edit (`?editOrderId=...`) — il flusso edit non viene toccato.

### Modifiche a `OrderFormSimple.tsx`

I campi persistibili usano `draftState` e le funzioni del hook invece degli useState locali:

| Codice attuale | Codice aggiornato |
|---|---|
| `setItems(prev => [...prev, item])` | `addItem(item)` |
| `setItems(prev => prev.filter(...))` | `removeItem(itemId)` |
| `setGlobalDiscountPercent(v)` | `updateScalar('globalDiscountPercent', v)` |
| `setOrderNotes(v)` | `updateScalar('notes', v)` |
| `setSelectedDeliveryAddressId(v)` | `updateScalar('deliveryAddressId', v)` |
| `setNoShipping(v)` | `updateScalar('noShipping', v)` |
| `setSelectedCustomer(c)` | `updateScalar('customer', c)` (+ crea draft se primo) |
| fine `handleSubmit()` (successo) | aggiunge `await deleteDraft()` (dal hook) |

Gli stati locali corrispondenti (`items`, `globalDiscountPercent`, ecc.) vengono rimossi e letti da `draftState`.

### UX: Resume banner

Mostrato in cima al form quando `hasDraft === true` al mount. Il form si popola automaticamente — nessuna scelta modale blocca l'utente (stile Gmail).

```
┌─────────────────────────────────────────────────────────────────┐
│  Bozza ripristinata · Mario Rossi · 3 articoli                  │
│  Salvata 10 min fa                       [Scarta e ricomincia]  │
└─────────────────────────────────────────────────────────────────┘
```

"Scarta e ricomincia" mostra un **inline confirm** (no `window.confirm` — bloccato in iOS Safari standalone):

```
Sicuro di voler scartare la bozza?   [Sì, scarta]  [Annulla]
```

### UX: Indicatore multi-dispositivo

Quando arriva `draft:delta:applied` (modifica da altra sessione):
- Il banner mostra un flash temporaneo (3s): **"Aggiornato da un altro dispositivo"**
- I singoli item aggiunti/rimossi da remoto appaiono/scompaiono con un'animazione (analoga a `recentlyAddedIds` già presente)

Quando arriva `draft:submitted` da altra sessione:
- Toast: "Ordine confermato da un altro dispositivo"
- Navigate automatico a `/pending-orders`

---

## 4. Edge Cases

| EC | Scenario | Comportamento |
|---|---|---|
| EC-1 | Stesso articolo aggiunto da due sessioni | Due righe distinte (UUID diversi) — l'agente rimuove il duplicato |
| EC-2 | Edit su sessione A, remove su sessione B | Remove vince — delta edit scartato dal server se item non esiste |
| EC-3 | Due sessioni cambiano lo stesso campo scalare | Last-write-wins — il server timestamp determina l'ordine |
| EC-4 | Sessione offline → riconnessione | Fetch stato canonico dal server → riproduci delta non-ACKati dalla coda locale |
| EC-5 | Sessione B fa submit mentre A sta editando | `draft:submitted` WS → sessione A riceve toast + navigate automatico |
| EC-6 | Delta in arrivo mentre si digita quantità | Delta aggiorna solo `draftState.items` — campo quantità (stato effimero locale) non viene toccato |

---

## 5. Scope escluso

- **IndexedDB**: non necessario — la coda delta non sopravvive a un hard refresh (accettabile: al reload si recupera lo stato canonico dal server)
- **Background Sync API**: fuori scope — offline puro non è un requisito esplicito
- **Presenza in tempo reale** (es. "Chi altro sta editando"): indicatore semplificato tramite flash su `draft:delta:applied`, no tracking esplicito di sessioni connesse
- **Draft multipli per agente**: escluso per scelta — un solo draft attivo per utente

---

## 6. File da creare / modificare

**Nuovi:**
- `archibald-web-app/backend/src/db/migrations/062-order-drafts.sql`
- `archibald-web-app/backend/src/db/repositories/order-drafts.repo.ts`
- `archibald-web-app/backend/src/db/repositories/order-drafts.repo.spec.ts`
- `archibald-web-app/backend/src/routes/drafts.router.ts`
- `archibald-web-app/backend/src/routes/drafts.router.spec.ts`
- `archibald-web-app/frontend/src/hooks/useOrderDraft.ts`
- `archibald-web-app/frontend/src/hooks/useOrderDraft.spec.ts`

**Modificati:**
- `archibald-web-app/backend/src/realtime/ws-server.ts` (o equivalente) — aggiunge `broadcastToUser` e gestione messaggi `draft:*`
- `archibald-web-app/backend/src/routes/index.ts` — monta `drafts.router`
- `archibald-web-app/frontend/src/pages/OrderFormSimple.tsx` — integra `useOrderDraft`, aggiunge resume banner, rimuove useState ridondanti
- `archibald-web-app/frontend/src/contexts/WebSocketContext.tsx` — espone handler per messaggi `draft:*`
