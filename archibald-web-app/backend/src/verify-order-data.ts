/**
 * Script di verifica per controllare i dati dell'ordine ORD/26000387
 * Controlla Order List + DDT dal database e confronta con i dati attesi
 */

import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "../data/orders.db");
const db = new Database(dbPath);

const orderNumber = "ORD/26000387";

console.log("=".repeat(80));
console.log(`🔍 VERIFICA DATI ORDINE: ${orderNumber}`);
console.log("=".repeat(80));

// Query per estrarre TUTTI i campi dell'ordine
const order = db
  .prepare(
    `
  SELECT
    -- Order List (actual schema - 20 colonne)
    id,
    orderNumber,
    customerProfileId,
    customerName,
    deliveryName,
    deliveryAddress,
    creationDate as orderDate,
    deliveryDate,
    remainingSalesFinancial,
    customerReference,
    salesStatus,
    orderType,
    documentStatus,
    salesOrigin,
    transferStatus,
    transferDate,
    completionDate,
    discountPercent as lineDiscount,
    grossAmount,
    totalAmount,
    status,

    -- DDT (11 colonne)
    ddtId,
    ddtNumber,
    ddtDeliveryDate,
    ddtOrderNumber,
    ddtCustomerAccount,
    ddtSalesName,
    ddtDeliveryName,
    trackingNumber,
    deliveryTerms,
    deliveryMethod,
    deliveryCity,

    -- Tracking (computed fields)
    trackingUrl,
    trackingCourier,

    -- Metadata
    userId,
    lastScraped,
    lastUpdated,
    detailJson,
    sentToMilanoAt,
    currentState
  FROM orders
  WHERE orderNumber = ?
`,
  )
  .get(orderNumber) as any;

if (!order) {
  console.error("❌ ORDINE NON TROVATO NEL DATABASE!");
  process.exit(1);
}

console.log("\n📊 DATI ORDINE NEL DATABASE:\n");

// ORDER LIST (20 campi)
console.log("━".repeat(80));
console.log("📋 ORDER LIST (20 campi)");
console.log("━".repeat(80));
console.log(`1.  ID:                      ${order.id || "N/A"}`);
console.log(`2.  Order Number:            ${order.orderNumber || "N/A"}`);
console.log(`3.  Customer Profile ID:     ${order.customerProfileId || "N/A"}`);
console.log(`4.  Customer Name:           ${order.customerName || "N/A"}`);
console.log(`5.  Delivery Name:           ${order.deliveryName || "N/A"}`);
console.log(`6.  Delivery Address:        ${order.deliveryAddress || "N/A"}`);
console.log(`7.  Order Date:              ${order.orderDate || "N/A"}`);
console.log(`8.  Delivery Date:           ${order.deliveryDate || "N/A"}`);
console.log(`9.  Remaining Sales Fin.:    ${order.remainingSalesFinancial || "N/A"}`);
console.log(`10. Customer Reference:      ${order.customerReference || "N/A"}`);
console.log(`11. Sales Status:            ${order.salesStatus || "N/A"}`);
console.log(`12. Order Type:              ${order.orderType || "N/A"}`);
console.log(`13. Document Status:         ${order.documentStatus || "N/A"}`);
console.log(`14. Sales Origin:            ${order.salesOrigin || "N/A"}`);
console.log(`15. Transfer Status:         ${order.transferStatus || "N/A"}`);
console.log(`16. Transfer Date:           ${order.transferDate || "N/A"}`);
console.log(`17. Completion Date:         ${order.completionDate || "N/A"}`);
console.log(`18. Line Discount:           ${order.lineDiscount || "N/A"}`);
console.log(`19. Gross Amount:            ${order.grossAmount || "N/A"}`);
console.log(`20. Total Amount:            ${order.totalAmount || "N/A"}`);

// DDT (11 campi)
console.log("\n" + "━".repeat(80));
console.log("🚚 DDT (11 campi)");
console.log("━".repeat(80));
console.log(`1.  DDT ID:                  ${order.ddtId || "❌ MANCANTE"}`);
console.log(`2.  DDT Number:              ${order.ddtNumber || "❌ MANCANTE"}`);
console.log(
  `3.  DDT Delivery Date:       ${order.ddtDeliveryDate || "❌ MANCANTE"}`,
);
console.log(
  `4.  DDT Order Number:        ${order.ddtOrderNumber || "❌ MANCANTE"}`,
);
console.log(
  `5.  DDT Customer Account:    ${order.ddtCustomerAccount || "❌ MANCANTE"}`,
);
console.log(
  `6.  DDT Sales Name:          ${order.ddtSalesName || "❌ MANCANTE"}`,
);
console.log(
  `7.  DDT Delivery Name:       ${order.ddtDeliveryName || "❌ MANCANTE"}`,
);
console.log(`8.  Delivery Terms:          ${order.deliveryTerms || "❌ MANCANTE"}`);
console.log(
  `9.  Delivery Method:         ${order.deliveryMethod || "❌ MANCANTE"}`,
);
console.log(`10. Delivery City:           ${order.deliveryCity || "❌ MANCANTE"}`);
console.log(
  `11. Tracking Number:         ${order.trackingNumber || "❌ MANCANTE"}`,
);

// TRACKING (3 campi)
console.log("\n" + "━".repeat(80));
console.log("📦 TRACKING (3 campi)");
console.log("━".repeat(80));
console.log(
  `1.  Tracking Number:         ${order.trackingNumber || "❌ MANCANTE"}`,
);
console.log(`2.  Tracking URL:            ${order.trackingUrl || "❌ MANCANTE"}`);
console.log(
  `3.  Tracking Courier:        ${order.trackingCourier || "❌ MANCANTE"}`,
);

