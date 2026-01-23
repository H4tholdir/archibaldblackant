import { useState, useEffect } from "react";
import { orderService } from "../services/orders.service";
import type { PendingOrder } from "../db/schema";

export function PendingOrdersPage() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const pendingOrders = await orderService.getPendingOrders();
      setOrders(pendingOrders);
    } catch (error) {
      console.error("[PendingOrdersPage] Failed to load orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrder = (orderId: number) => {
    setSelectedOrderIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(orderId)) {
        updated.delete(orderId);
      } else {
        updated.add(orderId);
      }
      return updated;
    });
  };

  const handleSelectAll = () => {
    if (selectedOrderIds.size === orders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(orders.map((o) => o.id!)));
    }
  };

  const handleSubmitOrders = async () => {
    if (selectedOrderIds.size === 0) return;

    setSubmitting(true);

    try {
      const selectedOrders = orders.filter((o) =>
        selectedOrderIds.has(o.id!)
      );

      const ordersToSubmit = selectedOrders.map((order) => ({
        customerId: order.customerId,
        customerName: order.customerName,
        items: order.items.map((item) => ({
          articleCode: item.articleCode,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
        })),
        discountPercent: order.discountPercent,
        targetTotalWithVAT: order.targetTotalWithVAT,
      }));

      const response = await fetch("/api/bot/submit-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: ordersToSubmit,
        }),
      });

      if (!response.ok) throw new Error("Bot submission failed");

      const { jobIds } = await response.json();

      for (const orderId of selectedOrderIds) {
        await orderService.updatePendingOrderStatus(orderId, "syncing");
      }

      alert(`Ordini inviati al bot. Job IDs: ${jobIds.join(", ")}`);

      await loadOrders();
      setSelectedOrderIds(new Set());
    } catch (error) {
      console.error("[PendingOrdersPage] Submission failed:", error);
      alert("Errore durante l'invio degli ordini. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        Caricamento ordini in attesa...
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "#6b7280",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          border: "1px dashed #d1d5db",
          margin: "2rem",
        }}
      >
        <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
          Nessun ordine in attesa
        </h2>
        <p>Gli ordini creati appariranno qui prima dell'invio.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.875rem", fontWeight: "700" }}>
          Ordini in Attesa ({orders.length})
        </h1>

        <button
          onClick={handleSubmitOrders}
          disabled={selectedOrderIds.size === 0 || submitting}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor:
              selectedOrderIds.size === 0 ? "#d1d5db" : "#22c55e",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "1rem",
            fontWeight: "600",
            cursor: selectedOrderIds.size === 0 ? "not-allowed" : "pointer",
          }}
        >
          {submitting
            ? "Invio in corso..."
            : `Invia Ordini Selezionati (${selectedOrderIds.size})`}
        </button>
      </div>

      <div
        style={{
          padding: "1rem",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          marginBottom: "1rem",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={selectedOrderIds.size === orders.length}
            onChange={handleSelectAll}
            style={{ width: "1.25rem", height: "1.25rem", cursor: "pointer" }}
          />
          <span style={{ fontWeight: "500" }}>Seleziona Tutti</span>
        </label>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {orders.map((order) => (
          <div
            key={order.id}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "1.5rem",
              backgroundColor: "white",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "1rem" }}
              >
                <input
                  type="checkbox"
                  checked={selectedOrderIds.has(order.id!)}
                  onChange={() => handleSelectOrder(order.id!)}
                  style={{
                    width: "1.25rem",
                    height: "1.25rem",
                    cursor: "pointer",
                  }}
                />
                <div>
                  <div style={{ fontWeight: "600", fontSize: "1.125rem" }}>
                    {order.customerName}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                    Creato: {new Date(order.createdAt).toLocaleString("it-IT")}
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: "0.25rem 0.75rem",
                  borderRadius: "9999px",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  backgroundColor:
                    order.status === "pending"
                      ? "#fef3c7"
                      : order.status === "error"
                        ? "#fee2e2"
                        : "#dbeafe",
                  color:
                    order.status === "pending"
                      ? "#92400e"
                      : order.status === "error"
                        ? "#991b1b"
                        : "#1e40af",
                }}
              >
                {order.status === "pending"
                  ? "In Attesa"
                  : order.status === "error"
                    ? "Errore"
                    : "In Elaborazione"}
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#f9fafb",
                padding: "1rem",
                borderRadius: "4px",
                marginBottom: "1rem",
              }}
            >
              <div style={{ fontWeight: "600", marginBottom: "0.5rem" }}>
                Articoli ({order.items.length})
              </div>
              {order.items.map((item, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.5rem 0",
                    borderBottom:
                      index < order.items.length - 1
                        ? "1px solid #e5e7eb"
                        : "none",
                  }}
                >
                  <div>
                    <div>{item.productName || item.articleCode}</div>
                    <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                      Quantità: {item.quantity}
                    </div>
                  </div>
                  <div style={{ fontWeight: "500" }}>
                    €{(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {order.status === "error" && order.errorMessage && (
              <div
                style={{
                  padding: "0.75rem",
                  backgroundColor: "#fee2e2",
                  border: "1px solid #dc2626",
                  borderRadius: "4px",
                  color: "#991b1b",
                  fontSize: "0.875rem",
                }}
              >
                <strong>Errore:</strong> {order.errorMessage}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
