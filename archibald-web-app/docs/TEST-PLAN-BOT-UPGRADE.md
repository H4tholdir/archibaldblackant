# Piano Test Bot Upgrade - DevExpress API Migration

## Ordine di Test
- **Cliente**: Fresis Soc Cooperativa
- **Articolo**: TD1272.314
- **Quantita**: 1 pz

## Prerequisiti
- Backend deve essere in esecuzione (`npm run dev` nel backend/)
- Redis deve essere attivo
- Il bot usa headless=false in dev (browser visibile)

## Fasi del Test

### Fase 1: Creare script di test e2e
Creare `backend/src/scripts/test-bot-upgrade.ts` che:
1. Crea un'istanza ArchibaldBot (legacy mode, senza userId)
2. Chiama `initialize()` + `login()`
3. Chiama `createOrder()` con i dati di test
4. Logga ogni step per verifica

### Fase 2: Verifiche passo per passo
Per ogni step del flusso, verificare:

| Step | Cosa verificare | Come |
|------|----------------|------|
| 2.5 Discovery | `salesLinesGridName` non e null, contiene "dviSALESLINEs" | Log output |
| 4 AddNew | API `gridAddNewRow()` funziona (non cade nel fallback DOM) | Log "AddNewRow via DevExpress API" |
| 5.2 Search | Campo INVENTTABLE focused, codice articolo digitato | Log + screenshot |
| 5.3 Variant | Variante trovata nel dropdown | Log |
| 5.7 UpdateEdit | API `gridUpdateEdit()` funziona (non cade nel fallback) | Log "UpdateEdit via DevExpress API" |
| 9 Extract ID | Order ID estratto | Log |
| 9.2 Line discount | "N/A" impostato | Log |
| 10 Save | "Salva e chiudi" cliccato con successo | Log |

### Fase 3: Analisi risultati
- Se tutti gli step passano con API: migrazione riuscita
- Se alcuni cadono nel fallback DOM: analizzare e fixare
- Se errori: screenshot + log per debug

## Dati OrderData per il test
```typescript
const testOrderData = {
  customerName: "Fresis Soc Cooperativa",
  items: [
    {
      articleCode: "TD1272.314",
      quantity: 1,
      productName: "TD1272.314",
    },
  ],
};
```

## Comandi
```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend
npx tsx src/scripts/test-bot-upgrade.ts
```

## File modificati nell'upgrade
- `backend/src/archibald-bot.ts`:
  - Aggiunto proprieta `salesLinesGridName: string | null`
  - Aggiunto 6 helper methods: `discoverSalesLinesGrid()`, `waitForGridCallback()`, `gridAddNewRow()`, `gridUpdateEdit()`, `getGridPageInfo()`, `gridGotoLastPage()`
  - STEP 2.5: Discovery controlli DevExpress (nuovo)
  - STEP 4: AddNew via API con fallback DOM (sostituito ~150 righe di multi-strategy click)
  - Loop articoli - UpdateEdit: via API con fallback DOM (sostituito ~40 righe con busy-wait)
  - 5.8 AddNew next article: via API + paginazione con fallback DOM (sostituito ~280 righe)
  - Fix bug linea 4554: `orderData.items.length` -> `itemsToOrder.length`
  - Rimosso 2x `wait(1500)` nel flusso Prezzi e Sconti

## Pattern accesso grid nel bot
```typescript
// I nomi controlli contengono hash sessione che cambiano
// Esempio: "Vertical_v7_61007966_MainLayoutEdit_xaf_l715_pg_xaf_l721_xaf_dviSALESLINEs_v10_30726963_LE_v10"
// Il bot cerca per keyword "dviSALESLINEs" + verifica metodo AddNewRow

// Accesso via API:
await page.evaluate((name) => {
    const grid = ASPxClientControl.GetControlCollection().GetByName(name);
    grid.AddNewRow(); // o UpdateEdit(), GotoPage(), etc.
}, this.salesLinesGridName);

// Attesa callback:
await page.waitForFunction((name) => {
    const grid = ASPxClientControl.GetControlCollection().GetByName(name);
    return grid && !grid.InCallback();
}, { polling: 100, timeout: 15000 }, this.salesLinesGridName);
```
