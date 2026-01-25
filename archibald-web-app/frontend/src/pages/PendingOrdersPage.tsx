import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { orderService } from "../services/orders.service";
import { toastService } from "../services/toast.service";
import { pdfExportService } from "../services/pdf-export.service";
import type { PendingOrder } from "../db/schema";

export function PendingOrdersPage() {
  const navigate = useNavigate();
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
      const selectedOrders = orders.filter((o) => selectedOrderIds.has(o.id!));

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

      toastService.success(
        `Ordini inviati al bot. Job IDs: ${jobIds.join(", ")}`,
      );

      await loadOrders();
      setSelectedOrderIds(new Set());
    } catch (error) {
      console.error("[PendingOrdersPage] Submission failed:", error);
      toastService.error("Errore durante l'invio degli ordini. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (!confirm("Sei sicuro di voler eliminare questo ordine?")) {
      return;
    }

    try {
      await orderService.deletePendingOrder(orderId);
      toastService.success("Ordine eliminato con successo");
      await loadOrders();
      // Remove from selection if it was selected
      setSelectedOrderIds((prev) => {
        const updated = new Set(prev);
        updated.delete(orderId);
        return updated;
      });
    } catch (error) {
      console.error("[PendingOrdersPage] Failed to delete order:", error);
      toastService.error("Errore durante l'eliminazione dell'ordine. Riprova.");
    }
  };

  const handleEditOrder = (orderId: number) => {
    // Navigate to order form with order ID as query parameter
    navigate(`/order?editOrderId=${orderId}`);
  };

  const handleDownloadPDF = (order: PendingOrder) => {
    try {
      pdfExportService.downloadOrderPDF(order);
      toastService.success("PDF scaricato con successo");
    } catch (error) {
      console.error("[PendingOrdersPage] Failed to generate PDF:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toastService.error(
        `Errore durante la generazione del PDF: ${errorMessage}`,
      );
    }
  };

  const handlePrintOrder = (order: PendingOrder) => {
    try {
      pdfExportService.printOrderPDF(order);
      toastService.info("Apertura finestra di stampa...");
    } catch (error) {
      console.error("[PendingOrdersPage] Failed to print order:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toastService.error(`Errore durante la stampa: ${errorMessage}`);
    }
  };

  const handleDownloadSelectedPDF = () => {
    if (selectedOrderIds.size === 0) {
      toastService.warning("Seleziona almeno un ordine");
      return;
    }

    try {
      const selectedOrders = orders.filter((o) => selectedOrderIds.has(o.id!));
      pdfExportService.downloadMultipleOrdersPDF(selectedOrders);
      toastService.success(`${selectedOrderIds.size} ordini esportati in PDF`);
    } catch (error) {
      console.error(
        "[PendingOrdersPage] Failed to export multiple PDFs:",
        error,
      );
      toastService.error("Errore durante l'esportazione multipla");
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

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={handleDownloadSelectedPDF}
            disabled={selectedOrderIds.size === 0}
            style={{
              padding: "0.75rem 1.25rem",
              backgroundColor:
                selectedOrderIds.size === 0 ? "#e5e7eb" : "#3b82f6",
              color: selectedOrderIds.size === 0 ? "#9ca3af" : "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "0.95rem",
              fontWeight: "600",
              cursor: selectedOrderIds.size === 0 ? "not-allowed" : "pointer",
            }}
            title="Esporta ordini selezionati in PDF"
          >
            📄 Esporta PDF ({selectedOrderIds.size})
          </button>
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
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
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
                <button
                  onClick={() => handleDownloadPDF(order)}
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "#10b981",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                  }}
                  title="Scarica PDF"
                >
                  📄 PDF
                </button>
                <button
                  onClick={() => handlePrintOrder(order)}
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "#8b5cf6",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                  }}
                  title="Stampa ordine"
                >
                  🖨️ Stampa
                </button>
                <button
                  onClick={() => handleEditOrder(order.id!)}
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                  }}
                  title="Modifica ordine"
                >
                  ✏️ Modifica
                </button>
                <button
                  onClick={() => handleDeleteOrder(order.id!)}
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                  }}
                  title="Elimina ordine"
                >
                  🗑️ Elimina
                </button>
              </div>
            </div>

            {/* DETAILED ORDER ITEMS - PREVENTIVO STYLE */}
            <div
              style={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                marginBottom: "1rem",
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div
                style={{
                  backgroundColor: "#f9fafb",
                  padding: "0.75rem 1rem",
                  borderBottom: "2px solid #e5e7eb",
                  fontWeight: "600",
                  fontSize: "0.875rem",
                  color: "#374151",
                }}
              >
                Dettaglio Articoli ({order.items.length})
              </div>

              {/* Table Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr 1fr 1fr",
                  gap: "0.5rem",
                  padding: "0.75rem 1rem",
                  backgroundColor: "#f9fafb",
                  borderBottom: "1px solid #e5e7eb",
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  color: "#6b7280",
                  textTransform: "uppercase",
                }}
              >
                <div>Articolo</div>
                <div style={{ textAlign: "right" }}>Qnt.</div>
                <div style={{ textAlign: "right" }}>Prezzo Unit.</div>
                <div style={{ textAlign: "right" }}>Sconto</div>
                <div style={{ textAlign: "right" }}>Subtotale</div>
                <div style={{ textAlign: "right" }}>IVA</div>
                <div style={{ textAlign: "right" }}>Totale</div>
              </div>

              {/* Items */}
              {order.items.map((item, index) => {
                const subtotal =
                  item.price * item.quantity - (item.discount || 0);
                const vatAmount = subtotal * (item.vat / 100);
                const total = subtotal + vatAmount;

                return (
                  <div
                    key={index}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr 1fr 1fr",
                      gap: "0.5rem",
                      padding: "1rem",
                      borderBottom:
                        index < order.items.length - 1
                          ? "1px solid #f3f4f6"
                          : "none",
                      fontSize: "0.875rem",
                    }}
                  >
                    {/* Product Name & Code */}
                    <div>
                      <div
                        style={{ fontWeight: "600", marginBottom: "0.25rem" }}
                      >
                        {item.productName || item.articleCode}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#9ca3af",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Cod: {item.articleCode}
                      </div>
                      {item.description && (
                        <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                          {item.description}
                        </div>
                      )}
                    </div>

                    {/* Quantity */}
                    <div style={{ textAlign: "right", alignSelf: "center" }}>
                      {item.quantity}
                    </div>

                    {/* Unit Price */}
                    <div style={{ textAlign: "right", alignSelf: "center" }}>
                      €{item.price.toFixed(2)}
                    </div>

                    {/* Discount */}
                    <div
                      style={{
                        textAlign: "right",
                        alignSelf: "center",
                        color:
                          item.discount && item.discount > 0
                            ? "#dc2626"
                            : "#9ca3af",
                      }}
                    >
                      {item.discount && item.discount > 0
                        ? `-€${item.discount.toFixed(2)}`
                        : "—"}
                    </div>

                    {/* Subtotal */}
                    <div
                      style={{
                        textAlign: "right",
                        alignSelf: "center",
                        fontWeight: "500",
                      }}
                    >
                      €{subtotal.toFixed(2)}
                    </div>

                    {/* VAT */}
                    <div style={{ textAlign: "right", alignSelf: "center" }}>
                      <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>
                        ({item.vat}%)
                      </div>
                      <div>€{vatAmount.toFixed(2)}</div>
                    </div>

                    {/* Total */}
                    <div
                      style={{
                        textAlign: "right",
                        alignSelf: "center",
                        fontWeight: "600",
                        color: "#1e40af",
                      }}
                    >
                      €{total.toFixed(2)}
                    </div>
                  </div>
                );
              })}

              {/* Order Totals */}
              <div
                style={{
                  backgroundColor: "#f9fafb",
                  padding: "1rem",
                  borderTop: "2px solid #e5e7eb",
                }}
              >
                {/* Calculate totals */}
                {(() => {
                  const orderSubtotal = order.items.reduce(
                    (sum, item) =>
                      sum + item.price * item.quantity - (item.discount || 0),
                    0,
                  );
                  const orderVAT = order.items.reduce(
                    (sum, item) =>
                      sum +
                      (item.price * item.quantity - (item.discount || 0)) *
                        (item.vat / 100),
                    0,
                  );
                  const orderTotal = orderSubtotal + orderVAT;

                  return (
                    <>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                          fontSize: "0.875rem",
                        }}
                      >
                        <span style={{ color: "#6b7280" }}>
                          Subtotale (senza IVA):
                        </span>
                        <span style={{ fontWeight: "500" }}>
                          €{orderSubtotal.toFixed(2)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                          fontSize: "0.875rem",
                        }}
                      >
                        <span style={{ color: "#6b7280" }}>IVA Totale:</span>
                        <span style={{ fontWeight: "500" }}>
                          €{orderVAT.toFixed(2)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          paddingTop: "0.75rem",
                          borderTop: "2px solid #3b82f6",
                          fontSize: "1.125rem",
                        }}
                      >
                        <span style={{ fontWeight: "700", color: "#1e40af" }}>
                          TOTALE (con IVA):
                        </span>
                        <span style={{ fontWeight: "700", color: "#1e40af" }}>
                          €{orderTotal.toFixed(2)}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
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
