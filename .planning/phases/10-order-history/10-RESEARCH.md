# Phase 10: Order History - Research

**Researched:** 2026-01-15
**Domain:** Puppeteer scraping of Archibald ERP order history with DevExpress UI
**Confidence:** MEDIUM (based on existing project patterns, Archibald-specific discovery needed)

<research_summary>
## Summary

Phase 10 richiede lettura dello storico ordini da Archibald ERP. A differenza di ricerca ecosystem tradizionale, questo è un **discovery task specifico del progetto**: esplorare l'UI Archibald per ordini storici e riusare i pattern Puppeteer/DevExpress già consolidati nelle fasi precedenti.

**Key insight**: Non serve ricercare nuove tecnologie. Il progetto ha già:
- ✅ Pattern Puppeteer consolidati (Phase 3, 4.1)
- ✅ DevExpress helper methods documentati (6 metodi riusabili)
- ✅ Session management per-user (Phase 6)
- ✅ UI patterns definiti (banking app timeline da CONTEXT.md)

**Approccio raccomandato**: Discovery pratico dell'UI Archibald per ordini → Riuso pattern esistenti → Mappatura selectors → Implementazione scraper.

**Primary recommendation:** Iniziare con Plan 10-01 (Research Archibald UI) come discovery pratico, non ricerca ecosystem.
</research_summary>

<standard_stack>
## Standard Stack

**Già stabilito nel progetto** - nessuna nuova libreria necessaria:

### Core (Existing)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| puppeteer | ~21.x | Browser automation per scraping Archibald | ✅ In uso (Phase 3, 4.1) |
| @types/puppeteer | latest | TypeScript types | ✅ Configured |

### Backend (Existing)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| express | ^4.x | API endpoints per order history | ✅ In uso |
| better-sqlite3 | ^9.x | Cache ordini storici (opzionale) | ✅ In uso |
| winston | ^3.x | Logging scraper operations | ✅ In uso |

### Frontend (Existing)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| react | 19.x | UI components per timeline ordini | ✅ In uso |
| dexie | 4.2.1 | IndexedDB cache ordini (opzionale) | ✅ In uso (Phase 8) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Puppeteer scraping | Archibald API (se esiste) | API ideale ma Archibald non espone API pubblica |
| Custom scraper | Playwright | Playwright più moderno ma Puppeteer già integrato e funzionante |
| No cache | Full cache con sync | Cache aggiunge complessità, valutare se necessario per MVP |

**Installation:**
Nessuna - tutte le librerie già presenti nel progetto.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Pattern già consolidati nel progetto da riusare:

### Pattern 1: DevExpress Helper Methods (Phase 3.08)
**What:** 6 metodi riusabili per interagire con UI DevExpress
**When to use:** Sempre quando si interagisce con dropdown, tabelle, celle DevExpress
**Existing helpers:**
```typescript
// Da archibald-bot.ts (già implementato)
- waitForDevExpressDropdown()
- selectDevExpressDropdownByText()
- waitForDevExpressTableLoad()
- clickDevExpressTableRow()
- getDevExpressTableCellValue()
- waitForDevExpressSaveComplete()
```

### Pattern 2: Session-Scoped Scraping (Phase 6)
**What:** Ogni utente ha sessione Puppeteer isolata (BrowserContext)
**When to use:** Per order history per-user
**Example:**
```typescript
// Pattern già implementato in browser-pool.ts
const context = await browserPool.acquireContext(userId);
const page = await context.newPage();
// Scraping operations...
await browserPool.releaseContext(userId);
```

### Pattern 3: Pagination Handling (Da implementare - simile a customer sync)
**What:** Iterare su pagine multiple se order history è paginato
**When to use:** Se Archibald mostra ordini su multiple pagine
**Pattern from customer-sync-service.ts:**
```typescript
// Pattern pagination esistente
let hasMorePages = true;
let currentPage = 1;

while (hasMorePages) {
  // Scrape current page
  const orders = await scrapePage(page, currentPage);

  // Check for next page
  hasMorePages = await hasNextPageButton(page);
  if (hasMorePages) {
    await clickNextPage(page);
    currentPage++;
  }
}
```

