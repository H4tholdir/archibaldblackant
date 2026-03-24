import { useState, useEffect } from "react";
import type { WarehousePickupOrder } from "../api/warehouse-pickups";
import { getWarehousePickups } from "../api/warehouse-pickups";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " +
      d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export function WarehousePickupList() {
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [orders, setOrders] = useState<WarehousePickupOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setCheckedIds(new Set());
    loadPickups();
  }, [selectedDate]);

  const loadPickups = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWarehousePickups(selectedDate);
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  };

  const toggleChecked = (id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalArticles = orders.reduce((sum, o) => sum + o.articles.length, 0);
  const totalPieces = orders.reduce(
    (sum, o) => sum + o.articles.reduce((s, a) => s + a.quantity, 0),
    0,
  );

  const handlePrint = () => window.print();

  return (
    <div style={{ padding: "20px" }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <label style={{ fontWeight: 600, color: "#444", fontSize: "14px" }}>
            Data:
          </label>
          <input autoComplete="off"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "6px",
              fontSize: "14px",
            }}
          />
          <button
            onClick={() => setSelectedDate(todayISO())}
            style={{
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 600,
              border: "1px solid #1565c0",
              borderRadius: "6px",
              background: "#e3f2fd",
              color: "#1565c0",
              cursor: "pointer",
            }}
          >
            Oggi
          </button>
        </div>
        <button
          onClick={handlePrint}
          style={{
            padding: "10px 18px",
            fontSize: "14px",
            fontWeight: 600,
            border: "none",
            borderRadius: "6px",
            background: "#d32f2f",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          🖨️ Stampa / PDF
        </button>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
          Caricamento...
        </div>
      )}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "#fdecea",
            border: "1px solid #f5c6cb",
            borderRadius: "6px",
            color: "#c62828",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      )}

      {/* Summary bar */}
      {!loading && !error && orders.length > 0 && (
        <div
          style={{
            background: "#f3f4ff",
            border: "1px solid #c5cae9",
            borderRadius: "8px",
            padding: "10px 16px",
            marginBottom: "16px",
            fontSize: "13px",
            color: "#3949ab",
            display: "flex",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <span>
            <strong>{orders.length}</strong> ordini
          </span>
          <span>
            <strong>{totalArticles}</strong> articoli da prelevare
          </span>
          <span>
            <strong>{totalPieces}</strong> pezzi totali
          </span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && orders.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 20px",
            color: "#aaa",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "10px" }}>📭</div>
          <p style={{ fontSize: "15px" }}>
            Nessun articolo da prelevare per questa data.
          </p>
        </div>
      )}

      {/* Order cards */}
      {orders.map((order) => (
        <div
          key={order.orderId}
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            marginBottom: "14px",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {/* Card header */}
          <div
            style={{
              background: "#f5f5f5",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid #e0e0e0",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div>
              <div>
                <span
                  style={{ fontSize: "15px", fontWeight: 700, color: "#1565c0" }}
                >
                  {order.orderNumber}
                </span>
                <span style={{ margin: "0 8px", color: "#bbb" }}>·</span>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#333" }}>
                  {order.customerName}
                </span>
              </div>
              {(() => {
                const subClient = order.articles.find((a) => a.subClientName)?.subClientName;
                return subClient ? (
                  <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                    Sotto-cliente: <strong>{subClient}</strong>
                  </div>
                ) : null;
              })()}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "12px", color: "#888" }}>
                {formatDate(order.creationDate)}
              </span>
              <span
                style={{
                  background: "#e8f5e9",
                  color: "#2e7d32",
                  padding: "3px 10px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                {order.articles.length} art.
              </span>
            </div>
          </div>

          {/* Articles table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={{ width: "36px", padding: "8px 12px" }}></th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Codice</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Descrizione</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#666", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Scatolo</th>
                <th style={{ textAlign: "center", padding: "8px 12px", color: "#666", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Stato</th>
                <th style={{ textAlign: "center", padding: "8px 12px", color: "#666", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Pz</th>
              </tr>
            </thead>
            <tbody>
              {order.articles.map((article) => {
                const isChecked = checkedIds.has(article.id);
                const isSold = article.status === "venduto";
                return (
                  <tr
                    key={article.id}
                    style={{
                      borderBottom: "1px solid #f0f0f0",
                      background: isChecked ? "#f1f8e9" : undefined,
                      opacity: isChecked ? 0.7 : 1,
                    }}
                  >
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <input autoComplete="off"
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleChecked(article.id)}
                        style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#4caf50" }}
                      />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "12px",
                          color: isChecked ? "#aaa" : "#1565c0",
                          fontWeight: 600,
                          textDecoration: isChecked ? "line-through" : undefined,
                        }}
                      >
                        {article.articleCode}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: isChecked ? "#aaa" : "#333", textDecoration: isChecked ? "line-through" : undefined }}>
                      {article.articleDescription ?? "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          background: "#fff3e0",
                          color: "#e65100",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        {article.boxName}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span
                        style={{
                          background: isSold ? "#e8f5e9" : "#fff8e1",
                          color: isSold ? "#2e7d32" : "#f57f17",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        {isSold ? "Venduto" : "Riservato"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span
                        style={{
                          background: "#e3f2fd",
                          color: "#0d47a1",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          fontSize: "13px",
                          fontWeight: 700,
                          display: "inline-block",
                          minWidth: "36px",
                          textAlign: "center",
                        }}
                      >
                        {article.quantity}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Print styles */}
      <style>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
