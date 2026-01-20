# Manual Testing Instructions - Plan 20-03

**Date:** 2026-01-20
**System:** formicanera.com (VPS Production)
**Status:** ✅ Code Deployed - Ready for Testing

---

## 🎯 What We're Testing

1. **Price Sync with Auto-Matching**: Verify that price sync automatically matches prices from prices.db to products.db
2. **Excel IVA Upload**: Verify that Excel upload ONLY updates IVA field (not prices)

---

## ✅ Current Status on VPS

**Verified via SSH:**
- ✅ Code deployed (6 commits)
- ✅ Backend running successfully
- ✅ prices.db exists with 4,976 prices
- ✅ **4,532 products** already have `priceSource='prices-db'` (auto-matching already worked!)
- ✅ Last sync: 2026-01-20T13:49:16.000Z

---

## 📋 Test 1: Price Sync + Auto-Matching

### Expected Behavior

When you trigger a price sync:
1. Downloads PDF from Archibald ERP (~15s)
2. Parses 4,976 prices (~60s)
3. Saves to `prices.db` (~2s)
4. **AUTO-MATCHES** prices to `products.db` (~5s)
5. Updates products with `priceSource='prices-db'`

### Steps

1. **Login to Admin Panel**
   - Go to: https://formicanera.com/admin
   - Username: `ikiA0930`
   - Password: `Fresis26@`

2. **Trigger Price Sync**
   - Find the section: **"🔄 Sincronizzazione Dati da Archibald ERP"**
   - Click "Avvia Sync" on the **"🟠 Barra Prezzi"** (orange bar)
   - Wait approximately 90 seconds

3. **Observe Progress**
   - The orange bar should show progress:
     - "Scaricamento PDF prezzi da Archibald..."
     - "Estrazione dati PDF..."
     - "Salvataggio X prezzi..."
     - **"Matching prezzi a prodotti..."** ← NEW!
     - "✓ Sync completato in Xs"

4. **Verify Results**
   - The sync should complete successfully
   - Check the backend logs (optional):
     ```bash
     ssh -i ~/archibald_vps deploy@91.98.136.198
     cd /home/deploy/archibald-app
     docker compose logs backend --tail 100 | grep -i "match"
     ```

### Success Criteria

- [ ] Sync completes without errors
- [ ] Progress shows "Matching" status
- [ ] Approximately 4,976 prices synced
- [ ] Products updated with prices from prices.db
- [ ] No errors in backend logs

---

## 📋 Test 2: Excel IVA Upload (IVA ONLY - NO Prices)

### Expected Behavior

When you upload an Excel file:
1. **ONLY** the `vat` field is updated
2. `vatSource` is set to `'excel'`
3. **Prices are NOT touched** (remain from prices-db)
4. File is parsed and then deleted (not stored)

### Preparation: Create Test Excel

You need a file with these columns (minimum):
- **ID** (e.g., "001627K0")
- **IVA** (e.g., 22)

Optional columns:
- Codice Articolo
- Descrizione
- Prezzo (will be ignored since `overwritePrices=false`)

**Sample Excel Structure:**

| Nome Gruppi | ID        | Codice Articolo | Descrizione    | Conf. | Prezzo unit. | Prezzo conf. | IVA |
|-------------|-----------|-----------------|----------------|-------|--------------|--------------|-----|
| Gruppo A    | 001627K0  | 1.204.005       | Test Product 1 | 5     | 10.50        | 52.50        | 22  |
| Gruppo B    | 001627K2  | 1.204.006       | Test Product 2 | 1     | 8.00         | 8.00         | 10  |
| Gruppo C    | 001627K3  | 1.204.007       | Test Product 3 | 10    | 15.00        | 150.00       | 22  |

**Note:** Use actual product IDs from your database for best results.

### Steps

1. **Login to Admin Panel**
   - Same credentials as Test 1

2. **Navigate to Excel Section**
   - Scroll to: **"📊 Carica Listino Excel (Solo IVA)"**
   - This is the NEW section added in Plan 20-03

3. **Upload Excel File**
   - Click "Seleziona file Excel (.xlsx, .xls)"
   - Choose your test Excel file
   - File uploads automatically on selection

4. **Observe Upload**
   - You should see: "⏳ Caricamento file Excel in corso..."
   - Then an alert popup:
     ```
     ✅ IVA caricata con successo!

     📊 Totale righe: X
     ✓ Prodotti matchati: Y
     🏷️  IVA aggiornate: Z
     ```

