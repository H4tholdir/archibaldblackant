import { useState, useEffect, useCallback } from "react";
import { OrderCardNew } from "../components/OrderCardNew";
import { SendToMilanoModal } from "../components/SendToMilanoModal";
import { SyncProgressModal } from "../components/SyncProgressModal";
import { groupOrdersByPeriod } from "../utils/orderGrouping";
import type { Order } from "../types/order";
import { useAuth } from "../hooks/useAuth";
import { useSyncProgress } from "../hooks/useSyncProgress";
import { toastService } from "../services/toast.service";

interface OrderFilters {
  customer: string;
  dateFrom: string;
  dateTo: string;
  status: string;
}

interface OrderHistoryResponse {
  success: boolean;
  data: {
    orders: Order[];
    total: number;
    hasMore: boolean;
  };
}

export function OrderHistory() {
  const auth = useAuth();
  const { progress, startSync, reset: resetProgress } = useSyncProgress();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [filters, setFilters] = useState<OrderFilters>({
    customer: "",
    dateFrom: "",
    dateTo: "",
    status: "",
  });
  const [debouncedCustomer, setDebouncedCustomer] = useState("");
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncType, setSyncType] = useState<"sync" | "reset">("sync");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalOrderId, setModalOrderId] = useState<string | null>(null);
  const [modalCustomerName, setModalCustomerName] = useState<string>("");
  const [sendingToMilano, setSendingToMilano] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [syncingDDT, setSyncingDDT] = useState(false);
  const [syncingInvoices, setSyncingInvoices] = useState(false);
  const [ordersSyncResult, setOrdersSyncResult] = useState<any>(null);
  const [ddtSyncResult, setDDTSyncResult] = useState<any>(null);
  const [invoicesSyncResult, setInvoicesSyncResult] = useState<any>(null);

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
    // Navigate to OrderForm with orderId to restore draft
    window.location.href = `/order-form?orderId=${orderId}`;
  };

  const handleResetDB = async () => {
    // Confirmation dialog
    const confirmed = window.confirm(
      "⚠️ ATTENZIONE: Questa operazione cancellerà TUTTI gli ordini dal database e avvierà una sincronizzazione completa. Sei sicuro di voler continuare?",
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("archibald_jwt");
    if (!token) {
      setError("Non autenticato. Effettua il login.");
      return;
    }

    // Open modal and start reset
    setSyncType("reset");
    setSyncModalOpen(true);
    setError(null);

    try {
      await startSync("reset", token, async () => {
        // Auto-refresh orders list when sync completes
        console.log("Reset and sync completed, refreshing orders list...");
        await fetchOrders();
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Errore nel reset del database";
      setError(errorMessage);
    }
  };

  const handleSyncOrders = async () => {
    if (syncingOrders || syncingDDT || syncingInvoices) return;

    setSyncingOrders(true);
    setOrdersSyncResult(null);
    setError(null);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato. Effettua il login.");
        return;
      }

      const response = await fetch("/api/orders/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Sync failed");
      }

      setOrdersSyncResult(data);
      await fetchOrders();
    } catch (error) {
      console.error("Orders sync error:", error);
      setError(`Errore sincronizzazione ordini: ${error}`);
    } finally {
      setSyncingOrders(false);
    }
  };

  const handleSyncDDT = async () => {
    if (syncingOrders || syncingDDT || syncingInvoices) return;

    setSyncingDDT(true);
    setDDTSyncResult(null);
    setError(null);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato. Effettua il login.");
        return;
      }

      const response = await fetch("/api/ddt/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Sync failed");
      }

      setDDTSyncResult(data);
      await fetchOrders();
    } catch (error) {
      console.error("DDT sync error:", error);
      setError(`Errore sincronizzazione DDT: ${error}`);
    } finally {
      setSyncingDDT(false);
    }
  };

  const handleSyncInvoices = async () => {
    if (syncingOrders || syncingDDT || syncingInvoices) return;

    setSyncingInvoices(true);
    setInvoicesSyncResult(null);
    setError(null);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato. Effettua il login.");
        return;
      }

      const response = await fetch("/api/invoices/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Sync failed");
      }

      setInvoicesSyncResult(data);
      await fetchOrders();
    } catch (error) {
      console.error("Invoices sync error:", error);
      setError(`Errore sincronizzazione fatture: ${error}`);
    } finally {
      setSyncingInvoices(false);
    }
  };

  const hasActiveFilters =
    filters.customer || filters.dateFrom || filters.dateTo || filters.status;

  // Group orders by period
  const orderGroups = groupOrdersByPeriod(orders);

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
      <div style={{ marginBottom: "24px" }}>
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
            Filtro
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["Tutti", "Spediti", "Consegnati", "Fatturati"].map(
              (filterType) => {
                const isActive =
                  filterType === "Tutti"
                    ? !filters.status
                    : filters.status === filterType;
                return (
                  <button
                    key={filterType}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        status: filterType === "Tutti" ? "" : filterType,
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
                    {filterType}
                  </button>
                );
              },
            )}
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

          {/* Sync Orders button */}
          <button
            onClick={handleSyncOrders}
            disabled={syncingOrders || syncingDDT || syncingInvoices || loading}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              border: "1px solid #1976d2",
              borderRadius: "8px",
              backgroundColor: syncingOrders ? "#e3f2fd" : "#fff",
              color: syncingOrders ? "#999" : "#1976d2",
              cursor:
                syncingOrders || syncingDDT || syncingInvoices || loading
                  ? "not-allowed"
                  : "pointer",
              transition: "all 0.2s",
              opacity:
                syncingOrders || syncingDDT || syncingInvoices || loading
                  ? 0.6
                  : 1,
            }}
            onMouseEnter={(e) => {
              if (
                !syncingOrders &&
                !syncingDDT &&
                !syncingInvoices &&
                !loading
              ) {
                e.currentTarget.style.backgroundColor = "#1976d2";
                e.currentTarget.style.color = "#fff";
              }
            }}
            onMouseLeave={(e) => {
              if (
                !syncingOrders &&
                !syncingDDT &&
                !syncingInvoices &&
                !loading
              ) {
                e.currentTarget.style.backgroundColor = "#fff";
                e.currentTarget.style.color = "#1976d2";
              }
            }}
          >
            {syncingOrders ? "⏳ Sync Ordini..." : "🔄 Sync Ordini"}
          </button>

          {/* Sync DDT button */}
          <button
            onClick={handleSyncDDT}
            disabled={syncingOrders || syncingDDT || syncingInvoices || loading}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              border: "1px solid #4caf50",
              borderRadius: "8px",
              backgroundColor: syncingDDT ? "#e8f5e9" : "#fff",
              color: syncingDDT ? "#999" : "#4caf50",
              cursor:
                syncingOrders || syncingDDT || syncingInvoices || loading
                  ? "not-allowed"
                  : "pointer",
              transition: "all 0.2s",
              opacity:
                syncingOrders || syncingDDT || syncingInvoices || loading
                  ? 0.6
                  : 1,
            }}
            onMouseEnter={(e) => {
              if (
                !syncingOrders &&
                !syncingDDT &&
                !syncingInvoices &&
                !loading
              ) {
                e.currentTarget.style.backgroundColor = "#4caf50";
                e.currentTarget.style.color = "#fff";
              }
            }}
            onMouseLeave={(e) => {
              if (
                !syncingOrders &&
                !syncingDDT &&
                !syncingInvoices &&
                !loading
              ) {
                e.currentTarget.style.backgroundColor = "#fff";
                e.currentTarget.style.color = "#4caf50";
              }
            }}
          >
            {syncingDDT ? "⏳ Sync DDT..." : "🚚 Sync DDT"}
          </button>

          {/* Sync Invoices button */}
          <button
            onClick={handleSyncInvoices}
            disabled={syncingOrders || syncingDDT || syncingInvoices || loading}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              border: "1px solid #ff9800",
              borderRadius: "8px",
              backgroundColor: syncingInvoices ? "#fff3e0" : "#fff",
              color: syncingInvoices ? "#999" : "#ff9800",
              cursor:
                syncingOrders || syncingDDT || syncingInvoices || loading
                  ? "not-allowed"
                  : "pointer",
              transition: "all 0.2s",
              opacity:
                syncingOrders || syncingDDT || syncingInvoices || loading
                  ? 0.6
                  : 1,
            }}
            onMouseEnter={(e) => {
              if (
                !syncingOrders &&
                !syncingDDT &&
                !syncingInvoices &&
                !loading
              ) {
                e.currentTarget.style.backgroundColor = "#ff9800";
                e.currentTarget.style.color = "#fff";
              }
            }}
            onMouseLeave={(e) => {
              if (
                !syncingOrders &&
                !syncingDDT &&
                !syncingInvoices &&
                !loading
              ) {
                e.currentTarget.style.backgroundColor = "#fff";
                e.currentTarget.style.color = "#ff9800";
              }
            }}
          >
            {syncingInvoices ? "⏳ Sync Fatture..." : "💰 Sync Fatture"}
          </button>

          {/* Admin-only Reset DB button */}
          {auth.user?.role === "admin" && (
            <button
              onClick={handleResetDB}
              disabled={progress.isRunning || loading}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 600,
                border: "1px solid #f44336",
                borderRadius: "8px",
                backgroundColor: progress.isRunning ? "#ffebee" : "#fff",
                color: progress.isRunning ? "#999" : "#f44336",
                cursor:
                  progress.isRunning || loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                opacity: progress.isRunning || loading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!progress.isRunning && !loading) {
                  e.currentTarget.style.backgroundColor = "#f44336";
                  e.currentTarget.style.color = "#fff";
                }
              }}
              onMouseLeave={(e) => {
                if (!progress.isRunning && !loading) {
                  e.currentTarget.style.backgroundColor = "#fff";
                  e.currentTarget.style.color = "#f44336";
                }
              }}
            >
              {progress.isRunning && syncType === "reset"
                ? "⏳ Reset in corso..."
                : "🗑️ Reset DB e Forza Sync"}
            </button>
          )}
        </div>
      </div>

      {/* Sync Progress Banners */}
      {syncingOrders && (
        <div
          style={{
            padding: "15px",
            backgroundColor: "#e3f2fd",
            borderRadius: "8px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: "bold",
              marginBottom: "5px",
            }}
          >
            ⏳ Sincronizzazione ordini in corso...
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>
            Download PDF → Parsing → Salvataggio database
          </div>
        </div>
      )}

      {syncingDDT && (
        <div
          style={{
            padding: "15px",
            backgroundColor: "#e8f5e9",
            borderRadius: "8px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: "bold",
              marginBottom: "5px",
            }}
          >
            ⏳ Sincronizzazione DDT in corso...
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>
            Download PDF → Parsing → Salvataggio database
          </div>
        </div>
      )}

      {syncingInvoices && (
        <div
          style={{
            padding: "15px",
            backgroundColor: "#fff3e0",
            borderRadius: "8px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: "bold",
              marginBottom: "5px",
            }}
          >
            ⏳ Sincronizzazione fatture in corso...
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>
            Download PDF → Parsing → Salvataggio database
          </div>
        </div>
      )}

      {/* Sync Result Summary - Orders */}
      {ordersSyncResult && !syncingOrders && (
        <div
          style={{
            padding: "15px",
            backgroundColor: "#e8f5e9",
            borderRadius: "8px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: "bold",
              color: "#2e7d32",
              marginBottom: "10px",
            }}
          >
            ✓ Sincronizzazione ordini completata
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>
            <div>
              Ordini processati: {ordersSyncResult.data?.ordersProcessed || 0}
            </div>
            <div>
              Nuovi ordini: {ordersSyncResult.data?.ordersInserted || 0}
            </div>
            <div>
              Ordini aggiornati: {ordersSyncResult.data?.ordersUpdated || 0}
            </div>
          </div>
        </div>
      )}

      {/* Sync Result Summary - DDT */}
      {ddtSyncResult && !syncingDDT && (
        <div
          style={{
            padding: "15px",
            backgroundColor: "#e8f5e9",
            borderRadius: "8px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: "bold",
              color: "#2e7d32",
              marginBottom: "10px",
            }}
          >
            ✓ Sincronizzazione DDT completata
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>
            <div>DDT processati: {ddtSyncResult.data?.ddtProcessed || 0}</div>
            <div>Nuovi DDT: {ddtSyncResult.data?.ddtInserted || 0}</div>
            <div>DDT aggiornati: {ddtSyncResult.data?.ddtUpdated || 0}</div>
          </div>
        </div>
      )}

      {/* Sync Result Summary - Invoices */}
      {invoicesSyncResult && !syncingInvoices && (
        <div
          style={{
            padding: "15px",
            backgroundColor: "#e8f5e9",
            borderRadius: "8px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: "bold",
              color: "#2e7d32",
              marginBottom: "10px",
            }}
          >
            ✓ Sincronizzazione fatture completata
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>
            <div>
              Fatture processate:{" "}
              {invoicesSyncResult.data?.invoicesProcessed || 0}
            </div>
            <div>
              Nuove fatture: {invoicesSyncResult.data?.invoicesInserted || 0}
            </div>
            <div>
              Fatture aggiornate:{" "}
              {invoicesSyncResult.data?.invoicesUpdated || 0}
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
