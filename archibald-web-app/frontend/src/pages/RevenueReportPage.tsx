import { useState, useMemo } from "react";
import { useFresisHistorySync } from "../hooks/useFresisHistorySync";
import {
  ARCA_FONT,
  ARCA_COLORS,
  formatArcaCurrency,
  parseArcaDataFromOrder,
} from "../components/arca/arcaStyles";
import { exportToCsv } from "../utils/csv-export";

type SubClientAggregate = {
  codice: string;
  name: string;
  count: number;
  totDoc: number;
  revenue: number;
};

type ArticleAggregate = {
  code: string;
  description: string;
  totalQty: number;
  totalAmount: number;
  occurrences: number;
};


export function RevenueReportPage() {
  const { historyOrders } = useFresisHistorySync();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [subClientFilter, setSubClientFilter] = useState("");
  const [viewMode, setViewMode] = useState<"subclient" | "article">(
    "subclient",
  );

  const filtered = useMemo(() => {
    let result = historyOrders;
    if (dateFrom) {
      result = result.filter((o) => o.createdAt >= dateFrom);
    }
    if (dateTo) {
      const toEnd = dateTo + "T23:59:59";
      result = result.filter((o) => o.createdAt <= toEnd);
    }
    if (subClientFilter) {
      const lower = subClientFilter.toLowerCase();
      result = result.filter(
        (o) =>
          o.subClientName?.toLowerCase().includes(lower) ||
          o.subClientCodice?.toLowerCase().includes(lower),
      );
    }
    return result;
  }, [historyOrders, dateFrom, dateTo, subClientFilter]);

  const subClientAggregates = useMemo(() => {
    const map = new Map<string, SubClientAggregate>();
    for (const order of filtered) {
      const key = order.subClientCodice;
      const existing = map.get(key);
      const arcaData = parseArcaDataFromOrder(order.arcaData);
      const totDoc = arcaData?.testata.TOTDOC ?? order.targetTotalWithVAT ?? 0;
      const revenue = order.revenue ?? 0;

      if (existing) {
        existing.count++;
        existing.totDoc += totDoc;
        existing.revenue += revenue;
      } else {
        map.set(key, {
          codice: key,
          name: order.subClientName || key,
          count: 1,
          totDoc,
          revenue,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  const articleAggregates = useMemo(() => {
    const map = new Map<string, ArticleAggregate>();
    for (const order of filtered) {
      const arcaData = parseArcaDataFromOrder(order.arcaData);
      if (arcaData) {
        for (const riga of arcaData.righe) {
          const key = riga.CODICEARTI || riga.DESCRIZION;
          const existing = map.get(key);
          if (existing) {
            existing.totalQty += riga.QUANTITA;
            existing.totalAmount += riga.PREZZOTOT;
            existing.occurrences++;
          } else {
            map.set(key, {
              code: riga.CODICEARTI,
              description: riga.DESCRIZION,
              totalQty: riga.QUANTITA,
              totalAmount: riga.PREZZOTOT,
              occurrences: 1,
            });
          }
        }
      } else {
        for (const item of order.items) {
          const key = item.articleCode || item.productName || "";
          const existing = map.get(key);
          const qty = item.quantity ?? 0;
          const amount = (item.price ?? 0) * qty;
          if (existing) {
            existing.totalQty += qty;
            existing.totalAmount += amount;
            existing.occurrences++;
          } else {
            map.set(key, {
              code: item.articleCode || "",
              description: item.productName || item.description || "",
              totalQty: qty,
              totalAmount: amount,
              occurrences: 1,
            });
          }
        }
      }
    }
    return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filtered]);

  const totals = useMemo(() => {
    let totDoc = 0;
    let revenue = 0;
    for (const agg of subClientAggregates) {
      totDoc += agg.totDoc;
      revenue += agg.revenue;
    }
    return { totDoc, revenue, count: filtered.length };
  }, [subClientAggregates, filtered.length]);

  const handleExportSubClient = () => {
    const headers = [
      "Codice",
      "Nome",
      "N. Documenti",
      "Tot. Documento",
      "Ricavo",
    ];
    const rows = subClientAggregates.map((a) => [
      a.codice,
      a.name,
      a.count,
      a.totDoc.toFixed(2),
      a.revenue.toFixed(2),
    ]);
    rows.push([
      "",
      "TOTALE",
      totals.count,
      totals.totDoc.toFixed(2),
      totals.revenue.toFixed(2),
    ]);
    const dateSuffix = dateFrom || dateTo ? `_${dateFrom}_${dateTo}` : "";
    exportToCsv(`ricavi-subclient${dateSuffix}.csv`, headers, rows);
  };

  const handleExportArticle = () => {
    const headers = [
      "Codice",
      "Descrizione",
      "Q.ta Totale",
      "Importo Totale",
      "N. Occorrenze",
    ];
    const rows = articleAggregates.map((a) => [
      a.code,
      a.description,
      a.totalQty,
      a.totalAmount.toFixed(2),
      a.occurrences,
    ]);
    const dateSuffix = dateFrom || dateTo ? `_${dateFrom}_${dateTo}` : "";
    exportToCsv(`ricavi-articoli${dateSuffix}.csv`, headers, rows);
  };

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "16px",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
        ...ARCA_FONT,
      }}
    >
      <h1
        style={{
          fontSize: "20px",
          fontWeight: 700,
          color: "#333",
          margin: "0 0 12px 0",
        }}
      >
        Rapporto Ricavi
      </h1>

      {/* Filters */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "8px",
          padding: "12px",
          marginBottom: "12px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div>
          <label style={filterLabelStyle}>Da</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={filterInputStyle}
          />
        </div>
        <div>
          <label style={filterLabelStyle}>A</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={filterInputStyle}
          />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label style={filterLabelStyle}>Sotto-cliente</label>
          <input
            type="text"
            placeholder="Filtra per nome o codice..."
            value={subClientFilter}
            onChange={(e) => setSubClientFilter(e.target.value)}
            style={filterInputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={() => setViewMode("subclient")}
            style={tabBtnStyle(viewMode === "subclient")}
          >
            Per cliente
          </button>
          <button
            onClick={() => setViewMode("article")}
            style={tabBtnStyle(viewMode === "article")}
          >
            Per articolo
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          padding: "8px 12px",
          backgroundColor: "#fff",
          borderRadius: "8px",
          marginBottom: "12px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={{ ...ARCA_FONT, fontSize: "12px" }}>
          Documenti: <strong>{totals.count}</strong>
        </span>
        <span style={{ ...ARCA_FONT, fontSize: "12px" }}>
          Totale doc.:{" "}
          <strong>{formatArcaCurrency(totals.totDoc)}</strong>
        </span>
        <span
          style={{
            ...ARCA_FONT,
            fontSize: "13px",
            fontWeight: "bold",
            color: totals.revenue >= 0 ? "#006600" : "#CC0000",
          }}
        >
          Ricavo totale: {formatArcaCurrency(totals.revenue)}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={
            viewMode === "subclient"
              ? handleExportSubClient
              : handleExportArticle
          }
          style={exportBtnStyle}
        >
          Esporta CSV
        </button>
      </div>

      {/* Table */}
      {viewMode === "subclient" && (
        <SubClientTable aggregates={subClientAggregates} />
      )}
      {viewMode === "article" && (
        <ArticleTable aggregates={articleAggregates} />
      )}
    </div>
  );
}

function SubClientTable({
  aggregates,
}: {
  aggregates: SubClientAggregate[];
}) {
  return (
    <div
      style={{
        border: `1px solid ${ARCA_COLORS.borderDark}`,
        backgroundColor: "#fff",
        overflowX: "auto",
      }}
    >
      <table
        style={{ ...ARCA_FONT, width: "100%", borderCollapse: "collapse" }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: ARCA_COLORS.headerBg,
              color: ARCA_COLORS.headerText,
            }}
          >
            <th style={thStyle}>Codice</th>
            <th style={{ ...thStyle, textAlign: "left" }}>Nome</th>
            <th style={thStyle}>N. Doc.</th>
            <th style={thStyle}>Totale Doc.</th>
            <th style={thStyle}>Ricavo</th>
            <th style={thStyle}>Margine %</th>
          </tr>
        </thead>
        <tbody>
          {aggregates.map((agg, idx) => {
            const margin =
              agg.totDoc > 0
                ? ((agg.revenue / agg.totDoc) * 100).toFixed(1)
                : "-";
            return (
              <tr
                key={agg.codice}
                style={{
                  backgroundColor:
                    idx % 2 === 0
                      ? ARCA_COLORS.rowEven
                      : ARCA_COLORS.rowOdd,
                }}
              >
                <td style={tdStyle}>{agg.codice}</td>
                <td style={{ ...tdStyle, textAlign: "left" }}>{agg.name}</td>
                <td style={tdStyle}>{agg.count}</td>
                <td style={tdStyle}>{formatArcaCurrency(agg.totDoc)}</td>
                <td
                  style={{
                    ...tdStyle,
                    fontWeight: "bold",
                    color: agg.revenue >= 0 ? "#006600" : "#CC0000",
                  }}
                >
                  {formatArcaCurrency(agg.revenue)}
                </td>
                <td style={tdStyle}>{margin}%</td>
              </tr>
            );
          })}
          {aggregates.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#999" }}>
                Nessun dato
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ArticleTable({
  aggregates,
}: {
  aggregates: ArticleAggregate[];
}) {
  return (
    <div
      style={{
        border: `1px solid ${ARCA_COLORS.borderDark}`,
        backgroundColor: "#fff",
        overflowX: "auto",
      }}
    >
      <table
        style={{ ...ARCA_FONT, width: "100%", borderCollapse: "collapse" }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: ARCA_COLORS.headerBg,
              color: ARCA_COLORS.headerText,
            }}
          >
            <th style={thStyle}>Codice</th>
            <th style={{ ...thStyle, textAlign: "left" }}>Descrizione</th>
            <th style={thStyle}>Q.ta Totale</th>
            <th style={thStyle}>Importo Totale</th>
            <th style={thStyle}>N. Occorrenze</th>
          </tr>
        </thead>
        <tbody>
          {aggregates.map((agg, idx) => (
            <tr
              key={agg.code + agg.description}
              style={{
                backgroundColor:
                  idx % 2 === 0
                    ? ARCA_COLORS.rowEven
                    : ARCA_COLORS.rowOdd,
              }}
            >
              <td style={tdStyle}>{agg.code}</td>
              <td style={{ ...tdStyle, textAlign: "left" }}>
                {agg.description}
              </td>
              <td style={tdStyle}>{agg.totalQty}</td>
              <td style={tdStyle}>{formatArcaCurrency(agg.totalAmount)}</td>
              <td style={tdStyle}>{agg.occurrences}</td>
            </tr>
          ))}
          {aggregates.length === 0 && (
            <tr>
              <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "#999" }}>
                Nessun dato
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const filterLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: "#333",
  marginBottom: "3px",
};

const filterInputStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: "12px",
  border: "1px solid #ddd",
  borderRadius: "4px",
  outline: "none",
  boxSizing: "border-box",
};

const thStyle: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "right",
  fontWeight: "bold",
  whiteSpace: "nowrap",
  fontSize: "11px",
};

const tdStyle: React.CSSProperties = {
  padding: "5px 10px",
  textAlign: "right",
  borderBottom: "1px solid #e0e0e0",
  whiteSpace: "nowrap",
  fontSize: "11px",
};

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 12px",
    fontSize: "11px",
    fontWeight: active ? 700 : 400,
    border: active ? "1px solid #1976d2" : "1px solid #ddd",
    borderRadius: "4px",
    backgroundColor: active ? "#E3F2FD" : "#fff",
    color: active ? "#1976d2" : "#666",
    cursor: "pointer",
  };
}

const exportBtnStyle: React.CSSProperties = {
  padding: "5px 14px",
  fontSize: "11px",
  fontWeight: 600,
  backgroundColor: "#2e7d32",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};
