import { useState, useEffect, useCallback } from "react";
import { OrderCard } from "../components/OrderCard";
import type { Order as OrderCardOrder } from "../components/OrderCard";
import { OrderTimeline } from "../components/OrderTimeline";
import type { StatusUpdate } from "../components/OrderTimeline";
import { groupOrdersByPeriod } from "../utils/orderGrouping";
import type { Order } from "../utils/orderGrouping";

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
  const [filters, setFilters] = useState<OrderFilters>({
    customer: "",
    dateFrom: "",
    dateTo: "",
    status: "",
  });
  const [debouncedCustomer, setDebouncedCustomer] = useState("");
  const [syncing, setSyncing] = useState(false);

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

  // Fetch order detail when expanding
  const handleToggle = async (orderId: string) => {
    if (expandedOrderId === orderId) {
      // Collapse
      setExpandedOrderId(null);
      return;
    }

    // Expand - check if detail already cached
    if (orderDetails.has(orderId)) {
      setExpandedOrderId(orderId);
      return;
    }

    // Fetch detail
    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato. Effettua il login.");
        return;
      }

      const response = await fetch(`/api/orders/${orderId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError("Ordine non trovato.");
          return;
        }
        throw new Error(`Errore ${response.status}: ${response.statusText}`);
      }

      const data: OrderDetailResponse = await response.json();
      if (!data.success) {
        throw new Error("Errore nel caricamento del dettaglio ordine");
      }

      // Cache detail
      setOrderDetails((prev) => new Map(prev).set(orderId, data.data));
      setExpandedOrderId(orderId);
    } catch (err) {
      console.error("Error fetching order detail:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Errore nel caricamento del dettaglio",
      );
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

      const response = await fetch("/api/orders/force-sync", {
        method: "POST",
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

      const data = await response.json();
      if (!data.success) {
        throw new Error("Errore nella sincronizzazione degli ordini");
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
  const getMergedOrder = (order: Order): OrderCardOrder => {
    const detail = orderDetails.get(order.id);
    if (!detail) {
      // Return base order cast to OrderCardOrder via unknown
      return order as unknown as OrderCardOrder;
    }
    return { ...order, ...detail } as unknown as OrderCardOrder;
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
                  const detail = orderDetails.get(order.id);

                  return (
                    <OrderCard
                      key={order.id}
                      order={mergedOrder}
                      expanded={isExpanded}
                      onToggle={() => handleToggle(order.id)}
                      onDocumentsClick={handleDocumentsClick}
                      timelineComponent={
                        isExpanded && detail?.statusTimeline ? (
                          <OrderTimeline updates={detail.statusTimeline} />
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
