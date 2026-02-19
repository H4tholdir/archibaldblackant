import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { FresisHistoryOrder } from "../types/fresis";
import {
  parseLinkedIds,
  serializeLinkedIds,
  getFresisHistory,
  deleteFresisHistory,
  deleteFromArchibald,
  updateFresisHistoryOrder,
} from "../api/fresis-history";
import { PDFExportService } from "../services/pdf-export.service";
import { useFresisHistorySync } from "../hooks/useFresisHistorySync";
import { ArcaImportModal } from "../components/ArcaImportModal";
import { JobProgressBar } from "../components/JobProgressBar";
import {
  FresisHistoryRealtimeService,
  type DeleteProgressState,
} from "../services/fresis-history-realtime.service";
import {
  OrderPickerModal,
  type SearchResult,
} from "../components/OrderPickerModal";
import {
  type FresisTimePreset,
  type UniqueSubClient,
  getDateRangeForPreset,
  filterByDateRange,
  filterBySubClient,
  matchesFresisGlobalSearch,
  extractUniqueSubClients,
} from "../utils/fresisHistoryFilters";
import type { ArcaData } from "../types/arca-data";
import { ArcaDocumentList } from "../components/arca/ArcaDocumentList";
import { ArcaDocumentDetail } from "../components/arca/ArcaDocumentDetail";
import { ARCA_FONT } from "../components/arca/arcaStyles";

const TIME_PRESETS: { id: FresisTimePreset; label: string }[] = [
  { id: "today", label: "Oggi" },
  { id: "thisWeek", label: "Questa sett." },
  { id: "thisMonth", label: "Questo mese" },
  { id: "last3Months", label: "Ultimi 3 mesi" },
  { id: "thisYear", label: "Quest'anno" },
  { id: "custom", label: "Personalizzato" },
];