5. **Verify Results**
   - The green box should show:
     - Total rows processed
     - Products matched
     - **IVA aggiornate** (count)
   - **IMPORTANT**: Notice there's NO "Prezzi aggiornati" field!

### Verification - Check Database (SSH)

To confirm that ONLY IVA was updated:

```bash
# SSH to VPS
ssh -i ~/archibald_vps deploy@91.98.136.198

# Navigate to app
cd /home/deploy/archibald-app

# Check a product that was in your Excel
docker compose exec backend node -e "
const { ProductDatabase } = require('./dist/product-db.js');
const db = ProductDatabase.getInstance();

// Replace with actual ID from your Excel
const product = db.getProductById('001627K0');

if (product) {
  console.log('Product:', product.id);
  console.log('  Name:', product.name);
  console.log('  Price:', product.price, '(source:', product.priceSource + ')');
  console.log('  VAT:', product.vat + '% (source:', product.vatSource + ')');
  console.log('');
  console.log('VERIFICATION:');
  console.log('  ✓ VAT should be from Excel (vatSource=excel)');
  console.log('  ✓ Price should be from prices-db (priceSource=prices-db)');
  console.log('  ✗ Price should NOT be from Excel!');
} else {
  console.log('Product not found - use a real ID from your database');
}
"

# Count products with Excel VAT
docker compose exec backend node -e "
const { ProductDatabase } = require('./dist/product-db.js');
const db = ProductDatabase.getInstance();
const count = db['db'].prepare('SELECT COUNT(*) as c FROM products WHERE vatSource = ?').get('excel');
console.log('Products with vatSource=excel:', count.c);
"
```

### Success Criteria

- [ ] Excel uploads successfully
- [ ] Alert shows matched products count
- [ ] **ONLY IVA field updated** (no "Prezzi aggiornati" in results)
- [ ] `vatSource` set to 'excel' for matched products
- [ ] `priceSource` remains 'prices-db' (NOT changed to 'excel')
- [ ] Unmatched products listed (if any)
- [ ] File deleted after processing (not stored)

---

## 📊 Summary of What Changed

### Before (Old Behavior)
```
Price Sync → Only populates prices.db
Excel Upload → Updates both price AND vat
Matching → Manual via /api/prices/match
```

### After (New Behavior - Plan 20-03)
```
Price Sync → Populates prices.db + AUTO-MATCH to products.db ✨
Excel Upload → Updates ONLY vat (prices from price sync)
Matching → AUTOMATIC after price sync ✨
```

---

## 🔄 Complete Workflow Test

To test the entire integrated workflow:

1. **Upload Excel IVA** (Test 2)
   - This sets IVA values on products
   - Products now have: `vat=22% (source:excel)`

2. **Trigger Price Sync** (Test 1)
   - Downloads PDF
   - Parses prices
   - Saves to prices.db
   - **AUTO-MATCHES** to products.db

3. **Final State**
   - Products have:
     - `price` from prices.db (priceSource='prices-db')
     - `vat` from Excel (vatSource='excel')
   - Dual source tracking!

---

## 🐛 Troubleshooting

### Price Sync Fails

**Check backend logs:**
```bash
docker compose logs backend --tail 50 | grep -i error
```

**Common issues:**
- PDF download timeout (increase timeout in code)
- Parsing errors (check PDF structure)
- Browser crashed (restart backend)

### Excel Upload Fails

**Check error message in alert**

**Common issues:**
- Wrong file format (must be .xlsx or .xls)
- Missing required columns (ID, IVA)
- Product IDs don't match database

### No Products Matched

**Possible reasons:**
- Excel IDs don't exist in products.db
- Codice Articolo format mismatch
- Products not synced yet (run product sync first)

---

## 📞 Support

If tests fail or unexpected behavior occurs:

1. Check backend logs: `docker compose logs backend --tail 100`
2. Verify database state (commands provided above)
3. Check browser console for frontend errors
4. Report issues with specific error messages

---

## ✅ Test Completion Checklist

After completing both tests:

- [ ] Price sync completes successfully
- [ ] Auto-matching runs after sync
- [ ] Products have priceSource='prices-db'
- [ ] Excel upload processes successfully
- [ ] ONLY IVA field updated (not prices)
- [ ] Products have vatSource='excel'
- [ ] Dual source tracking working
- [ ] No errors in backend logs
- [ ] UI shows correct statistics

---

**Document Created:** 2026-01-20
**Plan:** 20-03 (Excel IVA Upload & Price Matching)
**Status:** Ready for Manual Testing
