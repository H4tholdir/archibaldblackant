# Ghost Articles nelle FT Fresis — Design Spec

**Data:** 2026-03-22
**Scope:** Solo ordini FT Fresis con sottocliente selezionato

---

## Problema

Nello storico FT di Fresis esistono articoli il cui codice non è presente in `shared.products` (il catalogo Archibald). La PWA attualmente non permette l'inserimento di questi articoli in nuovi ordini. L'utente deve poterli aggiungere come "articoli non catalogati" che vengono tracciati nella FT ma non inviati al bot per il piazzamento su Archibald ERP.

---

## Soluzione

Trattare gli articoli non catalogati esattamente come articoli da magazzino: `warehouseQuantity = totalQuantity` → il bot li salta. Vengono salvati in `order_articles` con un flag `is_ghost = true` per identificazione semantica.

---

## Modello Dati

### Frontend — `PendingOrderItem`

Aggiunta di due campi opzionali al tipo esistente:

```ts
isGhostArticle?: boolean                         // articolo non in shared.products
ghostArticleSource?: 'history' | 'manual'        // origine: storico FT o inserimento manuale
```

### Backend — Migrazione DB

```sql
ALTER TABLE agents.order_articles
  ADD COLUMN is_ghost BOOLEAN NOT NULL DEFAULT FALSE;
```

Nessun'altra modifica al DB. La ricerca degli articoli fantasma storici avviene a runtime su `fresis_history.items` (JSONB esistente).

---

## Backend

### A) Handler `submit-order.ts`

Split degli items prima di costruire la chiamata al bot:

```ts
const botItems   = items.filter(i => !i.isGhostArticle);
const ghostItems = items.filter(i => i.isGhostArticle);
```

- Solo `botItems` vengono inviati al bot.
- Se `botItems` è vuoto, l'ordine segue il path warehouse-only (nessuna chiamata al bot).
- Per i ghost items: `warehouse_quantity = quantity` (convenzione esistente), `is_ghost = true`.
- Per gli articoli normali: `is_ghost = false` (DEFAULT).

### B) Nuovo endpoint — ricerca articoli ghost da storico FT

```
GET /api/fresis-history/ghost-articles?userId=<userId>
```

Aggregazione a runtime su `fresis_history.items` JSONB: estrae tutti gli `articleCode` apparsi nelle FT dell'agente che **non esistono** in `shared.products`. Ritorna lista deduplicata ordinata per frequenza d'uso decrescente:

```ts
type GhostArticleSuggestion = {
  articleCode: string;
  description: string;    // descrizione più recente vista nelle FT
  price: number;          // prezzo più recente
  discount: number;       // sconto più recente
  vat: number;            // IVA più recente
  occurrences: number;    // quante volte appare nello storico
};
```

**Nessuna problematica di sync PDF:** gli articoli ghost non vengono mai inviati al bot, quindi non esistono su Archibald, non c'è PDF saleslines da processare. Il comportamento è identico agli articoli da magazzino già gestiti oggi.

---

## Frontend

### A) Trigger nel form ricerca articoli

Visibile **solo** per ordini FT Fresis con sottocliente selezionato.

Quando la ricerca articoli non produce risultati in `shared.products`, compare in fondo alla lista:

> **"Inserisci come articolo non catalogato"**

### B) Modale "Articolo non catalogato"

Due tab:

**Tab 1 — Dallo storico FT**
- Lista degli articoli ghost dall'endpoint `GET /api/fresis-history/ghost-articles`
- Ogni riga: codice, descrizione, prezzo, sconto storici + contatore occorrenze
- Click su riga → precompila il form (tutti i campi editabili)

**Tab 2 — Inserimento manuale**
- Campi: codice articolo, descrizione, quantità, prezzo, sconto, IVA
- Obbligatori: codice articolo, IVA
- Validazione client-side prima di confermare

### C) Struttura item aggiunto all'ordine

```ts
{
  articleCode: "...",
  description: "...",
  quantity: N,
  price: N,
  discount: N,
  vat: N,
  isGhostArticle: true,
  ghostArticleSource: 'history' | 'manual',
  warehouseQuantity: N,       // = quantity totale → bot lo salta
  warehouseSources: [],
}
```

### D) Nessuna distinzione visiva

Gli articoli ghost vengono visualizzati nel form ordine senza badge o colori diversi. L'utente è consapevole di cosa sta inserendo.

---

## Vincoli

- La feature è abilitata **solo** per ordini FT Fresis con sottocliente selezionato.
- L'IVA è **obbligatoria** per gli articoli inseriti manualmente.
- Il bot non riceve mai articoli con `isGhostArticle: true`.
- Il flag `is_ghost` in `order_articles` è a scopo semantico/identificativo, non di protezione sync.

---

## File da Modificare

### Backend
- `src/db/migrations/` — nuova migrazione per `is_ghost` su `order_articles`
- `src/operations/handlers/submit-order.ts` — split botItems / ghostItems
- `src/routes/fresis-history.ts` — nuovo endpoint `GET /ghost-articles`
- `src/db/repositories/fresis-history.ts` — nuova funzione `getGhostArticleSuggestions()`

### Frontend
- `src/types/pending-order.ts` — aggiunta campi `isGhostArticle`, `ghostArticleSource`
- `src/components/` — nuovo componente `GhostArticleModal.tsx`
- Componente di ricerca articoli nel form FT — aggiunta trigger "Inserisci come non catalogato"
- `src/api/fresis-history.ts` — nuovo metodo `getGhostArticles()`