export function FresisHistoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const motherOrderFilter = searchParams.get("motherOrderId");
  const auth = useAuth();

  const { historyOrders: wsOrders, refetch: wsRefetch } =
    useFresisHistorySync();

  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<FresisHistoryOrder | null>(
    null,
  );
  const [showImportModal, setShowImportModal] = useState(false);
  const [linkingOrderId, setLinkingOrderId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingFromArchibald, setDeletingFromArchibald] = useState<
    string | null
  >(null);
  const [deleteProgress, setDeleteProgress] =
    useState<DeleteProgressState | null>(null);

  // Filter state
  const [activeTimePreset, setActiveTimePreset] =
    useState<FresisTimePreset>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Sub-client search
  const [subClientQuery, setSubClientQuery] = useState("");
  const [selectedSubClient, setSelectedSubClient] =
    useState<UniqueSubClient | null>(null);
  const [showSubClientDropdown, setShowSubClientDropdown] = useState(false);
  const [highlightedSubClientIndex, setHighlightedSubClientIndex] =
    useState(-1);
  const subClientDropdownRef = useRef<HTMLDivElement>(null);

  // Delete progress listener
  useEffect(() => {
    if (!deletingFromArchibald) return;
    const realtimeService = FresisHistoryRealtimeService.getInstance();
    const unsubscribe = realtimeService.onDeleteProgress(() => {
      const progress = realtimeService.getDeleteProgress(
        deletingFromArchibald,
      );
      if (progress) setDeleteProgress({ ...progress });
    });
    return () => {
      unsubscribe();
      realtimeService.clearDeleteProgress(deletingFromArchibald);
      setDeleteProgress(null);
    };
  }, [deletingFromArchibald]);

  // Debounce global search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(globalSearch), 300);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  // Loading state
  useEffect(() => {
    if (wsOrders.length > 0 || !loading) setLoading(false);
  }, [wsOrders, loading]);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Click outside sub-client dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        subClientDropdownRef.current &&
        !subClientDropdownRef.current.contains(e.target as Node)
      ) {
        setShowSubClientDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted sub-client into view
  useEffect(() => {
    if (highlightedSubClientIndex < 0) return;
    const dropdown = subClientDropdownRef.current;
    if (!dropdown) return;
    const items = dropdown.querySelectorAll("[data-subclient-item]");
    const item = items[highlightedSubClientIndex] as HTMLElement | undefined;
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [highlightedSubClientIndex]);

  const uniqueSubClients = useMemo(
    () => extractUniqueSubClients(wsOrders),
    [wsOrders],
  );

  const subClientResults = useMemo(() => {
    if (subClientQuery.length < 2) return [];
    const lower = subClientQuery.toLowerCase();
    return uniqueSubClients.filter(
      (sc) =>
        sc.name.toLowerCase().includes(lower) ||
        sc.codice.toLowerCase().includes(lower),
    );
  }, [subClientQuery, uniqueSubClients]);

  // Filtering pipeline
  const filteredOrders = useMemo(() => {
    let result = wsOrders;

    if (motherOrderFilter) {
      result = result.filter(
        (o) =>
          o.mergedIntoOrderId === motherOrderFilter ||
          o.archibaldOrderId === motherOrderFilter,
      );
    }
    if (selectedSubClient) {
      result = filterBySubClient(result, selectedSubClient.codice);
    }
    if (dateFrom || dateTo) {
      result = filterByDateRange(result, dateFrom, dateTo);
    }
    if (debouncedSearch) {
      result = result.filter((o) =>
        matchesFresisGlobalSearch(o, debouncedSearch),
      );
    }
    return result;
  }, [wsOrders, motherOrderFilter, selectedSubClient, dateFrom, dateTo, debouncedSearch]);

  // Keep selectedOrder in sync with data changes
  useEffect(() => {
    if (!selectedOrder) return;
    const updated = filteredOrders.find((o) => o.id === selectedOrder.id);
    if (updated) {
      setSelectedOrder(updated);
    } else {
      setSelectedOrder(null);
    }
  }, [filteredOrders, selectedOrder?.id]);

  // Time preset handler
  const handleTimePreset = (preset: FresisTimePreset) => {
    setActiveTimePreset(preset);
    const range = getDateRangeForPreset(preset);
    if (range) {
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  // Sub-client handlers
  const handleSelectSubClient = (sc: UniqueSubClient) => {
    setSelectedSubClient(sc);
    setSubClientQuery(sc.name);
    setShowSubClientDropdown(false);
    setHighlightedSubClientIndex(-1);
  };

  const handleClearSubClient = () => {
    setSelectedSubClient(null);
    setSubClientQuery("");
    setShowSubClientDropdown(false);
    setHighlightedSubClientIndex(-1);
  };

  const handleSubClientKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (subClientResults.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedSubClientIndex((prev) =>
          prev < subClientResults.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedSubClientIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (
          highlightedSubClientIndex >= 0 &&
          highlightedSubClientIndex < subClientResults.length
        ) {
          handleSelectSubClient(subClientResults[highlightedSubClientIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowSubClientDropdown(false);
        setHighlightedSubClientIndex(-1);
        break;
    }
  };

  const hasActiveFilters =
    selectedSubClient !== null ||
    dateFrom !== "" ||
    dateTo !== "" ||
    globalSearch !== "";

  const handleClearFilters = () => {
    handleClearSubClient();
    setActiveTimePreset(null);
    setDateFrom("");
    setDateTo("");
    setGlobalSearch("");
  };

  // --- Order actions ---
  const handleSyncLifecycles = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const records = await getFresisHistory();
      setSyncMessage(`Aggiornati ${records.length} ordini`);
      await wsRefetch();
    } catch (err) {
      console.error("[FresisHistoryPage] Sync failed:", err);
      setSyncMessage("Errore durante aggiornamento");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 3000);
    }
  };

  const isDraftInArchibald = (order: FresisHistoryOrder): boolean => {
    if (!order.archibaldOrderId) return false;
    if (order.currentState === "piazzato") return true;
    const numbers = parseLinkedIds(order.archibaldOrderNumber);
    return !numbers.some((n) => n.startsWith("ORD/"));
  };

  const handleDelete = async (id: string) => {
    const order = wsOrders.find((o) => o.id === id);
    if (!order) return;

    try {
      if (isDraftInArchibald(order)) {
        setDeletingFromArchibald(id);
        const result = await deleteFromArchibald(id);
        setDeletingFromArchibald(null);
        if (!result.message) {
          alert("Errore cancellazione da Archibald");
          return;
        }
      } else {
        await deleteFresisHistory(id);
      }
      setDeleteConfirmId(null);
      setSelectedOrder(null);
      await wsRefetch();
    } catch (err) {
      console.error("[FresisHistoryPage] Delete failed:", err);
      setDeletingFromArchibald(null);
    }
  };

  const handleLinkOrder = async (
    historyId: string,
    archibaldOrders: Array<{ id: string; orderNumber: string }>,
  ) => {
    try {
      const ids = archibaldOrders.map((o) => o.id);
      const numbers = archibaldOrders.map((o) => o.orderNumber);
      await updateFresisHistoryOrder(historyId, {
        archibaldOrderId: serializeLinkedIds(ids),
        archibaldOrderNumber: serializeLinkedIds(numbers),
      });
      setLinkingOrderId(null);
      await wsRefetch();
    } catch (err) {
      console.error("[FresisHistoryPage] Link order failed:", err);
    }
  };

  const handleUnlinkOrder = async (historyId: string) => {
    if (!window.confirm("Sei sicuro di voler scollegare questo ordine?"))
      return;
    try {
      await updateFresisHistoryOrder(historyId, {
        archibaldOrderId: undefined,
        archibaldOrderNumber: undefined,
        currentState: undefined,
        stateUpdatedAt: undefined,
      });
      await wsRefetch();
    } catch (err) {
      console.error("[FresisHistoryPage] Unlink order failed:", err);
    }
  };

  const handleDownloadPDF = useCallback((order: FresisHistoryOrder) => {
    const pdfService = PDFExportService.getInstance();
    const doc = pdfService.generateOrderPDF(order);
    doc.save(
      `ordine-fresis-${order.subClientName || order.subClientCodice}-${order.createdAt.slice(0, 10)}.pdf`,
    );
  }, []);

  const handleSelectInList = useCallback((order: FresisHistoryOrder) => {
    setSelectedOrder(order);
    setDeleteConfirmId(null);
  }, []);

  const handleDoubleClickInList = useCallback(
    (order: FresisHistoryOrder) => {
      setSelectedOrder(order);
      if (order.archibaldOrderId) {
        const firstId = parseLinkedIds(order.archibaldOrderId)[0];
        if (firstId) navigate(`/orders?highlight=${firstId}`);
      }
    },
    [navigate],
  );

  const handleDeleteFromDetail = useCallback(
    (id: string) => {
      if (deleteConfirmId === id) {
        handleDelete(id);
      } else {
        setDeleteConfirmId(id);
      }
    },
    [deleteConfirmId],
  );

  const handleSaveArcaData = useCallback(
    async (orderId: string, arcaData: ArcaData) => {
      try {
        const arcaDataStr = JSON.stringify(arcaData);
        await updateFresisHistoryOrder(orderId, {
          arcaData: arcaDataStr,
          targetTotalWithVAT: arcaData.testata.TOTDOC,
          shippingCost:
            arcaData.testata.SPESETR +
            arcaData.testata.SPESEIM +
            arcaData.testata.SPESEVA,
          notes: arcaData.testata.NOTE || undefined,
        });
        await wsRefetch();
      } catch (err) {
        console.error("[FresisHistoryPage] Save arca data failed:", err);
      }
    },
    [wsRefetch],
  );

  // Commission rate from profile
  const [commissionRate, setCommissionRate] = useState<number>(0.18);
  useEffect(() => {
    if (!auth.token) return;
    fetch("/api/users/me/target", { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.commissionRate != null) setCommissionRate(data.commissionRate);
      })
      .catch(() => {});
  }, [auth.token]);

  const [exporting, setExporting] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  const handleExportArca = useCallback(async () => {
    if (!auth.token) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (exportFrom) params.set("from", exportFrom);
      if (exportTo) params.set("to", exportTo);
      const qs = params.toString();
      const url = `/api/fresis-history/export-arca${qs ? `?${qs}` : ""}`;

      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        alert(body?.error || "Errore durante l'esportazione");
        return;
      }

      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const dateSuffix = exportFrom || exportTo ? `_${exportFrom || ""}_${exportTo || ""}` : "";
      a.download = `export-arca${dateSuffix}.zip`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      setShowExportPanel(false);
    } catch (err) {
      console.error("[FresisHistoryPage] Export failed:", err);
      alert("Errore durante l'esportazione");
    } finally {
      setExporting(false);
    }
  }, [auth.token, exportFrom, exportTo]);

  const listHeight = 600;

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
      {/* Header */}
      <div
        style={{
          marginBottom: "12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#333", margin: 0 }}>
            Storico Fresis
          </h1>
          <span style={{ fontSize: "12px", color: "#888" }}>
            {filteredOrders.length} documenti
            {filteredOrders.length !== wsOrders.length &&
              ` di ${wsOrders.length}`}
            {motherOrderFilter && " (filtro ordine madre)"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button onClick={() => setShowImportModal(true)} style={headerBtnStyle}>
            Importa da Arca
          </button>
          <button
            onClick={handleSyncLifecycles}
            disabled={syncing}
            style={{
              ...headerBtnStyle,
              backgroundColor: syncing ? "#93c5fd" : "#1976d2",
              color: "#fff",
              border: "none",
            }}
          >
            {syncing ? "Aggiornamento..." : "Aggiorna Stati"}
          </button>
          <button
            onClick={() => setShowExportPanel((v) => !v)}
            style={{
              ...headerBtnStyle,
              backgroundColor: "#2e7d32",
              color: "#fff",
              border: "none",
            }}
          >
            Esporta verso Arca
          </button>
          {syncMessage && (
            <span style={{ fontSize: "11px", color: "#666", alignSelf: "center" }}>
              {syncMessage}
            </span>
          )}
        </div>
      </div>

      {/* Export panel */}
      {showExportPanel && (
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            padding: "12px",
            marginBottom: "12px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            border: "1px solid #2e7d32",
            display: "flex",
            gap: "12px",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div>
            <label style={filterLabelStyle}>Da (opzionale)</label>
            <input
              type="date"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
              style={filterInputStyle}
            />
          </div>
          <div>
            <label style={filterLabelStyle}>A (opzionale)</label>
            <input
              type="date"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
              style={filterInputStyle}
            />
          </div>
          <button
            onClick={handleExportArca}
            disabled={exporting}
            style={{
              ...headerBtnStyle,
              backgroundColor: exporting ? "#81c784" : "#2e7d32",
              color: "#fff",
              border: "none",
            }}
          >
            {exporting ? "Esportazione..." : "Scarica ZIP (DBF)"}
          </button>
          <button
            onClick={() => setShowExportPanel(false)}
            style={headerBtnStyle}
          >
            Chiudi
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "8px",
          padding: "12px",
          marginBottom: "12px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        {/* Row 1: Sub-client + Global search */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
          {/* Sub-client search */}
          <div
            ref={subClientDropdownRef}
            style={{ flex: "1 1 45%", minWidth: "200px", position: "relative" }}
          >
            <label style={filterLabelStyle}>Sotto-cliente</label>
            {selectedSubClient ? (
              <div style={selectedChipStyle}>
                <span style={{ fontWeight: 600, color: "#2E7D32", flex: 1, fontSize: "12px" }}>
                  {selectedSubClient.name}
                </span>
                <span style={{ color: "#666", fontSize: "10px" }}>
                  {selectedSubClient.codice}
                </span>
                <button onClick={handleClearSubClient} style={chipCloseStyle}>
                  X
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Cerca per nome o codice..."
                  value={subClientQuery}
                  onChange={(e) => {
                    setSubClientQuery(e.target.value);
                    setHighlightedSubClientIndex(-1);
                    setShowSubClientDropdown(e.target.value.length >= 2);
                  }}
                  onKeyDown={handleSubClientKeyDown}
                  onFocus={() => {
                    if (subClientResults.length > 0) setShowSubClientDropdown(true);
                  }}
                  autoComplete="off"
                  style={filterInputStyle}
                />
                {showSubClientDropdown && subClientResults.length > 0 && (
                  <div style={dropdownStyle}>
                    {subClientResults.map((sc, index) => (
                      <div
                        key={sc.codice}
                        data-subclient-item
                        onClick={() => handleSelectSubClient(sc)}
                        onMouseEnter={() => setHighlightedSubClientIndex(index)}
                        style={{
                          padding: "6px 8px",
                          cursor: "pointer",
                          borderBottom:
                            index < subClientResults.length - 1
                              ? "1px solid #f3f4f6"
                              : "none",
                          backgroundColor:
                            index === highlightedSubClientIndex
                              ? "#E3F2FD"
                              : "#fff",
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "12px",
                        }}
                      >
                        <strong>{sc.name}</strong>
                        <span style={{ color: "#999", fontSize: "10px" }}>
                          {sc.codice}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {/* Global search */}
          <div style={{ flex: "1 1 45%", minWidth: "200px" }}>
            <label style={filterLabelStyle}>Ricerca globale</label>
            <input
              type="text"
              placeholder="Cerca articoli, codici, DDT, fatture..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              style={filterInputStyle}
            />
          </div>
        </div>

        {/* Row 2: Time presets */}
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "4px" }}>
          {TIME_PRESETS.map((preset) => {
            const isActive = activeTimePreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handleTimePreset(preset.id)}
                style={{
                  padding: "3px 10px",
                  fontSize: "11px",
                  fontWeight: isActive ? 600 : 400,
                  border: isActive ? "1px solid #1976d2" : "1px solid #ddd",
                  borderRadius: "12px",
                  backgroundColor: isActive ? "#E3F2FD" : "#fff",
                  color: isActive ? "#1976d2" : "#666",
                  cursor: "pointer",
                }}
              >
                {preset.label}
              </button>
            );
          })}
          {hasActiveFilters && (
            <button onClick={handleClearFilters} style={clearFilterBtnStyle}>
              X Azzera filtri
            </button>
          )}
        </div>

        {/* Custom date inputs */}
        {activeTimePreset === "custom" && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 150px" }}>
              <label style={filterLabelStyle}>Da</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActiveTimePreset("custom");
                }}
                style={filterInputStyle}
              />
            </div>
            <div style={{ flex: "1 1 150px" }}>
              <label style={filterLabelStyle}>A</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActiveTimePreset("custom");
                }}
                style={filterInputStyle}
              />
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ fontSize: "14px", color: "#666" }}>Caricamento...</p>
        </div>
      )}

      {/* Empty */}
      {!loading && wsOrders.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", backgroundColor: "#fff", borderRadius: "8px" }}>
          <p style={{ fontSize: "16px", fontWeight: 600, color: "#333" }}>
            Nessun ordine archiviato
          </p>
        </div>
      )}

      {/* No results */}
      {!loading && wsOrders.length > 0 && filteredOrders.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px", backgroundColor: "#fff", borderRadius: "8px" }}>
          <p style={{ fontSize: "14px", color: "#333" }}>
            Nessun ordine corrisponde ai filtri ({wsOrders.length} totali)
          </p>
          <button onClick={handleClearFilters} style={{ ...headerBtnStyle, marginTop: "8px" }}>
            Cancella filtri
          </button>
        </div>
      )}

      {/* Main content: List */}
      {!loading && filteredOrders.length > 0 && (
        <ArcaDocumentList
          orders={filteredOrders}
          selectedId={selectedOrder?.id ?? null}
          onSelect={handleSelectInList}
          onDoubleClick={handleDoubleClickInList}
          height={listHeight}
        />
      )}

      {/* Detail modal */}
      {selectedOrder && (
        <div
          style={overlayStyle}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedOrder(null); }}
        >
          <div style={modalStyle}>
            {/* Delete confirmation bar */}
            {deleteConfirmId === selectedOrder.id && (
              <div
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#fee2e2",
                  borderBottom: "1px solid #fca5a5",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                }}
              >
                <span style={{ fontWeight: 600, color: "#c62828" }}>
                  {isDraftInArchibald(selectedOrder)
                    ? "Confermi eliminazione da Archibald?"
                    : "Confermi eliminazione?"}
                </span>
                <button
                  onClick={() => handleDelete(selectedOrder.id)}
                  style={{ ...headerBtnStyle, backgroundColor: "#dc2626", color: "#fff", border: "none" }}
                >
                  Conferma
                </button>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  style={headerBtnStyle}
                >
                  Annulla
                </button>
              </div>
            )}

            {/* Delete progress */}
            {deletingFromArchibald === selectedOrder.id && (
              <div style={{ padding: "6px 12px" }}>
                <JobProgressBar
                  progress={deleteProgress?.progress ?? 0}
                  operation={
                    deleteProgress?.operation ?? "Avvio cancellazione..."
                  }
                  status="processing"
                />
              </div>
            )}

            <ArcaDocumentDetail
              order={selectedOrder}
              onClose={() => setSelectedOrder(null)}
              onLink={(id) => setLinkingOrderId(id)}
              onUnlink={(id) => handleUnlinkOrder(id)}
              onDelete={handleDeleteFromDetail}
              onSave={handleSaveArcaData}
              onDownloadPDF={handleDownloadPDF}
              onNavigateToOrder={(archibaldOrderId) => {
                setSelectedOrder(null);
                navigate(`/orders?highlight=${archibaldOrderId}`);
              }}
              commissionRate={commissionRate}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      {showImportModal && (
        <ArcaImportModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            wsRefetch();
          }}
        />
      )}

      {linkingOrderId &&
        (() => {
          const linkingOrder = filteredOrders.find(
            (o) => o.id === linkingOrderId,
          );
          const existingIds = linkingOrder
            ? parseLinkedIds(linkingOrder.archibaldOrderId)
            : [];
          return (
            <OrderPickerModal
              onClose={() => setLinkingOrderId(null)}
              initialSelection={
                existingIds.length > 0 ? existingIds : undefined
              }
              onSelect={(selectedOrders: SearchResult[]) => {
                handleLinkOrder(
                  linkingOrderId,
                  selectedOrders.map((o) => ({
                    id: o.id,
                    orderNumber: o.orderNumber,
                  })),
                );
              }}
            />
          );
        })()}
    </div>
  );
}

