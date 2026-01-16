import { useState, useEffect, useCallback } from "react";
import { OrderCardNew } from "../components/OrderCardNew";
import { OrderTimeline } from "../components/OrderTimeline";
import type {
  StatusUpdate,
  StateHistoryEntry,
} from "../components/OrderTimeline";
import { OrderTracking } from "../components/OrderTracking";
import { OrderActions } from "../components/OrderActions";
import { SendToMilanoModal } from "../components/SendToMilanoModal";
import { groupOrdersByPeriod } from "../utils/orderGrouping";
import type { Order } from "../types/order";

interface OrderFilters {
  customer: string;
  dateFrom: string;
  dateTo: string;
  status: string;
}

interface OrderDetail extends Order {
  customerName: string;
  total: string;
  status: string;
  tracking?: {
    courier: string;
    trackingNumber: string;
  };
  documents?: Array<{
    type: string;
    name: string;
    url: string;
  }>;
  items?: Array<{
    articleCode: string;
    productName?: string;
    description: string;
    quantity: number;
    price: number;
    discount?: number;
  }>;
  statusTimeline?: StatusUpdate[];
  customerNotes?: string;
}

interface OrderHistoryResponse {
  success: boolean;
  data: {
    orders: Order[];
    total: number;
    hasMore: boolean;
  };
}

interface OrderDetailResponse {
  success: boolean;
  data: OrderDetail;
}

export function OrderHistory() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<Map<string, OrderDetail>>(
    new Map(),
  );
  const [stateHistory, setStateHistory] = useState<
    Map<string, StateHistoryEntry[]>
  >(new Map());
  const [filters, setFilters] = useState<OrderFilters>({
    customer: "",
    dateFrom: "",
    dateTo: "",
    status: "",
  });
  const [debouncedCustomer, setDebouncedCustomer] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalOrderId, setModalOrderId] = useState<string | null>(null);
  const [modalCustomerName, setModalCustomerName] = useState<string>("");
  const [sendingToMilano, setSendingToMilano] = useState(false);

  // Debounce customer search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomer(filters.customer);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters.customer]);

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
      if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.append("dateTo", filters.dateTo);
      if (filters.status) params.append("status", filters.status);
      params.append("limit", "100");

      const response = await fetch(`/api/orders/history?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

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
  }, [debouncedCustomer, filters.dateFrom, filters.dateTo, filters.status]);

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

  const handleDocumentsClick = (orderId: string) => {
    // For now, just expand the card to show documents
    if (expandedOrderId !== orderId) {
      handleToggle(orderId);
    }
  };

  const handleClearFilters = () => {
    setFilters({
      customer: "",
      dateFrom: "",
      dateTo: "",
      status: "",
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

      const response = await fetch(
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

      // Show success message (you could add a toast here)
      alert("Ordine inviato a Milano con successo!");
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
    // Navigate to OrderForm with orderId to restore draft
    window.location.href = `/order-form?orderId=${orderId}`;
  };

  const handleForceSync = async () => {
    setSyncing(true);
    setError(null);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato. Effettua il login.");
        setSyncing(false);
        return;
      }

      // Call both force-sync and sync-states endpoints in parallel
      const [syncResponse, stateResponse] = await Promise.all([
        fetch("/api/orders/force-sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch("/api/orders/sync-states?forceRefresh=true", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);

      if (!syncResponse.ok) {
        if (syncResponse.status === 401) {
          setError("Sessione scaduta. Effettua il login.");
          localStorage.removeItem("archibald_jwt");
          return;
        }
        throw new Error(
          `Errore ${syncResponse.status}: ${syncResponse.statusText}`,
        );
      }

      const data = await syncResponse.json();
      if (!data.success) {
        throw new Error("Errore nella sincronizzazione degli ordini");
      }

      // State sync is best-effort (don't fail if it errors)
      if (stateResponse.ok) {
        const stateData = await stateResponse.json();
        console.log("State sync result:", stateData);
      }

      // Reload orders after successful sync
      await fetchOrders();
    } catch (err) {
      console.error("Error forcing sync:", err);
      setError(
        err instanceof Error ? err.message : "Errore nella sincronizzazione",
      );
    } finally {
      setSyncing(false);
    }
  };

  const hasActiveFilters =
    filters.customer || filters.dateFrom || filters.dateTo || filters.status;

  // Group orders by period
  const orderGroups = groupOrdersByPeriod(orders);

  // Get merged order data (base + detail if available)
  const getMergedOrder = (order: Order): Order => {
    const detail = orderDetails.get(order.id);
    if (!detail) {
      // Return base order as-is
      return order;
    }
    return { ...order, ...detail };
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
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "#333",
            marginBottom: "8px",
          }}
        >
          📦 Storico Ordini
        </h1>
        <p style={{ fontSize: "16px", color: "#666" }}>
          Consulta lo storico dei tuoi ordini e il loro stato
        </p>
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
          {/* Customer search */}
          <div>
            <label
              htmlFor="customer-search"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "8px",
              }}
            >
              Cliente
            </label>
            <input
              id="customer-search"
              type="text"
              placeholder="Cerca cliente..."
              value={filters.customer}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, customer: e.target.value }))
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

        {/* Status filter chips */}
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
            Stato
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["Tutti", "In lavorazione", "Evaso", "Spedito"].map((status) => {
              const isActive =
                status === "Tutti"
                  ? !filters.status
                  : filters.status === status;
              return (
                <button
                  key={status}
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      status: status === "Tutti" ? "" : status,
                    }))
                  }
                  style={{
                    padding: "8px 16px",
                    fontSize: "14px",
                    fontWeight: 600,
                    border: isActive ? "2px solid #1976d2" : "1px solid #ddd",
                    borderRadius: "20px",
                    backgroundColor: isActive ? "#e3f2fd" : "#fff",
                    color: isActive ? "#1976d2" : "#666",
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
                  {status}
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

          {/* Force sync button */}
          <button
            onClick={handleForceSync}
            disabled={syncing || loading}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              border: "1px solid #1976d2",
              borderRadius: "8px",
              backgroundColor: syncing ? "#e3f2fd" : "#fff",
              color: syncing ? "#999" : "#1976d2",
              cursor: syncing || loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              opacity: syncing || loading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!syncing && !loading) {
                e.currentTarget.style.backgroundColor = "#1976d2";
                e.currentTarget.style.color = "#fff";
              }
            }}
            onMouseLeave={(e) => {
              if (!syncing && !loading) {
                e.currentTarget.style.backgroundColor = "#fff";
                e.currentTarget.style.color = "#1976d2";
              }
            }}
          >
            {syncing ? "⏳ Sincronizzazione..." : "🔄 Forza Sincronizzazione"}
          </button>
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
    </div>
  );
}
