import { useState, useEffect, useRef } from "react";

interface SearchResult {
  id: string;
  orderNumber: string;
  customerName: string;
  createdAt: string;
  status: string;
}

interface OrderPickerModalProps {
  onSelect: (order: SearchResult) => void;
  onClose: () => void;
}

export function OrderPickerModal({ onSelect, onClose }: OrderPickerModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("archibald_jwt");
        if (!token) return;

        const response = await fetch(
          `/api/fresis-history/search-orders?q=${encodeURIComponent(query.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

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
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

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
          maxWidth: "500px",
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, fontSize: "1.25rem" }}>
          Collega ordine Archibald
        </h2>

        <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          Cerca per numero ordine o nome cliente.
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
            marginBottom: "0.75rem",
            boxSizing: "border-box",
          }}
        />

        {loading && (
          <div
            style={{ textAlign: "center", padding: "1rem", color: "#6b7280" }}
          >
            Ricerca...
          </div>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <div
            style={{ textAlign: "center", padding: "1rem", color: "#6b7280" }}
          >
            Nessun ordine trovato
          </div>
        )}

        {results.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              maxHeight: "300px",
              overflow: "auto",
            }}
          >
            {results.map((order) => (
              <div
                key={order.id}
                onClick={() => onSelect(order)}
                style={{
                  padding: "0.6rem 0.75rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#f3f4f6")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "white")
                }
              >
                <div style={{ fontWeight: "600" }}>N. {order.orderNumber}</div>
                <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  {order.customerName} | {formatDate(order.createdAt)} |{" "}
                  {order.status}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: "0.75rem" }}>
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
        </div>
      </div>
    </div>
  );
}
