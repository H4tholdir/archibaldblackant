import { useEffect, useState } from "react";
import { PriceHistoryModal } from "../components/PriceHistoryModal";

interface PriceChange {
  id: number;
  productId: string;
  productName: string;
  variantId: string | null;
  oldPrice: number | null;
  newPrice: number;
  percentageChange: number;
  changeType: "increase" | "decrease" | "new";
  syncDate: number;
}

interface PriceStats {
  totalChanges: number;
  increases: number;
  decreases: number;
  newPrices: number;
}

export function PriceVariationsPage() {
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [filteredChanges, setFilteredChanges] = useState<PriceChange[]>([]);
  const [stats, setStats] = useState<PriceStats>({
    totalChanges: 0,
    increases: 0,
    decreases: 0,
    newPrices: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "increases" | "decreases">(
    "all",
  );
  const [sortBy, setSortBy] = useState<"percentage" | "date">("percentage");
  const [selectedProduct, setSelectedProduct] = useState<PriceChange | null>(
    null,
  );

  useEffect(() => {
    fetchRecentChanges();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [changes, filter, sortBy]);

  const fetchRecentChanges = async () => {
    try {
      const token = localStorage.getItem("archibald_jwt");
      const response = await fetch("/api/prices/history/recent/30", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setChanges(data.changes || []);
        setStats(
          data.stats || {
            totalChanges: 0,
            increases: 0,
            decreases: 0,
            newPrices: 0,
          },
        );
      }
    } catch (error) {
      console.error("Failed to fetch price changes:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...changes];

    // Apply change type filter
    if (filter === "increases") {
      filtered = filtered.filter((c) => c.changeType === "increase");
    } else if (filter === "decreases") {
      filtered = filtered.filter((c) => c.changeType === "decrease");
    }

    // Apply sorting
    if (sortBy === "percentage") {
      filtered.sort(
        (a, b) => Math.abs(b.percentageChange) - Math.abs(a.percentageChange),
      );
    } else {
      filtered.sort((a, b) => b.syncDate - a.syncDate);
    }

    setFilteredChanges(filtered);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("it-IT");
  };

  const formatPrice = (price: number | null) => {
    return price !== null ? `€${price.toFixed(2)}` : "N/A";
  };

  const getChangeColor = (changeType: string) => {
    if (changeType === "increase") return "#c62828"; // Red
    if (changeType === "decrease") return "#2e7d32"; // Green
    return "#666"; // Gray for new
  };

  const getChangeIcon = (changeType: string) => {
    if (changeType === "increase") return "🔴";
    if (changeType === "decrease") return "🟢";
    return "🆕";
  };

  if (loading) {
    return (
      <div style={{ padding: "20px" }}>⏳ Caricamento variazioni prezzi...</div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>📊 Variazioni Prezzi (Ultimi 30 giorni)</h1>

      {/* Statistics Summary */}
      <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
        <div
          style={{
            padding: "15px",
            backgroundColor: "#ffebee",
            borderRadius: "8px",
          }}
        >
          <div
            style={{ fontSize: "24px", fontWeight: "bold", color: "#c62828" }}
          >
            {stats.increases}
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>Aumenti</div>
        </div>
        <div
          style={{
            padding: "15px",
            backgroundColor: "#e8f5e9",
            borderRadius: "8px",
          }}
        >
          <div
            style={{ fontSize: "24px", fontWeight: "bold", color: "#2e7d32" }}
          >
            {stats.decreases}
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>Diminuzioni</div>
        </div>
        <div
          style={{
            padding: "15px",
            backgroundColor: "#f5f5f5",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "24px", fontWeight: "bold", color: "#666" }}>
            {stats.newPrices}
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>Nuovi Prezzi</div>
        </div>
      </div>

      {/* Filters and Sorting */}
      <div
        style={{
          marginTop: "30px",
          display: "flex",
          gap: "15px",
          alignItems: "center",
        }}
      >
        <label>
          Filtro:
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            style={{ marginLeft: "10px", padding: "8px" }}
          >
            <option value="all">Tutti</option>
            <option value="increases">Solo Aumenti 🔴</option>
            <option value="decreases">Solo Diminuzioni 🟢</option>
          </select>
        </label>

        <label>
          Ordina per:
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ marginLeft: "10px", padding: "8px" }}
          >
            <option value="percentage">% Variazione</option>
            <option value="date">Data</option>
          </select>
        </label>
      </div>

      {/* Price Changes Table */}
      <div style={{ marginTop: "20px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={{ padding: "12px", textAlign: "left" }}>Articolo</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Variante</th>
              <th style={{ padding: "12px", textAlign: "right" }}>
                Prezzo Vecchio
              </th>
              <th style={{ padding: "12px", textAlign: "right" }}>
                Prezzo Nuovo
              </th>
              <th style={{ padding: "12px", textAlign: "right" }}>
                Variazione %
              </th>
              <th style={{ padding: "12px", textAlign: "left" }}>Data</th>
              <th style={{ padding: "12px", textAlign: "center" }}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filteredChanges.map((change) => (
              <tr key={change.id} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "12px" }}>{change.productName}</td>
                <td style={{ padding: "12px" }}>{change.variantId || "-"}</td>
                <td style={{ padding: "12px", textAlign: "right" }}>
                  {formatPrice(change.oldPrice)}
                </td>
                <td style={{ padding: "12px", textAlign: "right" }}>
                  {formatPrice(change.newPrice)}
                </td>
                <td
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    color: getChangeColor(change.changeType),
                    fontWeight: "bold",
                  }}
                >
                  {getChangeIcon(change.changeType)}{" "}
                  {change.percentageChange.toFixed(2)}%
                </td>
                <td style={{ padding: "12px" }}>
                  {formatDate(change.syncDate)}
                </td>
                <td style={{ padding: "12px", textAlign: "center" }}>
                  <button
                    onClick={() => setSelectedProduct(change)}
                    style={{ padding: "5px 10px", cursor: "pointer" }}
                  >
                    Storico
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredChanges.length === 0 && (
          <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
            Nessuna variazione trovata
          </div>
        )}
      </div>

      {/* Price History Modal */}
      {selectedProduct && (
        <PriceHistoryModal
          productId={selectedProduct.productId}
          productName={selectedProduct.productName}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
