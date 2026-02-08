import { useState, useEffect, useCallback } from "react";
import type {
  FresisHistoryOrder,
  PendingOrderItem,
  SubClient,
} from "../db/schema";
import { fresisHistoryService } from "../services/fresis-history.service";
import { PDFExportService } from "../services/pdf-export.service";
import { SubClientSelector } from "../components/new-order-form/SubClientSelector";
import { AddItemToHistory } from "../components/new-order-form/AddItemToHistory";
import { useFresisHistorySync } from "../hooks/useFresisHistorySync";
import { ArcaImportModal } from "../components/ArcaImportModal";
import { OrderPickerModal } from "../components/OrderPickerModal";

const STATE_BADGE_CONFIG: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  piazzato: { label: "Piazzato", bg: "#e5e7eb", color: "#374151" },
  inviato_milano: {
    label: "Inviato a Milano",
    bg: "#dbeafe",
    color: "#1e40af",
  },
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
  importato_arca: {
    label: "Importato da Arca",
    bg: "#e9d5ff",
    color: "#6b21a8",
  },
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

type EditState = {
  orderId: string;
  items: PendingOrderItem[];
  discountPercent: number;
  notes: string;
  subClientCodice: string;
  subClientName: string;
  subClientData: SubClient | null;
};

export function FresisHistoryPage() {
  const { historyOrders: wsOrders, refetch: wsRefetch } =
    useFresisHistorySync();

  const [orders, setOrders] = useState<FresisHistoryOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [editState, setEditState] = useState<EditState | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [linkingOrderId, setLinkingOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      if (searchQuery.trim()) {
        const result = await fresisHistoryService.searchHistoryOrders(
          searchQuery.trim(),
        );
        setOrders(result);
      } else {
        setOrders(wsOrders);
      }
    } catch (err) {
      console.error("[FresisHistoryPage] Failed to load orders:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, wsOrders]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadOrders]);

  const handleSyncLifecycles = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const count = await fresisHistoryService.syncOrderLifecycles();
      setSyncMessage(`Aggiornati ${count} ordini`);
      await wsRefetch();
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
      await wsRefetch();
    } catch (err) {
      console.error("[FresisHistoryPage] Mark delivered failed:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fresisHistoryService.deleteHistoryOrder(id);
      setDeleteConfirmId(null);
      await wsRefetch();
    } catch (err) {
      console.error("[FresisHistoryPage] Delete failed:", err);
    }
  };

  const handleStartEdit = (order: FresisHistoryOrder) => {
    setEditState({
      orderId: order.id,
      items: order.items.map((item) => ({ ...item })),
      discountPercent: order.discountPercent ?? 0,
      notes: order.notes ?? "",
      subClientCodice: order.subClientCodice,
      subClientName: order.subClientName,
      subClientData: order.subClientData ?? null,
    });
    setAddingProduct(false);
  };

  const handleCancelEdit = () => {
    setEditState(null);
    setAddingProduct(false);
  };

  const handleSaveEdit = async () => {
    if (!editState) return;
    if (editState.items.length === 0) return;

    const hasInvalidQty = editState.items.some(
      (item) => !item.quantity || item.quantity <= 0,
    );
    if (hasInvalidQty) return;

    try {
      await fresisHistoryService.updateHistoryOrder(editState.orderId, {
        items: editState.items,
        discountPercent: editState.discountPercent,
        notes: editState.notes || undefined,
        subClientCodice: editState.subClientCodice,
        subClientName: editState.subClientName,
        subClientData: editState.subClientData ?? undefined,
      });
      setEditState(null);
      setAddingProduct(false);
      await wsRefetch();
    } catch (err) {
      console.error("[FresisHistoryPage] Save edit failed:", err);
    }
  };

  const handleEditItemQty = (idx: number, qty: number) => {
    if (!editState) return;
    const newItems = [...editState.items];
    newItems[idx] = { ...newItems[idx], quantity: qty };
    setEditState({ ...editState, items: newItems });
  };

  const handleEditItemPrice = (idx: number, price: number) => {
    if (!editState) return;
    const newItems = [...editState.items];
    newItems[idx] = { ...newItems[idx], price };
    setEditState({ ...editState, items: newItems });
  };

  const handleRemoveItem = (idx: number) => {
    if (!editState) return;
    const newItems = editState.items.filter((_, i) => i !== idx);
    setEditState({ ...editState, items: newItems });
  };

  const handleAddItems = (newItems: PendingOrderItem[]) => {
    if (!editState) return;
    setEditState({
      ...editState,
      items: [...editState.items, ...newItems],
    });
    setAddingProduct(false);
  };

  const handleLinkOrder = async (
    historyId: string,
    archibaldOrder: { id: string; orderNumber: string },
  ) => {
    try {
      await fresisHistoryService.updateHistoryOrder(historyId, {
        archibaldOrderId: archibaldOrder.id,
        archibaldOrderNumber: archibaldOrder.orderNumber,
      });
      setLinkingOrderId(null);
      await wsRefetch();
    } catch (err) {
      console.error("[FresisHistoryPage] Link order failed:", err);
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

  const isEditingOrder = (orderId: string) => editState?.orderId === orderId;

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
          onClick={() => alert("Funzionalita' in arrivo")}
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
          onClick={() => setShowImportModal(true)}
          style={{
            padding: "0.5rem 1rem",
            background: "#e5e7eb",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Importa da Arca
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
          const editing = isEditingOrder(order.id);
          const isDeleting = deleteConfirmId === order.id;
          const displayItems = editing ? editState!.items : order.items;
          const totalItems = displayItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          );
          const totalGross = displayItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
          );
          const badge = getStateBadge(order);

          return (
            <div
              key={order.id}
              style={{
                border: editing ? "2px solid #f59e0b" : "1px solid #f59e0b",
                borderRadius: "8px",
                overflow: "hidden",
                background: editing ? "#fffef5" : "#fffbeb",
              }}
            >
              {/* Header */}
              <div
                onClick={() =>
                  !editing && setExpandedOrderId(isExpanded ? null : order.id)
                }
                style={{
                  padding: "0.75rem 1rem",
                  cursor: editing ? "default" : "pointer",
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
                      {editing ? editState!.subClientName : order.subClientName}
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
                    {editing && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "9999px",
                          background: "#fef3c7",
                          color: "#92400e",
                          fontWeight: "600",
                        }}
                      >
                        In modifica
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#78350f",
                    }}
                  >
                    Cod:{" "}
                    {editing
                      ? editState!.subClientCodice
                      : order.subClientCodice}{" "}
                    | {totalItems} articoli | {formatCurrency(totalGross)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#92400e" }}>
                    {formatDate(order.createdAt)}
                    {order.mergedAt &&
                      ` | Mergiato: ${formatDate(order.mergedAt)}`}
                  </div>
                </div>
                {!editing && (
                  <div style={{ fontSize: "1.25rem", color: "#92400e" }}>
                    {isExpanded ? "▲" : "▼"}
                  </div>
                )}
              </div>

              {/* Expanded details */}
              {(isExpanded || editing) && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    borderTop: "1px solid #fbbf24",
                    background: "white",
                  }}
                >
                  {/* Sub-client: editable in edit mode */}
                  {editing ? (
                    <div style={{ marginBottom: "0.75rem" }}>
                      <SubClientSelector
                        selectedSubClient={editState!.subClientData}
                        onSelect={(sc: SubClient) => {
                          setEditState({
                            ...editState!,
                            subClientCodice: sc.codice,
                            subClientName: sc.ragioneSociale,
                            subClientData: sc,
                          });
                        }}
                        onClear={() => {
                          setEditState({
                            ...editState!,
                            subClientCodice: "",
                            subClientName: "",
                            subClientData: null,
                          });
                        }}
                      />
                    </div>
                  ) : (
                    order.subClientData && (
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
                    )
                  )}

                  {/* Lifecycle section (hidden in edit mode) */}
                  {!editing && order.archibaldOrderId && (
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
                      <div
                        style={{ fontWeight: "600", marginBottom: "0.25rem" }}
                      >
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

                      {order.invoiceNumber && (
                        <div style={{ marginTop: "0.35rem" }}>
                          <strong>Fattura:</strong> {order.invoiceNumber}
                          {order.invoiceDate &&
                            ` del ${formatDate(order.invoiceDate)}`}
                          {order.invoiceAmount && ` - ${order.invoiceAmount}`}
                        </div>
                      )}

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
                        <th style={{ padding: "0.3rem" }}>Descrizione</th>
                        <th style={{ padding: "0.3rem", textAlign: "right" }}>
                          Qta'
                        </th>
                        <th style={{ padding: "0.3rem", textAlign: "right" }}>
                          Prezzo
                        </th>
                        <th style={{ padding: "0.3rem", textAlign: "right" }}>
                          Totale
                        </th>
                        {editing && (
                          <th
                            style={{
                              padding: "0.3rem",
                              textAlign: "center",
                              width: "40px",
                            }}
                          >
                            {/* delete column */}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {displayItems.map((item, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: "1px solid #e5e7eb",
                          }}
                        >
                          <td style={{ padding: "0.3rem" }}>
                            {item.productName || item.articleCode}
                          </td>
                          <td style={{ padding: "0.3rem" }}>
                            {item.description || "-"}
                          </td>
                          <td style={{ padding: "0.3rem", textAlign: "right" }}>
                            {editing ? (
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) =>
                                  handleEditItemQty(
                                    idx,
                                    parseInt(e.target.value, 10) || 0,
                                  )
                                }
                                min={1}
                                style={{
                                  width: "60px",
                                  padding: "0.2rem",
                                  textAlign: "right",
                                  border: "1px solid #d1d5db",
                                  borderRadius: "3px",
                                  fontSize: "0.8rem",
                                }}
                              />
                            ) : (
                              item.quantity
                            )}
                          </td>
                          <td style={{ padding: "0.3rem", textAlign: "right" }}>
                            {editing ? (
                              <input
                                type="number"
                                value={item.price}
                                onChange={(e) =>
                                  handleEditItemPrice(
                                    idx,
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                min={0}
                                step={0.01}
                                style={{
                                  width: "80px",
                                  padding: "0.2rem",
                                  textAlign: "right",
                                  border: "1px solid #d1d5db",
                                  borderRadius: "3px",
                                  fontSize: "0.8rem",
                                }}
                              />
                            ) : (
                              formatCurrency(item.price)
                            )}
                          </td>
                          <td style={{ padding: "0.3rem", textAlign: "right" }}>
                            {formatCurrency(item.price * item.quantity)}
                          </td>
                          {editing && (
                            <td
                              style={{ padding: "0.3rem", textAlign: "center" }}
                            >
                              <button
                                onClick={() => handleRemoveItem(idx)}
                                style={{
                                  padding: "0.15rem 0.4rem",
                                  background: "#fee2e2",
                                  color: "#dc2626",
                                  border: "1px solid #dc2626",
                                  borderRadius: "3px",
                                  cursor: "pointer",
                                  fontSize: "0.75rem",
                                  fontWeight: "bold",
                                }}
                              >
                                X
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Add item button / component (edit mode only) */}
                  {editing && !addingProduct && (
                    <button
                      onClick={() => setAddingProduct(true)}
                      style={{
                        padding: "0.4rem 0.75rem",
                        background: "#f0fdf4",
                        color: "#16a34a",
                        border: "1px solid #86efac",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      + Aggiungi articolo
                    </button>
                  )}

                  {editing && addingProduct && (
                    <div style={{ marginBottom: "0.75rem" }}>
                      <AddItemToHistory
                        onAdd={handleAddItems}
                        onCancel={() => setAddingProduct(false)}
                        existingItems={editState!.items}
                      />
                    </div>
                  )}

                  {/* Discount */}
                  {editing ? (
                    <div
                      style={{
                        fontSize: "0.85rem",
                        fontWeight: "500",
                        marginBottom: "0.5rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span>Sconto globale:</span>
                      <input
                        type="number"
                        value={editState!.discountPercent}
                        onChange={(e) =>
                          setEditState({
                            ...editState!,
                            discountPercent: Math.min(
                              100,
                              Math.max(0, parseFloat(e.target.value) || 0),
                            ),
                          })
                        }
                        min={0}
                        max={100}
                        step={1}
                        style={{
                          width: "60px",
                          padding: "0.2rem",
                          textAlign: "right",
                          border: "1px solid #d1d5db",
                          borderRadius: "3px",
                          fontSize: "0.85rem",
                        }}
                      />
                      <span>%</span>
                    </div>
                  ) : (
                    order.discountPercent !== undefined &&
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
                    )
                  )}

                  {/* Notes */}
                  {editing ? (
                    <div style={{ marginBottom: "0.5rem" }}>
                      <textarea
                        value={editState!.notes}
                        onChange={(e) =>
                          setEditState({ ...editState!, notes: e.target.value })
                        }
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
                  {editing ? (
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        onClick={handleSaveEdit}
                        disabled={editState!.items.length === 0}
                        style={{
                          padding: "0.4rem 1rem",
                          background:
                            editState!.items.length === 0
                              ? "#9ca3af"
                              : "#16a34a",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor:
                            editState!.items.length === 0
                              ? "not-allowed"
                              : "pointer",
                          fontSize: "0.85rem",
                          fontWeight: "600",
                        }}
                      >
                        Salva
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        style={{
                          padding: "0.4rem 1rem",
                          background: "#e5e7eb",
                          border: "1px solid #d1d5db",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                        }}
                      >
                        Annulla
                      </button>
                    </div>
                  ) : (
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
                        onClick={() => handleStartEdit(order)}
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
                        Modifica
                      </button>
                      {!order.archibaldOrderId && (
                        <button
                          onClick={() => setLinkingOrderId(order.id)}
                          style={{
                            padding: "0.4rem 0.75rem",
                            background: "#7c3aed",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                          }}
                        >
                          Collega ordine
                        </button>
                      )}
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
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showImportModal && (
        <ArcaImportModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            fresisHistoryService.syncFromServer().then(() => wsRefetch());
          }}
        />
      )}

      {linkingOrderId && (
        <OrderPickerModal
          onClose={() => setLinkingOrderId(null)}
          onSelect={(order) => {
            handleLinkOrder(linkingOrderId, {
              id: order.id,
              orderNumber: order.orderNumber,
            });
          }}
        />
      )}
    </div>
  );
}
