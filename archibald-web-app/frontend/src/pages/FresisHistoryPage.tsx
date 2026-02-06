import { useState, useEffect, useCallback } from "react";
import type { FresisHistoryOrder } from "../db/schema";
import { fresisHistoryService } from "../services/fresis-history.service";
import { PDFExportService } from "../services/pdf-export.service";

const STATE_BADGE_CONFIG: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  piazzato: { label: "Piazzato", bg: "#e5e7eb", color: "#374151" },
  inviato_milano: { label: "Inviato a Milano", bg: "#dbeafe", color: "#1e40af" },
  trasferito: { label: "Trasferito", bg: "#d1fae5", color: "#065f46" },
  transfer_error: {
    label: "Errore Trasferimento",
    bg: "#fee2e2",
    color: "#991b1b",
  },
  modifica: { label: "In Modifica", bg: "#fef3c7", color: "#92400e" },
  ordine_aperto: { label: "Ordine Aperto", bg: "#ffedd5", color: "#9a3412" },
  spedito: { label: "Spedito", bg: "#e0f2fe", color: "#0369a1" },
  consegnato: { label: "Consegnato", bg: "#bbf7d0", color: "#166534" },
  fatturato: { label: "Fatturato", bg: "#86efac", color: "#14532d" },
};

function getStateBadge(order: FresisHistoryOrder): {
  label: string;
  bg: string;
  color: string;
} {
  if (!order.archibaldOrderId) {
    return { label: "In attesa", bg: "#f3f4f6", color: "#6b7280" };
  }
  const cfg = order.currentState
    ? STATE_BADGE_CONFIG[order.currentState]
    : undefined;
  return cfg ?? { label: "In attesa", bg: "#f3f4f6", color: "#6b7280" };
}