// --- Shared styles ---

const headerBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "12px",
  fontWeight: 600,
  backgroundColor: "#fff",
  color: "#333",
  border: "1px solid #ddd",
  borderRadius: "4px",
  cursor: "pointer",
};

const filterLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: "#333",
  marginBottom: "3px",
};

const filterInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "12px",
  border: "1px solid #ddd",
  borderRadius: "4px",
  outline: "none",
  boxSizing: "border-box",
};

const selectedChipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "4px 8px",
  backgroundColor: "#E8F5E9",
  border: "1px solid #4CAF50",
  borderRadius: "4px",
};

const chipCloseStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "11px",
  color: "#666",
  padding: "1px 4px",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  zIndex: 1000,
  backgroundColor: "#fff",
  border: "1px solid #ddd",
  borderRadius: "4px",
  maxHeight: "250px",
  overflowY: "auto",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
};

const clearFilterBtnStyle: React.CSSProperties = {
  padding: "3px 10px",
  fontSize: "11px",
  fontWeight: 600,
  border: "1px solid #f44336",
  borderRadius: "12px",
  backgroundColor: "#fff",
  color: "#f44336",
  cursor: "pointer",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  zIndex: 1000,
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: "5vh",
  overflowY: "auto",
};

const modalStyle: React.CSSProperties = {
  backgroundColor: "#8a8a88",
  borderRadius: "2px",
  maxWidth: "680px",
  width: "95%",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
};
