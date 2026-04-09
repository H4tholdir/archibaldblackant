import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { FresisHistoryOrder } from "../types/fresis";
import type { ArcaTestata, ArcaRiga } from "../types/arca-data";
import {
  parseLinkedIds,
  serializeLinkedIds,
  deleteFresisHistory,
  deleteFromArchibald,
  updateFresisHistoryOrder,
  getUniqueSubClients,
} from "../api/fresis-history";
import { useOperationTracking } from "../contexts/OperationTrackingContext";
import { PDFExportService } from "../services/pdf-export.service";
import { useFresisHistorySync } from "../hooks/useFresisHistorySync";
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
  filterBySubClient,
  matchesFresisGlobalSearch,
  normalizeSubClientCode,
} from "../utils/fresisHistoryFilters";
import type { ArcaData } from "../types/arca-data";
import { ArcaDocumentList } from "../components/arca/ArcaDocumentList";
import { ArcaDocumentDetail } from "../components/arca/ArcaDocumentDetail";
import { ARCA_FONT } from "../components/arca/arcaStyles";
import { ArcaSyncButton } from "../components/ArcaSyncButton";
import { SubclientsTab } from "../components/SubclientsTab";

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
  const openRecordId = searchParams.get("openRecord");
  const auth = useAuth();
  const { trackOperation } = useOperationTracking();

  const today = new Date().toISOString().slice(0, 10);
  const initialRange = openRecordId
    ? { from: "2020-01-01", to: today }
    : getDateRangeForPreset("thisMonth")!;

  // Filter state
  const [activeTimePreset, setActiveTimePreset] =
    useState<FresisTimePreset | null>(null);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);

  // Search & filter state (declared before hook to compute isBackendSearch)
  const [globalSearch, setGlobalSearch] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'ft_only' | 'kt_only'>('ft_only');
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'documenti' | 'sottoclienti'>('documenti');

  // Sub-client search
  const [subClientQuery, setSubClientQuery] = useState("");
  const [selectedSubClient, setSelectedSubClient] =
    useState<UniqueSubClient | null>(null);
  const [showSubClientDropdown, setShowSubClientDropdown] = useState(false);
  const [highlightedSubClientIndex, setHighlightedSubClientIndex] =
    useState(-1);
  const subClientDropdownRef = useRef<HTMLDivElement>(null);

  // Backend search: when search term has 2+ chars, send to backend (bypasses date filters)
  const isBackendSearch = debouncedSearch.length >= 2;
  const shouldBypassDates = isBackendSearch || selectedSubClient !== null;
  const shouldReplaceRef = useRef(false);
  shouldReplaceRef.current = shouldBypassDates;
  const autoSelectDoneRef = useRef(false);

  const { historyOrders: wsOrders, refetch: wsRefetch } =
    useFresisHistorySync(
      shouldBypassDates ? undefined : dateFrom,
      shouldBypassDates ? undefined : dateTo,
      isBackendSearch && !selectedSubClient ? debouncedSearch : undefined,
      selectedSubClient?.codice,
    );

  // Progressive loading state
  const [allOrders, setAllOrders] = useState<FresisHistoryOrder[]>([]);
  const [canLoadMore, setCanLoadMore] = useState(true);

  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<FresisHistoryOrder | null>(
    null,
  );
  const [linkingOrderId, setLinkingOrderId] = useState<string | null>(null);
  const [deletionWarnings, setDeletionWarnings] = useState<Array<{
    invoiceNumber: string;
    hasTracking: boolean;
    hasDdt: boolean;
    hasDelivery: boolean;
  }>>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingFromArchibald, setDeletingFromArchibald] = useState<
    string | null
  >(null);
  const [deleteProgress, setDeleteProgress] =
    useState<DeleteProgressState | null>(null);
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

  // Clear orders when leaving backend-driven mode; disable progressive loading
  const prevBypassRef = useRef(false);
  useEffect(() => {
    if (shouldBypassDates !== prevBypassRef.current) {
      if (!shouldBypassDates) setAllOrders([]);
      setCanLoadMore(!shouldBypassDates);
      prevBypassRef.current = shouldBypassDates;
    }
  }, [shouldBypassDates]);

  // Loading state
  useEffect(() => {
    if (wsOrders.length > 0 || !loading) setLoading(false);
  }, [wsOrders, loading]);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Accumulate orders when wsOrders changes
  // Backend search/subclient: replace entirely (results are the complete filtered set)
  // Date range browsing: accumulate for progressive loading
  useEffect(() => {
    if (shouldReplaceRef.current) {
      setAllOrders(wsOrders);
    } else if (wsOrders.length > 0) {
      setAllOrders(prev => {
        const existingIds = new Set(prev.map(o => o.id));
        const newOrders = wsOrders.filter(o => !existingIds.has(o.id));
        if (newOrders.length === 0) return prev;
        return [...prev, ...newOrders];
      });
    }
  }, [wsOrders]);

  // Load more months (go back 1 month at a time, stop at Jan 1st of current year)
  const loadMoreMonths = useCallback(() => {
    if (!canLoadMore) return;
    const currentFrom = new Date(dateFrom);
    const janFirst = new Date(currentFrom.getFullYear(), 0, 1);

    const newFrom = new Date(currentFrom);
    newFrom.setMonth(newFrom.getMonth() - 1);
    newFrom.setDate(1);

    if (newFrom <= janFirst) {
      newFrom.setTime(janFirst.getTime());
      setCanLoadMore(false);
    }

    const y = newFrom.getFullYear();
    const m = String(newFrom.getMonth() + 1).padStart(2, "0");
    const d = String(newFrom.getDate()).padStart(2, "0");
    setDateFrom(`${y}-${m}-${d}`);
  }, [dateFrom, canLoadMore]);

  // Responsive list height
  const [listHeight, setListHeight] = useState(() =>
    Math.max(400, window.innerHeight - 300),
  );
  useEffect(() => {
    const handleResize = () => setListHeight(Math.max(400, window.innerHeight - 300));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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

  // Fetch all unique sub-clients once from backend (lightweight, ~10KB)
  const [uniqueSubClients, setUniqueSubClients] = useState<UniqueSubClient[]>([]);
  useEffect(() => {
    getUniqueSubClients()
      .then(scs => setUniqueSubClients(scs.map(sc => ({ codice: sc.codice, name: sc.name }))))
      .catch(err => console.error("[FresisHistoryPage] Failed to load sub-clients:", err));
  }, []);

  const subClientResults = useMemo(() => {
    if (subClientQuery.length < 2) return [];
    const lower = subClientQuery.toLowerCase();
    const normalizedQuery = normalizeSubClientCode(subClientQuery);
    const isCodeLike = /^C\d{5}$/.test(normalizedQuery);
    const matches = uniqueSubClients.filter(
      (sc) =>
        sc.name.toLowerCase().includes(lower) ||
        sc.codice.toLowerCase().includes(lower) ||
        (isCodeLike && normalizeSubClientCode(sc.codice) === normalizedQuery),
    );
    if (!isCodeLike) return matches;
    return matches.sort((a, b) => {
      const aExact = normalizeSubClientCode(a.codice) === normalizedQuery ? 0 : 1;
      const bExact = normalizeSubClientCode(b.codice) === normalizedQuery ? 0 : 1;
      return aExact - bExact;
    });
  }, [subClientQuery, uniqueSubClients]);

  // Filtering pipeline (date filtering done by backend, no need to re-filter here)
  const filteredOrders = useMemo(() => {
    let result = allOrders;

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
    if (debouncedSearch && (!isBackendSearch || selectedSubClient)) {
      result = result.filter((o) =>
        matchesFresisGlobalSearch(o, debouncedSearch),
      );
    }
    return result;
  }, [allOrders, motherOrderFilter, selectedSubClient, debouncedSearch, isBackendSearch]);

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

  // Auto-select record when navigating via ?openRecord=<id> — only once
  useEffect(() => {
    if (!openRecordId || allOrders.length === 0 || autoSelectDoneRef.current) return;
    const record = allOrders.find((o) => o.id === openRecordId);
    if (record) {
      setSelectedOrder(record);
      autoSelectDoneRef.current = true;
    }
  }, [openRecordId, allOrders]);

  // Time preset handler
  const handleTimePreset = (preset: FresisTimePreset) => {
    setAllOrders([]);
    setActiveTimePreset(preset);
    const range = getDateRangeForPreset(preset);
    if (range) {
      setDateFrom(range.from);
      setDateTo(range.to);
    } else {
      setDateFrom("");
      setDateTo("");
    }
    setCanLoadMore(false);
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
    activeTimePreset !== null ||
    globalSearch !== "" ||
    docTypeFilter !== 'ft_only';

  const handleClearFilters = () => {
    handleClearSubClient();
    setAllOrders([]);
    setActiveTimePreset(null);
    const range = getDateRangeForPreset("thisMonth")!;
    setDateFrom(range.from);
    setDateTo(range.to);
    setGlobalSearch("");
    setCanLoadMore(true);
    setDocTypeFilter('ft_only');
  };

  // --- Order actions ---
  const isDraftInArchibald = (order: FresisHistoryOrder): boolean => {
    if (!order.archibaldOrderId) return false;
    if (order.currentState === "piazzato") return true;
    const numbers = parseLinkedIds(order.archibaldOrderNumber);
    return !numbers.some((n) => n.startsWith("ORD/"));
  };

  const handleDelete = async (id: string) => {
    const order = allOrders.find((o) => o.id === id);
    if (!order) return;

    try {
      if (isDraftInArchibald(order)) {
        setDeletingFromArchibald(id);
        const result = await deleteFromArchibald(id);
        setDeletingFromArchibald(null);
        trackOperation(id, result.jobId, order.customerName || id, 'Eliminazione da Archibald...');
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
    let documentNumber = order.invoiceNumber ?? order.id;
    let shippingCost: number | undefined = order.shippingCost ?? 0;
    let shippingTax: number | undefined = order.shippingTax ?? 0;
    let discountPercent: number | undefined = order.discountPercent ?? undefined;
    let documentDate: string | undefined;
    let paymentConditions: string | undefined;
    let transportCause: string | undefined;
    let aspectOfGoods: string | undefined;
    let portType: string | undefined;
    let packages: string | undefined;
    let grossWeight: number | undefined;
    let netWeight: number | undefined;
    let volume: number | undefined;
    let unitsOfMeasure: Record<string, string> | undefined;

    if (order.arcaData) {
      try {
        const arcaData = (typeof order.arcaData === "object"
          ? order.arcaData
          : JSON.parse(order.arcaData as unknown as string)) as { testata?: ArcaTestata; righe?: ArcaRiga[] };

        if (arcaData?.testata) {
          documentNumber = `${arcaData.testata.TIPODOC} ${arcaData.testata.NUMERODOC}/${arcaData.testata.ESERCIZIO}`;
          shippingCost = (arcaData.testata.SPESETR ?? 0) + (arcaData.testata.SPESEIM ?? 0) + (arcaData.testata.SPESEVA ?? 0);
          shippingTax = 0;
          // Override DB discount_percent with testata.SCONTIF (pre-computed factor).
          // SCONTI is a cascade string (e.g. "10+5"); parseFloat would only read the
          // first component. SCONTIF already encodes the full cascade as a multiplier.
          discountPercent = arcaData.testata.SCONTIF < 1
            ? (1 - arcaData.testata.SCONTIF) * 100
            : 0;
          if (arcaData.testata.DATADOC) documentDate = arcaData.testata.DATADOC;
          if (arcaData.testata.PAG) paymentConditions = arcaData.testata.PAG;
          if (arcaData.testata.TRCAUSALE) transportCause = arcaData.testata.TRCAUSALE;
          if (arcaData.testata.ASPBENI) aspectOfGoods = arcaData.testata.ASPBENI;
          if (arcaData.testata.PORTO) portType = arcaData.testata.PORTO;
          if (arcaData.testata.COLLI) packages = arcaData.testata.COLLI;
          if (arcaData.testata.PESOLORDO) grossWeight = arcaData.testata.PESOLORDO;
          if (arcaData.testata.PESONETTO) netWeight = arcaData.testata.PESONETTO;
          if (arcaData.testata.VOLUME) volume = arcaData.testata.VOLUME;
        } else {
          // No testata (e.g. KT orders): per-line discounts cover everything,
          // never apply DB discount_percent on top
          discountPercent = 0;
        }

        if (arcaData?.righe?.length) {
          unitsOfMeasure = Object.fromEntries(
            arcaData.righe.filter((r) => r.UNMISURA).map((r) => [r.CODICEARTI, r.UNMISURA])
          );
        }
      } catch { /* ignore */ }
    }

    const isKtOrder = documentNumber.startsWith("KT ");
    const pdfService = PDFExportService.getInstance();
    const doc = pdfService.generateOrderPDF({
      ...order,
      documentNumber,
      isKtOrder,
      shippingCost,
      shippingTax,
      discountPercent,
      documentDate,
      paymentConditions,
      transportCause,
      aspectOfGoods,
      portType,
      packages,
      grossWeight,
      netWeight,
      volume,
      unitsOfMeasure,
    });
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
            {filteredOrders.length !== allOrders.length &&
              ` di ${allOrders.length}`}
            {motherOrderFilter && " (filtro ordine madre)"}
          </span>
        </div>
        <div>
          <ArcaSyncButton onSyncComplete={(warnings) => {
            setDeletionWarnings(warnings ?? []);
            wsRefetch();
          }} />
        </div>
      </div>

      {/* Deletion warnings banner */}
      {deletionWarnings.length > 0 && (
        <div style={{
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: 4,
          padding: '10px 14px',
          marginBottom: 12,
        }}>
          <strong>⚠️ {deletionWarnings.length} documenti cancellati in Arca</strong>
          {' '}contengono dati PWA (tracking/DDT/consegna):
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            {deletionWarnings.map(w => (
              <li key={w.invoiceNumber} style={{ fontSize: 13 }}>
                <strong>{w.invoiceNumber}</strong>
                {w.hasTracking && <span style={{ color: '#856404' }}> · tracking</span>}
                {w.hasDdt && <span style={{ color: '#856404' }}> · DDT</span>}
                {w.hasDelivery && <span style={{ color: '#856404' }}> · consegna completata</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: "0",
          marginBottom: "12px",
          borderBottom: "2px solid #e0e0e0",
        }}
      >
        {(["documenti", "sottoclienti"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? "#7c3aed" : "#666",
              backgroundColor: "transparent",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid #7c3aed" : "2px solid transparent",
              marginBottom: "-2px",
              cursor: "pointer",
              transition: "color 0.2s, border-color 0.2s",
            }}
          >
            {tab === "documenti" ? "Documenti" : "Sottoclienti"}
          </button>
        ))}
      </div>

      {activeTab === "sottoclienti" && <SubclientsTab />}

      {activeTab === "documenti" && <>
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
                  type="search"
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
            <input autoComplete="off"
              type="search"
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
          {shouldBypassDates && (
            <span style={{ fontSize: "10px", color: "#1976d2", fontStyle: "italic", alignSelf: "center", marginLeft: "4px" }}>
              Ricerca su tutti i documenti
            </span>
          )}
          {hasActiveFilters && (
            <button onClick={handleClearFilters} style={clearFilterBtnStyle}>
              X Azzera filtri
            </button>
          )}
        </div>

        {/* Row 3: Tipo documento */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center", marginTop: "4px" }}>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "#555", textTransform: "uppercase" }}>
            Tipo doc:
          </span>
          {(
            [
              { id: 'all', label: 'Tutti' },
              { id: 'ft_only', label: 'Solo FT' },
              { id: 'kt_only', label: 'Solo KT' },
            ] as const
          ).map(({ id, label }) => {
            const isActive = docTypeFilter === id;
            const isKt = id === 'kt_only';
            return (
              <button
                key={id}
                onClick={() => setDocTypeFilter(id)}
                style={{
                  padding: "3px 10px",
                  fontSize: "11px",
                  fontWeight: isActive ? 700 : 400,
                  border: isActive
                    ? `1px solid ${isKt ? '#ff9800' : '#1976d2'}`
                    : "1px solid #ddd",
                  borderRadius: "12px",
                  backgroundColor: isActive
                    ? (isKt ? '#FFF3E0' : '#E3F2FD')
                    : "#fff",
                  color: isActive
                    ? (isKt ? '#e65100' : '#1976d2')
                    : "#666",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Custom date inputs */}
        {activeTimePreset === "custom" && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 150px" }}>
              <label style={filterLabelStyle}>Da</label>
              <input autoComplete="off"
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
              <input autoComplete="off"
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
      {!loading && allOrders.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", backgroundColor: "#fff", borderRadius: "8px" }}>
          <p style={{ fontSize: "16px", fontWeight: 600, color: "#333" }}>
            Nessun ordine archiviato
          </p>
        </div>
      )}

      {/* No results */}
      {!loading && allOrders.length > 0 && filteredOrders.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px", backgroundColor: "#fff", borderRadius: "8px" }}>
          <p style={{ fontSize: "14px", color: "#333" }}>
            Nessun ordine corrisponde ai filtri ({allOrders.length} totali)
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
            onScrollNearEnd={canLoadMore ? loadMoreMonths : undefined}
            docTypeFilter={docTypeFilter}
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
      </>}
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
