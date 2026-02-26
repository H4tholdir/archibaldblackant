# Piano: Ottimizzazione Batch Sync Articoli Ordini

## Problema

La sync degli articoli ordini processa ~1 ordine ogni 10 minuti perché:
1. Ogni ordine è un job separato nella coda BullMQ
2. Ogni job richiede: acquire browser context → login → naviga pagina → download PDF → parse → release
3. L'overhead del browser context acquire/release (login compreso) domina il tempo
4. I job articoli competono con altri sync (customers, orders, ddt, invoices) nella stessa coda

Con ~50+ ordini non sincronizzati, servono ore per smaltire il backlog.

## Soluzione proposta: Batch PDF Download

### Concetto

Un singolo job `sync-order-articles-batch` che:
1. Acquisisce UN context browser
2. Fa login UNA volta
3. Scarica i PDF di N ordini in sequenza (stessa sessione browser)
4. Parsa e salva tutti gli articoli
5. Rilascia il context

### Vantaggi

- **~3-4x più veloce**: l'overhead login+context è ammortizzato su N ordini
- **Meno contesa nella coda**: 1 job batch invece di N job singoli
- **Meno carico su Archibald**: una sola sessione browser

### Implementazione

#### 1. Nuovo handler: `sync-order-articles-batch.ts`

```typescript
type SyncOrderArticlesBatchData = {
  orderIds: string[];
};

async function handleSyncOrderArticlesBatch(
  deps: SyncOrderArticlesBatchDeps,
  data: SyncOrderArticlesBatchData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<BatchResult> {
  // 1. Acquire single browser context
  const ctx = await deps.acquireContext(userId);
  try {
    const results = [];
    for (let i = 0; i < data.orderIds.length; i++) {
      onProgress(Math.round((i / data.orderIds.length) * 100),
        `Articoli ordine ${i + 1}/${data.orderIds.length}`);

      // 2. Download PDF for this order (reusing same context)
      const pdfPath = await deps.downloadOrderArticlesPDF(ctx, orderIds[i]);

      // 3. Parse + enrich + save (same as current handler)
      const articles = await deps.parsePdf(pdfPath);
      // ... enrich with VAT, save to DB, cleanup

      results.push({ orderId: orderIds[i], articlesCount: articles.length });
    }
    return { processedOrders: results.length, results };
  } finally {
    await deps.releaseContext(userId, ctx);
  }
}
```

#### 2. Modifica sync-scheduler.ts

Invece di N job `sync-order-articles`, enqueue 1 job `sync-order-articles-batch`:

```typescript
if (getOrdersNeedingArticleSync) {
  pendingTimeouts.push(setTimeout(async () => {
    const orderIds = await getOrdersNeedingArticleSync(userId, ARTICLE_SYNC_BATCH_LIMIT);
    if (orderIds.length > 0) {
      // UN solo job batch invece di N job singoli
      enqueue('sync-order-articles-batch', userId, { orderIds });
    }
  }, ARTICLE_SYNC_DELAY_MS));
}
```

#### 3. Registrazione in main.ts

Aggiungere il nuovo handler nella mappa handlers, riutilizzando la stessa logica del bot.

### File da modificare

| File | Modifica |
|------|----------|
| `backend/src/operations/handlers/sync-order-articles-batch.ts` | Nuovo handler batch |
| `backend/src/operations/operation-types.ts` | Aggiungere tipo `sync-order-articles-batch` |
| `backend/src/sync/sync-scheduler.ts` | Enqueue batch invece di singoli |
| `backend/src/main.ts` | Registrare handler batch |
| `backend/src/bot/archibald-bot.ts` | Eventuale metodo `downloadOrderArticlesPDF` che accetta context come parametro (già esiste) |

### Stima impatto

| Metrica | Prima | Dopo |
|---------|-------|------|
| Ordini/ciclo | ~1 | ~10 |
| Tempo per 10 ordini | ~100 min | ~15-20 min |
| Job nella coda per ciclo | 5-10 | 1 |
| Login browser per ciclo | 5-10 | 1 |

### Backward compatibility

- Il vecchio handler `sync-order-articles` (singolo) resta per il pulsante manuale "Aggiorna Articoli" nel frontend
- Il batch è solo per lo scheduler automatico
