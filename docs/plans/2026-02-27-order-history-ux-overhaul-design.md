# Order History UX Overhaul — Design

**Date:** 2026-02-27
**Approach:** Incrementale (Opzione A) — 8 feature indipendenti, rilasciabili separatamente.

---

## Feature 1 — Tab default "Articoli"

**File:** `OrderCardNew.tsx`
**Modifica:** `useState("panoramica")` → `useState("articoli")`
**Impatto:** 1 riga.

---

## Feature 2 — Ricerca globale: nascondi schede non pertinenti

**File:** `OrderHistory.tsx`

- Le schede che non matchano `debouncedSearch` vengono escluse dal rendering (non solo collassate).
- Le pile: se nessun ordine della pila matcha, la pila intera viene nascosta. Se almeno uno matcha, la pila si mostra.
- La barra di navigazione ricerca (Prev/Next) rimane con conteggio aggiornato.
- `HighlightText` continua a evidenziare i match in giallo/arancione.

---

## Feature 3 — Swipe bidirezionale + indicatori

**File:** `OrderCardStack.tsx`

- Swipe left e right già implementati nel codice — verificare e consolidare.
- Aggiungere **pallini (dots)** sotto la pila: pallino attivo più grande e colorato.
- Aggiungere **frecce laterali** semitrasparenti ai lati della scheda top.
- Frecce sempre visibili con >1 scheda (ciclico).

---

## Feature 4 — Stacking manuale con causale (migrazione localStorage → DB)

### DB

**Tabella** `agents.order_stacks`:
| Colonna | Tipo |
|---------|------|
| id | serial PK |
| agent_id | int FK |
| stack_id | varchar unique per agent |
| reason | text |
| created_at | timestamptz |

**Tabella** `agents.order_stack_members`:
| Colonna | Tipo |
|---------|------|
| id | serial PK |
| stack_id | int FK → order_stacks.id ON DELETE CASCADE |
| order_id | varchar |
| position | int |

### API

- `GET /api/order-stacks` — lista stack dell'agente
- `POST /api/order-stacks` — crea stack `{ orderIds, reason }`
- `DELETE /api/order-stacks/:stackId` — dissolvi stack
- `DELETE /api/order-stacks/:stackId/members/:orderId` — rimuovi un ordine dalla pila

### UI

- **Long-press (500ms)** su una scheda → modalità selezione.
- Checkbox su tutte le schede, scheda premuta pre-selezionata.
- Toolbar fissa in basso: contatore + bottone "Impila".
- Click "Impila" → dialog con input causale → salva via API.
- **Migrazione automatica:** al primo load, se localStorage ha stack, li migra via API e pulisce localStorage.

---

## Feature 5 — Note/todo nell'header ordini

### DB

**Tabella** `agents.order_notes`:
| Colonna | Tipo |
|---------|------|
| id | serial PK |
| agent_id | int FK |
| order_id | varchar |
| text | text |
| checked | boolean default false |
| position | int |
| created_at | timestamptz |
| updated_at | timestamptz |

### API

- `GET /api/orders/:orderId/notes` — lista note
- `POST /api/orders/:orderId/notes` — crea nota `{ text }`
- `PATCH /api/orders/:orderId/notes/:noteId` — toggle checked / modifica testo
- `DELETE /api/orders/:orderId/notes/:noteId` — cancella nota

### UI

**Collassata:** sotto nome cliente, indicatore compatto: icona appunti + "3/5". Verde se tutte completate, arancione se pendenti.

**Espansa (header):** sezione note tra header e tab:
- Lista checkbox con testo (stile todos)
- Input inline per nuova nota (+ Enter)
- Swipe o X per cancellare
- Completate in fondo, barrate, grigio

---

## Feature 6 — Fix clipping scroll pile

**File:** `OrderCardStack.tsx`, `OrderHistory.tsx`

- `overflow: hidden` sul container della pila.
- Z-index della pila < z-index dell'header/navbar.

---

## Feature 7 — Pile visivamente più marcate

**File:** `OrderCardStack.tsx`

- `STACK_OFFSET` da 12px a 16px.
- Ombra più pronunciata sulle schede sotto.
- Bordo laterale colorato: arancione per NC, blu per manuali.
- Badge più prominente: sfondo pieno con testo bianco.
- Gradiente/sfumatura sulle schede sottostanti per profondità.

---

## Feature 8 — Modale fullscreen per pile espanse

**File:** `OrderCardStack.tsx` (refactor della modalità expanded)

- **Tap sulla pila** → overlay fullscreen: `position: fixed, inset: 0, z-index: 1000, background: #f5f5f5`.
- **Header fisso:** titolo "Pila (N ordini)", causale, bottone [X].
- **Body scrollabile:** schede ordine elencate con gap.
- **Footer:** "Scollega pila" (manuali) o info NC (auto).
- **Animazione:** slide-up `translateY(100%) → translateY(0)`.
- **Chiusura:** X, swipe-down header, Escape.
- **Body scroll lock:** `document.body.style.overflow = "hidden"`.

---

## Ordine di implementazione (fasi)

1. Tab default Articoli (triviale, nessuna dipendenza)
2. Ricerca globale — nascondi non pertinenti (frontend only)
3. Swipe bidirezionale + indicatori (frontend only)
4. Fix clipping scroll (frontend only)
5. Pile visivamente più marcate (frontend only)
6. Modale fullscreen pile (frontend only, ma dipende da 5 per look coerente)
7. Stacking manuale + migrazione DB (backend + frontend, più complesso)
8. Note/todo ordini (backend + frontend, più complesso)
