import { useState, useEffect, useCallback } from "react";
import { OrderCardNew } from "../components/OrderCardNew";
import { SendToMilanoModal } from "../components/SendToMilanoModal";
import { SyncProgressModal } from "../components/SyncProgressModal";
import { OrderStatusLegend } from "../components/OrderStatusLegend";
import { groupOrdersByPeriod } from "../utils/orderGrouping";
import type { Order } from "../types/order";
import { useSyncProgress } from "../hooks/useSyncProgress";
import { toastService } from "../services/toast.service";
import { fetchWithRetry } from "../utils/fetch-with-retry";

interface OrderFilters {
  customer: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  quickFilters: Set<QuickFilterType>;
  search: string; // Global search term
}

type QuickFilterType =
  | "requiresAttention"
  | "editable"
  | "inTransit"
  | "invoiced";

interface OrderHistoryResponse {
  success: boolean;
  data: {
    orders: Order[];
    total: number;
    hasMore: boolean;
  };
}

export function OrderHistory() {
  const { progress, reset: resetProgress } = useSyncProgress();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [filters, setFilters] = useState<OrderFilters>({
    customer: "",
    dateFrom: "",
    dateTo: "",
    status: "",
    quickFilters: new Set(),
    search: "",
  });
  const [debouncedCustomer, setDebouncedCustomer] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncType] = useState<"sync" | "reset">("sync");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalOrderId, setModalOrderId] = useState<string | null>(null);
  const [modalCustomerName, setModalCustomerName] = useState<string>("");
  const [sendingToMilano, setSendingToMilano] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  // Debounce customer search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomer(filters.customer);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters.customer]);

  // Debounce global search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters.search]);

  // Fetch orders on mount and when filters change
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato. Effettua il login.");
        setLoading(false);
        return;
      }

      // Build query params
      const params = new URLSearchParams();
      if (debouncedCustomer) params.append("customer", debouncedCustomer);
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.append("dateTo", filters.dateTo);
      if (filters.status) params.append("status", filters.status);
      params.append("limit", "100");

      const response = await fetchWithRetry(
        `/api/orders/history?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401) {
          setError("Sessione scaduta. Effettua il login.");
          localStorage.removeItem("archibald_jwt");
          return;
        }
        throw new Error(`Errore ${response.status}: ${response.statusText}`);
      }

      const data: OrderHistoryResponse = await response.json();
      if (!data.success) {
        throw new Error("Errore nel caricamento degli ordini");
      }

      setOrders(data.data.orders);
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError(err instanceof Error ? err.message : "Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }, [
    debouncedCustomer,
    debouncedSearch,
    filters.dateFrom,
    filters.dateTo,
    filters.status,
  ]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Fetch order detail and state history when expanding
  const handleToggle = (orderId: string) => {
    if (expandedOrderId === orderId) {
      // Collapse
      setExpandedOrderId(null);
    } else {
      // Expand - all data already available from /api/orders/history
      setExpandedOrderId(orderId);
    }
  };

  const handleClearFilters = () => {
    setFilters({
      customer: "",
      dateFrom: "",
      dateTo: "",
      status: "",
      quickFilters: new Set(),
      search: "",
    });
  };

  const handleSendToMilano = (orderId: string, customerName: string) => {
    setModalOrderId(orderId);
    setModalCustomerName(customerName);
    setModalOpen(true);
  };

  const handleConfirmSendToMilano = async () => {
    if (!modalOrderId) return;

    setSendingToMilano(true);
    setError(null);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato. Effettua il login.");
        setSendingToMilano(false);
        return;
      }

      const response = await fetchWithRetry(
        `/api/orders/${modalOrderId}/send-to-milano`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401) {
          setError("Sessione scaduta. Effettua il login.");
          localStorage.removeItem("archibald_jwt");
          return;
        }
        throw new Error(`Errore ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Errore nell'invio a Milano");
      }

      // Close modal
      setModalOpen(false);
      setModalOrderId(null);
      setModalCustomerName("");

      // Reload orders to reflect new state
      await fetchOrders();

      // Show success message
      toastService.success("Ordine inviato a Milano con successo!");
    } catch (err) {
      console.error("Error sending to Milano:", err);
      setError(
        err instanceof Error ? err.message : "Errore nell'invio a Milano",
      );
    } finally {
      setSendingToMilano(false);
    }
  };

  const handleEdit = (orderId: string) => {
    // Navigate to OrderForm with orderId to edit
    window.location.href = `/order?orderId=${orderId}`;
  };

  // Apply quick filters client-side
  const applyQuickFilters = (orders: Order[]): Order[] => {
    if (filters.quickFilters.size === 0) return orders;

    return orders.filter((order) => {
      for (const filterType of filters.quickFilters) {
        let matches = false;

        switch (filterType) {
          case "requiresAttention":
            // IN ATTESA DI APPROVAZIONE or TRANSFER ERROR
            matches =
              order.state === "IN ATTESA DI APPROVAZIONE" ||
              order.state === "TRANSFER ERROR";
            break;

          case "editable":
            // GIORNALE + MODIFICA
            matches =
              order.orderType === "GIORNALE" && order.state === "MODIFICA";
            break;

          case "inTransit":
            // ORDINE DI VENDITA + CONSEGNATO + TRASFERITO without deliveryCompletedDate
            matches =
              (order.orderType === "ORDINE DI VENDITA" ||
                order.status === "CONSEGNATO") &&
              !!(order.tracking?.trackingNumber || order.ddt?.trackingNumber) &&
              !order.deliveryCompletedDate;
            break;

          case "invoiced":
            // With invoice number
            matches = !!order.invoiceNumber;
            break;
        }

        if (!matches) return false; // AND logic: all filters must match
      }

      return true;
    });
  };

  const filteredOrders = applyQuickFilters(orders);

  const hasActiveFilters =
    filters.customer ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.status ||
    filters.quickFilters.size > 0 ||
    filters.search;

  // Group orders by period
  const orderGroups = groupOrdersByPeriod(filteredOrders);

  // Get merged order data (base order as-is since we removed orderDetails state)
  const getMergedOrder = (order: Order): Order => {
    return order;
  };

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "24px",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#333",
              marginBottom: "8px",
            }}
          >
            📦 Ordini
          </h1>
          <p style={{ fontSize: "16px", color: "#666" }}>
            Consulta lo storico dei tuoi ordini e il loro stato
          </p>
        </div>
        <button
          onClick={() => setLegendOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            fontSize: "14px",
            fontWeight: 600,
            backgroundColor: "#fff",
            color: "#1976d2",
            border: "2px solid #1976d2",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#1976d2";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#fff";
            e.currentTarget.style.color = "#1976d2";
          }}
        >
          ℹ️ Leggi gli stati
        </button>
      </div>

      {/* Filters */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          {/* Global search */}
          <div>
            <label
              htmlFor="global-search"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "8px",
              }}
            >
              🔍 Ricerca globale
            </label>
            <input
              id="global-search"
              type="text"
              placeholder="Cerca ordini, clienti, articoli, tracking..."
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "14px",
                border: "1px solid #ddd",
                borderRadius: "8px",
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#1976d2";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#ddd";
              }}
            />
            <div
              style={{
                fontSize: "11px",
                color: "#999",
                marginTop: "4px",
              }}
            >
              Cerca in: ORD/numero, cliente, importi, tracking, DDT, fattura
            </div>
          </div>

          {/* Date from */}
          <div>
            <label
              htmlFor="date-from"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "8px",
              }}
            >
              Da
            </label>
            <input
              id="date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "14px",
                border: "1px solid #ddd",
                borderRadius: "8px",
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#1976d2";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#ddd";
              }}
            />
          </div>

          {/* Date to */}
          <div>
            <label
              htmlFor="date-to"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "8px",
              }}
            >
              A
            </label>
            <input
              id="date-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "14px",
                border: "1px solid #ddd",
                borderRadius: "8px",
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#1976d2";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#ddd";
              }}
            />
          </div>
        </div>

        {/* Quick filter chips */}
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              color: "#333",
              marginBottom: "8px",
            }}
          >
            Filtri veloci
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              {
                id: "requiresAttention" as QuickFilterType,
                label: "⚠️ Richiede attenzione",
                color: "#F44336",
                bgColor: "#FFEBEE",
                count: orders.filter(
                  (o) =>
                    o.state === "IN ATTESA DI APPROVAZIONE" ||
                    o.state === "TRANSFER ERROR",
                ).length,
              },
              {
                id: "editable" as QuickFilterType,
                label: "✏️ Modificabili",
                color: "#757575",
                bgColor: "#F5F5F5",
                count: orders.filter(
                  (o) => o.orderType === "GIORNALE" && o.state === "MODIFICA",
                ).length,
              },
              {
                id: "inTransit" as QuickFilterType,
                label: "🚚 In transito",
                color: "#2196F3",
                bgColor: "#E3F2FD",
                count: orders.filter(
                  (o) =>
                    (o.orderType === "ORDINE DI VENDITA" ||
                      o.status === "CONSEGNATO") &&
                    (o.tracking?.trackingNumber || o.ddt?.trackingNumber) &&
                    !o.deliveryCompletedDate,
                ).length,
              },
              {
                id: "invoiced" as QuickFilterType,
                label: "📑 Fatturati",
                color: "#9C27B0",
                bgColor: "#F3E5F5",
                count: orders.filter((o) => !!o.invoiceNumber).length,
              },
            ].map((quickFilter) => {
              const isActive = filters.quickFilters.has(quickFilter.id);
              return (
                <button
                  key={quickFilter.id}
                  onClick={() => {
                    setFilters((prev) => {
                      const newQuickFilters = new Set(prev.quickFilters);
                      if (isActive) {
                        newQuickFilters.delete(quickFilter.id);
                      } else {
                        newQuickFilters.add(quickFilter.id);
                      }
                      return { ...prev, quickFilters: newQuickFilters };
                    });
                  }}
                  style={{
                    padding: "8px 16px",
                    fontSize: "14px",
                    fontWeight: 600,
                    border: isActive
                      ? `2px solid ${quickFilter.color}`
                      : "1px solid #ddd",
                    borderRadius: "20px",
                    backgroundColor: isActive ? quickFilter.bgColor : "#fff",
                    color: isActive ? quickFilter.color : "#666",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "#f5f5f5";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "#fff";
                    }
                  }}
                >
                  {quickFilter.label} ({quickFilter.count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "12px" }}>
          {/* Clear filters button */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 600,
                border: "1px solid #f44336",
                borderRadius: "8px",
                backgroundColor: "#fff",
                color: "#f44336",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f44336";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#fff";
                e.currentTarget.style.color = "#f44336";
              }}
            >
              ✕ Cancella filtri
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              marginBottom: "16px",
              animation: "spin 1s linear infinite",
            }}
          >
            ⏳
          </div>
          <p style={{ fontSize: "16px", color: "#666" }}>
            Caricamento ordini...
          </p>
          <style>
            {`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}
          </style>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            border: "2px solid #f44336",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              textAlign: "center",
              marginBottom: "16px",
            }}
          >
            ⚠️
          </div>
          <p
            style={{
              fontSize: "16px",
              color: "#f44336",
              textAlign: "center",
              marginBottom: "16px",
            }}
          >
            {error}
          </p>
          <div style={{ textAlign: "center" }}>
            <button
              onClick={fetchOrders}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#1565c0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#1976d2";
              }}
            >
              Riprova
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && orders.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>📭</div>
          <p
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#333",
              marginBottom: "8px",
            }}
          >
            Nessun ordine trovato
          </p>
          <p style={{ fontSize: "14px", color: "#666" }}>
            {hasActiveFilters
              ? "Prova a modificare i filtri di ricerca"
              : "Non hai ancora effettuato ordini"}
          </p>
        </div>
      )}

      {/* Timeline content */}
      {!loading && !error && orders.length > 0 && (
        <div>
          {orderGroups.map((group) => (
            <div key={group.period} style={{ marginBottom: "32px" }}>
              {/* Period header */}
              <h2
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "16px",
                  paddingLeft: "4px",
                }}
              >
                {group.period}
              </h2>

              {/* Orders in this period */}
              <div>
                {group.orders.map((order) => {
                  const mergedOrder = getMergedOrder(order);
                  const isExpanded = expandedOrderId === order.id;

                  return (
                    <OrderCardNew
                      key={order.id}
                      order={mergedOrder}
                      expanded={isExpanded}
                      onToggle={() => handleToggle(order.id)}
                      onSendToMilano={handleSendToMilano}
                      onEdit={handleEdit}
                      token={localStorage.getItem("archibald_jwt") || undefined}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Send to Milano Modal */}
      <SendToMilanoModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalOrderId(null);
          setModalCustomerName("");
        }}
        onConfirm={handleConfirmSendToMilano}
        orderId={modalOrderId || ""}
        customerName={modalCustomerName}
        isLoading={sendingToMilano}
      />

      {/* Sync Progress Modal */}
      <SyncProgressModal
        isOpen={syncModalOpen}
        type={syncType}
        progress={progress}
        onClose={() => {
          setSyncModalOpen(false);
          resetProgress();
        }}
      />

      {/* Order Status Legend Modal */}
      <OrderStatusLegend
        isOpen={legendOpen}
        onClose={() => setLegendOpen(false)}
      />
    </div>
  );
}
