import { useState } from "react";
import { WarehouseUpload } from "../components/WarehouseUpload";
import { WarehouseStatsWidget } from "../components/WarehouseStatsWidget";
import { handleOrderReturn } from "../services/warehouse-order-integration";
import { toastService } from "../services/toast.service";
import { db } from "../db/schema";

export default function WarehouseManagementView() {
  // Warehouse Returns state
  const [orderId, setOrderId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [previewItems, setPreviewItems] = useState<
    Array<{
      id: number;
      articleCode: string;
      description: string;
      quantity: number;
      boxName: string;
    }>
  >([]);
  const [returnReason, setReturnReason] = useState<
    "modification" | "customer_return" | "manual_correction"
  >("customer_return");

  // Preview what items would be returned
  const handlePreview = async () => {
    if (!orderId.trim()) {
      toastService.warning("Inserisci un Order ID/Job ID");
      return;
    }

    try {
      const items = await db.warehouseItems
        .filter((item) => item.soldInOrder === orderId.trim())
        .toArray();

      if (items.length === 0) {
        toastService.warning(
          "Nessun articolo trovato per questo ordine nel magazzino",
        );
        setPreviewItems([]);
        return;
      }

      setPreviewItems(
        items.map((item) => ({
          id: item.id!,
          articleCode: item.articleCode,
          description: item.description,
          quantity: item.quantity,
          boxName: item.boxName,
        })),
      );

      toastService.success(`Trovati ${items.length} articoli da magazzino`);
    } catch (error) {
      console.error("[WarehouseReturns] Preview failed:", error);
      toastService.error("Errore durante la ricerca degli articoli");
      setPreviewItems([]);
    }
  };

  // Process the return
  const handleReturn = async () => {
    if (!orderId.trim()) {
      toastService.warning("Inserisci un Order ID/Job ID");
      return;
    }

    if (previewItems.length === 0) {
      toastService.warning("Nessun articolo da restituire");
      return;
    }

    setProcessing(true);

    try {
      const itemsReturned = await handleOrderReturn(
        orderId.trim(),
        returnReason,
      );

      toastService.success(
        `✅ ${itemsReturned} articoli restituiti al magazzino`,
      );

      // Reset form
      setOrderId("");
      setPreviewItems([]);
    } catch (error) {
      console.error("[WarehouseReturns] Return failed:", error);
      toastService.error("Errore durante il reso degli articoli");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "10px" }}>
          📦 Gestione Magazzino
        </h1>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          Carica e gestisci l'inventario del magazzino. Gli articoli caricati
          saranno disponibili durante la creazione degli ordini.
        </p>
      </div>

      {/* Upload Component */}
      <WarehouseUpload />

      {/* Stats Widget */}
      <div style={{ marginTop: "20px" }}>
        <WarehouseStatsWidget />
      </div>

      {/* Divider */}
      <div
        style={{
          margin: "40px 0",
          borderTop: "2px solid #e5e7eb",
        }}
      />

      {/* Warehouse Returns Section */}
      <div>
        <h2
          style={{
            fontSize: "1.75rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          🔄 Gestione Resi Magazzino
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "2rem" }}>
          Restituisci articoli dal magazzino per ordini già inviati ad Archibald
        </p>

        {/* Order ID Input */}
        <div
          style={{
            background: "#f9fafb",
            padding: "1.5rem",
            borderRadius: "8px",
            marginBottom: "1.5rem",
          }}
        >
          <h3 style={{ fontSize: "1.125rem", marginBottom: "1rem" }}>
            1. Inserisci Order ID/Job ID
          </h3>

          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
              }}
            >
              Order ID Archibald (es: job-123 o warehouse-456)
            </label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="job-123"
              style={{
                width: "100%",
                padding: "0.75rem",
                fontSize: "1rem",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontFamily: "monospace",
              }}
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
              }}
            >
              Motivo del reso
            </label>
            <select
              value={returnReason}
              onChange={(e) =>
                setReturnReason(
                  e.target.value as
                    | "modification"
                    | "customer_return"
                    | "manual_correction",
                )
              }
              style={{
                width: "100%",
                padding: "0.75rem",
                fontSize: "1rem",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
              }}
            >
              <option value="customer_return">Reso Cliente</option>
              <option value="modification">Modifica Ordine</option>
              <option value="manual_correction">Correzione Manuale</option>
            </select>
          </div>

          <button
            onClick={handlePreview}
            style={{
              padding: "0.75rem 1.5rem",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontSize: "1rem",
              fontWeight: "600",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Anteprima Articoli
          </button>
        </div>

        {/* Preview Items */}
        {previewItems.length > 0 && (
          <div
            style={{
              background: "#fef3c7",
              padding: "1.5rem",
              borderRadius: "8px",
              border: "2px solid #f59e0b",
              marginBottom: "1.5rem",
            }}
          >
            <h3
              style={{
                fontSize: "1.125rem",
                marginBottom: "1rem",
                color: "#92400e",
              }}
            >
              2. Articoli da Restituire ({previewItems.length})
            </h3>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                background: "white",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <thead>
                <tr
                  style={{ background: "#fef3c7", borderBottom: "2px solid #f59e0b" }}
                >
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "left",
                      fontWeight: "600",
                    }}
                  >
                    Codice Articolo
                  </th>
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "left",
                      fontWeight: "600",
                    }}
                  >
                    Descrizione
                  </th>
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "center",
                      fontWeight: "600",
                    }}
                  >
                    Quantità
                  </th>
                  <th
                    style={{
                      padding: "0.75rem",
                      textAlign: "center",
                      fontWeight: "600",
                    }}
                  >
                    Scatolo
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewItems.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: "1px solid #f3f4f6" }}
                  >
                    <td
                      style={{
                        padding: "0.75rem",
                        fontFamily: "monospace",
                        fontWeight: "600",
                      }}
                    >
                      {item.articleCode}
                    </td>
                    <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                      {item.description}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem",
                        textAlign: "center",
                        fontWeight: "600",
                      }}
                    >
                      {item.quantity} pz
                    </td>
                    <td
                      style={{
                        padding: "0.75rem",
                        textAlign: "center",
                        color: "#059669",
                        fontWeight: "600",
                      }}
                    >
                      {item.boxName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div
              style={{
                marginTop: "1rem",
                padding: "1rem",
                background: "#fee2e2",
                border: "2px solid #dc2626",
                borderRadius: "6px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#991b1b",
                  fontWeight: "600",
                  fontSize: "0.875rem",
                }}
              >
                ⚠️ ATTENZIONE: Questa operazione rilascerà {previewItems.length}{" "}
                articoli dal magazzino, rendendoli nuovamente disponibili per
                altri ordini.
              </p>
            </div>

            <button
              onClick={handleReturn}
              disabled={processing}
              style={{
                marginTop: "1rem",
                padding: "0.75rem 1.5rem",
                background: processing ? "#d1d5db" : "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "1rem",
                fontWeight: "600",
                cursor: processing ? "not-allowed" : "pointer",
                width: "100%",
              }}
            >
              {processing ? "Elaborazione..." : "Conferma Reso"}
            </button>
          </div>
        )}

        {/* Info Box */}
        <div
          style={{
            background: "#eff6ff",
            padding: "1.5rem",
            borderRadius: "8px",
            border: "2px solid #3b82f6",
          }}
        >
          <h4
            style={{
              fontSize: "1rem",
              marginBottom: "0.75rem",
              color: "#1e40af",
            }}
          >
            ℹ️ Quando usare questa funzionalità
          </h4>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.5rem",
              color: "#1e40af",
              fontSize: "0.875rem",
              lineHeight: "1.6",
            }}
          >
            <li>
              <strong>Reso Cliente:</strong> Il cliente restituisce articoli
              dopo la consegna
            </li>
            <li>
              <strong>Modifica Ordine:</strong> L'ordine deve essere modificato
              prima della spedizione
            </li>
            <li>
              <strong>Correzione Manuale:</strong> Correzione di errori nel
              tracking del magazzino
            </li>
          </ul>
          <p
            style={{
              margin: "1rem 0 0 0",
              fontSize: "0.875rem",
              color: "#1e40af",
            }}
          >
            <strong>Nota:</strong> Questa operazione NON modifica l'ordine in
            Archibald. Gestisce solo la disponibilità degli articoli nel
            magazzino locale.
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="padding: 20px"] {
            padding: 10px;
          }

          h1 {
            font-size: 1.5rem !important;
          }

          h2 {
            font-size: 1.35rem !important;
          }
        }
      `}</style>
    </div>
  );
}
