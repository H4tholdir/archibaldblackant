import { useState, useEffect } from "react";
import type {
  WidgetOrder,
  WidgetOrdersResponse,
  OrderExclusionUpdate,
} from "../types/widget";

interface WidgetOrderConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  month: number;
  onUpdate: () => void;
}

export function WidgetOrderConfigModal({
  isOpen,
  onClose,
  year: initialYear,
  month: initialMonth,
  onUpdate,
}: WidgetOrderConfigModalProps) {
  const [data, setData] = useState<WidgetOrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterExcluded, setFilterExcluded] = useState<
    "all" | "included" | "excluded"
  >("all");
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);

  useEffect(() => {
    if (isOpen) {
      setSelectedYear(initialYear);
      setSelectedMonth(initialMonth);
      loadOrders();
    }
  }, [isOpen, initialYear, initialMonth]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("archibald_jwt");
      const response = await fetch(
        `/api/widget/orders/${selectedYear}/${selectedMonth}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.ok) {
        const data = await response.json();
        setData(data);
      } else {
        console.error("Failed to load orders:", await response.text());
      }
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderExclusion = async (
    order: WidgetOrder,
    scope: "monthly" | "yearly",
  ) => {
    setSaving(true);
    try {
      const token = localStorage.getItem("archibald_jwt");

      const update: OrderExclusionUpdate = {
        orderId: order.id,
        excludeFromYearly:
          scope === "yearly"
            ? !order.excludedFromYearly
            : order.excludedFromYearly,
        excludeFromMonthly:
          scope === "monthly"
            ? !order.excludedFromMonthly
            : order.excludedFromMonthly,
        reason: order.exclusionReason || undefined,
      };

      const response = await fetch("/api/widget/orders/exclusions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(update),
      });

      if (response.ok) {
        // Reload orders
        await loadOrders();
        // Notify parent to refresh widgets
        onUpdate();
      } else {
        console.error("Failed to update exclusion:", await response.text());
      }
    } catch (error) {
      console.error("Error updating exclusion:", error);
    } finally {
      setSaving(false);
    }
  };

  const parseAmount = (amount: string | null): number => {
    if (!amount) return 0;
    // Italian format: "1.791,01 €" -> 1791.01
    // Remove currency symbols and spaces
    let cleaned = amount.replace(/[€\s]/g, "");
    // Remove thousand separators (dots in Italian format)
    cleaned = cleaned.replace(/\./g, "");
    // Replace decimal comma with dot
    cleaned = cleaned.replace(",", ".");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  if (!isOpen) return null;

  const filteredOrders = data?.orders.filter((order) => {
    // Filter by search term
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase());

    // Filter by exclusion status
    const matchesFilter =
      filterExcluded === "all" ||
      (filterExcluded === "included" && !order.excludedFromMonthly) ||
      (filterExcluded === "excluded" && order.excludedFromMonthly);

    return matchesSearch && matchesFilter;
  });

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "30px",
          maxWidth: "1000px",
          width: "90%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "24px", color: "#2c3e50" }}>
            ⚙️ Configura Ordini Widget
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "28px",
              cursor: "pointer",
              color: "#7f8c8d",
            }}
          >
            ×
          </button>
        </div>

        {/* Period Selector */}
        <div
          style={{
            display: "flex",
            gap: "15px",
            marginBottom: "20px",
            padding: "15px",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <label
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: "#2c3e50",
              }}
            >
              📅 Periodo:
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(Number(e.target.value));
              }}
              style={{
                padding: "8px 12px",
                border: "2px solid #3498db",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                backgroundColor: "white",
              }}
            >
              {[
                "Gennaio",
                "Febbraio",
                "Marzo",
                "Aprile",
                "Maggio",
                "Giugno",
                "Luglio",
                "Agosto",
                "Settembre",
                "Ottobre",
                "Novembre",
                "Dicembre",
              ].map((monthName, index) => (
                <option key={index + 1} value={index + 1}>
                  {monthName}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(Number(e.target.value));
              }}
              style={{
                padding: "8px 12px",
                border: "2px solid #3498db",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                backgroundColor: "white",
              }}
            >
              {Array.from(
                { length: 5 },
                (_, i) => new Date().getFullYear() - i,
              ).map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={loadOrders}
            disabled={loading}
            style={{
              padding: "8px 16px",
              backgroundColor: "#3498db",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "⏳ Caricamento..." : "🔄 Carica Periodo"}
          </button>

          <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
            <button
              onClick={() => {
                const newMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
                const newYear =
                  selectedMonth === 1 ? selectedYear - 1 : selectedYear;
                setSelectedMonth(newMonth);
                setSelectedYear(newYear);
              }}
              style={{
                padding: "8px 12px",
                backgroundColor: "#95a5a6",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                cursor: "pointer",
              }}
              title="Mese Precedente"
            >
              ◀ Precedente
            </button>
            <button
              onClick={() => {
                const newMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
                const newYear =
                  selectedMonth === 12 ? selectedYear + 1 : selectedYear;
                setSelectedMonth(newMonth);
                setSelectedYear(newYear);
              }}
              style={{
                padding: "8px 12px",
                backgroundColor: "#95a5a6",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                cursor: "pointer",
              }}
              title="Mese Successivo"
            >
              Successivo ▶
            </button>
          </div>
        </div>

        <p style={{ color: "#7f8c8d", marginBottom: "15px", fontSize: "13px" }}>
          Seleziona quali ordini includere nei calcoli del widget per il periodo
          scelto
        </p>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <p style={{ color: "#7f8c8d" }}>Caricamento ordini...</p>
          </div>
        ) : data ? (
          <>
            {/* Summary */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "15px",
                marginBottom: "25px",
                padding: "20px",
                backgroundColor: "#f8f9fa",
                borderRadius: "8px",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", color: "#7f8c8d" }}>
                  Totale Ordini
                </div>
                <div style={{ fontSize: "20px", fontWeight: "bold" }}>
                  {data.summary.totalOrders}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "#27ae60" }}>
                  Inclusi
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: "bold",
                    color: "#27ae60",
                  }}
                >
                  {data.summary.includedCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "#e74c3c" }}>
                  Esclusi
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: "bold",
                    color: "#e74c3c",
                  }}
                >
                  {data.summary.excludedCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "#27ae60" }}>
                  Budget Incluso
                </div>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: "bold",
                    color: "#27ae60",
                  }}
                >
                  {formatCurrency(data.summary.totalIncluded)}
                </div>
              </div>
            </div>

            {/* Filters */}
            <div
              style={{
                display: "flex",
                gap: "15px",
                marginBottom: "20px",
                flexWrap: "wrap",
              }}
            >
              <input
                type="text"
                placeholder="🔍 Cerca ordine o cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: "200px",
                  padding: "10px 15px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "14px",
                }}
              />
              <select
                value={filterExcluded}
                onChange={(e) =>
                  setFilterExcluded(
                    e.target.value as "all" | "included" | "excluded",
                  )
                }
                style={{
                  padding: "10px 15px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                <option value="all">Tutti</option>
                <option value="included">Solo Inclusi</option>
                <option value="excluded">Solo Esclusi</option>
              </select>
            </div>

            {/* Orders Table */}
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "14px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderBottom: "2px solid #ddd",
                    }}
                  >
                    <th style={{ padding: "12px", textAlign: "left" }}>
                      Ordine
                    </th>
                    <th style={{ padding: "12px", textAlign: "left" }}>
                      Cliente
                    </th>
                    <th style={{ padding: "12px", textAlign: "right" }}>
                      Totale
                    </th>
                    <th style={{ padding: "12px", textAlign: "center" }}>
                      Data
                    </th>
                    <th style={{ padding: "12px", textAlign: "center" }}>
                      Mese
                    </th>
                    <th style={{ padding: "12px", textAlign: "center" }}>
                      Anno
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders?.map((order) => (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom: "1px solid #eee",
                        backgroundColor: order.excludedFromMonthly
                          ? "#fff5f5"
                          : "white",
                      }}
                    >
                      <td style={{ padding: "12px", fontWeight: "500" }}>
                        {order.orderNumber}
                      </td>
                      <td style={{ padding: "12px", color: "#555" }}>
                        {order.customerName}
                      </td>
                      <td
                        style={{
                          padding: "12px",
                          textAlign: "right",
                          fontWeight: "bold",
                        }}
                      >
                        {order.totalAmount
                          ? formatCurrency(parseAmount(order.totalAmount))
                          : "-"}
                      </td>
                      <td
                        style={{
                          padding: "12px",
                          textAlign: "center",
                          color: "#7f8c8d",
                          fontSize: "13px",
                        }}
                      >
                        {formatDate(order.creationDate)}
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <button
                          onClick={() => toggleOrderExclusion(order, "monthly")}
                          disabled={saving}
                          style={{
                            padding: "6px 12px",
                            border: "none",
                            borderRadius: "4px",
                            cursor: saving ? "not-allowed" : "pointer",
                            fontSize: "12px",
                            fontWeight: "500",
                            backgroundColor: order.excludedFromMonthly
                              ? "#fee"
                              : "#e8f5e9",
                            color: order.excludedFromMonthly
                              ? "#c62828"
                              : "#2e7d32",
                            opacity: saving ? 0.6 : 1,
                          }}
                        >
                          {order.excludedFromMonthly
                            ? "❌ Escluso"
                            : "✅ Incluso"}
                        </button>
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <button
                          onClick={() => toggleOrderExclusion(order, "yearly")}
                          disabled={saving}
                          style={{
                            padding: "6px 12px",
                            border: "none",
                            borderRadius: "4px",
                            cursor: saving ? "not-allowed" : "pointer",
                            fontSize: "12px",
                            fontWeight: "500",
                            backgroundColor: order.excludedFromYearly
                              ? "#fee"
                              : "#e8f5e9",
                            color: order.excludedFromYearly
                              ? "#c62828"
                              : "#2e7d32",
                            opacity: saving ? 0.6 : 1,
                          }}
                        >
                          {order.excludedFromYearly
                            ? "❌ Escluso"
                            : "✅ Incluso"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredOrders?.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <p style={{ color: "#7f8c8d" }}>
                  Nessun ordine trovato con i filtri selezionati
                </p>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <p style={{ color: "#e74c3c" }}>
              Errore nel caricamento degli ordini
            </p>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: "25px",
            paddingTop: "20px",
            borderTop: "1px solid #eee",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "12px 24px",
              backgroundColor: "#3498db",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: "pointer",
            }}
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
