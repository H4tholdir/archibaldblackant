/**
 * Example usage of OrderCard and OrderTimeline components
 * This file demonstrates how to use the timeline UI components together
 */

import { useState } from "react";
import { OrderCard, type Order } from "./OrderCard";
import { OrderTimeline, type StatusUpdate } from "./OrderTimeline";
import { groupOrdersByPeriod } from "../utils/orderGrouping";

// Example order data
const exampleOrders: Order[] = [
  {
    id: "1",
    date: new Date().toISOString(),
    customerName: "Rossi Mario",
    total: "1.234,56 €",
    status: "In lavorazione",
    items: [
      {
        articleCode: "H129FSQ.104.023",
        productName: "Widget Premium",
        description: "Colore: Rosso, Taglia: L",
        quantity: 2,
        price: 45.5,
        discount: 10,
      },
      {
        articleCode: "ABC123.456.789",
        productName: "Gadget Deluxe",
        description: "Modello standard",
        quantity: 1,
        price: 120.0,
      },
    ],
    statusTimeline: [
      {
        status: "In lavorazione",
        timestamp: new Date().toISOString(),
        note: "Ordine ricevuto e in elaborazione",
      },
      {
        status: "Creato",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
    ],
    customerNotes: "Consegna urgente - Cliente preferenziale",
    documents: [
      {
        type: "Fattura",
        name: "Fattura #2024-001",
        url: "/documents/invoice-001.pdf",
      },
    ],
  },
  {
    id: "2",
    date: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    customerName: "Bianchi Luigi",
    total: "456,78 €",
    status: "Spedito",
    tracking: {
      courier: "BRT",
      trackingNumber: "123456789ABC",
    },
    items: [
      {
        articleCode: "XYZ789.012.345",
        productName: "Accessorio Base",
        description: "",
        quantity: 3,
        price: 152.26,
      },
    ],
    statusTimeline: [
      {
        status: "Spedito",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        note: "Pacco affidato al corriere BRT",
      },
      {
        status: "Evaso",
        timestamp: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        status: "In lavorazione",
        timestamp: new Date(Date.now() - 10800000).toISOString(),
      },
      {
        status: "Creato",
        timestamp: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    documents: [
      {
        type: "Fattura",
        name: "Fattura #2024-002",
        url: "/documents/invoice-002.pdf",
      },
      {
        type: "DDT",
        name: "DDT #2024-002",
        url: "/documents/ddt-002.pdf",
      },
    ],
  },
  {
    id: "3",
    date: new Date(Date.now() - 2592000000).toISOString(), // 30 days ago
    customerName: "Verdi Anna",
    total: "789,00 €",
    status: "Evaso",
    items: [
      {
        articleCode: "AAA111.222.333",
        productName: "Prodotto Speciale",
        description: "Edizione limitata",
        quantity: 1,
        price: 789.0,
      },
    ],
    statusTimeline: [
      {
        status: "Evaso",
        timestamp: new Date(Date.now() - 2500000000).toISOString(),
      },
      {
        status: "In lavorazione",
        timestamp: new Date(Date.now() - 2590000000).toISOString(),
      },
      {
        status: "Creato",
        timestamp: new Date(Date.now() - 2592000000).toISOString(),
      },
    ],
    documents: [
      {
        type: "Fattura",
        name: "Fattura #2024-003",
        url: "/documents/invoice-003.pdf",
      },
    ],
  },
];

export function OrderCardExample() {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const handleToggle = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  const handleDocumentsClick = (orderId: string) => {
    console.log("Opening documents for order:", orderId);
    // In real implementation, this would open a documents modal or navigate to documents page
  };

  // Example 1: Single order card
  const singleOrderExample = (
    <div style={{ padding: "20px", maxWidth: "600px" }}>
      <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>
        Example 1: Single Order Card
      </h2>
      <OrderCard
        order={exampleOrders[0]}
        expanded={expandedOrderId === exampleOrders[0].id}
        onToggle={() => handleToggle(exampleOrders[0].id)}
        onDocumentsClick={handleDocumentsClick}
        timelineComponent={
          exampleOrders[0].statusTimeline ? (
            <OrderTimeline updates={exampleOrders[0].statusTimeline} />
          ) : null
        }
      />
    </div>
  );

  // Example 2: Grouped orders with temporal grouping
  const groupedOrders = groupOrdersByPeriod(exampleOrders);

  const groupedOrdersExample = (
    <div style={{ padding: "20px", maxWidth: "600px" }}>
      <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>
        Example 2: Grouped Orders by Period
      </h2>
      {groupedOrders.map((group) => (
        <div key={group.period} style={{ marginBottom: "32px" }}>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#666",
              marginBottom: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {group.period}
          </h3>
          {group.orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              expanded={expandedOrderId === order.id}
              onToggle={() => handleToggle(order.id)}
              onDocumentsClick={handleDocumentsClick}
              timelineComponent={
                order.statusTimeline ? (
                  <OrderTimeline updates={order.statusTimeline} />
                ) : null
              }
            />
          ))}
        </div>
      ))}
    </div>
  );

  // Example 3: Standalone timeline
  const timelineExample = (
    <div style={{ padding: "20px", maxWidth: "600px" }}>
      <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>
        Example 3: Standalone Timeline
      </h2>
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          padding: "16px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        }}
      >
        {exampleOrders[1].statusTimeline && (
          <OrderTimeline updates={exampleOrders[1].statusTimeline} />
        )}
      </div>
    </div>
  );

  return (
    <div style={{ backgroundColor: "#f5f5f5", minHeight: "100vh" }}>
      {singleOrderExample}
      <hr
        style={{
          margin: "40px 0",
          border: "none",
          borderTop: "2px solid #e0e0e0",
        }}
      />
      {groupedOrdersExample}
      <hr
        style={{
          margin: "40px 0",
          border: "none",
          borderTop: "2px solid #e0e0e0",
        }}
      />
      {timelineExample}
    </div>
  );
}
