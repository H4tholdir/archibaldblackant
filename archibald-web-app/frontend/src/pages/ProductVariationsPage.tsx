import { useEffect, useState } from "react";
import { ProductHistoryModal } from "../components/ProductHistoryModal";

interface ProductVariation {
  productId: string;
  productName: string | null;
  changeType: "created" | "updated" | "deleted";
  fieldsChanged: number;
  changedAt: number;
  syncSessionId: string;
}

interface Stats {
  totalChanges: number;
  created: number;
  updated: number;
  deleted: number;
}

export function ProductVariationsPage() {
  const [changes, setChanges] = useState<ProductVariation[]>([]);
  const [filteredChanges, setFilteredChanges] = useState<ProductVariation[]>(
    [],
  );
  const [stats, setStats] = useState<Stats>({
    totalChanges: 0,
    created: 0,
    updated: 0,
    deleted: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "created" | "updated" | "deleted"
  >("all");
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [selectedProduct, setSelectedProduct] =
    useState<ProductVariation | null>(null);

  useEffect(() => {
    fetchRecentChanges();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [changes, filter, sortBy]);

  const fetchRecentChanges = async () => {
    try {
      const token = localStorage.getItem("archibald_jwt");
      const response = await fetch("/api/products/variations/recent/30", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setChanges(data.changes || []);
        setStats(
          data.stats || { totalChanges: 0, created: 0, updated: 0, deleted: 0 },
        );
      }
    } catch (error) {
      console.error("Failed to fetch product changes:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...changes];

    if (filter !== "all") {
      filtered = filtered.filter((c) => c.changeType === filter);
    }

    if (sortBy === "date") {
      filtered.sort((a, b) => b.changedAt - a.changedAt);
    } else {
      filtered.sort((a, b) =>
        (a.productName || "").localeCompare(b.productName || ""),
      );
    }

    setFilteredChanges(filtered);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("it-IT");
  };

  const getChangeColor = (changeType: string) => {
    if (changeType === "created") return "#1565c0";
    if (changeType === "updated") return "#e65100";
    if (changeType === "deleted") return "#c62828";
    return "#666";
  };

  const getChangeBadge = (changeType: string) => {
    if (changeType === "created") return { label: "Nuovo", bg: "#e3f2fd" };
    if (changeType === "updated") return { label: "Modificato", bg: "#fff3e0" };
    if (changeType === "deleted") return { label: "Eliminato", bg: "#ffebee" };
    return { label: changeType, bg: "#f5f5f5" };
  };

  if (loading) {
    return (
      <div style={{ padding: "20px" }}>Caricamento variazioni prodotti...</div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Variazioni Prodotti (Ultimi 30 giorni)</h1>

      {/* Statistics Summary */}
      <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
        <div
          style={{
            padding: "15px",
            backgroundColor: "#f5f5f5",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "24px", fontWeight: "bold", color: "#666" }}>
            {stats.totalChanges}
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>Totale</div>
        </div>
        <div
          style={{
            padding: "15px",
            backgroundColor: "#e3f2fd",
            borderRadius: "8px",
          }}
        >
          <div
            style={{ fontSize: "24px", fontWeight: "bold", color: "#1565c0" }}
          >
            {stats.created}
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>Nuovi</div>
        </div>
        <div
          style={{
            padding: "15px",
            backgroundColor: "#fff3e0",
            borderRadius: "8px",
          }}
        >
          <div
            style={{ fontSize: "24px", fontWeight: "bold", color: "#e65100" }}
          >
            {stats.updated}
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>Modificati</div>
        </div>
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
            {stats.deleted}
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>Eliminati</div>
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
            <option value="created">Nuovi</option>
            <option value="updated">Modificati</option>
            <option value="deleted">Eliminati</option>
          </select>
        </label>

        <label>
          Ordina per:
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ marginLeft: "10px", padding: "8px" }}
          >
            <option value="date">Data</option>
            <option value="name">Nome Prodotto</option>
          </select>
        </label>
      </div>

      {/* Product Changes Table */}
      <div style={{ marginTop: "20px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={{ padding: "12px", textAlign: "left" }}>Articolo</th>
              <th style={{ padding: "12px", textAlign: "left" }}>
                Tipo Modifica
              </th>
              <th style={{ padding: "12px", textAlign: "center" }}>
                Campi Modificati
              </th>
              <th style={{ padding: "12px", textAlign: "left" }}>Data</th>
              <th style={{ padding: "12px", textAlign: "center" }}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filteredChanges.map((change, index) => {
              const badge = getChangeBadge(change.changeType);
              return (
                <tr
                  key={`${change.productId}-${change.changedAt}-${index}`}
                  style={{ borderBottom: "1px solid #ddd" }}
                >
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontWeight: "bold" }}>
                      {change.productName || change.productId}
                    </div>
                    <div style={{ fontSize: "12px", color: "#999" }}>
                      {change.productId}
                    </div>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: "bold",
                        backgroundColor: badge.bg,
                        color: getChangeColor(change.changeType),
                      }}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {change.changeType === "updated"
                      ? change.fieldsChanged
                      : "-"}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {formatDate(change.changedAt)}
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
              );
            })}
          </tbody>
        </table>

        {filteredChanges.length === 0 && (
          <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
            Nessuna variazione trovata
          </div>
        )}
      </div>

      {/* Product History Modal */}
      {selectedProduct && (
        <ProductHistoryModal
          productId={selectedProduct.productId}
          productName={selectedProduct.productName || selectedProduct.productId}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
