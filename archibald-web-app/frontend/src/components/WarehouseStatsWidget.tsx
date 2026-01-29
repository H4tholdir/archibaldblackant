import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getWarehouseStatistics } from "../services/warehouse-order-integration";

/**
 * Warehouse Statistics Widget (Phase 5)
 * Shows current warehouse inventory status on Dashboard
 */
export function WarehouseStatsWidget() {
  const [stats, setStats] = useState<{
    total: { items: number; quantity: number };
    available: { items: number; quantity: number };
    reserved: { items: number; quantity: number };
    sold: { items: number; quantity: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await getWarehouseStatistics();
        setStats(data);
      } catch (error) {
        console.error("[WarehouseStats] Failed to load:", error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();

    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div
        style={{
          background: "#f9fafb",
          borderRadius: "12px",
          padding: "1.5rem",
          border: "1px solid #e5e7eb",
        }}
      >
        <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem" }}>
          🏪 Magazzino
        </h3>
        <p style={{ color: "#6b7280", margin: 0 }}>Caricamento...</p>
      </div>
    );
  }

  if (!stats || stats.total.items === 0) {
    return (
      <div
        style={{
          background: "#fef3c7",
          borderRadius: "12px",
          padding: "1.5rem",
          border: "1px solid #f59e0b",
        }}
      >
        <h3
          style={{
            margin: "0 0 1rem 0",
            fontSize: "1.125rem",
            color: "#92400e",
          }}
        >
          🏪 Magazzino
        </h3>
        <p style={{ color: "#92400e", margin: "0 0 1rem 0" }}>
          Nessun articolo caricato nel magazzino
        </p>
        <Link
          to="/warehouse-returns"
          style={{
            display: "inline-block",
            padding: "0.5rem 1rem",
            background: "#f59e0b",
            color: "white",
            textDecoration: "none",
            borderRadius: "6px",
            fontSize: "0.875rem",
            fontWeight: "600",
          }}
        >
          Gestisci Magazzino
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#f0fdf4",
        borderRadius: "12px",
        padding: "1.5rem",
        border: "1px solid #22c55e",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#166534" }}>
          🏪 Magazzino
        </h3>
        <Link
          to="/warehouse-returns"
          style={{
            fontSize: "0.875rem",
            color: "#16a34a",
            textDecoration: "none",
            fontWeight: "600",
          }}
        >
          Gestisci →
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
        }}
      >
        {/* Available */}
        <div
          style={{
            background: "white",
            padding: "1rem",
            borderRadius: "8px",
            border: "1px solid #d1fae5",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            Disponibili
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: "700",
              color: "#22c55e",
              marginTop: "0.25rem",
            }}
          >
            {stats.available.quantity}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
            {stats.available.items} articoli
          </div>
        </div>

        {/* Reserved */}
        <div
          style={{
            background: "white",
            padding: "1rem",
            borderRadius: "8px",
            border: "1px solid #fef3c7",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            Riservati
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: "700",
              color: "#f59e0b",
              marginTop: "0.25rem",
            }}
          >
            {stats.reserved.quantity}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
            {stats.reserved.items} articoli
          </div>
        </div>

        {/* Sold */}
        <div
          style={{
            background: "white",
            padding: "1rem",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Venduti</div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: "700",
              color: "#6b7280",
              marginTop: "0.25rem",
            }}
          >
            {stats.sold.quantity}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
            {stats.sold.items} articoli
          </div>
        </div>

        {/* Total */}
        <div
          style={{
            background: "white",
            padding: "1rem",
            borderRadius: "8px",
            border: "1px solid #22c55e",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Totale</div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: "700",
              color: "#166534",
              marginTop: "0.25rem",
            }}
          >
            {stats.total.quantity}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
            {stats.total.items} articoli
          </div>
        </div>
      </div>
    </div>
  );
}
