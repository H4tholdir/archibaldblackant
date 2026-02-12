import { useEffect, useState } from "react";
import { formatPrice } from "../utils/format-currency";

interface PriceHistoryRecord {
  id: number;
  oldPrice: number | null;
  newPrice: number;
  percentageChange: number;
  changeType: string;
  syncDate: number;
  source: string;
}

interface Props {
  productId: string;
  productName: string;
  onClose: () => void;
}

export function PriceHistoryModal({ productId, productName, onClose }: Props) {
  const [history, setHistory] = useState<PriceHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [productId]);

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem("archibald_jwt");
      const response = await fetch(`/api/prices/history/${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error("Failed to fetch price history:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getChangeColor = (changeType: string) => {
    if (changeType === "increase") return "#c62828";
    if (changeType === "decrease") return "#2e7d32";
    return "#666";
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1001,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          maxWidth: "700px",
          width: "100%",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px",
            borderBottom: "1px solid #ddd",
            position: "sticky",
            top: 0,
            backgroundColor: "white",
          }}
        >
          <h2 style={{ margin: 0 }}>📈 Storico Prezzi</h2>
          <p style={{ margin: "5px 0 0 0", color: "#666" }}>{productName}</p>
        </div>

        {/* Content */}
        <div style={{ padding: "20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px" }}>
              ⏳ Caricamento...
            </div>
          ) : history.length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "40px", color: "#666" }}
            >
              Nessuno storico disponibile
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {/* Timeline */}
              <div
                style={{
                  borderLeft: "2px solid #ddd",
                  paddingLeft: "20px",
                  marginLeft: "10px",
                }}
              >
                {history.map((record) => (
                  <div
                    key={record.id}
                    style={{ marginBottom: "20px", position: "relative" }}
                  >
                    {/* Timeline dot */}
                    <div
                      style={{
                        position: "absolute",
                        left: "-26px",
                        top: "5px",
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        backgroundColor: getChangeColor(record.changeType),
                        border: "2px solid white",
                        boxShadow:
                          "0 0 0 2px " + getChangeColor(record.changeType),
                      }}
                    />

                    {/* Record card */}
                    <div
                      style={{
                        backgroundColor: "#f9f9f9",
                        padding: "15px",
                        borderRadius: "8px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "14px", color: "#666" }}>
                            {formatDate(record.syncDate)} • {record.source}
                          </div>
                          <div
                            style={{
                              marginTop: "8px",
                              display: "flex",
                              gap: "20px",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: "12px", color: "#999" }}>
                                Vecchio
                              </div>
                              <div
                                style={{ fontSize: "18px", fontWeight: "bold" }}
                              >
                                {formatPrice(record.oldPrice)}
                              </div>
                            </div>
                            <div style={{ fontSize: "24px", color: "#666" }}>
                              →
                            </div>
                            <div>
                              <div style={{ fontSize: "12px", color: "#999" }}>
                                Nuovo
                              </div>
                              <div
                                style={{ fontSize: "18px", fontWeight: "bold" }}
                              >
                                {formatPrice(record.newPrice)}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: "20px",
                            fontWeight: "bold",
                            color: getChangeColor(record.changeType),
                            textAlign: "right",
                          }}
                        >
                          {record.percentageChange > 0 ? "+" : ""}
                          {record.percentageChange.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "20px",
            borderTop: "1px solid #ddd",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            onClick={onClose}
            style={{ padding: "10px 20px", cursor: "pointer" }}
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
