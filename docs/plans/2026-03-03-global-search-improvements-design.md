# Global Search Improvements Design

## Problem

The global search ("Ricerca globale") in the Orders page has three issues:

1. **Articles not searchable**: `articleSearchText` and `order.items` are defined in the frontend `Order` type but never populated by the backend. Searching for article codes/descriptions returns zero results.
2. **Highlighting gaps**: Several searched fields lack `HighlightText` in tabs (DDT, invoice, tracking). Some fields like `notes`/`customerNotes` are not searched at all.
3. **Hidden matches**: When a match is inside a collapsed card or inactive tab, the user has no way to find it without manually expanding every card and clicking every tab.

## Solution

### A. Backend: Populate `article_search_text`

**Migration 015**: Add `article_search_text TEXT` column to `agents.order_records` with a backfill query from existing `order_articles`.

**3 write points** update the column after saving articles:
- `sync-order-articles.ts` (line ~126 UPDATE query)
- `submit-order.ts` (after article INSERT)
- `edit-order.ts` (after article INSERT)

Format: `"ART001 Cavetto morsetto | ART002 Guaina termica"` — concatenation of `article_code + ' ' + article_description` separated by ` | `.

**`mapRowToOrder`**: Map `row.article_search_text` to `articleSearchText`.

### B. Frontend: Missing fields in search

Add to `matchesGlobalSearch`:
- `order.notes`
- `order.customerNotes`

### C. Frontend: Auto-expand + auto-tab

When search matches an order on a field that lives in an internal tab:

1. **`getMatchingTabs(order, query)`**: Returns which tabs contain matches (panoramica, articoli, ddt, fattura, tracking).
2. **Auto-expand card**: `OrderHistory` tracks which orders should auto-expand based on search. Pass `autoExpandForSearch` prop to cards.
3. **Auto-select tab**: Pass `suggestedTab` prop to `OrderCardNew`. When set, the card opens to that tab instead of the default.
4. **ScrollIntoView**: Already handled by `useSearchMatches` hook via `data-search-match` DOM query.

Tab priority (first match wins): panoramica > articoli > ddt > fattura > tracking.

### D. Frontend: Responsive navigation bar

- Add `flexWrap: "wrap"` to the floating results bar
- Ensure text doesn't overflow on mobile viewports