export function FresisHistoryPage() {
  const [orders, setOrders] = useState<FresisHistoryOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const result = searchQuery.trim()
        ? await fresisHistoryService.searchHistoryOrders(searchQuery.trim())
        : await fresisHistoryService.getAllHistoryOrders();
      setOrders(result);
    } catch (err) {
      console.error("[FresisHistoryPage] Failed to load orders:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadOrders]);

  useEffect(() => {
    fresisHistoryService.syncOrderLifecycles().then(() => loadOrders());
  }, []);

  const handleSyncLifecycles = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const count = await fresisHistoryService.syncOrderLifecycles();
      setSyncMessage(`Aggiornati ${count} ordini`);
      await loadOrders();
    } catch (err) {
      console.error("[FresisHistoryPage] Sync failed:", err);
      setSyncMessage("Errore durante aggiornamento");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 3000);
    }
  };

  const handleMarkDelivered = async (order: FresisHistoryOrder) => {
    try {
      await fresisHistoryService.updateHistoryOrder(order.id, {
        currentState: "consegnato",
        deliveryCompletedDate: new Date().toISOString(),
        stateUpdatedAt: new Date().toISOString(),
      });
      await loadOrders();
    } catch (err) {
      console.error("[FresisHistoryPage] Mark delivered failed:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fresisHistoryService.deleteHistoryOrder(id);
      setDeleteConfirmId(null);
      await loadOrders();
    } catch (err) {
      console.error("[FresisHistoryPage] Delete failed:", err);
    }
  };

  const handleSaveNotes = async (id: string) => {
    try {
      await fresisHistoryService.updateHistoryOrder(id, { notes: editNotes });
      setEditingOrderId(null);
      await loadOrders();
    } catch (err) {
      console.error("[FresisHistoryPage] Update failed:", err);
    }
  };

  const handleDownloadPDF = (order: FresisHistoryOrder) => {
    const pdfService = PDFExportService.getInstance();
    const doc = pdfService.generateOrderPDF(order);
    doc.save(
      `ordine-fresis-${order.subClientName || order.subClientCodice}-${order.createdAt.slice(0, 10)}.pdf`,
    );
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString("it-IT", {
      style: "currency",
      currency: "EUR",
    });

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "1rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        Storico Fresis
      </h1>

      {/* Search bar */}
      <div style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cerca per sotto-cliente, articolo, codice, data..."
          style={{
            width: "100%",
            padding: "0.75rem",
            fontSize: "1rem",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            outline: "none",
          }}
        />
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => alert("Funzionalità in arrivo")}
          style={{
            padding: "0.5rem 1rem",
            background: "#e5e7eb",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Report
        </button>
        <button
          onClick={() => alert("Funzionalità in arrivo")}
          style={{
            padding: "0.5rem 1rem",
            background: "#e5e7eb",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Importa
        </button>
        <button
          onClick={handleSyncLifecycles}
          disabled={syncing}
          style={{
            padding: "0.5rem 1rem",
            background: syncing ? "#93c5fd" : "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: syncing ? "default" : "pointer",
            fontSize: "0.875rem",
          }}
        >
          {syncing ? "Aggiornamento..." : "Aggiorna Stati"}
        </button>
        {syncMessage && (
          <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
            {syncMessage}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
          Caricamento...
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
          {searchQuery
            ? "Nessun risultato trovato"
            : "Nessun ordine archiviato"}
        </div>
      )}

      {/* Orders list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {orders.map((order) => {
          const isExpanded = expandedOrderId === order.id;
          const isEditing = editingOrderId === order.id;
          const isDeleting = deleteConfirmId === order.id;
          const totalItems = order.items.reduce(
            (sum, item) => sum + item.quantity,
            0,
          );
          const totalGross = order.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
          );
          const badge = getStateBadge(order);

          return (
            <div
              key={order.id}
              style={{
                border: "1px solid #f59e0b",
                borderRadius: "8px",
                overflow: "hidden",
                background: "#fffbeb",
              }}
            >
              {/* Header */}
              <div
                onClick={() =>
                  setExpandedOrderId(isExpanded ? null : order.id)
                }
                style={{
                  padding: "0.75rem 1rem",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontWeight: "600", fontSize: "1rem" }}>
                      {order.subClientName}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "9999px",
                        background: badge.bg,
                        color: badge.color,
                        fontWeight: "500",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#78350f",
                    }}
                  >
                    Cod: {order.subClientCodice} | {totalItems} articoli |{" "}
                    {formatCurrency(totalGross)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#92400e" }}>
                    {formatDate(order.createdAt)}
                    {order.mergedAt && ` | Mergiato: ${formatDate(order.mergedAt)}`}
                  </div>
                </div>
                <div style={{ fontSize: "1.25rem", color: "#92400e" }}>
                  {isExpanded ? "▲" : "▼"}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    borderTop: "1px solid #fbbf24",
                    background: "white",
                  }}
                >
                  {/* Sub-client details */}
                  {order.subClientData && (
                    <div
                      style={{
                        marginBottom: "0.75rem",
                        padding: "0.5rem",
                        background: "#fef3c7",
                        borderRadius: "4px",
                        fontSize: "0.8rem",
                      }}
                    >
                      <strong>Sotto-cliente:</strong>{" "}
                      {order.subClientData.ragioneSociale}
                      {order.subClientData.supplRagioneSociale &&
                        ` - ${order.subClientData.supplRagioneSociale}`}
                      <br />
                      {order.subClientData.indirizzo && (
                        <>
                          {order.subClientData.indirizzo}
                          {order.subClientData.localita &&
                            `, ${order.subClientData.localita}`}
                          {order.subClientData.cap &&
                            ` ${order.subClientData.cap}`}
                          {order.subClientData.prov &&
                            ` (${order.subClientData.prov})`}
                          <br />
                        </>
                      )}
                      {order.subClientData.partitaIva &&
                        `P.IVA: ${order.subClientData.partitaIva}`}
                      {order.subClientData.codFiscale &&
                        ` | CF: ${order.subClientData.codFiscale}`}
                    </div>
                  )}

                  {/* Lifecycle section */}
                  {order.archibaldOrderId && (
                    <div
                      style={{
                        marginBottom: "0.75rem",
                        padding: "0.5rem",
                        background: "#f0f9ff",
                        borderRadius: "4px",
                        border: "1px solid #bae6fd",
                        fontSize: "0.8rem",
                      }}
                    >
                      <div style={{ fontWeight: "600", marginBottom: "0.25rem" }}>
                        Ordine Archibald
                      </div>
                      <div>
                        {order.archibaldOrderNumber && (
                          <span>N. {order.archibaldOrderNumber}</span>
                        )}
                        {order.currentState && (
                          <span
                            style={{
                              marginLeft: "0.5rem",
                              fontSize: "0.7rem",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "9999px",
                              background: badge.bg,
                              color: badge.color,
                              fontWeight: "500",
                            }}
                          >
                            {badge.label}
                          </span>
                        )}
                      </div>

                      {/* DDT/Spedizione */}
                      {order.ddtNumber && (
                        <div style={{ marginTop: "0.35rem" }}>
                          <strong>DDT:</strong> {order.ddtNumber}
                          {order.ddtDeliveryDate &&
                            ` | Consegna prevista: ${formatDate(order.ddtDeliveryDate)}`}
                          {order.trackingNumber && (
                            <div>
                              <strong>Tracking:</strong>{" "}
                              {order.trackingUrl ? (
                                <a
                                  href={order.trackingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: "#2563eb" }}
                                >
                                  {order.trackingNumber}
                                </a>
                              ) : (
                                order.trackingNumber
                              )}
                              {order.trackingCourier &&
                                ` (${order.trackingCourier})`}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fattura */}
                      {order.invoiceNumber && (
                        <div style={{ marginTop: "0.35rem" }}>
                          <strong>Fattura:</strong> {order.invoiceNumber}
                          {order.invoiceDate &&
                            ` del ${formatDate(order.invoiceDate)}`}
                          {order.invoiceAmount && ` - ${order.invoiceAmount}`}
                        </div>
                      )}

                      {/* Consegna completata */}
                      {order.deliveryCompletedDate && (
                        <div style={{ marginTop: "0.35rem", color: "#166534" }}>
                          Consegnato il{" "}
                          {formatDate(order.deliveryCompletedDate)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Items table */}
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.8rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: "2px solid #f59e0b",
                          textAlign: "left",
                        }}
                      >
                        <th style={{ padding: "0.3rem" }}>Codice</th>
                        <th style={{ padding: "0.3rem" }}>Prodotto</th>
                        <th style={{ padding: "0.3rem", textAlign: "right" }}>
                          Qtà
                        </th>
                        <th style={{ padding: "0.3rem", textAlign: "right" }}>
                          Prezzo
                        </th>
                        <th style={{ padding: "0.3rem", textAlign: "right" }}>
                          Totale
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: "1px solid #e5e7eb",
                          }}
                        >
                          <td style={{ padding: "0.3rem" }}>
                            {item.articleCode}
                          </td>
                          <td style={{ padding: "0.3rem" }}>
                            {item.productName || item.description || "-"}
                          </td>
                          <td
                            style={{ padding: "0.3rem", textAlign: "right" }}
                          >
                            {item.quantity}
                          </td>
                          <td
                            style={{ padding: "0.3rem", textAlign: "right" }}
                          >
                            {formatCurrency(item.price)}
                          </td>
                          <td
                            style={{ padding: "0.3rem", textAlign: "right" }}
                          >
                            {formatCurrency(item.price * item.quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Discount info */}
                  {order.discountPercent !== undefined &&
                    order.discountPercent > 0 && (
                      <div
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: "500",
                          marginBottom: "0.5rem",
                        }}
                      >
                        Sconto globale: {order.discountPercent}%
                      </div>
                    )}

                  {/* Notes */}
                  {isEditing ? (
                    <div style={{ marginBottom: "0.5rem" }}>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Note..."
                        rows={3}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          border: "1px solid #d1d5db",
                          borderRadius: "4px",
                          fontSize: "0.85rem",
                          resize: "vertical",
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          marginTop: "0.25rem",
                        }}
                      >
                        <button
                          onClick={() => handleSaveNotes(order.id)}
                          style={{
                            padding: "0.3rem 0.75rem",
                            background: "#16a34a",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                          }}
                        >
                          Salva
                        </button>
                        <button
                          onClick={() => setEditingOrderId(null)}
                          style={{
                            padding: "0.3rem 0.75rem",
                            background: "#e5e7eb",
                            border: "1px solid #d1d5db",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                          }}
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    order.notes && (
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "#374151",
                          marginBottom: "0.5rem",
                          fontStyle: "italic",
                        }}
                      >
                        Note: {order.notes}
                      </div>
                    )
                  )}

                  {/* Action buttons */}
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => handleDownloadPDF(order)}
                      style={{
                        padding: "0.4rem 0.75rem",
                        background: "#2563eb",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                      }}
                    >
                      Scarica PDF
                    </button>
                    <button
                      onClick={() => {
                        setEditingOrderId(order.id);
                        setEditNotes(order.notes || "");
                      }}
                      style={{
                        padding: "0.4rem 0.75rem",
                        background: "#f59e0b",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                      }}
                    >
                      Modifica Note
                    </button>
                    {order.currentState === "spedito" &&
                      !order.deliveryCompletedDate && (
                        <button
                          onClick={() => handleMarkDelivered(order)}
                          style={{
                            padding: "0.4rem 0.75rem",
                            background: "#16a34a",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                          }}
                        >
                          Segna Consegnato
                        </button>
                      )}
                    {isDeleting ? (
                      <>
                        <button
                          onClick={() => handleDelete(order.id)}
                          style={{
                            padding: "0.4rem 0.75rem",
                            background: "#dc2626",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                          }}
                        >
                          Conferma Elimina
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          style={{
                            padding: "0.4rem 0.75rem",
                            background: "#e5e7eb",
                            border: "1px solid #d1d5db",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                          }}
                        >
                          Annulla
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(order.id)}
                        style={{
                          padding: "0.4rem 0.75rem",
                          background: "#fee2e2",
                          color: "#dc2626",
                          border: "1px solid #dc2626",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                        }}
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
