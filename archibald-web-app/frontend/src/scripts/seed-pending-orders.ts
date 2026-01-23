/**
 * Development script to seed pending orders for testing
 *
 * Usage in browser console:
 * ```
 * import('/src/scripts/seed-pending-orders.ts').then(m => m.seedPendingOrders())
 * ```
 */

import { orderService } from "../services/orders.service";

export async function seedPendingOrders() {
  console.log("[Seed] Creating test pending orders...");

  const testOrders = [
    {
      customerId: "test-customer-1",
      customerName: "Test Cliente 1",
      items: [
        {
          articleCode: "ART001",
          productName: "Prodotto Test 1",
          description: "Descrizione prodotto test",
          quantity: 5,
          price: 10.5,
        },
        {
          articleCode: "ART002",
          productName: "Prodotto Test 2",
          quantity: 2,
          price: 25.0,
        },
      ],
    },
    {
      customerId: "test-customer-2",
      customerName: "Test Cliente 2",
      items: [
        {
          articleCode: "ART003",
          productName: "Prodotto Test 3",
          quantity: 10,
          price: 5.0,
          discount: 2.5,
        },
      ],
      discountPercent: 5,
    },
    {
      customerId: "test-customer-3",
      customerName: "Test Cliente 3 (Error)",
      items: [
        {
          articleCode: "ART004",
          productName: "Prodotto Test 4",
          quantity: 1,
          price: 100.0,
        },
      ],
    },
  ];

  for (let i = 0; i < testOrders.length; i++) {
    const order = testOrders[i];
    try {
      const id = await orderService.savePendingOrder(order);
      console.log(`[Seed] ✅ Created pending order ${i + 1}:`, id);

      // Mark the 3rd order as error for testing
      if (i === 2) {
        await orderService.updatePendingOrderStatus(
          id,
          "error",
          "Network timeout during submission",
        );
        console.log(`[Seed] ⚠️  Marked order ${id} as error`);
      }
    } catch (error) {
      console.error(`[Seed] ❌ Failed to create order ${i + 1}:`, error);
    }
  }

  console.log(
    "[Seed] ✅ Seeding complete! Navigate to /pending-orders to see the orders.",
  );
  console.log("[Seed] 💡 Test offline mode: DevTools → Network → Offline");
}

// Auto-run if loaded directly in browser
if (typeof window !== "undefined") {
  (window as any).seedPendingOrders = seedPendingOrders;
  console.log("[Seed] Run seedPendingOrders() to create test orders");
}