// METADATA
console.log("\n" + "━".repeat(80));
console.log("🔧 METADATA");
console.log("━".repeat(80));
console.log(`User ID:                 ${order.userId || "N/A"}`);
console.log(`Last Scraped:            ${order.lastScraped || "N/A"}`);
console.log(`Last Updated:            ${order.lastUpdated || "N/A"}`);
console.log(`Detail JSON:             ${order.detailJson ? "✅ Presente" : "❌ Assente"}`);

// CONFRONTO CON DATI ATTESI (dalle screenshot)
console.log("\n" + "=".repeat(80));
console.log("✅ CONFRONTO CON DATI ATTESI (dalle screenshot)");
console.log("=".repeat(80));

const expected = {
  orderNumber: "ORD/26000387",
  customerName: "Maco International Di Conte & C. Sas",
  orderDate: "13 gen 2026",
  total: "1.791,01 €",
  status: "Ordine Aperto",
  documentState: "Documento di trasporto:",
  transferred: true,
  lineDiscount: "47,60 %",

  // Dati che DOVREBBERO essere nel DDT (dalle screenshot non visibili direttamente)
  // Ma sappiamo che l'ordine ha DDT perché mostra "Documento di trasporto"
};

console.log("\n📝 VERIFICA CAMPI CRITICI:\n");

// 1. Order Number
if (order.orderNumber === expected.orderNumber) {
  console.log(`✅ Order Number: CORRETTO (${order.orderNumber})`);
} else {
  console.log(
    `❌ Order Number: ERRATO! Atteso: ${expected.orderNumber}, Trovato: ${order.orderNumber}`,
  );
}

// 2. Customer Name
if (order.customerName === expected.customerName) {
  console.log(`✅ Customer Name: CORRETTO`);
} else {
  console.log(
    `❌ Customer Name: ERRATO! Atteso: ${expected.customerName}, Trovato: ${order.customerName}`,
  );
}

// 3. Total
const totalMatch =
  order.totalAmount?.includes("1.791") || order.totalAmount?.includes("1791");
if (totalMatch) {
  console.log(`✅ Total: CORRETTO (${order.totalAmount})`);
} else {
  console.log(
    `❌ Total: ERRATO! Atteso: ~1.791, Trovato: ${order.totalAmount}`,
  );
}

// 4. Transferred
if (
  order.transferStatus === "Sì" ||
  order.transferStatus?.toLowerCase().includes("trasferito")
) {
  console.log(`✅ Transferred: CORRETTO (${order.transferStatus})`);
} else {
  console.log(
    `⚠️  Transferred: DUBBIO (Atteso: Sì, Trovato: ${order.transferStatus})`,
  );
}

// 5. Line Discount
if (order.lineDiscount?.includes("47")) {
  console.log(`✅ Line Discount: CORRETTO (${order.lineDiscount})`);
} else {
  console.log(
    `❌ Line Discount: ERRATO! Atteso: ~47%, Trovato: ${order.lineDiscount}`,
  );
}

// 6. DDT Present?
if (order.ddtNumber) {
  console.log(`✅ DDT: PRESENTE (${order.ddtNumber})`);
} else {
  console.log(
    `❌ DDT: MANCANTE! (L'ordine ha badge "Documento di trasporto" ma nessun DDT nel DB)`,
  );
}

// 7. Tracking Present?
if (order.trackingNumber && order.trackingUrl) {
  console.log(
    `✅ TRACKING: PRESENTE (${order.trackingNumber} - ${order.trackingCourier || "Unknown"})`,
  );
  console.log(`   📍 URL: ${order.trackingUrl}`);
} else if (order.trackingNumber && !order.trackingUrl) {
  console.log(
    `⚠️  TRACKING: PARZIALE (Numero: ${order.trackingNumber}, ma URL mancante!)`,
  );
} else {
  console.log(
    `❌ TRACKING: COMPLETAMENTE MANCANTE! (Questo è il problema che hai notato)`,
  );
}

// SUMMARY
console.log("\n" + "=".repeat(80));
console.log("📊 SUMMARY - PROBLEMI RILEVATI");
console.log("=".repeat(80));

const issues: string[] = [];

if (!order.ddtNumber) {
  issues.push("❌ DDT mancante nel database");
}

if (!order.trackingNumber) {
  issues.push("❌ Tracking number mancante");
}

if (!order.trackingUrl) {
  issues.push("❌ Tracking URL mancante (PROBLEMA CRITICO per clickable link)");
}

if (!order.trackingCourier) {
  issues.push("⚠️  Tracking courier mancante (logo non visualizzabile)");
}

if (issues.length === 0) {
  console.log("\n✅ TUTTI I DATI SONO PRESENTI E CORRETTI!");
} else {
  console.log("\n⚠️  PROBLEMI RILEVATI:\n");
  issues.forEach((issue) => console.log(`   ${issue}`));

  console.log("\n💡 POSSIBILI CAUSE:\n");
  console.log(
    "   1. Il DDT non è stato matchato correttamente (orderNumber ↔ orderId)",
  );
  console.log("   2. Il tracking non è presente nella tabella DDT su Archibald");
  console.log("   3. Lo scraping del DDT non estrae correttamente i dati tracking");
  console.log(
    "   4. Il formato del tracking URL non è riconosciuto dal parser",
  );
}

console.log("\n" + "=".repeat(80));

db.close();
