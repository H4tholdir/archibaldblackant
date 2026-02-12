import { useState, useEffect, useRef } from "react";
import { formatPriceFromString } from "../utils/format-currency";

export interface SearchResult {
  id: string;
  orderNumber: string;
  customerName: string;
  createdAt: string;
  status: string;
  totalAmount: string | null;
  grossAmount: string | null;
  discountPercent: string | null;
  currentState: string | null;
  deliveryName: string | null;
  ddtNumber: string | null;
  invoiceNumber: string | null;
  itemsCount: number;
}

interface OrderPickerModalProps {
  onSelect: (orders: SearchResult[]) => void;
  onClose: () => void;
  initialSelection?: string[];
}

const STATE_COLORS: Record<string, { bg: string; color: string }> = {
  piazzato: { bg: "#e5e7eb", color: "#374151" },
  inviato_milano: { bg: "#dbeafe", color: "#1e40af" },
  trasferito: { bg: "#d1fae5", color: "#065f46" },
  transfer_error: { bg: "#fee2e2", color: "#991b1b" },
  modifica: { bg: "#fef3c7", color: "#92400e" },
  ordine_aperto: { bg: "#ffedd5", color: "#9a3412" },
  spedito: { bg: "#e0f2fe", color: "#0369a1" },
  consegnato: { bg: "#bbf7d0", color: "#166534" },
  fatturato: { bg: "#86efac", color: "#14532d" },
};

function getStatusStyle(status: string | null): {
  bg: string;
  color: string;
} {
  if (!status) return { bg: "#f3f4f6", color: "#6b7280" };
  return STATE_COLORS[status] ?? { bg: "#f3f4f6", color: "#6b7280" };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatCurrency(value: string | null): string {
  if (!value) return "";
  return formatPriceFromString(value);
}

export function OrderPickerModal({
  onSelect,
  onClose,
  initialSelection,
}: OrderPickerModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelection ?? []),
  );
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchOrders = async (searchQuery: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) return;

      const url = searchQuery.trim()
        ? `/api/fresis-history/search-orders?q=${encodeURIComponent(searchQuery.trim())}`
        : `/api/fresis-history/search-orders`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const json = await response.json();
        if (json.success) {
          setResults(json.orders);
        }
      }
    } catch (err) {
      console.error("[OrderPickerModal] Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders("");
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchOrders(query);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(results.map((r) => r.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleConfirm = () => {
    const selected = results.filter((r) => selectedIds.has(r.id));
    if (selected.length > 0) {
      onSelect(selected);
    }
  };

  const allSelected =
    results.length > 0 && results.every((r) => selectedIds.has(r.id));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "1.5rem",
          maxWidth: "600px",
          width: "95%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{ marginTop: 0, fontSize: "1.25rem", marginBottom: "0.5rem" }}
        >
          Collega ordine Archibald
        </h2>

        <p
          style={{
            fontSize: "0.85rem",
            color: "#6b7280",
            margin: "0 0 0.75rem",
          }}
        >
          Cerca per numero ordine, cliente o destinatario. Seleziona uno o piu'
          ordini.
        </p>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca ordine..."
          autoFocus
          style={{
            width: "100%",
            padding: "0.75rem",
            fontSize: "1rem",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            outline: "none",
            marginBottom: "0.5rem",
            boxSizing: "border-box",
          }}
        />

        {results.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
              fontSize: "0.8rem",
            }}
          >
            <span style={{ color: "#6b7280" }}>
              {results.length} ordini trovati
            </span>
            <button
              onClick={allSelected ? deselectAll : selectAll}
              style={{
                padding: "0.2rem 0.5rem",
                background: "#f3f4f6",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.75rem",
              }}
            >
              {allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
            </button>
          </div>
        )}

        <div
          style={{
            flex: 1,
            overflow: "auto",
            marginBottom: "0.75rem",
            minHeight: 0,
          }}
        >
          {loading && (
            <div
              style={{ textAlign: "center", padding: "1rem", color: "#6b7280" }}
            >
              Caricamento...
            </div>
          )}

          {!loading && results.length === 0 && (
            <div
              style={{ textAlign: "center", padding: "1rem", color: "#6b7280" }}
            >
              Nessun ordine trovato
            </div>
          )}

          {!loading && results.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {results.map((order) => {
                const isSelected = selectedIds.has(order.id);
                const statusStyle = getStatusStyle(
                  order.currentState || order.status,
                );

                return (
                  <div
                    key={order.id}
                    onClick={() => toggleSelection(order.id)}
                    style={{
                      padding: "0.6rem 0.75rem",
                      border: isSelected
                        ? "2px solid #7c3aed"
                        : "1px solid #d1d5db",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      background: isSelected ? "#f5f3ff" : "white",
                      transition: "all 0.15s",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(order.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ accentColor: "#7c3aed" }}
                      />
                      <span style={{ fontWeight: "600" }}>
                        N. {order.orderNumber}
                      </span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          padding: "0.1rem 0.4rem",
                          borderRadius: "9999px",
                          background: statusStyle.bg,
                          color: statusStyle.color,
                          fontWeight: "500",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {order.currentState || order.status || "—"}
                      </span>
                      {order.totalAmount && (
                        <span
                          style={{
                            marginLeft: "auto",
                            fontWeight: "600",
                            fontSize: "0.85rem",
                          }}
                        >
                          {formatCurrency(order.totalAmount)}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.25rem 0.75rem",
                        fontSize: "0.78rem",
                        color: "#6b7280",
                        paddingLeft: "1.5rem",
                      }}
                    >
                      <span>{order.customerName}</span>
                      {order.deliveryName &&
                        order.deliveryName !== order.customerName && (
                          <span>Dest: {order.deliveryName}</span>
                        )}
                      <span>{formatDate(order.createdAt)}</span>
                      {order.itemsCount > 0 && (
                        <span>{order.itemsCount} articoli</span>
                      )}
                      {order.discountPercent &&
                        parseFloat(order.discountPercent) > 0 && (
                          <span>Sc. {order.discountPercent}%</span>
                        )}
                      {order.ddtNumber && <span>DDT: {order.ddtNumber}</span>}
                      {order.invoiceNumber && (
                        <span>Fatt: {order.invoiceNumber}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #e5e7eb",
            paddingTop: "0.75rem",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem",
              background: "#e5e7eb",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Annulla
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            style={{
              padding: "0.5rem 1.25rem",
              background: selectedIds.size === 0 ? "#9ca3af" : "#7c3aed",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
              fontWeight: "600",
            }}
          >
            Collega{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
