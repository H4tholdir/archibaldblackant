# Design Spec: Unificazione Multimatching — "I più venduti"

**Data:** 2026-03-20
**Stato:** Approvato
**File interessati:** `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

---

## Problema

La funzione "I più venduti" carica i dati solo del cliente diretto selezionato, ignorando i clienti collegati tramite multi-matching. Manca il pulsante "Modifica collegamenti" nella modale. L'agente vede quindi un'aggregazione parziale degli articoli.

Lo Storico Ordini funziona correttamente: mostra la MatchingManagerModal per configurare i profili collegati, poi usa `getCustomerFullHistory` per recuperare dati aggregati su tutti i profili. I più venduti devono seguire lo stesso identico percorso.

---

## Requisiti

1. Click "I più venduti" apre la MatchingManagerModal (stesso flusso dello Storico Ordini).
2. Il flag "Non mostrare più" è condiviso tramite DB: poiché la MatchingManagerModal viene montata con le stesse props (`mode`, `subClientCodice`/`customerProfileId`) sia per Storico che per Più Venduti, il flag skip già persistito in DB viene letto e rispettato automaticamente da entrambe le funzioni. Non serve alcuno stato React aggiuntivo per la sincronizzazione.
3. Dopo la conferma del matching, i dati vengono recuperati via `getCustomerFullHistory` e aggregati nel frontend.
4. La modale "I più venduti" mostra nell'header il pulsante "✎ Modifica collegamenti". Visibilità: sempre presente (non c'è condizione sullo stato degli ID — se gli ID sono vuoti, la riapertura del matching li popolerà). Al click: chiude modale, imposta `matchingForceShow=true` e `pendingMatchingAction='topSold'`, riapre MatchingManagerModal.
5. Titolo modale: `I più venduti — {selectedSubClient?.ragioneSociale}` — invariato rispetto ad oggi. Per clienti diretti (no subclient) mostra "I più venduti — " con dash e niente dopo: comportamento intenzionale confermato dall'utente.
6. Nessuna modifica a backend, endpoint, DB o altri componenti.

---

## Comportamento per tipo cliente

| Tipo cliente | Flusso |
|---|---|
| Cliente diretto | MatchingManagerModal (mode=customer) → `getCustomerFullHistory` con customerProfileIds → aggregazione |
| Fresis + sotto-cliente | MatchingManagerModal (mode=subclient) → `getCustomerFullHistory` con customerProfileIds + [subClientCodice, ...subClientCodices] → aggregazione |
| Fresis senza sotto-cliente | Non applicabile: il pulsante "I più venduti" non è visibile (gate nel JSX: `selectedCustomer && (!isFresis(selectedCustomer) \|\| selectedSubClient)`). La funzione `loadTopSoldItems` ha una guard difensiva aggiuntiva per sicurezza. |

---

## Soluzione: Pending Action

Si aggiunge un singolo stato `pendingMatchingAction: 'history' | 'topSold' | null` a `OrderFormSimple`. Questo segnalino viene impostato al click e letto dopo la conferma del matching per sapere quale azione eseguire.

---

## Modifiche a OrderFormSimple.tsx

### 1. Nuovo stato

```typescript
pendingMatchingAction: 'history' | 'topSold' | null  // default: null
```

### 2. loadTopSoldItems (modifica)

Rimuove la chiamata a `loadOrderHistory()` e la logica di aggregazione locale.

Nuovo comportamento:
1. Guard: `if (!selectedCustomer) return`
2. Guard difensiva: `if (isFresis(selectedCustomer) && !selectedSubClient) return`
3. `setPendingMatchingAction('topSold')`
4. `setShowMatchingManagerModal(true)`

Il gate primario rimane il JSX (pulsante non visibile). La guard in `loadTopSoldItems` è solo difensiva.

### 3. handleHistorySearchClick (modifica)

Aggiunge `setPendingMatchingAction('history')` prima del ramo che chiama `setShowMatchingManagerModal(true)`.

Il ramo `isFresis && !selectedSubClient` (apre CustomerHistoryModal direttamente, bypassa MatchingManagerModal) rimane invariato e **non imposta** `pendingMatchingAction` — corretto perché non passa per il matching.

### 4. dispatchMatchingResult(ids: MatchIds | undefined) — nuova funzione

Sostituisce le callback `onConfirm(ids: MatchIds)` e `onSkip(matches?: MatchIds)` duplicate nei due blocchi MatchingManagerModal. Unifica la logica post-matching.

```
dispatchMatchingResult(ids: MatchIds | undefined):
  1. Se ids è definito:
       - setHistoryCustomerProfileIds(ids.customerProfileIds)
       - setHistorySubClientCodices(
           isFresis(selectedCustomer) && selectedSubClient
             ? [selectedSubClient.codice, ...ids.subClientCodices]
             : ids.subClientCodices
         )
  2. setMatchingForceShow(false)
  3. setShowMatchingManagerModal(false)
  4. Se pendingMatchingAction === 'history': setShowCustomerHistoryModal(true)
     Se pendingMatchingAction === 'topSold':
       aggregateAndShowTopSold(historyCustomerProfileIds, historySubClientCodices)
       // Nota: usa gli ID appena aggiornati al passo 1.
       // Se ids era undefined (skip senza matches), usa i valori correnti dello stato
       // (potrebbero essere array vuoti se è la prima apertura — getCustomerFullHistory
       // con array vuoti restituirà risultati vuoti, il che è il comportamento corretto
       // per un cliente senza matching configurato)
  5. setPendingMatchingAction(null)
