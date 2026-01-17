import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerCard } from "../components/CustomerCard";
import { CustomerSyncModal } from "../components/CustomerSyncModal";
import { useCustomerSync } from "../hooks/useCustomerSync";
import type { Customer } from "../types/customer";

interface CustomerFilters {
  search: string;
  city: string;
  customerType: string;
}

interface CustomerListResponse {
  success: boolean;
  data: {
    customers: Customer[];
    total: number;
  };
}

export function CustomerList() {
  const navigate = useNavigate();
  const {
    progress: syncProgress,
    startSync,
    reset: resetSync,
  } = useCustomerSync();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(
    null,
  );
  const [filters, setFilters] = useState<CustomerFilters>({
    search: "",
    city: "",
    customerType: "",
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [syncModalOpen, setSyncModalOpen] = useState(false);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters.search]);

  // Fetch customers on mount and when filters change
  const fetchCustomers = useCallback(async () => {
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
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (filters.city) params.append("city", filters.city);
      if (filters.customerType) params.append("type", filters.customerType);
      params.append("limit", "100");

      const response = await fetch(`/api/customers?${params.toString()}`, {
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

      const data: CustomerListResponse = await response.json();
      if (!data.success) {
        throw new Error("Errore nel caricamento dei clienti");
      }

      setCustomers(data.data.customers);
    } catch (err) {
      console.error("Error fetching customers:", err);
      setError(err instanceof Error ? err.message : "Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters.city, filters.customerType]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleToggle = (customerId: string) => {
    if (expandedCustomerId === customerId) {
      setExpandedCustomerId(null);
    } else {
      setExpandedCustomerId(customerId);
    }
  };

  const handleClearFilters = () => {
    setFilters({
      search: "",
      city: "",
      customerType: "",
    });
  };

  const handleForceSync = async () => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) {
      setError("Non autenticato. Effettua il login.");
      return;
    }

    // Open modal and start sync
    setSyncModalOpen(true);
    setError(null);

    const result = await startSync(token);

    if (result.success) {
      // Reload customers after successful sync
      await fetchCustomers();
    } else {
      setError(result.error || "Errore nella sincronizzazione");
    }
  };

  const handleEdit = (customerId: string) => {
    navigate(`/customers/${customerId}/edit`);
  };

  const hasActiveFilters =
    filters.search || filters.city || filters.customerType;

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
          👥 Clienti
        </h1>
        <p style={{ fontSize: "16px", color: "#666" }}>
          Gestisci l'anagrafica dei tuoi clienti
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
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          {/* Search */}
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
              Cerca cliente
            </label>
            <input
              id="customer-search"
              type="text"
              placeholder="Nome, P.IVA, Città..."
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
            disabled={syncProgress.isRunning || loading}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              border: "1px solid #1976d2",
              borderRadius: "8px",
              backgroundColor: syncProgress.isRunning ? "#e3f2fd" : "#fff",
              color: syncProgress.isRunning ? "#999" : "#1976d2",
              cursor:
                syncProgress.isRunning || loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              opacity: syncProgress.isRunning || loading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!syncProgress.isRunning && !loading) {
                e.currentTarget.style.backgroundColor = "#1976d2";
                e.currentTarget.style.color = "#fff";
              }
            }}
            onMouseLeave={(e) => {
              if (!syncProgress.isRunning && !loading) {
                e.currentTarget.style.backgroundColor = "#fff";
                e.currentTarget.style.color = "#1976d2";
              }
            }}
          >
            {syncProgress.isRunning
              ? "⏳ Sincronizzazione..."
              : "🔄 Sincronizza"}
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
            Caricamento clienti...
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
              onClick={fetchCustomers}
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
      {!loading && !error && customers.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>👤</div>
          <p
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#333",
              marginBottom: "8px",
            }}
          >
            Nessun cliente trovato
          </p>
          <p style={{ fontSize: "14px", color: "#666" }}>
            {hasActiveFilters
              ? "Prova a modificare i filtri di ricerca"
              : "Nessun cliente nel database"}
          </p>
        </div>
      )}

      {/* Customer list */}
      {!loading && !error && customers.length > 0 && (
        <div>
          <div
            style={{
              marginBottom: "12px",
              fontSize: "14px",
              color: "#666",
              paddingLeft: "4px",
            }}
          >
            {customers.length} client{customers.length !== 1 ? "i" : "e"} trovat
            {customers.length !== 1 ? "i" : "o"}
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {customers.map((customer) => {
              const isExpanded =
                expandedCustomerId === customer.customerProfile;

              return (
                <CustomerCard
                  key={customer.customerProfile}
                  customer={customer}
                  expanded={isExpanded}
                  onToggle={() => handleToggle(customer.customerProfile)}
                  onEdit={handleEdit}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Customer Sync Modal */}
      <CustomerSyncModal
        isOpen={syncModalOpen}
        progress={syncProgress}
        onClose={() => {
          setSyncModalOpen(false);
          resetSync();
        }}
      />
    </div>
  );
}
