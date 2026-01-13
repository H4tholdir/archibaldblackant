#!/usr/bin/env tsx
/**
 * Script per assegnare prezzi di default ai prodotti senza prezzo
 *
 * Strategia:
 * 1. Calcola prezzo medio per gruppo di prodotti
 * 2. Assegna prezzo medio del gruppo ai prodotti senza prezzo
 * 3. Se gruppo non ha prezzi, usa prezzo medio globale
 * 4. Pulisce record spazzatura (lun, mar, Gen, Feb, ecc.)
 */

import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "../../data/products.db");
const db = new Database(dbPath);

console.log("🔧 Assegnazione prezzi di default ai prodotti...\n");

// Step 1: Pulisci record spazzatura (giorni settimana, mesi)
console.log("Step 1: Pulizia record spazzatura");
const garbageIds = ["lun", "mar", "mer", "gio", "ven", "sab", "dom",
                     "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
                     "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const deleteGarbage = db.prepare("DELETE FROM products WHERE id = ?");
let garbageDeleted = 0;
for (const id of garbageIds) {
  const result = deleteGarbage.run(id);
  garbageDeleted += result.changes;
}
console.log(`✅ Eliminati ${garbageDeleted} record spazzatura\n`);

// Step 2: Calcola prezzo medio per gruppo
console.log("Step 2: Calcolo prezzi medi per gruppo");
const groupAverages = db.prepare(`
  SELECT
    groupCode,
    ROUND(AVG(price), 2) as avg_price,
    COUNT(*) as products_with_price
  FROM products
  WHERE price > 0 AND groupCode IS NOT NULL
  GROUP BY groupCode
`).all() as Array<{ groupCode: string; avg_price: number; products_with_price: number }>;

console.log(`📊 ${groupAverages.length} gruppi con prezzi medi calcolati`);

// Step 3: Calcola prezzo medio globale (fallback)
const globalAvg = db.prepare(`
  SELECT ROUND(AVG(price), 2) as avg_price
  FROM products
  WHERE price > 0
`).get() as { avg_price: number };

console.log(`📊 Prezzo medio globale: €${globalAvg.avg_price}\n`);

// Step 4: Assegna prezzi di default
console.log("Step 3: Assegnazione prezzi di default");

const updatePrice = db.prepare(`
  UPDATE products
  SET price = ?
  WHERE id = ?
`);

let assignedByGroup = 0;
let assignedGlobal = 0;

const productsWithoutPrice = db.prepare(`
  SELECT id, name, groupCode
  FROM products
  WHERE price IS NULL OR price = 0
`).all() as Array<{ id: string; name: string; groupCode: string | null }>;

console.log(`🔍 Trovati ${productsWithoutPrice.length} prodotti senza prezzo\n`);

const transaction = db.transaction((products: typeof productsWithoutPrice) => {
  for (const product of products) {
    let priceToAssign = globalAvg.avg_price;

    // Cerca prezzo medio del gruppo
    if (product.groupCode) {
      const groupAvg = groupAverages.find(g => g.groupCode === product.groupCode);
      if (groupAvg) {
        priceToAssign = groupAvg.avg_price;
        assignedByGroup++;
      } else {
        assignedGlobal++;
      }
    } else {
      assignedGlobal++;
    }

    updatePrice.run(priceToAssign, product.id);
  }
});

transaction(productsWithoutPrice);

console.log(`✅ Assegnati prezzi di default:`);
console.log(`   - ${assignedByGroup} prodotti con prezzo medio del gruppo`);
console.log(`   - ${assignedGlobal} prodotti con prezzo medio globale (€${globalAvg.avg_price})`);

// Step 5: Statistiche finali
console.log("\n📊 Statistiche finali:");
const stats = db.prepare(`
  SELECT
    COUNT(*) as total_products,
    COUNT(CASE WHEN price > 0 THEN 1 END) as products_with_price,
    ROUND(COUNT(CASE WHEN price > 0 THEN 1 END) * 100.0 / COUNT(*), 1) as coverage_percentage,
    ROUND(MIN(price), 2) as min_price,
    ROUND(MAX(price), 2) as max_price,
    ROUND(AVG(price), 2) as avg_price
  FROM products
`).get() as {
  total_products: number;
  products_with_price: number;
  coverage_percentage: number;
  min_price: number;
  max_price: number;
  avg_price: number;
};

console.log(`   Total prodotti: ${stats.total_products}`);
console.log(`   Prodotti con prezzo: ${stats.products_with_price} (${stats.coverage_percentage}%)`);
console.log(`   Range prezzi: €${stats.min_price} - €${stats.max_price}`);
console.log(`   Prezzo medio: €${stats.avg_price}`);

db.close();

console.log("\n✅ Processo completato!");