```

### 5. aggregateAndShowTopSold(profileIds: string[], subClientCodices: string[]) — nuova funzione asincrona

```
aggregateAndShowTopSold(profileIds, subClientCodices):
  1. Chiama getCustomerFullHistory({ customerProfileIds: profileIds, subClientCodices })
     Il tipo di ritorno è CustomerFullHistoryOrder[] (array diretto, non wrappato in { orders: [...] })
  2. Aggrega:
     - Map<articleCode, { articleCode, productName, totalQuantity }>
     - Chiave: articleCode
     - productName: articleDescription del primo ordine in cui compare quell'articleCode
       (regola di merge: primo trovato — stessa logica del codice attuale)
     - totalQuantity: somma quantity di tutti gli articoli con quel articleCode
  3. Converte Map in array, ordina discendente per totalQuantity
  4. setTopSoldItems(sorted)
  5. setShowTopSoldModal(true)
```

### 6. MatchingManagerModal JSX (modifica)

Entrambi i blocchi (mode=subclient e mode=customer) modificano le callback:
- `onConfirm={(ids) => dispatchMatchingResult(ids)}`
- `onSkip={(matches) => dispatchMatchingResult(matches)}`
- `onClose={() => { setMatchingForceShow(false); setShowMatchingManagerModal(false); setPendingMatchingAction(null); }}`

### 7. Modale "I più venduti" JSX (modifica)

Aggiunge nell'header il pulsante "✎ Modifica collegamenti" con lo stesso stile del pulsante in `CustomerHistoryModal`:
```
background: 'rgba(0,0,0,0.06)', border: 'none', padding: '4px 10px',
borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
whiteSpace: 'nowrap', flexShrink: 0
```

onClick:
```
setShowTopSoldModal(false)
setMatchingForceShow(true)
setPendingMatchingAction('topSold')
setShowMatchingManagerModal(true)
```

---

## Formato dati aggregati

`topSoldItems` mantiene il tipo esistente, `description` viene rimosso (non presente in `CustomerFullHistoryArticle`):
```typescript
Array<{
  articleCode: string;
  productName: string;   // da articleDescription, primo valore trovato per quel articleCode
  totalQuantity: number;
}>
```

---

## Test

### Unit — aggregazione (se `aggregateAndShowTopSold` è estraibile come funzione pura)

Input: `CustomerFullHistoryOrder[]`. Output: array ordinato.

- **Somma multi-cliente**: due ordini con stesso `articleCode` da clienti diversi → quantità sommate
- **Ordinamento**: articolo con quantità maggiore appare per primo
- **Articolo in un solo cliente**: non viene perso
- **Lista ordini vuota**: output è array vuoto
- **Nessuna sovrapposizione**: ogni articolo compare una volta con la propria quantità
- **Collisione productName**: stesso `articleCode`, `articleDescription` diversa in ordini diversi → usa la prima descrizione trovata (nessun merge — primo valore)

### Integration — flusso in OrderFormSimple

Mock: `getCustomerFullHistory`, `getMatchesForCustomer` / `getMatchesForSubClient`.

- **skip=false**: click "I più venduti" → `MatchingManagerModal` visibile → click conferma → MatchingManagerModal scompare → modale Più Venduti visibile → `getCustomerFullHistory` chiamata con gli ID confermati
- **skip=true**: click "I più venduti" → nessuna MatchingManagerModal → modale Più Venduti visibile direttamente
- **Pulsante "Modifica collegamenti"**: presente nell'header della modale Più Venduti → click → MatchingManagerModal visibile con forceShow=true → conferma → modale Più Venduti si riapre con nuova chiamata a `getCustomerFullHistory`
- **Flag unificato (comportamento)**: la MatchingManagerModal usa lo stesso `mode`/`entityId` sia da Storico che da Più Venduti → stesso record DB → skip impostato da una funzione viene rispettato dall'altra automaticamente

---

## Non incluso in scope

- Modifiche al backend
- Modifiche a `CustomerHistoryModal`, `MatchingManagerModal`, o altri componenti
- Nuovi endpoint API
- Modifiche al DB