### Pattern 4: Timeline UI (Banking App - da CONTEXT.md)
**What:** Card espandibili stile banking app (da Phase 8 patterns)
**When to use:** Frontend order history display
**Pattern:**
```typescript
// Simile a offline indicator (Phase 8.06)
<div className="order-timeline">
  {ordersGroupedByPeriod.map(group => (
    <div key={group.period}>
      <h3>{group.period}</h3> {/* Oggi, Settimana, Mese */}
      {group.orders.map(order => (
        <OrderCard
          order={order}
          expandable={true}
          onExpand={() => loadOrderDetail(order.id)}
        />
      ))}
    </div>
  ))}
</div>
```

### Anti-Patterns to Avoid
- **Scraping senza session management:** Ogni user deve avere propria sessione (già risolto Phase 6)
- **Hardcoded selectors senza fallback:** DevExpress IDs dinamici, usare text content (lezione Phase 3.08)
- **Scraping tutto ogni volta:** Cache ordini recenti se appropriato (Pattern Phase 8)
- **Ignorare stati ordine:** Archibald traccia stati (in lavorazione/evaso/spedito) - estrarre tutto
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

Questi problemi hanno già soluzioni nel progetto:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DevExpress interaction | Custom selectors/wait logic | Existing helper methods (6 methods) | Phase 3.08 created battle-tested helpers, reduce duplication ~40% |
| Session management | Custom browser pool | Existing BrowserPool with userId routing | Phase 6 implemented production-grade multi-user sessions |
| UI timeline/cards | Custom components | Adapt banking app patterns (Phase 8) | Consistent UX, users già conoscono pattern |
| Pagination logic | Custom pagination | Adapt customer-sync pagination pattern | Already works with DevExpress, proven reliable |
| Cache strategy | Custom cache | Dexie.js + IndexedDB (Phase 8) | If caching needed, reuse existing infrastructure |
| Logging | console.log | Winston logger | Phase 2 standardized logging, already configured |

**Key insight:** Phase 10 è **integration work**, non new technology. Ogni problema ha soluzione esistente nel progetto da riusare/adattare.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

Dalla storia del progetto (Phases 3, 4.1, 6):

### Pitfall 1: DevExpress Dynamic IDs
**What goes wrong:** Selectors basati su ID DevExpress falliscono tra sessioni
**Why it happens:** DevExpress genera IDs dinamici ogni volta
**How to avoid:** Usare text content per identificare elementi (lezione Phase 3.08)
**Warning signs:** Selettori che funzionano una volta poi falliscono

### Pitfall 2: Race Conditions con Backend Sync
**What goes wrong:** Order scraping interferisce con customer/product sync
**Why it happens:** Processi concorrenti accedono a Archibald simultaneamente
**How to avoid:** Usare PriorityManager (Phase 4.1-01) per coordinare accessi
**Warning signs:** Scraping fallisce random, timeout sporadici

### Pitfall 3: Pagination Infinita
**What goes wrong:** Loop infinito se "Next page" button sempre presente
**Why it happens:** Condizione di terminazione non robusta
**How to avoid:** Verificare contenuto pagina, non solo presenza bottone next
**Warning signs:** Scraping non termina mai, stesse righe processate ripetutamente

### Pitfall 4: Missing Order Detail Navigation
**What goes wrong:** Estratta solo lista ordini, non dettaglio completo (articoli/quantità/prezzi)
**Why it happens:** Archibald probabilmente richiede click su ordine per vedere dettagli
**How to avoid:** Discovery deve mappare anche navigation flow per dettagli
**Warning signs:** API risponde ma con dati incompleti/superficiali

### Pitfall 5: Stati Ordine Non Estratti
**What goes wrong:** Frontend mostra ordini ma senza stato (in lavorazione/evaso/spedito)
**Why it happens:** Stato è campo importante ma potrebbe essere in colonna nascosta o dropdown
**How to avoid:** Discovery deve identificare dove Archibald mostra stati ordine
**Warning signs:** CONTEXT.md richiede stati ma scraper non li estrae

### Pitfall 6: Tracking Spedizione Mancante
**What goes wrong:** Badge "Tracking disponibile" non appare mai
**Why it happens:** Tracking è aggiunto dopo che ordine creato, forse in sezione separata
**How to avoid:** Discovery deve identificare dove/quando tracking appare in Archibald
**Warning signs:** User richiede tracking (CONTEXT.md) ma feature non funziona

### Pitfall 7: Performance con Molti Ordini
**What goes wrong:** Scraping 1000+ ordini impiega troppo tempo
**Why it happens:** Scraping sequenziale ordine-per-ordine è lento
**How to avoid:** Implementare pagination intelligente, cache, o limit temporale (es: ultimi 30 giorni)
**Warning signs:** Agent aspetta minuti per vedere storico, timeout backend
</common_pitfalls>

