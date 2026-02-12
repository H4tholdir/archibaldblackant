import { useState, useEffect } from "react";
import type { PendingOrder } from "../db/schema";
import { db } from "../db/schema";
import { formatCurrency } from "../utils/format-currency";

interface OrderConflictReviewProps {
  order: PendingOrder;
  onConfirm: () => void;
  onCancel: () => void;
}

interface ItemConflict {
  articleCode: string;
  productName: string;
  queuedPrice: number;
  currentPrice: number | null;
  priceChanged: boolean;
  productNotFound: boolean;
  nameChanged: boolean;
  currentProductName?: string;
}

export function OrderConflictReview({
  order,
  onConfirm,
  onCancel,
}: OrderConflictReviewProps) {
  const [conflicts, setConflicts] = useState<ItemConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [queuedTotal, setQueuedTotal] = useState(0);
  const [currentTotal, setCurrentTotal] = useState(0);

  useEffect(() => {
    async function detectConflicts() {
      try {
        const itemConflicts: ItemConflict[] = [];
        let queued = 0;
        let current = 0;

        for (const item of order.items) {
          const queuedPrice = item.price;
          const queuedQty = item.quantity;
          queued += queuedPrice * queuedQty;

          // Fetch current price and product from cache
          const priceRecord = await db.prices
            .where("articleId")
            .equals(item.articleCode)
            .first();

          const productRecord = await db.products
            .where("id")
            .equals(item.articleCode)
            .first();

          const currentPrice = priceRecord?.price ?? null;
          const currentProductName = productRecord?.name;

          const priceChanged =
            currentPrice !== null && currentPrice !== queuedPrice;
          const productNotFound = !productRecord;
          const nameChanged =
            currentProductName !== undefined &&
            currentProductName !== item.productName;

          if (priceChanged || productNotFound || nameChanged) {
            itemConflicts.push({
              articleCode: item.articleCode,
              productName: item.productName || "Prodotto",
              queuedPrice,
              currentPrice,
              priceChanged,
              productNotFound,
              nameChanged,
              currentProductName,
            });
          }

          // Calculate current total (use queued price if current unavailable)
          current += (currentPrice ?? queuedPrice) * queuedQty;
        }

        setConflicts(itemConflicts);
        setQueuedTotal(queued);
        setCurrentTotal(current);
      } catch (error) {
        console.error(
          "[OrderConflictReview] Error detecting conflicts:",
          error,
        );
      } finally {
        setLoading(false);
      }
    }

    detectConflicts();
  }, [order]);

  if (loading) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000,
        }}
      >
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            padding: "24px",
            maxWidth: "500px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          }}
        >
          <p>Caricamento conflitti...</p>
        </div>
      </div>
    );
  }

  const totalChanged = Math.abs(currentTotal - queuedTotal) > 0.01;
  const percentChange =
    queuedTotal > 0 ? ((currentTotal - queuedTotal) / queuedTotal) * 100 : 0;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "8px",
          padding: "24px",
          maxWidth: "600px",
          width: "90%",
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ marginTop: 0, color: "#f57c00" }}>
          ⚠️ Revisione Ordine con Conflitti
        </h3>

        <div
          style={{
            marginBottom: "16px",
            paddingBottom: "16px",
            borderBottom: "1px solid #eee",
          }}
        >
          <p style={{ margin: "4px 0", color: "#333", fontWeight: 600 }}>
            Cliente: {order.customerName}
          </p>
          <p style={{ margin: "4px 0", color: "#666", fontSize: "14px" }}>
            {order.items.length} articoli • Creato il{" "}
            {new Date(order.createdAt).toLocaleDateString("it-IT")}
          </p>
        </div>

        {conflicts.length === 0 ? (
          <p style={{ color: "#666" }}>Nessun conflitto rilevato.</p>
        ) : (
          <>
            <h4
              style={{ marginTop: "16px", marginBottom: "8px", color: "#333" }}
            >
              Conflitti Rilevati:
            </h4>
            <div style={{ marginBottom: "16px" }}>
              {conflicts.map((conflict, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "12px",
                    marginBottom: "8px",
                    backgroundColor: "#fff3e0",
                    borderRadius: "4px",
                    border: "1px solid #ffe0b2",
                  }}
                >
                  <p
                    style={{ margin: "4px 0", fontWeight: 600, color: "#333" }}
                  >
                    {conflict.productName}
                  </p>
                  <p
                    style={{ margin: "4px 0", fontSize: "13px", color: "#666" }}
                  >
                    Codice: {conflict.articleCode}
                  </p>

                  {conflict.productNotFound && (
                    <p
                      style={{
                        margin: "8px 0 4px 0",
                        color: "#d32f2f",
                        fontSize: "14px",
                      }}
                    >
                      ⚠️ <strong>Prodotto non disponibile</strong> nel catalogo
                      attuale
                    </p>
                  )}

                  {conflict.nameChanged && (
                    <p
                      style={{
                        margin: "8px 0 4px 0",
                        color: "#f57c00",
                        fontSize: "14px",
                      }}
                    >
                      Nome cambiato:{" "}
                      <span style={{ textDecoration: "line-through" }}>
                        {conflict.productName}
                      </span>{" "}
                      → {conflict.currentProductName}
                    </p>
                  )}

                  {conflict.priceChanged && conflict.currentPrice !== null && (
                    <p style={{ margin: "8px 0 4px 0", fontSize: "14px" }}>
                      Prezzo:{" "}
                      <span
                        style={{
                          textDecoration: "line-through",
                          color: "#999",
                        }}
                      >
                        {formatCurrency(conflict.queuedPrice)}
                      </span>{" "}
                      →{" "}
                      <span
                        style={{
                          color:
                            conflict.currentPrice > conflict.queuedPrice
                              ? "#d32f2f"
                              : "#388e3c",
                          fontWeight: 600,
                        }}
                      >
                        {formatCurrency(conflict.currentPrice)}
                      </span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {totalChanged && (
          <div
            style={{
              padding: "12px",
              marginBottom: "16px",
              backgroundColor: percentChange > 0 ? "#ffebee" : "#e8f5e9",
              borderRadius: "4px",
              border:
                percentChange > 0 ? "1px solid #ffcdd2" : "1px solid #c8e6c9",
            }}
          >
            <p style={{ margin: "4px 0", fontSize: "14px", color: "#666" }}>
              Totale originale:{" "}
              <span style={{ textDecoration: "line-through" }}>
                {formatCurrency(queuedTotal)}
              </span>
            </p>
            <p style={{ margin: "4px 0", fontSize: "16px", fontWeight: 600 }}>
              Nuovo totale:{" "}
              <span
                style={{
                  color: percentChange > 0 ? "#d32f2f" : "#388e3c",
                }}
              >
                {formatCurrency(currentTotal)}
              </span>{" "}
              <span style={{ fontSize: "14px", color: "#666" }}>
                ({percentChange > 0 ? "+" : ""}
                {percentChange.toFixed(1)}%)
              </span>
            </p>
          </div>
        )}

        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            backgroundColor: "#f5f5f5",
            borderRadius: "4px",
          }}
        >
          <p
            style={{
              margin: "4px 0",
              fontSize: "14px",
              color: "#666",
              lineHeight: 1.5,
            }}
          >
            <strong>Conferma modifiche:</strong> L'ordine verrà sincronizzato
            con i dati attuali del catalogo.
          </p>
          <p
            style={{
              margin: "4px 0",
              fontSize: "14px",
              color: "#666",
              lineHeight: 1.5,
            }}
          >
            <strong>Annulla:</strong> L'ordine non verrà sincronizzato.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "24px",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "10px 20px",
              borderRadius: "4px",
              border: "1px solid #ddd",
              backgroundColor: "#fff",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "10px 20px",
              borderRadius: "4px",
              border: "none",
              backgroundColor: "#1976d2",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            Conferma Modifiche
          </button>
        </div>
      </div>
    </div>
  );
}
