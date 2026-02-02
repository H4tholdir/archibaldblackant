import { useState, useEffect } from "react";
import { db, type WarehouseItem } from "../db/schema";
import { releaseWarehouseReservations } from "../services/warehouse-order-integration";
import { toastService } from "../services/toast.service";

type StatusFilter = "all" | "available" | "reserved" | "sold";

export function WarehouseInventoryView() {
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [boxFilter, setBoxFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Available boxes for filter dropdown
  const [availableBoxes, setAvailableBoxes] = useState<string[]>([]);

  // Load all items on mount
  useEffect(() => {
    loadInventory();
  }, []);

  // Apply filters whenever they change
  useEffect(() => {
    applyFilters();
  }, [items, statusFilter, boxFilter, searchTerm]);

  const loadInventory = async () => {
    setLoading(true);
    try {
      const allItems = await db.warehouseItems.toArray();

      // Sort by box name, then by article code
      allItems.sort((a, b) => {
        const boxCompare = a.boxName.localeCompare(b.boxName);
        if (boxCompare !== 0) return boxCompare;
        return a.articleCode.localeCompare(b.articleCode);
      });

      setItems(allItems);

      // Extract unique box names
      const boxes = Array.from(new Set(allItems.map((item) => item.boxName)));
      boxes.sort();
      setAvailableBoxes(boxes);
    } catch (error) {
      console.error("[WarehouseInventory] Failed to load items:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...items];

    // Status filter
    if (statusFilter === "available") {
      filtered = filtered.filter(
        (item) => !item.reservedForOrder && !item.soldInOrder,
      );
    } else if (statusFilter === "reserved") {
      filtered = filtered.filter((item) => item.reservedForOrder);
    } else if (statusFilter === "sold") {
      filtered = filtered.filter((item) => item.soldInOrder);
    }

    // Box filter
    if (boxFilter !== "all") {
      filtered = filtered.filter((item) => item.boxName === boxFilter);
    }

    // Search filter (article code or description)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.articleCode.toLowerCase().includes(term) ||
          item.description.toLowerCase().includes(term),
      );
    }

    setFilteredItems(filtered);
  };

  const handleReleaseReservation = async (reservedForOrder: string) => {
    try {
      // Extract pending order ID (e.g., "pending-uuid-123" -> "uuid-123")
      const orderId = reservedForOrder.replace("pending-", "");

      if (!orderId) {
        toastService.error(
          "Formato ordine non valido. Impossibile rilasciare.",
        );
        return;
      }

      await releaseWarehouseReservations(orderId);
      toastService.success(`✅ Articoli rilasciati da ${reservedForOrder}`);

      // Reload inventory
      await loadInventory();
    } catch (error) {
      console.error("[WarehouseInventory] Release failed:", error);
      toastService.error("Errore durante il rilascio degli articoli");
    }
  };

  const getStatusBadge = (item: WarehouseItem) => {
    if (item.soldInOrder) {
      return (
        <span
          style={{
            padding: "0.25rem 0.5rem",
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: "4px",
            fontSize: "0.75rem",
            fontWeight: "600",
          }}
        >
          ❌ Venduto
        </span>
      );
    }

    if (item.reservedForOrder) {
      return (
        <span
          style={{
            padding: "0.25rem 0.5rem",
            background: "#fef3c7",
            color: "#92400e",
            borderRadius: "4px",
            fontSize: "0.75rem",
            fontWeight: "600",
          }}
        >
          🔒 Riservato
        </span>
      );
    }

    return (
      <span
        style={{
          padding: "0.25rem 0.5rem",
          background: "#d1fae5",
          color: "#065f46",
          borderRadius: "4px",
          fontSize: "0.75rem",
          fontWeight: "600",
        }}
      >
        ✅ Disponibile
      </span>
    );
  };

  const getOrderReference = (item: WarehouseItem) => {
    if (item.soldInOrder) {
      return (
        <div style={{ fontSize: "0.875rem", fontFamily: "monospace" }}>
          <strong style={{ color: "#dc2626" }}>Ordine:</strong>{" "}
          {item.soldInOrder}
        </div>
      );
    }

    if (item.reservedForOrder) {
      return (
        <div style={{ fontSize: "0.875rem", fontFamily: "monospace" }}>
          <strong style={{ color: "#d97706" }}>Riservato per:</strong>{" "}
          {item.reservedForOrder}
        </div>
      );
    }

    return <span style={{ color: "#9ca3af", fontSize: "0.875rem" }}>—</span>;
  };

  // Calculate stats
  const stats = {
    total: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    available: items.filter(
      (item) => !item.reservedForOrder && !item.soldInOrder,
    ).length,
    availableQty: items
      .filter((item) => !item.reservedForOrder && !item.soldInOrder)
      .reduce((sum, item) => sum + item.quantity, 0),
    reserved: items.filter((item) => item.reservedForOrder).length,
    reservedQty: items
      .filter((item) => item.reservedForOrder)
      .reduce((sum, item) => sum + item.quantity, 0),
    sold: items.filter((item) => item.soldInOrder).length,
    soldQty: items
      .filter((item) => item.soldInOrder)
      .reduce((sum, item) => sum + item.quantity, 0),
  };

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
        Caricamento inventario...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          background: "#f9fafb",
          borderRadius: "8px",
          border: "2px dashed #d1d5db",
        }}
      >
        <p style={{ color: "#6b7280", margin: 0 }}>
          📦 Nessun articolo nel magazzino. Carica un file Excel per iniziare.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "2rem" }}>
      {/* Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div
          style={{
            background: "#f0f9ff",
            padding: "1rem",
            borderRadius: "8px",
            border: "2px solid #0284c7",
          }}
        >
          <div
            style={{
              fontSize: "0.875rem",
              color: "#0c4a6e",
              marginBottom: "0.5rem",
            }}
          >
            Totale Articoli
          </div>
          <div
            style={{ fontSize: "1.5rem", fontWeight: "700", color: "#0284c7" }}
          >
            {stats.total}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#0c4a6e" }}>
            {stats.totalQuantity} pezzi
          </div>
        </div>

        <div
          style={{
            background: "#d1fae5",
            padding: "1rem",
            borderRadius: "8px",
            border: "2px solid #10b981",
          }}
        >
          <div
            style={{
              fontSize: "0.875rem",
              color: "#065f46",
              marginBottom: "0.5rem",
            }}
          >
            Disponibili
          </div>
          <div
            style={{ fontSize: "1.5rem", fontWeight: "700", color: "#10b981" }}
          >
            {stats.available}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#065f46" }}>
            {stats.availableQty} pezzi
          </div>
        </div>

        <div
          style={{
            background: "#fef3c7",
            padding: "1rem",
            borderRadius: "8px",
            border: "2px solid #f59e0b",
          }}
        >
          <div
            style={{
              fontSize: "0.875rem",
              color: "#92400e",
              marginBottom: "0.5rem",
            }}
          >
            Riservati
          </div>
          <div
            style={{ fontSize: "1.5rem", fontWeight: "700", color: "#f59e0b" }}
          >
            {stats.reserved}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#92400e" }}>
            {stats.reservedQty} pezzi
          </div>
        </div>

        <div
          style={{
            background: "#fee2e2",
            padding: "1rem",
            borderRadius: "8px",
            border: "2px solid #dc2626",
          }}
        >
          <div
            style={{
              fontSize: "0.875rem",
              color: "#991b1b",
              marginBottom: "0.5rem",
            }}
          >
            Venduti
          </div>
          <div
            style={{ fontSize: "1.5rem", fontWeight: "700", color: "#dc2626" }}
          >
            {stats.sold}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#991b1b" }}>
            {stats.soldQty} pezzi
          </div>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          background: "#f9fafb",
          padding: "1.5rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
        }}
      >
        <h3
          style={{ fontSize: "1rem", marginBottom: "1rem", fontWeight: "600" }}
        >
          🔍 Filtri
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
          }}
        >
          {/* Status Filter */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "500",
                marginBottom: "0.5rem",
                color: "#374151",
              }}
            >
              Stato
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              style={{
                width: "100%",
                padding: "0.5rem",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "0.875rem",
              }}
            >
              <option value="all">Tutti</option>
              <option value="available">Disponibili</option>
              <option value="reserved">Riservati</option>
              <option value="sold">Venduti</option>
            </select>
          </div>

          {/* Box Filter */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "500",
                marginBottom: "0.5rem",
                color: "#374151",
              }}
            >
              Scatolo
            </label>
            <select
              value={boxFilter}
              onChange={(e) => setBoxFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "0.5rem",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "0.875rem",
              }}
            >
              <option value="all">Tutti</option>
              {availableBoxes.map((box) => (
                <option key={box} value={box}>
                  {box}
                </option>
              ))}
            </select>
          </div>

          {/* Search Filter */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "500",
                marginBottom: "0.5rem",
                color: "#374151",
              }}
            >
              Cerca Articolo
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Codice o descrizione..."
              style={{
                width: "100%",
                padding: "0.5rem",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "0.875rem",
              }}
            />
          </div>
        </div>

        {/* Results Count */}
        <div
          style={{
            marginTop: "1rem",
            fontSize: "0.875rem",
            color: "#6b7280",
          }}
        >
          Mostrando <strong>{filteredItems.length}</strong> di{" "}
          <strong>{items.length}</strong> articoli
        </div>
      </div>

      {/* Inventory Table */}
      <div
        style={{
          background: "white",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.875rem",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#f9fafb",
                  borderBottom: "2px solid #e5e7eb",
                }}
              >
                <th
                  style={{
                    padding: "0.75rem",
                    textAlign: "left",
                    fontWeight: "600",
                    color: "#374151",
                  }}
                >
                  Scatolo
                </th>
                <th
                  style={{
                    padding: "0.75rem",
                    textAlign: "left",
                    fontWeight: "600",
                    color: "#374151",
                  }}
                >
                  Codice Articolo
                </th>
                <th
                  style={{
                    padding: "0.75rem",
                    textAlign: "left",
                    fontWeight: "600",
                    color: "#374151",
                  }}
                >
                  Descrizione
                </th>
                <th
                  style={{
                    padding: "0.75rem",
                    textAlign: "center",
                    fontWeight: "600",
                    color: "#374151",
                  }}
                >
                  Quantità
                </th>
                <th
                  style={{
                    padding: "0.75rem",
                    textAlign: "center",
                    fontWeight: "600",
                    color: "#374151",
                  }}
                >
                  Stato
                </th>
                <th
                  style={{
                    padding: "0.75rem",
                    textAlign: "left",
                    fontWeight: "600",
                    color: "#374151",
                  }}
                >
                  Riferimento Ordine
                </th>
                <th
                  style={{
                    padding: "0.75rem",
                    textAlign: "center",
                    fontWeight: "600",
                    color: "#374151",
                  }}
                >
                  Azioni
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "2rem",
                      textAlign: "center",
                      color: "#9ca3af",
                    }}
                  >
                    Nessun articolo corrisponde ai filtri selezionati
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: "1px solid #f3f4f6",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f9fafb")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <td
                      style={{
                        padding: "0.75rem",
                        color: "#059669",
                        fontWeight: "600",
                      }}
                    >
                      {item.boxName}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem",
                        fontFamily: "monospace",
                        fontWeight: "600",
                      }}
                    >
                      {item.articleCode}
                    </td>
                    <td style={{ padding: "0.75rem", color: "#6b7280" }}>
                      {item.description}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem",
                        textAlign: "center",
                        fontWeight: "600",
                      }}
                    >
                      {item.quantity}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "center" }}>
                      {getStatusBadge(item)}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      {getOrderReference(item)}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "center" }}>
                      {item.reservedForOrder && (
                        <button
                          onClick={() =>
                            handleReleaseReservation(item.reservedForOrder!)
                          }
                          style={{
                            padding: "0.4rem 0.75rem",
                            background: "#ef4444",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#dc2626";
                            e.currentTarget.style.transform = "scale(1.05)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#ef4444";
                            e.currentTarget.style.transform = "scale(1)";
                          }}
                        >
                          🔓 Rilascia
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