<code_examples>
## Code Examples

Pattern esistenti da riusare/adattare:

### DevExpress Table Scraping (da customer-sync-service.ts)
```typescript
// Source: archibald-web-app/backend/src/customer-sync-service.ts (Phase 4.1-04)
async function scrapeOrderTable(page: Page): Promise<Order[]> {
  // Wait for DevExpress table to load
  await page.waitForSelector('.dxgvControl', { timeout: 30000 });

  // Extract rows
  const orders = await page.$$eval(
    '.dxgvDataRow',
    (rows) => rows.map(row => {
      const cells = row.querySelectorAll('.dxgv');
      return {
        id: cells[0]?.textContent?.trim() || '',
        date: cells[1]?.textContent?.trim() || '',
        customer: cells[2]?.textContent?.trim() || '',
        total: cells[3]?.textContent?.trim() || '',
        status: cells[4]?.textContent?.trim() || '',
      };
    })
  );

  return orders;
}
```

### Session-Scoped API Endpoint (da index.ts)
```typescript
// Source: archibald-web-app/backend/src/index.ts (Phase 6)
// Pattern per endpoint order history con JWT auth
app.get(
  "/api/orders/history",
  authenticateJWT,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user.userId;

      // Acquire user-specific browser context
      const context = await browserPool.acquireContext(userId);

      // Scrape order history for this user
      const orders = await orderHistoryService.getOrders(context, userId);

      // Release context
      await browserPool.releaseContext(userId);

      res.json({ success: true, data: orders });
    } catch (error) {
      logger.error("Failed to fetch order history", { error, userId: req.user.userId });
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  }
);
```

### Timeline UI Component (banking app pattern)
```typescript
// Pattern da CONTEXT.md - banking app style
interface OrderCardProps {
  order: Order;
  onExpand: (orderId: string) => void;
  expanded: boolean;
}

function OrderCard({ order, onExpand, expanded }: OrderCardProps) {
  return (
    <div className="order-card" onClick={() => onExpand(order.id)}>
      {/* Collapsed view */}
      <div className="order-summary">
        <span className="customer">{order.customerName}</span>
        <span className="date">{formatDate(order.date)}</span>
        <span className="total">{formatCurrency(order.total)}</span>
        <span className={`status status-${order.status}`}>
          {order.status}
        </span>
        {order.hasTracking && (
          <span className="tracking-badge">Tracking disponibile</span>
        )}
      </div>

      {/* Expanded view */}
      {expanded && (
        <div className="order-detail">
          {/* Timeline stati */}
          <OrderTimeline updates={order.statusUpdates} />

          {/* Lista articoli */}
          <OrderItems items={order.items} />

          {/* Documenti */}
          <OrderDocuments documents={order.documents} />
        </div>
      )}
    </div>
  );
}
```
</code_examples>

<sota_updates>
## State of the Art (2024-2025)

Non applicabile - questo non è un domain con "ecosystem" in evoluzione. È scraping specifico di un ERP legacy (DevExpress XAF).

**Project-specific updates:**
| Old Pattern | Current Pattern | When Changed | Impact |
|-------------|-----------------|--------------|--------|
| Single browser instance | BrowserContext pooling | Phase 6 | Multi-user order history ora possibile |
| Manual selector maintenance | DevExpress helper methods | Phase 3.08 | Riduce duplicazione ~40%, più maintainable |
| Sync senza coordinamento | PriorityManager | Phase 4.1-01 | Elimina race conditions con order history scraping |

**Architecture decisions relevant to Phase 10:**
- **Phase 6 multi-user:** Order history deve essere per-user, non globale
- **Phase 8 offline:** Consider caching recent orders in IndexedDB (opzionale)
- **Phase 3.08 DevExpress:** Riusare helper methods per consistency
</sota_updates>

<open_questions>
## Open Questions

Queste domande richiedono **discovery pratico su Archibald UI** (Plan 10-01):

1. **Dove si trova la sezione ordini storici in Archibald?**
   - What we know: Menu "Ordini" esiste (Phase 3.08)
   - What's unclear: Submenu o link per "Storico ordini" vs "Nuovo ordine"?
   - Recommendation: Manual exploration o screenshot durante Plan 10-01

2. **Come è strutturata la lista ordini?**
   - What we know: DevExpress tables (come clienti/prodotti)
   - What's unclear: Colonne esatte, ordinamento default, pagination
   - Recommendation: Screenshot + HTML inspection in Plan 10-01

