# Design: Lista Prelievi Magazzino + Restyling Gestione Magazzino

**Data**: 2026-03-09
**Scope**: Feature "Articoli da prendere" + fix visual consistency di WarehouseManagementView

---

## Contesto

L'agente invia ordini durante la giornata con articoli prelevati dal magazzino fisico
(`warehouse_quantity > 0`). La sera, rientrando in magazzino, ha bisogno di sapere
quali articoli fisici deve prelevare dagli scaffali per completare le spedizioni.

Parallelamente, la pagina `/warehouse-management` ha inconsistenze visive rispetto
al resto della PWA (sfondo viola diretto invece di grigio chiaro, bottoni galleggianti,
bug "Invalid Date", titolo duplicato).

---

## Parte 1 — Fix Visual Consistency

### Problema attuale

`WarehouseManagementView.tsx` ha il container senza `backgroundColor`, lasciando
che il gradient `.app` (#667eea → #764ba2) sia visibile come sfondo. Tutte le altre
pagine (Clienti, Ordini, Storico Fresis) usano un wrapper con sfondo chiaro che
copre il gradient.

### Fix da applicare

| # | Problema | Fix |
|---|---------|-----|
| 1 | Sfondo viola diretto | Aggiungere `backgroundColor: "#f5f5f5"`, `minHeight: "100vh"` al container esterno |
| 2 | h1 colore bianco illeggibile su grigio | Cambiare colore h1 → `#1a1a2e` (coerente con altre pagine) |
| 3 | Bottoni azione galleggiano sul viola | Racchiuderli in una card bianca (`background: "#fff"`, `border: "1px solid #e0e0e0"`, `borderRadius: 8`, `padding: 16`) |
| 4 | Titolo duplicato "Gestione Magazzino" | Rimuovere l'`<h3>` interno da `WarehouseUpload.tsx` |
| 5 | Bug "Invalid Date" | Fix formatting di `metadata.uploadedAt` con guard `isNaN(date.getTime())` |
| 6 | "Cancella Magazzino" barra grigia | Spostare fuori dalla card upload, diventare bottone rosso nella action row |

---

## Parte 2 — Tab Navigation

`WarehouseManagementView` introduce due tab:
- **📦 Magazzino** — contenuto attuale (WarehouseUpload + WarehouseInventoryView)
- **🛒 Articoli da prendere** — nuovo componente WarehousePickupList

Stato tab in `useState<'magazzino' | 'pickup'>`, default `'magazzino'`.
I bottoni azione (Aggiungi Articolo, Gestione Scatoli) sono visibili solo nel tab Magazzino.

---

## Parte 3 — Feature "Articoli da prendere"

### Requisiti funzionali

- Mostra ordini inviati nella data selezionata con almeno un articolo da magazzino fisico
- Raggruppamento **per ordine** (non aggregato)
- Solo articoli con `warehouse_quantity > 0`
- Data picker con default = oggi, bottone "Oggi" per reset rapido
- Checkbox per articolo (stato React, sessione corrente, nessuna persistenza server)
- Export PDF stampabile
- Barra riepilogativa: N ordini · N articoli · N pezzi totali

### Layout UI

```
[Data: DD/MM/YYYY] [Oggi]                    [🖨️ Esporta PDF]
─────────────────────────────────────────────────────────────
 3 ordini · 8 articoli da prelevare · 21 pezzi totali
─────────────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────┐
│ ORD/2026/00142 · Rossi Mario          09/03 08:45 [4 art] │
├──────┬─────────────────┬─────────────┬────────┬─────────┤
│  ☐   │ H379.104.014    │ Rubinetto…  │ BOX-A1 │   3     │
│  ☑   │ 222.045.100     │ ~~Guarn…~~  │ BOX-A2 │  10     │  ← riga barrata
└──────┴─────────────────┴─────────────┴────────┴─────────┘
```

### Backend — nuovo endpoint

**Route**: `GET /api/orders/warehouse-pickups?date=YYYY-MM-DD`

**Repository function** (in `orders.ts`):
```sql
SELECT
  o.id AS order_id,
  o.order_number,
  o.customer_name,
  o.creation_date,
  a.id AS article_id,
  a.article_code,
  a.article_description,
  a.warehouse_quantity,
  a.warehouse_sources_json
FROM agents.order_records o
JOIN agents.order_articles a
  ON a.order_id = o.id AND a.user_id = o.user_id
WHERE o.user_id = $1
  AND DATE(o.creation_date) = $2::date
  AND a.warehouse_quantity > 0
ORDER BY o.creation_date ASC, o.order_number ASC, a.id ASC
```

Restituisce array di ordini, ognuno con `articles: WarehousePickupArticle[]`.

**Nuovo router**: aggiunto in `orders.ts` esistente.

### Frontend — nuovo componente

`WarehousePickupList.tsx` (componente standalone, importato in `WarehouseManagementView`):
- Stato: `selectedDate` (string YYYY-MM-DD), `checkedArticleIds` (Set\<number\>), `orders` (array)
- Fetch all'apertura del tab e al cambio data
- Checkbox toggle: aggiunge/rimuove id dal Set
- Riga barrata visivamente quando checked

### PDF Export

Usa `window.print()` con CSS `@media print` dedicato, oppure genera un HTML template
e lo apre in nuova finestra per la stampa. Non richiede librerie aggiuntive.
Il PDF sarà raggruppato per ordine, con tabella articoli e colonne: Codice | Descrizione | Scatolo | Pezzi.

---

## Struttura file da creare/modificare

| File | Tipo | Operazione |
|------|------|-----------|
| `frontend/src/components/WarehousePickupList.tsx` | nuovo | componente lista prelievi |
| `frontend/src/pages/WarehouseManagementView.tsx` | modifica | tab nav + restyling |
| `frontend/src/components/WarehouseUpload.tsx` | modifica | rimuovi h3 duplicato, fix Invalid Date |
| `backend/src/db/repositories/orders.ts` | modifica | nuova funzione `getWarehousePickupsByDate` |
| `backend/src/routes/orders.ts` | modifica | nuovo endpoint GET warehouse-pickups |

---

## Test

- **Unit**: `getWarehousePickupsByDate` con date valide, data senza ordini, `warehouse_quantity = 0`
- **Integration**: GET `/api/orders/warehouse-pickups?date=2026-03-09` → risposta corretta
- **Frontend**: type-check passa, nessuna regressione visiva sulle altre tab
