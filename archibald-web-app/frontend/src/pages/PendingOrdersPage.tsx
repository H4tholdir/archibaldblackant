import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { orderService } from "../services/orders.service";
import { toastService } from "../services/toast.service";
import { pdfExportService } from "../services/pdf-export.service";
import type { PendingOrder } from "../db/schema";
import { calculateShippingCosts } from "../utils/order-calculations";
import { usePendingSync } from "../hooks/usePendingSync";
import { JobProgressBar } from "../components/JobProgressBar";
import { isFresis, FRESIS_DEFAULT_DISCOUNT } from "../utils/fresis-constants";
import { mergeFresisPendingOrders } from "../utils/order-merge";
import { db } from "../db/schema";

export function PendingOrdersPage() {
  const navigate = useNavigate();

  // 🔧 FIX: Use usePendingSync hook to get real-time updates via WebSocket
  const {
    pendingOrders: orders,
    isSyncing: loading,
    refetch,
  } = usePendingSync();

  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set(),
  );
  const [submitting, setSubmitting] = useState(false);

  // Merge Fresis state
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeDiscount, setMergeDiscount] = useState(
    String(FRESIS_DEFAULT_DISCOUNT),
  );

  // Expand/collapse state for each order
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(
    new Set(),
  );

  // Mobile responsiveness
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSelectOrder = (orderId: string) => {
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
      setSelectedOrderIds(new Set(orders.map((o) => o.id)));
    }
  };

  const handleToggleExpand = (orderId: string) => {
    setExpandedOrderIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(orderId)) {
        updated.delete(orderId);
      } else {
        updated.add(orderId);
      }
      return updated;
    });
  };

  const handleSubmitOrders = async () => {
    if (selectedOrderIds.size === 0) return;

    setSubmitting(true);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        throw new Error("Token non trovato, rifare login");
      }

      const selectedOrders = orders.filter((o) => selectedOrderIds.has(o.id!));

      const ordersToSubmit = selectedOrders.map((order) => ({
        pendingOrderId: order.id, // Phase 72: Include pending order ID for job tracking
        customerId: order.customerId,
        customerName: order.customerName,
        items: order.items.map((item) => ({
          articleCode: item.articleCode,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
          // Include warehouse fields for backend filtering
          warehouseQuantity: item.warehouseQuantity || 0,
          warehouseSources: item.warehouseSources || [],
        })),
        discountPercent: order.discountPercent,
        targetTotalWithVAT: order.targetTotalWithVAT,
      }));

      const response = await fetch("/api/bot/submit-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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

      await refetch();
      setSelectedOrderIds(new Set());
    } catch (error) {
      console.error("[PendingOrdersPage] Submission failed:", error);
      toastService.error("Errore durante l'invio degli ordini. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryOrder = async (orderId: string) => {
    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        toastService.error("Ordine non trovato");
        return;
      }

      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        throw new Error("Token non trovato, rifare login");
      }

      // Reset job fields in IndexedDB (via direct db access)
      const { db } = await import("../db/schema");
      await db.pendingOrders.update(orderId, {
        jobId: undefined,
        jobStatus: "idle",
        jobProgress: 0,
        jobOperation: undefined,
        jobError: undefined,
        status: "pending",
        errorMessage: undefined,
        retryCount: (order.retryCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      });

      // Resubmit to bot
      const response = await fetch("/api/bot/submit-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orders: [
            {
              pendingOrderId: order.id,
              customerId: order.customerId,
              customerName: order.customerName,
              items: order.items.map((item) => ({
                articleCode: item.articleCode,
                productName: item.productName,
                description: item.description,
                quantity: item.quantity,
                price: item.price,
                discount: item.discount,
                warehouseQuantity: item.warehouseQuantity || 0,
                warehouseSources: item.warehouseSources || [],
              })),
              discountPercent: order.discountPercent,
              targetTotalWithVAT: order.targetTotalWithVAT,
            },
          ],
        }),
      });

      if (!response.ok) throw new Error("Submission failed");

      toastService.success("Ordine reinviato al bot");
      await refetch();
    } catch (error) {
      console.error("[PendingOrdersPage] Retry failed:", error);
      toastService.error("Errore durante il reinvio");
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo ordine?")) {
      return;
    }

    try {
      await orderService.deletePendingOrder(orderId);
      toastService.success("Ordine eliminato con successo");
      await refetch();
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

  const handleDeleteSelectedOrders = async () => {
    if (selectedOrderIds.size === 0) return;

    if (
      !confirm(`Sei sicuro di voler eliminare ${selectedOrderIds.size} ordini?`)
    ) {
      return;
    }

    try {
      // Delete all selected orders
      for (const orderId of selectedOrderIds) {
        await orderService.deletePendingOrder(orderId);
      }

      await refetch();
      setSelectedOrderIds(new Set());
    } catch (error) {
      console.error(
        "[PendingOrdersPage] Failed to delete selected orders:",
        error,
      );
      toastService.error(
        "Errore durante l'eliminazione degli ordini. Riprova.",
      );
    }
  };

  const selectedFresisOrders = orders.filter(
    (o) => selectedOrderIds.has(o.id!) && isFresis({ id: o.customerId }),
  );

  const handleMergeFresis = async () => {
    if (selectedFresisOrders.length < 2) return;

    try {
      const discount = parseFloat(mergeDiscount) || FRESIS_DEFAULT_DISCOUNT;
      const mergedOrder = mergeFresisPendingOrders(
        selectedFresisOrders,
        discount,
      );

      // Archive original orders to fresisHistory
      const now = new Date().toISOString();
      for (const original of selectedFresisOrders) {
        await db.fresisHistory.add({
          id: crypto.randomUUID(),
          originalPendingOrderId: original.id!,
          subClientCodice: original.subClientCodice ?? "",
          subClientName: original.subClientName ?? "",
          subClientData: original.subClientData ?? {
            codice: "",
            ragioneSociale: "",
          },
          customerId: original.customerId,
          customerName: original.customerName,
          items: original.items,
          discountPercent: original.discountPercent,
          targetTotalWithVAT: original.targetTotalWithVAT,
          shippingCost: original.shippingCost,
          shippingTax: original.shippingTax,
          mergedIntoOrderId: mergedOrder.id,
          mergedAt: now,
          createdAt: original.createdAt,
          updatedAt: now,
        });
      }

      // Add merged order
      await db.pendingOrders.add(mergedOrder);

      // Delete original orders
      for (const original of selectedFresisOrders) {
        await orderService.deletePendingOrder(original.id!);
      }

      await refetch();
      setSelectedOrderIds(new Set());
      setShowMergeDialog(false);
      toastService.success(
        `Merge completato: ${selectedFresisOrders.length} ordini uniti con sconto ${discount}%`,
      );
    } catch (error) {
      console.error("[PendingOrdersPage] Merge failed:", error);
      toastService.error("Errore durante il merge degli ordini");
    }
  };

  const handleEditOrder = (orderId: string) => {
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

  if (loading) {
    return (
      <div
        style={{
          padding: isMobile ? "1.5rem" : "2rem",
          textAlign: "center",
          fontSize: isMobile ? "0.9375rem" : "1rem",
        }}
      >
        Caricamento ordini in attesa...
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div
        style={{
          padding: isMobile ? "1.5rem" : "2rem",
          textAlign: "center",
          color: "#6b7280",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          border: "1px dashed #d1d5db",
          margin: isMobile ? "1rem" : "2rem",
        }}
      >
        <h2
          style={{
            fontSize: isMobile ? "1.25rem" : "1.5rem",
            marginBottom: "0.5rem",
          }}
        >
          Nessun ordine in attesa
        </h2>
        <p style={{ fontSize: isMobile ? "0.875rem" : "1rem" }}>
          Gli ordini creati appariranno qui prima dell'invio.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "1rem" : "2rem" }}>
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between",
          alignItems: isMobile ? "stretch" : "center",
          marginBottom: isMobile ? "1rem" : "1.5rem",
          gap: isMobile ? "1rem" : "0",
        }}
      >
        <h1
          style={{
            fontSize: isMobile ? "1.5rem" : "1.875rem",
            fontWeight: "700",
          }}
        >
          Ordini in Attesa ({orders.length})
        </h1>

        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: isMobile ? "0.5rem" : "0.75rem",
          }}
        >
          <button
            onClick={handleDeleteSelectedOrders}
            disabled={selectedOrderIds.size === 0}
            style={{
              padding: isMobile ? "0.875rem 1rem" : "0.75rem 1.25rem",
              backgroundColor:
                selectedOrderIds.size === 0 ? "#e5e7eb" : "#dc2626",
              color: selectedOrderIds.size === 0 ? "#9ca3af" : "white",
              border: "none",
              borderRadius: "8px",
              fontSize: isMobile ? "1rem" : "0.95rem",
              fontWeight: "600",
              cursor: selectedOrderIds.size === 0 ? "not-allowed" : "pointer",
              minHeight: "44px", // Touch target
            }}
            title="Elimina tutti gli ordini selezionati"
          >
            🗑️ {isMobile ? "Elimina" : "Elimina Selezionati"} (
            {selectedOrderIds.size})
          </button>
          <button
            onClick={handleSubmitOrders}
            disabled={selectedOrderIds.size === 0 || submitting}
            style={{
              padding: isMobile ? "0.875rem 1rem" : "0.75rem 1.5rem",
              backgroundColor:
                selectedOrderIds.size === 0 ? "#d1d5db" : "#22c55e",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: isMobile ? "1rem" : "1rem",
              fontWeight: "600",
              cursor: selectedOrderIds.size === 0 ? "not-allowed" : "pointer",
              minHeight: "44px", // Touch target
            }}
          >
            {submitting
              ? "Invio..."
              : isMobile
                ? `Invia (${selectedOrderIds.size})`
                : `Invia Ordini Selezionati (${selectedOrderIds.size})`}
          </button>
          {selectedFresisOrders.length >= 2 && (
            <button
              onClick={() => setShowMergeDialog(true)}
              style={{
                padding: isMobile ? "0.875rem 1rem" : "0.75rem 1.25rem",
                backgroundColor: "#f59e0b",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: isMobile ? "1rem" : "0.95rem",
                fontWeight: "600",
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              Merge Fresis ({selectedFresisOrders.length})
            </button>
          )}
        </div>
      </div>

      {/* Merge Fresis Dialog */}
      {showMergeDialog && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowMergeDialog(false)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "1.5rem",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: "700",
                marginBottom: "1rem",
              }}
            >
              Merge Ordini Fresis
            </h2>
            <p style={{ marginBottom: "0.75rem", color: "#6b7280" }}>
              Unisci {selectedFresisOrders.length} ordini in un unico ordine
              Fresis. Gli articoli con lo stesso codice verranno sommati.
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontWeight: "600",
                  marginBottom: "0.25rem",
                }}
              >
                Sconto globale (%)
              </label>
              <input
                type="number"
                value={mergeDiscount}
                onChange={(e) => setMergeDiscount(e.target.value)}
                style={{
                  width: "100px",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  fontSize: "1rem",
                }}
              />
            </div>

            <div
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                backgroundColor: "#fffbeb",
                borderRadius: "8px",
                fontSize: "0.875rem",
              }}
            >
              <strong>Ordini da unire:</strong>
              <ul style={{ margin: "0.5rem 0 0 1rem", padding: 0 }}>
                {selectedFresisOrders.map((o) => (
                  <li key={o.id}>
                    {o.subClientName || o.customerName} - {o.items.length}{" "}
                    articoli
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={handleMergeFresis}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  backgroundColor: "#f59e0b",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Conferma Merge
              </button>
              <button
                onClick={() => setShowMergeDialog(false)}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  backgroundColor: "#e5e7eb",
                  color: "#374151",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          padding: isMobile ? "0.875rem" : "1rem",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          marginBottom: isMobile ? "0.75rem" : "1rem",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={selectedOrderIds.size === orders.length}
            onChange={handleSelectAll}
            style={{
              width: isMobile ? "1.375rem" : "1.25rem",
              height: isMobile ? "1.375rem" : "1.25rem",
              cursor: "pointer",
              minWidth: "22px", // Touch target
              minHeight: "22px",
            }}
          />
          <span
            style={{
              fontWeight: "500",
              fontSize: isMobile ? "1rem" : "0.95rem",
            }}
          >
            Seleziona Tutti
          </span>
        </label>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {orders.map((order) => {
          const isJobActive =
            order.jobStatus &&
            ["started", "processing"].includes(order.jobStatus);
          const isJobCompleted = order.jobStatus === "completed";
          const isJobFailed = order.jobStatus === "failed";

          const cardOpacity = isJobActive || isJobCompleted ? 0.6 : 1;
          const cardBgColor = isJobCompleted
            ? "#f0fdf4"
            : isJobFailed
              ? "#fef2f2"
              : "white";

          return (
            <div
              key={order.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                padding: isMobile ? "1rem" : "1.5rem",
                backgroundColor: cardBgColor,
                opacity: cardOpacity,
                transition: "opacity 0.3s ease, background-color 0.3s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  justifyContent: "space-between",
                  alignItems: isMobile ? "stretch" : "flex-start",
                  marginBottom: isMobile ? "0.75rem" : "1rem",
                  gap: isMobile ? "0.75rem" : "0",
                }}
              >
                {/* Checkbox and customer info */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: isMobile ? "0.75rem" : "1rem",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedOrderIds.has(order.id!)}
                    onChange={() => handleSelectOrder(order.id!)}
                    style={{
                      width: isMobile ? "1.375rem" : "1.25rem",
                      height: isMobile ? "1.375rem" : "1.25rem",
                      cursor: "pointer",
                      marginTop: "0.125rem",
                      minWidth: "22px",
                      minHeight: "22px",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: "600",
                        fontSize: isMobile ? "1.0625rem" : "1.125rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      {order.customerName}
                    </div>
                    {order.subClientCodice && (
                      <div
                        style={{
                          fontSize: isMobile ? "0.75rem" : "0.8125rem",
                          color: "#92400e",
                          backgroundColor: "#fef3c7",
                          padding: "0.125rem 0.5rem",
                          borderRadius: "4px",
                          display: "inline-block",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Sotto-cliente: {order.subClientName || order.subClientCodice}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: isMobile ? "0.8125rem" : "0.875rem",
                        color: "#6b7280",
                      }}
                    >
                      Creato:{" "}
                      {new Date(order.createdAt).toLocaleString("it-IT")}
                    </div>
                    {/* Status badge visible on mobile under customer name */}
                    {isMobile && (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          display: "inline-block",
                        }}
                      >
                        <div
                          style={{
                            padding: "0.375rem 0.875rem",
                            borderRadius: "9999px",
                            fontSize: "0.8125rem",
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
                            display: "inline-block",
                          }}
                        >
                          {order.status === "pending"
                            ? "In Attesa"
                            : order.status === "error"
                              ? "Errore"
                              : "In Elaborazione"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons - desktop layout */}
                {!isMobile && (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                    }}
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
                )}

                {/* Action buttons - mobile layout (grid) */}
                {isMobile && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: "0.5rem",
                      marginTop: "0.5rem",
                    }}
                  >
                    <button
                      onClick={() => handleDownloadPDF(order)}
                      style={{
                        padding: "0.75rem",
                        background: "#10b981",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.9375rem",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.375rem",
                        minHeight: "44px",
                      }}
                      title="Scarica PDF"
                    >
                      <span>📄</span>
                      <span>PDF</span>
                    </button>
                    <button
                      onClick={() => handlePrintOrder(order)}
                      style={{
                        padding: "0.75rem",
                        background: "#8b5cf6",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.9375rem",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.375rem",
                        minHeight: "44px",
                      }}
                      title="Stampa ordine"
                    >
                      <span>🖨️</span>
                      <span>Stampa</span>
                    </button>
                    <button
                      onClick={() => handleEditOrder(order.id!)}
                      style={{
                        padding: "0.75rem",
                        background: "#3b82f6",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.9375rem",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.375rem",
                        minHeight: "44px",
                      }}
                      title="Modifica ordine"
                    >
                      <span>✏️</span>
                      <span>Modifica</span>
                    </button>
                    <button
                      onClick={() => handleDeleteOrder(order.id!)}
                      style={{
                        padding: "0.75rem",
                        background: "#dc2626",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.9375rem",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.375rem",
                        minHeight: "44px",
                      }}
                      title="Elimina ordine"
                    >
                      <span>🗑️</span>
                      <span>Elimina</span>
                    </button>
                  </div>
                )}
              </div>

              {/* PHASE 72: Job Progress Bar */}
              {(isJobActive || isJobCompleted || isJobFailed) && (
                <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
                  <JobProgressBar
                    progress={order.jobProgress || 0}
                    operation={order.jobOperation || "In attesa..."}
                    status={order.jobStatus || "idle"}
                    error={isJobFailed ? order.jobError : undefined}
                  />
                  {isJobFailed && (
                    <button
                      onClick={() => handleRetryOrder(order.id!)}
                      style={{
                        padding: "0.75rem 1.25rem",
                        backgroundColor: "#f59e0b",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "0.9375rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        marginTop: "0.75rem",
                        width: isMobile ? "100%" : "auto",
                      }}
                    >
                      🔄 Riprova Ordine
                    </button>
                  )}
                </div>
              )}

              {/* DETAILED ORDER ITEMS - PREVENTIVO STYLE */}
              <div
                style={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  marginBottom: isMobile ? "0.75rem" : "1rem",
                  overflow: "hidden",
                }}
              >
                {/* Header with expand/collapse button */}
                <div
                  style={{
                    backgroundColor: "#f9fafb",
                    padding: isMobile ? "0.75rem" : "0.75rem 1rem",
                    borderBottom: "2px solid #e5e7eb",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                  onClick={() => handleToggleExpand(order.id!)}
                >
                  <span
                    style={{
                      fontWeight: "600",
                      fontSize: isMobile ? "0.9375rem" : "0.875rem",
                      color: "#374151",
                    }}
                  >
                    Dettaglio Articoli ({order.items.length})
                  </span>
                  <span
                    style={{
                      fontSize: isMobile ? "1.125rem" : "1rem",
                      color: "#6b7280",
                    }}
                  >
                    {expandedOrderIds.has(order.id!) ? "▼" : "▶"}
                  </span>
                </div>

                {/* Content - only shown when expanded */}
                {expandedOrderIds.has(order.id!) && (
                  <>
                    {/* Sub-client details for Fresis orders */}
                    {order.subClientData && (
                      <div
                        style={{
                          padding: "0.75rem 1rem",
                          backgroundColor: "#fffbeb",
                          borderBottom: "1px solid #f59e0b",
                          fontSize: "0.8125rem",
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
                          gap: "0.25rem 1rem",
                        }}
                      >
                        <div>
                          <strong>Codice:</strong> {order.subClientData.codice}
                        </div>
                        <div>
                          <strong>Ragione Sociale:</strong>{" "}
                          {order.subClientData.ragioneSociale}
                        </div>
                        {order.subClientData.supplRagioneSociale && (
                          <div>
                            <strong>Suppl.:</strong>{" "}
                            {order.subClientData.supplRagioneSociale}
                          </div>
                        )}
                        {order.subClientData.indirizzo && (
                          <div>
                            <strong>Indirizzo:</strong>{" "}
                            {order.subClientData.indirizzo}
                          </div>
                        )}
                        {order.subClientData.localita && (
                          <div>
                            <strong>Localita:</strong>{" "}
                            {order.subClientData.localita}{" "}
                            {order.subClientData.cap}{" "}
                            {order.subClientData.prov}
                          </div>
                        )}
                        {order.subClientData.partitaIva && (
                          <div>
                            <strong>P.IVA:</strong>{" "}
                            {order.subClientData.partitaIva}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Table Header - desktop only */}
                    {!isMobile && (
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
                    )}

                    {/* Items */}
                    {order.items.map((item, index) => {
                      const subtotal =
                        item.price * item.quantity - (item.discount || 0);
                      // Apply global discount if present
                      const subtotalAfterGlobal = order.discountPercent
                        ? subtotal * (1 - order.discountPercent / 100)
                        : subtotal;
                      const vatAmount = subtotalAfterGlobal * (item.vat / 100);
                      const total = subtotalAfterGlobal + vatAmount;

                      return (
                        <div
                          key={index}
                          style={{
                            display: isMobile ? "block" : "grid",
                            gridTemplateColumns: isMobile
                              ? undefined
                              : "3fr 1fr 1fr 1fr 1fr 1fr 1fr",
                            gap: isMobile ? undefined : "0.5rem",
                            padding: isMobile ? "0.75rem" : "1rem",
                            borderBottom:
                              index < order.items.length - 1
                                ? "1px solid #f3f4f6"
                                : "none",
                            fontSize: isMobile ? "0.875rem" : "0.875rem",
                          }}
                        >
                          {/* Desktop Layout - Grid */}
                          {!isMobile && (
                            <>
                              {/* Product Name & Code */}
                              <div>
                                <div
                                  style={{
                                    fontWeight: "600",
                                    marginBottom: "0.25rem",
                                  }}
                                >
                                  {item.productName || item.articleCode}
                                </div>
                                {/* Only show "Cod:" if it's different from productName */}
                                {item.productName &&
                                  item.productName !== item.articleCode && (
                                    <div
                                      style={{
                                        fontSize: "0.75rem",
                                        color: "#9ca3af",
                                        marginBottom: "0.25rem",
                                      }}
                                    >
                                      Cod: {item.articleCode}
                                    </div>
                                  )}
                                {item.description && (
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "#6b7280",
                                    }}
                                  >
                                    {item.description}
                                  </div>
                                )}
                                {/* Warehouse badge */}
                                {item.warehouseQuantity &&
                                  item.warehouseQuantity > 0 && (
                                    <div
                                      style={{
                                        fontSize: "0.75rem",
                                        color: "#059669",
                                        fontWeight: "600",
                                        marginTop: "0.25rem",
                                      }}
                                    >
                                      🏪 {item.warehouseQuantity} pz da
                                      magazzino
                                    </div>
                                  )}
                              </div>

                              {/* Quantity */}
                              <div
                                style={{
                                  textAlign: "right",
                                  alignSelf: "center",
                                }}
                              >
                                {item.quantity}
                              </div>

                              {/* Unit Price */}
                              <div
                                style={{
                                  textAlign: "right",
                                  alignSelf: "center",
                                }}
                              >
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
                              <div
                                style={{
                                  textAlign: "right",
                                  alignSelf: "center",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "#6b7280",
                                  }}
                                >
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
                            </>
                          )}

                          {/* Mobile Layout - Vertical Card */}
                          {isMobile && (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.625rem",
                              }}
                            >
                              {/* Product Name & Code */}
                              <div>
                                <div
                                  style={{
                                    fontWeight: "600",
                                    marginBottom: "0.25rem",
                                    fontSize: "0.9375rem",
                                  }}
                                >
                                  {item.productName || item.articleCode}
                                </div>
                                {/* Only show "Cod:" if it's different from productName */}
                                {item.productName &&
                                  item.productName !== item.articleCode && (
                                    <div
                                      style={{
                                        fontSize: "0.8125rem",
                                        color: "#9ca3af",
                                        marginBottom: "0.25rem",
                                      }}
                                    >
                                      Cod: {item.articleCode}
                                    </div>
                                  )}
                                {item.description && (
                                  <div
                                    style={{
                                      fontSize: "0.8125rem",
                                      color: "#6b7280",
                                    }}
                                  >
                                    {item.description}
                                  </div>
                                )}
                                {/* Warehouse badge */}
                                {item.warehouseQuantity &&
                                  item.warehouseQuantity > 0 && (
                                    <div
                                      style={{
                                        fontSize: "0.8125rem",
                                        color: "#059669",
                                        fontWeight: "600",
                                        marginTop: "0.25rem",
                                      }}
                                    >
                                      🏪 {item.warehouseQuantity} pz da
                                      magazzino
                                    </div>
                                  )}
                              </div>

                              {/* Details Grid - 2 columns */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: "0.5rem",
                                  fontSize: "0.875rem",
                                }}
                              >
                                {/* Quantity */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    Quantità
                                  </div>
                                  <div style={{ fontWeight: "500" }}>
                                    {item.quantity}
                                  </div>
                                </div>

                                {/* Unit Price */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    Prezzo Unit.
                                  </div>
                                  <div style={{ fontWeight: "500" }}>
                                    €{item.price.toFixed(2)}
                                  </div>
                                </div>

                                {/* Discount */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    Sconto
                                  </div>
                                  <div
                                    style={{
                                      fontWeight: "500",
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
                                </div>

                                {/* Subtotal */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    Subtotale
                                  </div>
                                  <div style={{ fontWeight: "600" }}>
                                    €{subtotal.toFixed(2)}
                                  </div>
                                </div>

                                {/* VAT */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    IVA ({item.vat}%)
                                  </div>
                                  <div style={{ fontWeight: "500" }}>
                                    €{vatAmount.toFixed(2)}
                                  </div>
                                </div>

                                {/* Total */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    Totale
                                  </div>
                                  <div
                                    style={{
                                      fontWeight: "700",
                                      color: "#1e40af",
                                      fontSize: "1rem",
                                    }}
                                  >
                                    €{total.toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Order Totals */}
                    <div
                      style={{
                        backgroundColor: "#f9fafb",
                        padding: isMobile ? "0.75rem" : "1rem",
                        borderTop: "2px solid #e5e7eb",
                      }}
                    >
                      {/* Calculate totals */}
                      {(() => {
                        const orderSubtotal = order.items.reduce(
                          (sum, item) =>
                            sum +
                            item.price * item.quantity -
                            (item.discount || 0),
                          0,
                        );

                        // Apply global discount if present
                        const globalDiscountAmount = order.discountPercent
                          ? (orderSubtotal * order.discountPercent) / 100
                          : 0;
                        const subtotalAfterGlobalDiscount =
                          orderSubtotal - globalDiscountAmount;

                        // Calculate shipping costs based on subtotal after discount
                        const shippingCosts = calculateShippingCosts(
                          subtotalAfterGlobalDiscount,
                        );
                        const shippingCost = shippingCosts.cost;
                        const shippingTax = shippingCosts.tax;

                        // Calculate VAT including shipping tax
                        const itemsVAT = order.items.reduce((sum, item) => {
                          const itemSubtotal =
                            item.price * item.quantity - (item.discount || 0);
                          const itemAfterGlobalDiscount = order.discountPercent
                            ? itemSubtotal * (1 - order.discountPercent / 100)
                            : itemSubtotal;
                          return (
                            sum + itemAfterGlobalDiscount * (item.vat / 100)
                          );
                        }, 0);
                        const orderVAT = itemsVAT + shippingTax;

                        // Total includes items + shipping cost + total VAT
                        const orderTotal =
                          subtotalAfterGlobalDiscount + shippingCost + orderVAT;

                        return (
                          <>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "0.5rem",
                                fontSize: isMobile ? "0.8125rem" : "0.875rem",
                              }}
                            >
                              <span style={{ color: "#6b7280" }}>
                                Subtotale (senza IVA):
                              </span>
                              <span style={{ fontWeight: "500" }}>
                                €{orderSubtotal.toFixed(2)}
                              </span>
                            </div>

                            {/* Show global discount if present */}
                            {order.discountPercent &&
                              order.discountPercent > 0 && (
                                <>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      marginBottom: "0.5rem",
                                      fontSize: isMobile
                                        ? "0.8125rem"
                                        : "0.875rem",
                                    }}
                                  >
                                    <span style={{ color: "#dc2626" }}>
                                      Sconto globale (
                                      {order.discountPercent.toFixed(2)}
                                      %):
                                    </span>
                                    <span
                                      style={{
                                        fontWeight: "500",
                                        color: "#dc2626",
                                      }}
                                    >
                                      -€{globalDiscountAmount.toFixed(2)}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      marginBottom: "0.5rem",
                                      fontSize: isMobile
                                        ? "0.8125rem"
                                        : "0.875rem",
                                    }}
                                  >
                                    <span style={{ color: "#6b7280" }}>
                                      Subtotale scontato:
                                    </span>
                                    <span style={{ fontWeight: "500" }}>
                                      €{subtotalAfterGlobalDiscount.toFixed(2)}
                                    </span>
                                  </div>
                                </>
                              )}

                            {/* Shipping Costs */}
                            {shippingCost > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginBottom: "0.5rem",
                                  fontSize: isMobile ? "0.8125rem" : "0.875rem",
                                }}
                              >
                                <span style={{ color: "#f59e0b" }}>
                                  Spese di trasporto K3
                                  <span
                                    style={{
                                      fontSize: "0.75rem",
                                      marginLeft: "0.25rem",
                                    }}
                                  >
                                    (€{shippingCost.toFixed(2)} + IVA)
                                  </span>
                                </span>
                                <span
                                  style={{
                                    fontWeight: "500",
                                    color: "#f59e0b",
                                  }}
                                >
                                  €{(shippingCost + shippingTax).toFixed(2)}
                                </span>
                              </div>
                            )}

                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "0.5rem",
                                fontSize: isMobile ? "0.8125rem" : "0.875rem",
                              }}
                            >
                              <span style={{ color: "#6b7280" }}>
                                IVA Totale:
                              </span>
                              <span style={{ fontWeight: "500" }}>
                                €{orderVAT.toFixed(2)}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                paddingTop: isMobile ? "0.625rem" : "0.75rem",
                                borderTop: "2px solid #3b82f6",
                                fontSize: isMobile ? "1rem" : "1.125rem",
                              }}
                            >
                              <span
                                style={{ fontWeight: "700", color: "#1e40af" }}
                              >
                                TOTALE (con IVA):
                              </span>
                              <span
                                style={{ fontWeight: "700", color: "#1e40af" }}
                              >
                                €{orderTotal.toFixed(2)}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>

              {order.status === "error" && order.errorMessage && (
                <div
                  style={{
                    padding: isMobile ? "0.625rem" : "0.75rem",
                    backgroundColor: "#fee2e2",
                    border: "1px solid #dc2626",
                    borderRadius: "4px",
                    color: "#991b1b",
                    fontSize: isMobile ? "0.8125rem" : "0.875rem",
                    marginTop: isMobile ? "0.5rem" : "0",
                  }}
                >
                  <strong>Errore:</strong> {order.errorMessage}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
