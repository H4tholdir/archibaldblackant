import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CustomerCreateModal } from '../components/CustomerCreateModal';
import { CustomerCard } from "../components/CustomerCard";
import { CustomerDetailPage } from "./CustomerDetailPage";
import { customerService } from "../services/customers.service";
import { useKeyboardScroll } from "../hooks/useKeyboardScroll";
import { toastService } from "../services/toast.service";
import { checkCustomerCompleteness } from "../utils/customer-completeness";
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
  const { scrollFieldIntoView, keyboardPaddingStyle } = useKeyboardScroll();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightProfile = searchParams.get('highlight');
  const searchParam = searchParams.get('search');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [retryingProfiles, setRetryingProfiles] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(
    null,
  );
  const [filters, setFilters] = useState<CustomerFilters>({
    search: searchParam ?? "",
    city: "",
    customerType: "",
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const navigate = useNavigate();
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [incompleteCount, setIncompleteCount] = useState<number | null>(null);
  const [customerPhotos, setCustomerPhotos] = useState<
    Record<string, string | null>
  >({});
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    const jwt = localStorage.getItem('archibald_jwt') ?? '';
    fetch('/api/customers/stats', {
      headers: { Authorization: `Bearer ${jwt}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { total: number; incomplete: number } | null) => {
        if (body) setIncompleteCount(body.incomplete);
      })
      .catch(() => {});
  }, []);

  // Fetch customers: default view loads first 30, filters load up to 100/500
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

      const hasActiveFilter = incompleteOnly || !!debouncedSearch || !!filters.city || !!filters.customerType;

      // Build query params
      const params = new URLSearchParams();
      if (incompleteOnly) {
        params.append('limit', '500');
      } else if (!hasActiveFilter) {
        // Default view: primi 30 clienti (sorted by last_sync desc, backend default)
        params.append('limit', '30');
      } else {
        if (debouncedSearch) params.append("search", debouncedSearch);
        if (filters.city) params.append("city", filters.city);
        if (filters.customerType) params.append("type", filters.customerType);
        params.append("limit", "100");
      }

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
  }, [debouncedSearch, filters.city, filters.customerType, incompleteOnly]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Scroll+flash al cliente evidenziato da notifica (?highlight=<customerProfile>)
  useEffect(() => {
    if (!highlightProfile || customers.length === 0) return;
    const target = customers.find((c) => c.customerProfile === highlightProfile);
    if (!target) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('highlight');
      return next;
    }, { replace: true });
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-customer-profile="${highlightProfile}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'box-shadow 0.3s';
        el.style.boxShadow = '0 0 0 3px #f59e0b';
        setTimeout(() => { el.style.boxShadow = ''; }, 2000);
      }
    }, 300);
  }, [highlightProfile, customers, setSearchParams]);

  // Lazy load photos for visible customers
  useEffect(() => {
    if (customers.length === 0) return;

    let cancelled = false;
    const loadPhotos = async () => {
      for (const c of customers) {
        if (cancelled) break;
        if (customerPhotos[c.customerProfile] !== undefined) continue;
        try {
          const url = await customerService.getPhotoUrl(c.customerProfile);
          if (!cancelled) {
            setCustomerPhotos((prev) => ({
              ...prev,
              [c.customerProfile]: url,
            }));
          }
        } catch {
          if (!cancelled) {
            setCustomerPhotos((prev) => ({
              ...prev,
              [c.customerProfile]: null,
            }));
          }
        }
      }
    };
    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, [customers]);

  const handlePhotoUpload = async (customerProfile: string, file: File) => {
    try {
      await customerService.uploadPhoto(customerProfile, file);
      const url = await customerService.getPhotoUrl(customerProfile);
      setCustomerPhotos((prev) => ({ ...prev, [customerProfile]: url }));
    } catch (err) {
      console.error("Photo upload failed:", err);
      setError("Errore durante il caricamento della foto");
    }
  };

  const handlePhotoDelete = async (customerProfile: string) => {
    try {
      await customerService.deletePhoto(customerProfile);
      setCustomerPhotos((prev) => ({ ...prev, [customerProfile]: null }));
    } catch (err) {
      console.error("Photo delete failed:", err);
      setError("Errore durante l'eliminazione della foto");
    }
  };

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

  const handleRetry = async (customerProfile: string) => {
    setRetryingProfiles((prev) => new Set(prev).add(customerProfile));
    try {
      await customerService.retryBotPlacement(customerProfile);
      await fetchCustomers();
      toastService.success("Sincronizzazione avviata — il bot aggiornerà il cliente a breve");
    } catch (err) {
      console.error("Retry failed:", err);
      toastService.error("Errore durante il retry — riprova tra qualche minuto");
    } finally {
      setRetryingProfiles((prev) => {
        const next = new Set(prev);
        next.delete(customerProfile);
        return next;
      });
    }
  };

  const isDesktop = window.innerWidth > 1024;
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);

  const handleNavigate = (customerProfile: string) => {
    if (isDesktop) {
      setSelectedProfile((prev) => prev === customerProfile ? null : customerProfile);
    } else {
      navigate(`/customers/${encodeURIComponent(customerProfile)}`);
    }
  };

  const isTablet = window.innerWidth >= 641;

  const displayedCustomers = incompleteOnly
    ? customers.filter((c) => !checkCustomerCompleteness(c).ok)
    : customers;

  const hasActiveFilters =
    filters.search || filters.city || filters.customerType;

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      {/* Pannello lista — sinistra */}
      <div
        style={{
          width: isDesktop && selectedProfile ? '38%' : '100%',
          flexShrink: 0,
          overflowY: 'auto',
          background: '#f5f5f5',
          borderRight: isDesktop && selectedProfile ? '1.5px solid #e5e7eb' : 'none',
          transition: 'width 0.2s ease',
          ...keyboardPaddingStyle,
        }}
      >
      {/* Topbar dark — coerente con CustomerDetailPage */}
      <div style={{
        background: '#1e293b',
        color: '#f8fafc',
        padding: '9px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '13px',
        fontWeight: 600,
        marginBottom: '0',
      }}>
        <span style={{ fontSize: '14px' }}>👥</span>
        <span>Clienti</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: '#64748b' }}>Formicola Biagio</span>
      </div>

      <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "16px",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
      }}
    >

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
            <input autoComplete="off"
              id="customer-search"
              type="text"
              placeholder="Nome, P.IVA, telefono, città, email..."
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
                scrollFieldIntoView(e.target as HTMLElement);
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#ddd";
              }}
            />
          </div>
        </div>

        {/* Incomplete filter chip */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
          <button
            onClick={() => setIncompleteOnly((v) => !v)}
            style={{
              padding: '5px 12px', borderRadius: '14px', fontSize: '12px',
              fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
              background: incompleteOnly ? '#fff5f5' : 'white',
              borderColor: incompleteOnly ? '#fca5a5' : '#d1d5db',
              color: incompleteOnly ? '#dc2626' : '#64748b',
            }}
          >
            ⚠ Incompleti{incompleteCount !== null ? ` (${incompleteCount})` : ''}
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "12px", marginTop: '12px' }}>
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

          {/* New customer button */}
          <button
            onClick={() => setCreateModalOpen(true)}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              border: "1px solid #4caf50",
              borderRadius: "8px",
              backgroundColor: "#4caf50",
              color: "#fff",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#43a047";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#4caf50";
            }}
          >
            + Nuovo Cliente
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
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>
            👤
          </div>
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
            Prova a modificare i filtri di ricerca
          </p>
        </div>
      )}

      {/* Customer list */}
      {!loading && !error && customers.length > 0 && (
        <div>
          <div
            style={{
              marginBottom: "12px",
              fontSize: "12px",
              color: "#64748b",
              paddingLeft: "4px",
            }}
          >
            {!incompleteOnly && !filters.search && !filters.city && !filters.customerType
              ? `${displayedCustomers.length} clienti recenti`
              : `${displayedCustomers.length} clienti trovati`}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isTablet ? 'repeat(2, 1fr)' : '1fr',
              gap: '16px',
            }}
          >
            {displayedCustomers.map((customer) => {
              const isExpanded =
                expandedCustomerId === customer.customerProfile;

              return (
                <div
                  key={customer.customerProfile}
                  data-customer-profile={customer.customerProfile}
                  style={{
                    outline: isDesktop && selectedProfile === customer.customerProfile
                      ? '2px solid #2563eb'
                      : 'none',
                    borderRadius: '12px',
                    transition: 'outline 0.1s',
                  }}
                >
                  <CustomerCard
                    customer={customer}
                    expanded={isExpanded}
                    onToggle={() => handleToggle(customer.customerProfile)}
                    onEdit={() => {}}
                    onNavigate={handleNavigate}
                    onRetry={handleRetry}
                    isRetrying={retryingProfiles.has(customer.customerProfile)}
                    photoUrl={customerPhotos[customer.customerProfile]}
                    onPhotoUpload={handlePhotoUpload}
                    onPhotoDelete={handlePhotoDelete}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
      </div>
      {/* Pannello dettaglio — destra (solo desktop + cliente selezionato) */}
      {isDesktop && selectedProfile && (
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative', background: 'white' }}>
          <button
            onClick={() => setSelectedProfile(null)}
            style={{
              position: 'absolute', top: '10px', right: '12px', zIndex: 10,
              background: 'rgba(15,23,42,0.6)', color: 'white', border: 'none',
              borderRadius: '50%', width: '24px', height: '24px', fontSize: '14px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: '1',
            }}
          >
            ✕
          </button>
          <CustomerDetailPage
            customerProfileOverride={selectedProfile}
            embedded
          />
        </div>
      )}
      <CustomerCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSaved={() => {
          setCreateModalOpen(false);
          void fetchCustomers();
        }}
      />
    </div>
  );
}