3. **Come si accede al dettaglio ordine completo?**
   - What we know: Archibald usa modal/page per dettagli (Phase 3.08 pattern)
   - What's unclear: Click su row? Pulsante "Dettagli"? New page?
   - Recommendation: Test navigation flow durante discovery

4. **Dove/quando appare il tracking spedizione?**
   - What we know: CONTEXT.md richiede badge "Tracking disponibile"
   - What's unclear: Campo in lista? Solo in dettaglio? Campo separato?
   - Recommendation: Chiedere a user o discovery su ordine test già spedito

5. **Dove sono memorizzati i documenti (fatture/DDT)?**
   - What we know: CONTEXT.md richiede pulsante "Vedi documenti"
   - What's unclear: Link in lista ordini? Solo in dettaglio? URL esterni?
   - Recommendation: Discovery su ordine con fattura emessa

6. **Timeline aggiornamenti Archibald - dove si trova?**
   - What we know: CONTEXT.md richiede timeline stati con timestamp
   - What's unclear: Campo "History"? Colonna "Log"? Tab separata?
   - Recommendation: Inspect ordine con storia (creato → evaso → spedito)

7. **Serve cache ordini o fetch on-demand?**
   - What we know: Phase 8 ha IndexedDB infra, ma ordini cambiano meno frequentemente
   - What's unclear: Volume ordini, frequenza accesso, query patterns
   - Recommendation: Start with no cache (simpler), add se performance issue
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- **Project codebase** - Existing implementations:
  - `archibald-web-app/backend/src/archibald-bot.ts` - DevExpress helpers (Phase 3.08)
  - `archibald-web-app/backend/src/customer-sync-service.ts` - Pagination pattern (Phase 4.1-04)
  - `archibald-web-app/backend/src/browser-pool.ts` - Session management (Phase 6)
  - `.planning/phases/10-order-history/10-CONTEXT.md` - User vision and requirements

### Secondary (MEDIUM confidence)
- **Project decisions** (STATE.md):
  - Phase 3.08: DevExpress patterns and helper methods
  - Phase 6: Multi-user session architecture
  - Phase 8: IndexedDB cache patterns (if applicable)

### Tertiary (LOW confidence - needs validation)
- **Archibald UI for order history**: UNKNOWN - requires manual discovery in Plan 10-01
- **Order detail structure**: UNKNOWN - requires inspection during Plan 10-01
- **Tracking/document location**: UNKNOWN - needs user input or discovery

**CRITICAL NOTE:** La "ricerca" vera per questa fase non è su web/docs/ecosystem, ma **pratica su Archibald ERP**. Plan 10-01 deve documentare:
- Screenshots UI ordini storici
- Selectors DevExpress identificati
- Navigation flow per dettagli
- Campi disponibili (articoli, quantità, prezzi, stati, tracking, documenti)
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Puppeteer (già in uso)
- Existing patterns: DevExpress helpers, session management, pagination
- Discovery needed: Archibald UI per ordini storici (Plan 10-01)
- Frontend: Banking app timeline pattern (da CONTEXT.md)

**Confidence breakdown:**
- Technology stack: **HIGH** - già tutto presente nel progetto
- Architecture patterns: **HIGH** - riuso pattern consolidati Phases 3, 6, 8
- DevExpress scraping: **MEDIUM** - pattern noti ma selectors specifici da scoprire
- Archibald UI structure: **LOW** - richiede discovery pratico (Plan 10-01)
- Order detail navigation: **LOW** - richiede test su Archibald
- Tracking/documents location: **LOW** - richiede user input o discovery

**Research approach:**
Questo non è research "ecosystem" tradizionale. È **project-specific integration** che riusa pattern esistenti + discovery pratico Archibald UI.

**Research date:** 2026-01-15
**Valid until:** N/A - project-specific, non ecosystem research
**Ready for planning:** YES - con caveat che Plan 10-01 deve essere discovery pratico Archibald UI

**Next step:** Plan 10-01 (Research Archibald UI) deve:
1. Manual exploration Archibald per trovare sezione ordini storici
2. Screenshot UI + HTML inspection per identificare selectors
3. Document navigation flow per dettaglio ordine
4. Map available fields (articoli, quantità, prezzi, stati, tracking, documenti)
5. Identify pagination se presente
</metadata>

---

*Phase: 10-order-history*
*Research completed: 2026-01-15*
*Ready for planning: Yes (with Plan 10-01 as practical discovery)*
