import { useEffect, useState } from "react";

interface ProductChangeRecord {
  id: number;
  productId: string;
  changeType: "created" | "updated" | "deleted";
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  changedAt: number;
  syncSessionId: string;
}

interface Props {
  productId: string;
  productName: string;
  onClose: () => void;
}

export function ProductHistoryModal({
  productId,
  productName,
  onClose,
}: Props) {
  const [history, setHistory] = useState<ProductChangeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [productId]);

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem("archibald_jwt");
      const response = await fetch(
        `/api/products/variations/product/${encodeURIComponent(productId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = await response.json();
      if (data.success) {
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error("Failed to fetch product history:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getChangeColor = (changeType: string) => {
    if (changeType === "created") return "#1565c0";
    if (changeType === "updated") return "#e65100";
    if (changeType === "deleted") return "#c62828";
    return "#666";
  };

  const getChangeDescription = (record: ProductChangeRecord) => {
    if (record.changeType === "created") return "Prodotto aggiunto al catalogo";
    if (record.changeType === "deleted") return "Prodotto rimosso dal catalogo";
    return null;
  };

  // Group updated records by changedAt to show field changes together
  const groupedHistory: Array<{
    changedAt: number;
    changeType: string;
    syncSessionId: string;
    fields: Array<{
      field: string | null;
      oldValue: string | null;
      newValue: string | null;
    }>;
  }> = [];

  for (const record of history) {
    const existing = groupedHistory.find(
      (g) =>
        g.changedAt === record.changedAt &&
        g.changeType === record.changeType &&
        g.syncSessionId === record.syncSessionId,
    );

    if (existing) {
      existing.fields.push({
        field: record.fieldChanged,
        oldValue: record.oldValue,
        newValue: record.newValue,
      });
    } else {
      groupedHistory.push({
        changedAt: record.changedAt,
        changeType: record.changeType,
        syncSessionId: record.syncSessionId,
        fields: [
          {
            field: record.fieldChanged,
            oldValue: record.oldValue,
            newValue: record.newValue,
          },
        ],
      });
    }
  }

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
          <h2 style={{ margin: 0 }}>Storico Prodotto</h2>
          <p style={{ margin: "5px 0 0 0", color: "#666" }}>{productName}</p>
          <p style={{ margin: "2px 0 0 0", color: "#999", fontSize: "12px" }}>
            {productId}
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: "20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px" }}>
              Caricamento...
            </div>
          ) : groupedHistory.length === 0 ? (
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
                {groupedHistory.map((group, index) => {
                  const color = getChangeColor(group.changeType);
                  return (
                    <div
                      key={`${group.changedAt}-${index}`}
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
                          backgroundColor: color,
                          border: "2px solid white",
                          boxShadow: "0 0 0 2px " + color,
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
                            fontSize: "14px",
                            color: "#666",
                            marginBottom: "8px",
                          }}
                        >
                          {formatDate(group.changedAt)}
                        </div>

                        {group.changeType === "created" ||
                        group.changeType === "deleted" ? (
                          <div style={{ color, fontWeight: "bold" }}>
                            {getChangeDescription(
                              group as unknown as ProductChangeRecord,
                            )}
                          </div>
                        ) : (
                          <div>
                            <div
                              style={{
                                fontWeight: "bold",
                                color,
                                marginBottom: "8px",
                              }}
                            >
                              {group.fields.length} camp
                              {group.fields.length !== 1 ? "i" : "o"} modificat
                              {group.fields.length !== 1 ? "i" : "o"}
                            </div>
                            {group.fields
                              .filter((f) => f.field)
                              .map((f, fi) => (
                                <div
                                  key={fi}
                                  style={{
                                    fontSize: "13px",
                                    padding: "4px 0",
                                    borderBottom:
                                      fi < group.fields.length - 1
                                        ? "1px solid #eee"
                                        : "none",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontWeight: "bold",
                                      color: "#333",
                                    }}
                                  >
                                    {f.field}:
                                  </span>{" "}
                                  <span style={{ color: "#999" }}>
                                    {f.oldValue || "(vuoto)"}
                                  </span>{" "}
                                  <span style={{ color: "#666" }}>→</span>{" "}
                                  <span style={{ color: "#333" }}>
                                    {f.newValue || "(vuoto)"}
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
