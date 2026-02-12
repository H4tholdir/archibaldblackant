import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { HighlightText } from "../components/HighlightText";
import { useSearchMatches } from "../hooks/useSearchMatches";
import type {
  FresisHistoryOrder,
  PendingOrderItem,
  SubClient,
  Product,
} from "../db/schema";
import { db } from "../db/schema";
import {
  fresisHistoryService,
  parseLinkedIds,
  serializeLinkedIds,
} from "../services/fresis-history.service";
import { productService } from "../services/products.service";
import { priceService } from "../services/prices.service";
import { CachePopulationService } from "../services/cache-population";
import { normalizeVatRate } from "../utils/vat-utils";
import { PDFExportService } from "../services/pdf-export.service";
import { SubClientSelector } from "../components/new-order-form/SubClientSelector";
import { AddItemToHistory } from "../components/new-order-form/AddItemToHistory";
import { useFresisHistorySync } from "../hooks/useFresisHistorySync";
import { ArcaImportModal } from "../components/ArcaImportModal";
import { JobProgressBar } from "../components/JobProgressBar";
import {
  FresisHistoryRealtimeService,
  type DeleteProgressState,
  type EditProgressState,
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
  computeOrderTotals,
  extractUniqueSubClients,
  groupFresisOrdersByPeriod,
} from "../utils/fresisHistoryFilters";

const STATE_BADGE_CONFIG: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  piazzato: { label: "Piazzato", bg: "#e5e7eb", color: "#374151" },
  inviato_milano: {
    label: "Inviato a Verona",
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

const VISIBLE_BATCH_SIZE = 50;

const TIME_PRESETS: { id: FresisTimePreset; label: string }[] = [
  { id: "today", label: "Oggi" },
  { id: "thisWeek", label: "Questa sett." },
  { id: "thisMonth", label: "Questo mese" },
  { id: "last3Months", label: "Ultimi 3 mesi" },
  { id: "thisYear", label: "Quest'anno" },
  { id: "custom", label: "Personalizzato" },
];

const formatDateDisplay = (iso: string) => {
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

export function FresisHistoryPage() {
  const { historyOrders: wsOrders, refetch: wsRefetch } =
    useFresisHistorySync();

  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingFromArchibald, setDeletingFromArchibald] = useState<
    string | null
  >(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] =
    useState<DeleteProgressState | null>(null);
  const [editingInArchibald, setEditingInArchibald] = useState<string | null>(
    null,
  );
  const [editProgress, setEditProgress] = useState<EditProgressState | null>(
    null,
  );

  useEffect(() => {
    if (!deletingFromArchibald) return;
    const realtimeService = FresisHistoryRealtimeService.getInstance();
    const unsubscribe = realtimeService.onDeleteProgress(() => {
      const progress = realtimeService.getDeleteProgress(deletingFromArchibald);
      if (progress) setDeleteProgress({ ...progress });
    });
    return () => {
      unsubscribe();
      realtimeService.clearDeleteProgress(deletingFromArchibald);
      setDeleteProgress(null);
    };
  }, [deletingFromArchibald]);

  useEffect(() => {
    if (!editingInArchibald) return;
    const realtimeService = FresisHistoryRealtimeService.getInstance();
    const unsubscribe = realtimeService.onEditProgress(() => {
      const progress = realtimeService.getEditProgress(editingInArchibald);
      if (progress) setEditProgress({ ...progress });
    });
    return () => {
      unsubscribe();
      realtimeService.clearEditProgress(editingInArchibald);
      setEditProgress(null);
    };
  }, [editingInArchibald]);

  const [editState, setEditState] = useState<EditState | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [linkingOrderId, setLinkingOrderId] = useState<string | null>(null);

  // Inline article editing
  const [editingArticleIdx, setEditingArticleIdx] = useState<number | null>(
    null,
  );
  const [articleSearch, setArticleSearch] = useState("");
  const [articleResults, setArticleResults] = useState<Product[]>([]);
  const [searchingArticle, setSearchingArticle] = useState(false);
  const [highlightedArticleIdx, setHighlightedArticleIdx] = useState(-1);
  const articleDropdownRef = useRef<HTMLDivElement>(null);

  // Qty packaging validation
  const [qtyValidation, setQtyValidation] = useState<
    Map<number, string | null>
  >(new Map());

  // Product sync check
  const [syncingProducts, setSyncingProducts] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    orderId: string;
    modifications: Array<
      | {
          type: "update";
          rowIndex: number;
          articleCode: string;
          quantity: number;
          discount?: number;
        }
      | {
          type: "add";
          articleCode: string;
          quantity: number;
          discount?: number;
        }
      | { type: "delete"; rowIndex: number }
    >;
    originalItems: PendingOrderItem[];
  } | null>(null);

  // Filter state
  const [activeTimePreset, setActiveTimePreset] =
    useState<FresisTimePreset>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Sub-client search state
  const [subClientQuery, setSubClientQuery] = useState("");
  const [selectedSubClient, setSelectedSubClient] =
    useState<UniqueSubClient | null>(null);
  const [showSubClientDropdown, setShowSubClientDropdown] = useState(false);
  const [highlightedSubClientIndex, setHighlightedSubClientIndex] =
    useState(-1);
  const subClientDropdownRef = useRef<HTMLDivElement>(null);

  // Infinite scroll
  const [visibleCount, setVisibleCount] = useState(VISIBLE_BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Scroll to top
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // Search highlight navigation
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const { currentIndex, totalMatches, goNext, goPrev } = useSearchMatches(
    resultsContainerRef,
    debouncedSearch,
  );

  // Debounce global search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(globalSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  // Loading state from ws
  useEffect(() => {
    if (wsOrders.length > 0 || !loading) {
      setLoading(false);
    }
  }, [wsOrders, loading]);

  // Mark loaded after first ws event
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Scroll listener
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
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
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedSubClientIndex]);

  // Article search debounce
  useEffect(() => {
    if (editingArticleIdx === null) return;
    if (articleSearch.length < 2) {
      setArticleResults([]);
      return;
    }

    setSearchingArticle(true);
    const timer = setTimeout(async () => {
      try {
        const results = await productService.searchProducts(articleSearch, 50);
        const seen = new Set<string>();
        const deduped: Product[] = [];
        for (const r of results) {
          if (!seen.has(r.name)) {
            seen.add(r.name);
            deduped.push(r);
          }
          if (deduped.length >= 10) break;
        }
        setArticleResults(deduped);
        setHighlightedArticleIdx(-1);
      } catch {
        setArticleResults([]);
      } finally {
        setSearchingArticle(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [articleSearch, editingArticleIdx]);

  // Click outside article dropdown
  useEffect(() => {
    if (editingArticleIdx === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        articleDropdownRef.current &&
        !articleDropdownRef.current.contains(e.target as Node)
      ) {
        setEditingArticleIdx(null);
        setArticleResults([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editingArticleIdx]);

  // Scroll highlighted article into view
  useEffect(() => {
    if (highlightedArticleIdx < 0) return;
    const dropdown = articleDropdownRef.current;
    if (!dropdown) return;
    const items = dropdown.querySelectorAll("[data-article-item]");
    const item = items[highlightedArticleIdx] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedArticleIdx]);

  // Extract unique sub-clients from all orders (memoized)
  const uniqueSubClients = useMemo(
    () => extractUniqueSubClients(wsOrders),
    [wsOrders],
  );

  // Sub-client autocomplete results
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

    // 1. Filter by sub-client
    if (selectedSubClient) {
      result = filterBySubClient(result, selectedSubClient.codice);
    }

    // 2. Filter by date range
    if (dateFrom || dateTo) {
      result = filterByDateRange(result, dateFrom, dateTo);
    }

    // 3. Filter by global search
    if (debouncedSearch) {
      result = result.filter((o) =>
        matchesFresisGlobalSearch(o, debouncedSearch),
      );
    }

    return result;
  }, [wsOrders, selectedSubClient, dateFrom, dateTo, debouncedSearch]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(VISIBLE_BATCH_SIZE);
  }, [selectedSubClient, dateFrom, dateTo, debouncedSearch]);

  // Visible orders (infinite scroll slice)
  const visibleOrders = useMemo(
    () => filteredOrders.slice(0, visibleCount),
    [filteredOrders, visibleCount],
  );

  // Grouped by period
  const orderGroups = useMemo(
    () => groupFresisOrdersByPeriod(visibleOrders),
    [visibleOrders],
  );

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filteredOrders.length) {
          setVisibleCount((prev) =>
            Math.min(prev + VISIBLE_BATCH_SIZE, filteredOrders.length),
          );
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, filteredOrders.length]);

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

  const handleSubClientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

  const isDraftInArchibald = (order: FresisHistoryOrder): boolean => {
    if (!order.archibaldOrderId) return false;
    if (order.currentState === "piazzato") return true;
    // If it has an archibald number starting with ORD/ it was sent to Verona
    const numbers = parseLinkedIds(order.archibaldOrderNumber);
    const hasSentNumber = numbers.some((n) => n.startsWith("ORD/"));
    return !hasSentNumber;
  };

  const handleDelete = async (id: string) => {
    const order = wsOrders.find((o) => o.id === id);
    if (!order) return;

    try {
      if (isDraftInArchibald(order)) {
        setDeletingFromArchibald(id);
        const result = await fresisHistoryService.deleteFromArchibald(id);
        setDeletingFromArchibald(null);
        if (!result.success) {
          alert(`Errore cancellazione da Archibald: ${result.message}`);
          return;
        }
      } else {
        await fresisHistoryService.deleteHistoryOrder(id);
      }
      setDeleteConfirmId(null);
      await wsRefetch();
    } catch (err) {
      console.error("[FresisHistoryPage] Delete failed:", err);
      setDeletingFromArchibald(null);
    }
  };

  const handleStartEdit = async (order: FresisHistoryOrder) => {
    // Check product cache
    const productCount = await db.products.count();
    if (productCount === 0) {
      setSyncingProducts(true);
      setSyncProgress("Sincronizzazione prodotti in corso...");
      try {
        const jwt = localStorage.getItem("jwt") || "";
        const syncResult =
          await CachePopulationService.getInstance().populateCache(jwt, (p) => {
            setSyncProgress(p.message);
          });
        if (!syncResult.success) {
          alert(
            `Sincronizzazione prodotti fallita: ${syncResult.error || "errore sconosciuto"}. La ricerca articoli potrebbe non funzionare.`,
          );
        }
      } catch (err) {
        console.error("[FresisHistoryPage] Product sync failed:", err);
        alert(
          "Sincronizzazione prodotti fallita. La ricerca articoli potrebbe non funzionare.",
        );
      } finally {
        setSyncingProducts(false);
      }
    }

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
    setQtyValidation(new Map());
    setExpandedOrderId(order.id);

    setTimeout(() => {
      document
        .getElementById(`order-${order.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleCancelEdit = () => {
    setEditState(null);
    setAddingProduct(false);
    setEditingArticleIdx(null);
    setArticleResults([]);
    setQtyValidation(new Map());
  };

  const computeOrderModifications = (
    originalItems: PendingOrderItem[],
    editedItems: PendingOrderItem[],
  ): Array<
    | {
        type: "update";
        rowIndex: number;
        articleCode: string;
        quantity: number;
        discount?: number;
      }
    | { type: "add"; articleCode: string; quantity: number; discount?: number }
    | { type: "delete"; rowIndex: number }
  > => {
    const mods: Array<
      | {
          type: "update";
          rowIndex: number;
          articleCode: string;
          quantity: number;
          discount?: number;
        }
      | {
          type: "add";
          articleCode: string;
          quantity: number;
          discount?: number;
        }
      | { type: "delete"; rowIndex: number }
    > = [];

    const maxOriginal = originalItems.length;

    // Check existing rows for updates
    for (let i = 0; i < Math.min(maxOriginal, editedItems.length); i++) {
      const orig = originalItems[i];
      const edited = editedItems[i];
      if (
        orig.articleCode !== edited.articleCode ||
        orig.quantity !== edited.quantity ||
        (orig.discount ?? 0) !== (edited.discount ?? 0)
      ) {
        mods.push({
          type: "update",
          rowIndex: i,
          articleCode: edited.articleCode,
          quantity: edited.quantity,
          discount: edited.discount,
        });
      }
    }

    // New rows (added items)
    for (let i = maxOriginal; i < editedItems.length; i++) {
      mods.push({
        type: "add",
        articleCode: editedItems[i].articleCode,
        quantity: editedItems[i].quantity,
        discount: editedItems[i].discount,
      });
    }

    // Deleted rows (original rows beyond edited length)
    for (let i = editedItems.length; i < maxOriginal; i++) {
      mods.push({
        type: "delete",
        rowIndex: i,
      });
    }

    return mods;
  };

  const handleSaveEdit = async () => {
    if (!editState) return;
    if (editState.items.length === 0) return;
    const hasInvalidQty = editState.items.some(
      (item) => !item.quantity || item.quantity <= 0,
    );
    if (hasInvalidQty) return;

    const order = wsOrders.find((o) => o.id === editState.orderId);

    try {
      // If this is a draft in Archibald, show confirm modal first
      if (order && isDraftInArchibald(order)) {
        const modifications = computeOrderModifications(
          order.items,
          editState.items,
        );

        if (modifications.length > 0) {
          setConfirmModal({
            orderId: editState.orderId,
            modifications,
            originalItems: order.items,
          });
          return;
        } else {
          // Only local changes (notes, subclient, etc.)
          await fresisHistoryService.updateHistoryOrder(editState.orderId, {
            items: editState.items,
            discountPercent: editState.discountPercent,
            notes: editState.notes || undefined,
            subClientCodice: editState.subClientCodice,
            subClientName: editState.subClientName,
            subClientData: editState.subClientData ?? undefined,
          });
        }
      } else {
        await fresisHistoryService.updateHistoryOrder(editState.orderId, {
          items: editState.items,
          discountPercent: editState.discountPercent,
          notes: editState.notes || undefined,
          subClientCodice: editState.subClientCodice,
          subClientName: editState.subClientName,
          subClientData: editState.subClientData ?? undefined,
        });
      }
      setEditState(null);
      setAddingProduct(false);
      setQtyValidation(new Map());
      await wsRefetch();
    } catch (err) {
      console.error("[FresisHistoryPage] Save edit failed:", err);
      setEditingInArchibald(null);
    }
  };

  const handleConfirmEdit = async () => {
    if (!confirmModal || !editState) return;
    setConfirmModal(null);
    setEditingInArchibald(editState.orderId);

    try {
      const result = await fresisHistoryService.editInArchibald(
        editState.orderId,
        confirmModal.modifications,
        editState.items,
      );
      setEditingInArchibald(null);

      if (!result.success) {
        alert(`Errore modifica su Archibald: ${result.message}`);
        return;
      }

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
      setQtyValidation(new Map());
      await wsRefetch();
    } catch (err) {
      console.error("[FresisHistoryPage] Confirm edit failed:", err);
      setEditingInArchibald(null);
    }
  };

  const handleEditItemQty = (idx: number, qty: number) => {
    if (!editState) return;
    const newItems = [...editState.items];
    newItems[idx] = { ...newItems[idx], quantity: qty };
    setEditState({ ...editState, items: newItems });
    // Debounced packaging validation
    const productName = newItems[idx].productName || "";
    if (productName && qty > 0) {
      validateQtyPackaging(idx, qty, productName);
    }
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
    // Re-index validation map after removal
    setQtyValidation((prev) => {
      const next = new Map<number, string | null>();
      for (const [key, val] of prev) {
        if (key < idx) next.set(key, val);
        else if (key > idx) next.set(key - 1, val);
      }
      return next;
    });
  };

  const handleEditItemDiscount = (idx: number, discount: number) => {
    if (!editState) return;
    const clamped = Math.min(100, Math.max(0, discount));
    const newItems = [...editState.items];
    newItems[idx] = { ...newItems[idx], discount: clamped };
    setEditState({ ...editState, items: newItems });
  };

  const handleEditItemArticle = async (idx: number, product: Product) => {
    if (!editState) return;
    const item = editState.items[idx];

    // Find optimal variant for current quantity
    const packagingResult = await productService.calculateOptimalPackaging(
      product.name,
      item.quantity,
    );

    let variantId = product.id;
    if (
      packagingResult.success &&
      packagingResult.breakdown &&
      packagingResult.breakdown.length > 0
    ) {
      variantId = packagingResult.breakdown[0].variant.variantId || product.id;
    }

    // Load price and VAT for the variant
    const priceData = await priceService.getPriceAndVat(variantId);
    const newPrice = priceData?.price ?? item.price;
    const newVat = normalizeVatRate(priceData?.vat);

    const newItems = [...editState.items];
    newItems[idx] = {
      ...newItems[idx],
      articleCode: variantId,
      articleId: variantId,
      productName: product.name,
      description: product.description || "",
      price: newPrice,
      vat: newVat,
    };
    setEditState({ ...editState, items: newItems });

    // Close dropdown
    setEditingArticleIdx(null);
    setArticleSearch("");
    setArticleResults([]);

    // Re-validate packaging for this idx
    validateQtyPackaging(idx, item.quantity, product.name);
  };

  const validateQtyPackaging = useCallback(
    async (idx: number, qty: number, productName: string) => {
      if (!qty || qty <= 0 || !productName) return;
      try {
        const result = await productService.calculateOptimalPackaging(
          productName,
          qty,
        );
        setQtyValidation((prev) => {
          const next = new Map(prev);
          next.set(
            idx,
            result.success
              ? null
              : (result.error ?? "Confezionamento non valido"),
          );
          return next;
        });
      } catch {
        setQtyValidation((prev) => {
          const next = new Map(prev);
          next.set(idx, null);
          return next;
        });
      }
    },
    [],
  );

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
    archibaldOrders: Array<{ id: string; orderNumber: string }>,
  ) => {
    try {
      const ids = archibaldOrders.map((o) => o.id);
      const numbers = archibaldOrders.map((o) => o.orderNumber);
      await fresisHistoryService.updateHistoryOrder(historyId, {
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
    try {
      await fresisHistoryService.updateHistoryOrder(historyId, {
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

  const isEditingOrder = (orderId: string) => editState?.orderId === orderId;

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "24px",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#333",
              marginBottom: "8px",
            }}
          >
            Storico Fresis
          </h1>
          <p style={{ fontSize: "16px", color: "#666" }}>
            Consulta lo storico ordini Fresis e il loro stato
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => alert("Funzionalita' in arrivo")}
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 600,
              backgroundColor: "#fff",
              color: "#333",
              border: "1px solid #ddd",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Report
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 600,
              backgroundColor: "#fff",
              color: "#333",
              border: "1px solid #ddd",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Importa da Arca
          </button>
          <button
            onClick={handleSyncLifecycles}
            disabled={syncing}
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 600,
              backgroundColor: syncing ? "#93c5fd" : "#1976d2",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: syncing ? "default" : "pointer",
            }}
          >
            {syncing ? "Aggiornamento..." : "Aggiorna Stati"}
          </button>
          {syncMessage && (
            <span
              style={{
                fontSize: "13px",
                color: "#666",
                alignSelf: "center",
              }}
            >
              {syncMessage}
            </span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        }}
      >
        {/* Row 1: Sub-client search + Global search */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          {/* Sub-client search */}
          <div
            ref={subClientDropdownRef}
            style={{
              flex: "1 1 45%",
              minWidth: "250px",
              position: "relative",
            }}
          >
            <label
              htmlFor="subclient-search"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "8px",
              }}
            >
              Sotto-cliente
            </label>
            {selectedSubClient ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  backgroundColor: "#E8F5E9",
                  border: "1px solid #4CAF50",
                  borderRadius: "8px",
                }}
              >
                <span style={{ fontWeight: 600, color: "#2E7D32", flex: 1 }}>
                  {selectedSubClient.name}
                </span>
                <span style={{ color: "#666", fontSize: "12px" }}>
                  {selectedSubClient.codice}
                </span>
                <button
                  onClick={handleClearSubClient}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "16px",
                    color: "#666",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#C8E6C9";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {"\u2715"}
                </button>
              </div>
            ) : (
              <>
                <input
                  id="subclient-search"
                  type="text"
                  placeholder="Cerca sotto-cliente per nome o codice..."
                  value={subClientQuery}
                  onChange={(e) => {
                    setSubClientQuery(e.target.value);
                    setHighlightedSubClientIndex(-1);
                    if (e.target.value.length >= 2) {
                      setShowSubClientDropdown(true);
                    } else {
                      setShowSubClientDropdown(false);
                    }
                  }}
                  onKeyDown={handleSubClientKeyDown}
                  onFocus={() => {
                    if (subClientResults.length > 0)
                      setShowSubClientDropdown(true);
                  }}
                  autoComplete="off"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                {showSubClientDropdown && subClientResults.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      backgroundColor: "#fff",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      maxHeight: "300px",
                      overflowY: "auto",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    }}
                  >
                    {subClientResults.map((sc, index) => (
                      <div
                        key={sc.codice}
                        data-subclient-item
                        onClick={() => handleSelectSubClient(sc)}
                        onMouseEnter={() => setHighlightedSubClientIndex(index)}
                        style={{
                          padding: "10px 12px",
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
                          alignItems: "baseline",
                        }}
                      >
                        <strong style={{ fontSize: "14px" }}>{sc.name}</strong>
                        <span
                          style={{
                            marginLeft: "8px",
                            color: "#6b7280",
                            fontSize: "12px",
                            flexShrink: 0,
                          }}
                        >
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
          <div style={{ flex: "1 1 45%", minWidth: "250px" }}>
            <label
              htmlFor="global-search"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "8px",
              }}
            >
              Ricerca globale
            </label>
            <input
              id="global-search"
              type="text"
              placeholder="Cerca negli ordini filtrati..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "14px",
                border: "1px solid #ddd",
                borderRadius: "8px",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#1976d2";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#ddd";
              }}
            />
            <div
              style={{
                fontSize: "11px",
                color: "#999",
                marginTop: "4px",
              }}
            >
              Cerca per sotto-cliente, articolo, codice, DDT, fattura...
            </div>
          </div>
        </div>

        {/* Row 2: Time presets */}
        <div style={{ marginBottom: "12px" }}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              color: "#333",
              marginBottom: "8px",
            }}
          >
            Periodo
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {TIME_PRESETS.map((preset) => {
              const isActive = activeTimePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleTimePreset(preset.id)}
                  style={{
                    padding: "6px 14px",
                    fontSize: "13px",
                    fontWeight: 500,
                    border: isActive ? "1px solid #1976d2" : "1px solid #ddd",
                    borderRadius: "20px",
                    backgroundColor: isActive ? "#E3F2FD" : "#fff",
                    color: isActive ? "#1976d2" : "#666",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "#f5f5f5";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "#fff";
                    }
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 3: Custom date inputs */}
        {activeTimePreset === "custom" && (
          <div
            style={{
              display: "flex",
              gap: "16px",
              marginBottom: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 200px", minWidth: "150px" }}>
              <label
                htmlFor="date-from"
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#333",
                  marginBottom: "6px",
                }}
              >
                Da
              </label>
              <input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActiveTimePreset("custom");
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "14px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ flex: "1 1 200px", minWidth: "150px" }}>
              <label
                htmlFor="date-to"
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#333",
                  marginBottom: "6px",
                }}
              >
                A
              </label>
              <input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActiveTimePreset("custom");
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "14px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        )}

        {/* Clear filters */}
        {hasActiveFilters && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleClearFilters}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 600,
                border: "1px solid #f44336",
                borderRadius: "8px",
                backgroundColor: "#fff",
                color: "#f44336",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f44336";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#fff";
                e.currentTarget.style.color = "#f44336";
              }}
            >
              {"\u2715"} Cancella tutti i filtri
            </button>
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              marginBottom: "16px",
              animation: "spin 1s linear infinite",
            }}
          >
            {"\u23f3"}
          </div>
          <p style={{ fontSize: "16px", color: "#666" }}>
            Caricamento ordini...
          </p>
          <style>
            {`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}
          </style>
        </div>
      )}

      {/* Empty state */}
      {!loading && wsOrders.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>
            {"\ud83d\udced"}
          </div>
          <p
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#333",
              marginBottom: "8px",
            }}
          >
            Nessun ordine archiviato
          </p>
          <p style={{ fontSize: "14px", color: "#666" }}>
            Gli ordini compariranno qui quando saranno archiviati
          </p>
        </div>
      )}

      {/* No results after filtering */}
      {!loading && wsOrders.length > 0 && filteredOrders.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>
            {"\ud83d\udd0d"}
          </div>
          <p
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "#333",
              marginBottom: "8px",
            }}
          >
            Nessun ordine corrisponde ai filtri
          </p>
          <p
            style={{
              fontSize: "14px",
              color: "#666",
              marginBottom: "16px",
            }}
          >
            {wsOrders.length} ordini totali, nessuno corrisponde ai filtri
            attivi
          </p>
          <button
            onClick={handleClearFilters}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              backgroundColor: "#1976d2",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Cancella filtri
          </button>
        </div>
      )}

      {/* Orders list */}
      {!loading && filteredOrders.length > 0 && (
        <div>
          {/* Results summary */}
          <div
            style={{
              fontSize: "13px",
              color: "#888",
              marginBottom: "12px",
            }}
          >
            Visualizzati {visibleOrders.length} di {filteredOrders.length}{" "}
            ordini
            {filteredOrders.length !== wsOrders.length &&
              ` (${wsOrders.length} totali)`}
          </div>

          {/* Search navigation bar */}
          {debouncedSearch && totalMatches > 0 && (
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "8px 16px",
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                marginBottom: "12px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              <button
                onClick={goPrev}
                style={{
                  padding: "4px 10px",
                  fontSize: "14px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                }}
              >
                {"\u25C0"}
              </button>
              <span
                style={{ fontSize: "13px", fontWeight: 500, color: "#333" }}
              >
                Risultato {currentIndex + 1} di {totalMatches}
              </span>
              <button
                onClick={goNext}
                style={{
                  padding: "4px 10px",
                  fontSize: "14px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                }}
              >
                {"\u25B6"}
              </button>
              <span
                style={{
                  fontSize: "12px",
                  color: "#888",
                  borderLeft: "1px solid #e5e7eb",
                  paddingLeft: "12px",
                }}
              >
                &quot;{debouncedSearch}&quot; in {filteredOrders.length} ordini
              </span>
            </div>
          )}

          <div ref={resultsContainerRef}>
            {orderGroups.map((group) => (
              <div key={group.period} style={{ marginBottom: "32px" }}>
                <h2
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: "16px",
                    paddingLeft: "4px",
                  }}
                >
                  {group.period}
                </h2>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {group.orders.map((order) => {
                    const isExpanded = debouncedSearch
                      ? true
                      : expandedOrderId === order.id;
                    const editing = isEditingOrder(order.id);
                    const isDeleting = deleteConfirmId === order.id;
                    const displayItems = editing
                      ? editState!.items
                      : order.items;
                    const discountPercent = editing
                      ? editState!.discountPercent
                      : (order.discountPercent ?? 0);
                    const hasRowDiscounts = displayItems.some(
                      (item) => item.discount && item.discount > 0,
                    );
                    const { totalItems, totalGross, totalNet } =
                      computeOrderTotals(displayItems, 0);
                    const badge = getStateBadge(order);

                    const liveDocTotal =
                      totalNet * (1 - discountPercent / 100) +
                      (order.shippingCost ?? 0) +
                      (order.shippingTax ?? 0);

                    return (
                      <div
                        key={order.id}
                        id={`order-${order.id}`}
                        style={{
                          border: editing
                            ? "2px solid #f59e0b"
                            : "1px solid #e5e7eb",
                          borderRadius: "12px",
                          overflow: "hidden",
                          background: "#fff",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                          contentVisibility: "auto",
                        }}
                      >
                        {/* Header */}
                        <div
                          onClick={() =>
                            !editing &&
                            !debouncedSearch &&
                            setExpandedOrderId(isExpanded ? null : order.id)
                          }
                          style={{
                            padding: "12px 16px",
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
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 600,
                                  fontSize: "15px",
                                  color: "#333",
                                }}
                              >
                                <HighlightText
                                  text={
                                    editing
                                      ? editState!.subClientName
                                      : order.subClientName
                                  }
                                  query={debouncedSearch}
                                />
                              </span>
                              <span
                                style={{
                                  fontSize: "11px",
                                  padding: "2px 8px",
                                  borderRadius: "9999px",
                                  background: badge.bg,
                                  color: badge.color,
                                  fontWeight: 500,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {badge.label}
                              </span>
                              {editing && (
                                <span
                                  style={{
                                    fontSize: "11px",
                                    padding: "2px 8px",
                                    borderRadius: "9999px",
                                    background: "#fef3c7",
                                    color: "#92400e",
                                    fontWeight: 600,
                                  }}
                                >
                                  In modifica
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: "13px",
                                color: "#666",
                                marginTop: "4px",
                              }}
                            >
                              Cod:{" "}
                              <HighlightText
                                text={
                                  editing
                                    ? editState!.subClientCodice
                                    : order.subClientCodice
                                }
                                query={debouncedSearch}
                              />{" "}
                              | {totalItems} articoli |{" "}
                              {formatCurrency(
                                hasRowDiscounts ? totalNet : totalGross,
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#999",
                                marginTop: "2px",
                              }}
                            >
                              {formatDateDisplay(order.createdAt)}
                              {order.mergedAt &&
                                ` | Unito: ${formatDateDisplay(order.mergedAt)}`}
                            </div>
                          </div>
                          {!editing && (
                            <div
                              style={{
                                fontSize: "18px",
                                color: "#999",
                                flexShrink: 0,
                              }}
                            >
                              {isExpanded ? "\u25B2" : "\u25BC"}
                            </div>
                          )}
                        </div>

                        {/* Expanded details */}
                        {(isExpanded || editing) && (
                          <div
                            style={{
                              padding: "12px 16px",
                              borderTop: "1px solid #e5e7eb",
                            }}
                          >
                            {/* Sub-client: editable in edit mode */}
                            {editing ? (
                              <div style={{ marginBottom: "12px" }}>
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
                                    marginBottom: "12px",
                                    padding: "8px 12px",
                                    background: "#f9fafb",
                                    borderRadius: "8px",
                                    fontSize: "13px",
                                    color: "#374151",
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

                            {/* Lifecycle section */}
                            {!editing &&
                              order.archibaldOrderId &&
                              (() => {
                                const linkedNumbers = parseLinkedIds(
                                  order.archibaldOrderNumber,
                                );
                                return (
                                  <div
                                    style={{
                                      marginBottom: "12px",
                                      padding: "8px 12px",
                                      background: "#f0f9ff",
                                      borderRadius: "8px",
                                      border: "1px solid #bae6fd",
                                      fontSize: "13px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontWeight: 600,
                                        marginBottom: "4px",
                                      }}
                                    >
                                      {linkedNumbers.length > 1
                                        ? `Ordini Archibald (${linkedNumbers.length})`
                                        : "Ordine Archibald"}
                                    </div>
                                    <div>
                                      {linkedNumbers.map((num, i) => (
                                        <span key={i}>
                                          {i > 0 && ", "}
                                          N.{" "}
                                          <HighlightText
                                            text={num}
                                            query={debouncedSearch}
                                          />
                                        </span>
                                      ))}
                                      {order.currentState && (
                                        <span
                                          style={{
                                            marginLeft: "8px",
                                            fontSize: "11px",
                                            padding: "1px 6px",
                                            borderRadius: "9999px",
                                            background: badge.bg,
                                            color: badge.color,
                                            fontWeight: 500,
                                          }}
                                        >
                                          {badge.label}
                                        </span>
                                      )}
                                    </div>

                                    {order.ddtNumber && (
                                      <div style={{ marginTop: "6px" }}>
                                        <strong>DDT:</strong>{" "}
                                        <HighlightText
                                          text={order.ddtNumber}
                                          query={debouncedSearch}
                                        />
                                        {order.ddtDeliveryDate &&
                                          ` | Consegna prevista: ${formatDateDisplay(order.ddtDeliveryDate)}`}
                                        {order.trackingNumber && (
                                          <div>
                                            <strong>Tracking:</strong>{" "}
                                            {order.trackingUrl ? (
                                              <a
                                                href={order.trackingUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                  color: "#2563eb",
                                                }}
                                              >
                                                <HighlightText
                                                  text={order.trackingNumber}
                                                  query={debouncedSearch}
                                                />
                                              </a>
                                            ) : (
                                              <HighlightText
                                                text={order.trackingNumber}
                                                query={debouncedSearch}
                                              />
                                            )}
                                            {order.trackingCourier &&
                                              ` (${order.trackingCourier})`}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {order.invoiceNumber && (
                                      <div style={{ marginTop: "6px" }}>
                                        <strong>Fattura:</strong>{" "}
                                        <HighlightText
                                          text={order.invoiceNumber}
                                          query={debouncedSearch}
                                        />
                                        {order.invoiceDate &&
                                          ` del ${formatDateDisplay(order.invoiceDate)}`}
                                        {order.invoiceAmount && (
                                          <>
                                            {" - "}
                                            <HighlightText
                                              text={order.invoiceAmount}
                                              query={debouncedSearch}
                                            />
                                          </>
                                        )}
                                      </div>
                                    )}

                                    {order.deliveryCompletedDate && (
                                      <div
                                        style={{
                                          marginTop: "6px",
                                          color: "#166534",
                                        }}
                                      >
                                        Consegnato il{" "}
                                        {formatDateDisplay(
                                          order.deliveryCompletedDate,
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                            {/* Items table */}
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                fontSize: "13px",
                                marginBottom: "12px",
                              }}
                            >
                              <thead>
                                <tr
                                  style={{
                                    borderBottom: "2px solid #e5e7eb",
                                    textAlign: "left",
                                  }}
                                >
                                  <th style={{ padding: "6px 4px" }}>Codice</th>
                                  <th style={{ padding: "6px 4px" }}>
                                    Descrizione
                                  </th>
                                  <th
                                    style={{
                                      padding: "6px 4px",
                                      textAlign: "right",
                                    }}
                                  >
                                    {"Qta'"}
                                  </th>
                                  <th
                                    style={{
                                      padding: "6px 4px",
                                      textAlign: "right",
                                    }}
                                  >
                                    Prezzo
                                  </th>
                                  {(editing || hasRowDiscounts) && (
                                    <th
                                      style={{
                                        padding: "6px 4px",
                                        textAlign: "right",
                                      }}
                                    >
                                      Sc.%
                                    </th>
                                  )}
                                  <th
                                    style={{
                                      padding: "6px 4px",
                                      textAlign: "right",
                                    }}
                                  >
                                    Totale
                                  </th>
                                  {editing && (
                                    <th
                                      style={{
                                        padding: "6px 4px",
                                        textAlign: "center",
                                        width: "40px",
                                      }}
                                    />
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {displayItems.map((item, idx) => (
                                  <tr
                                    key={idx}
                                    style={{
                                      borderBottom: "1px solid #f3f4f6",
                                    }}
                                  >
                                    <td
                                      style={{
                                        padding: "6px 4px",
                                        position: "relative",
                                      }}
                                    >
                                      {editing && editingArticleIdx === idx ? (
                                        <div
                                          ref={articleDropdownRef}
                                          style={{ position: "relative" }}
                                        >
                                          <input
                                            type="text"
                                            value={articleSearch}
                                            onChange={(e) =>
                                              setArticleSearch(e.target.value)
                                            }
                                            onKeyDown={(e) => {
                                              if (e.key === "ArrowDown") {
                                                e.preventDefault();
                                                setHighlightedArticleIdx(
                                                  (prev) =>
                                                    Math.min(
                                                      prev + 1,
                                                      articleResults.length - 1,
                                                    ),
                                                );
                                              } else if (e.key === "ArrowUp") {
                                                e.preventDefault();
                                                setHighlightedArticleIdx(
                                                  (prev) =>
                                                    Math.max(prev - 1, 0),
                                                );
                                              } else if (
                                                e.key === "Enter" &&
                                                highlightedArticleIdx >= 0
                                              ) {
                                                e.preventDefault();
                                                handleEditItemArticle(
                                                  idx,
                                                  articleResults[
                                                    highlightedArticleIdx
                                                  ],
                                                );
                                              } else if (e.key === "Escape") {
                                                setEditingArticleIdx(null);
                                                setArticleResults([]);
                                              }
                                            }}
                                            autoFocus
                                            style={{
                                              width: "100%",
                                              padding: "4px",
                                              border: "1px solid #3b82f6",
                                              borderRadius: "4px",
                                              fontSize: "13px",
                                              boxSizing: "border-box",
                                            }}
                                            placeholder="Cerca articolo..."
                                          />
                                          {(articleResults.length > 0 ||
                                            searchingArticle) && (
                                            <div
                                              style={{
                                                position: "absolute",
                                                top: "100%",
                                                left: 0,
                                                right: 0,
                                                background: "white",
                                                border: "1px solid #d1d5db",
                                                borderRadius: "6px",
                                                boxShadow:
                                                  "0 4px 12px rgba(0,0,0,0.15)",
                                                zIndex: 1000,
                                                maxHeight: "200px",
                                                overflowY: "auto",
                                              }}
                                            >
                                              {searchingArticle && (
                                                <div
                                                  style={{
                                                    padding: "8px",
                                                    color: "#9ca3af",
                                                    fontSize: "12px",
                                                  }}
                                                >
                                                  Ricerca...
                                                </div>
                                              )}
                                              {articleResults.map(
                                                (product, pIdx) => (
                                                  <div
                                                    key={product.id}
                                                    data-article-item
                                                    onClick={() =>
                                                      handleEditItemArticle(
                                                        idx,
                                                        product,
                                                      )
                                                    }
                                                    style={{
                                                      padding: "6px 8px",
                                                      cursor: "pointer",
                                                      fontSize: "12px",
                                                      background:
                                                        pIdx ===
                                                        highlightedArticleIdx
                                                          ? "#eff6ff"
                                                          : "white",
                                                      borderBottom:
                                                        pIdx <
                                                        articleResults.length -
                                                          1
                                                          ? "1px solid #f3f4f6"
                                                          : "none",
                                                    }}
                                                    onMouseEnter={() =>
                                                      setHighlightedArticleIdx(
                                                        pIdx,
                                                      )
                                                    }
                                                  >
                                                    <div
                                                      style={{
                                                        fontWeight: 500,
                                                      }}
                                                    >
                                                      {product.name}
                                                    </div>
                                                    {product.description && (
                                                      <div
                                                        style={{
                                                          color: "#6b7280",
                                                          fontSize: "11px",
                                                        }}
                                                      >
                                                        {product.description}
                                                      </div>
                                                    )}
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ) : editing ? (
                                        <span
                                          onClick={() => {
                                            setEditingArticleIdx(idx);
                                            setArticleSearch(
                                              item.productName ||
                                                item.articleCode ||
                                                "",
                                            );
                                            setArticleResults([]);
                                            setHighlightedArticleIdx(-1);
                                          }}
                                          style={{
                                            cursor: "pointer",
                                            borderBottom: "1px dashed #3b82f6",
                                            color: "#1d4ed8",
                                          }}
                                          title="Clicca per cambiare articolo"
                                        >
                                          {item.productName ||
                                            item.articleCode ||
                                            "-"}
                                        </span>
                                      ) : (
                                        <HighlightText
                                          text={
                                            item.productName ||
                                            item.articleCode ||
                                            ""
                                          }
                                          query={debouncedSearch}
                                        />
                                      )}
                                    </td>
                                    <td style={{ padding: "6px 4px" }}>
                                      <HighlightText
                                        text={item.description || "-"}
                                        query={debouncedSearch}
                                      />
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 4px",
                                        textAlign: "right",
                                      }}
                                    >
                                      {editing ? (
                                        <div>
                                          <input
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) =>
                                              handleEditItemQty(
                                                idx,
                                                parseInt(e.target.value, 10) ||
                                                  0,
                                              )
                                            }
                                            min={1}
                                            style={{
                                              width: "60px",
                                              padding: "4px",
                                              textAlign: "right",
                                              border: `1px solid ${qtyValidation.get(idx) ? "#dc2626" : "#d1d5db"}`,
                                              borderRadius: "4px",
                                              fontSize: "13px",
                                            }}
                                            title={
                                              qtyValidation.get(idx) ||
                                              undefined
                                            }
                                          />
                                          {qtyValidation.get(idx) && (
                                            <div
                                              style={{
                                                fontSize: "10px",
                                                color: "#dc2626",
                                                marginTop: "2px",
                                              }}
                                            >
                                              {qtyValidation.get(idx)}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        item.quantity
                                      )}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 4px",
                                        textAlign: "right",
                                      }}
                                    >
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
                                            padding: "4px",
                                            textAlign: "right",
                                            border: "1px solid #d1d5db",
                                            borderRadius: "4px",
                                            fontSize: "13px",
                                          }}
                                        />
                                      ) : (
                                        formatCurrency(item.price)
                                      )}
                                    </td>
                                    {(editing || hasRowDiscounts) && (
                                      <td
                                        style={{
                                          padding: "6px 4px",
                                          textAlign: "right",
                                          color: item.discount
                                            ? "#dc2626"
                                            : "#9ca3af",
                                        }}
                                      >
                                        {editing ? (
                                          <input
                                            type="number"
                                            value={item.discount || 0}
                                            onChange={(e) =>
                                              handleEditItemDiscount(
                                                idx,
                                                parseFloat(e.target.value) || 0,
                                              )
                                            }
                                            min={0}
                                            max={100}
                                            step={0.01}
                                            style={{
                                              width: "55px",
                                              padding: "4px",
                                              textAlign: "right",
                                              border: "1px solid #d1d5db",
                                              borderRadius: "4px",
                                              fontSize: "13px",
                                            }}
                                          />
                                        ) : item.discount ? (
                                          `${item.discount}%`
                                        ) : (
                                          "-"
                                        )}
                                      </td>
                                    )}
                                    <td
                                      style={{
                                        padding: "6px 4px",
                                        textAlign: "right",
                                      }}
                                    >
                                      {formatCurrency(
                                        item.price *
                                          item.quantity *
                                          (1 - (item.discount || 0) / 100),
                                      )}
                                    </td>
                                    {editing && (
                                      <td
                                        style={{
                                          padding: "6px 4px",
                                          textAlign: "center",
                                        }}
                                      >
                                        <button
                                          onClick={() => handleRemoveItem(idx)}
                                          style={{
                                            padding: "2px 6px",
                                            background: "#fee2e2",
                                            color: "#dc2626",
                                            border: "1px solid #dc2626",
                                            borderRadius: "4px",
                                            cursor: "pointer",
                                            fontSize: "12px",
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

                            {/* Add item button (edit mode) */}
                            {editing && !addingProduct && (
                              <button
                                onClick={() => setAddingProduct(true)}
                                style={{
                                  padding: "6px 12px",
                                  background: "#f0fdf4",
                                  color: "#16a34a",
                                  border: "1px solid #86efac",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  fontSize: "13px",
                                  marginBottom: "12px",
                                }}
                              >
                                + Aggiungi articolo
                              </button>
                            )}

                            {editing && addingProduct && (
                              <div style={{ marginBottom: "12px" }}>
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
                                  fontSize: "14px",
                                  fontWeight: 500,
                                  marginBottom: "8px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
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
                                        Math.max(
                                          0,
                                          parseFloat(e.target.value) || 0,
                                        ),
                                      ),
                                    })
                                  }
                                  min={0}
                                  max={100}
                                  step={1}
                                  style={{
                                    width: "60px",
                                    padding: "4px",
                                    textAlign: "right",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "4px",
                                    fontSize: "14px",
                                  }}
                                />
                                <span>%</span>
                              </div>
                            ) : (
                              order.discountPercent !== undefined &&
                              order.discountPercent > 0 && (
                                <div
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: 500,
                                    marginBottom: "8px",
                                  }}
                                >
                                  Sconto globale: {order.discountPercent}%
                                </div>
                              )
                            )}

                            {/* Shipping & totals — always shown */}
                            <div
                              style={{
                                fontSize: "13px",
                                color: "#374151",
                                marginBottom: "8px",
                                display: "flex",
                                gap: "12px",
                                flexWrap: "wrap",
                                alignItems: "baseline",
                              }}
                            >
                              {order.shippingCost !== undefined &&
                                order.shippingCost > 0 && (
                                  <span>
                                    Spese: {formatCurrency(order.shippingCost)}
                                  </span>
                                )}
                              {order.shippingTax !== undefined &&
                                order.shippingTax > 0 && (
                                  <span>
                                    IVA: {formatCurrency(order.shippingTax)}
                                  </span>
                                )}
                              <span style={{ fontWeight: 600 }}>
                                Totale: {formatCurrency(liveDocTotal)}
                              </span>
                              {!editing &&
                                order.targetTotalWithVAT !== undefined &&
                                order.targetTotalWithVAT > 0 &&
                                Math.abs(
                                  order.targetTotalWithVAT - liveDocTotal,
                                ) > 0.01 && (
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      color: "#9ca3af",
                                    }}
                                  >
                                    (Arca:{" "}
                                    {formatCurrency(order.targetTotalWithVAT)})
                                  </span>
                                )}
                            </div>

                            {/* Notes */}
                            {editing ? (
                              <div style={{ marginBottom: "8px" }}>
                                <textarea
                                  value={editState!.notes}
                                  onChange={(e) =>
                                    setEditState({
                                      ...editState!,
                                      notes: e.target.value,
                                    })
                                  }
                                  placeholder="Note..."
                                  rows={3}
                                  style={{
                                    width: "100%",
                                    padding: "8px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "6px",
                                    fontSize: "14px",
                                    resize: "vertical",
                                    boxSizing: "border-box",
                                  }}
                                />
                              </div>
                            ) : (
                              order.notes && (
                                <div
                                  style={{
                                    fontSize: "14px",
                                    color: "#374151",
                                    marginBottom: "8px",
                                    fontStyle: "italic",
                                  }}
                                >
                                  Note:{" "}
                                  <HighlightText
                                    text={order.notes}
                                    query={debouncedSearch}
                                  />
                                </div>
                              )
                            )}

                            {/* Action buttons */}
                            {editing && editingInArchibald === order.id ? (
                              <div style={{ width: "100%" }}>
                                <JobProgressBar
                                  progress={editProgress?.progress ?? 0}
                                  operation={
                                    editProgress?.operation ??
                                    "Avvio modifica su Archibald..."
                                  }
                                  status="processing"
                                />
                              </div>
                            ) : editing ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={editState!.items.length === 0}
                                  style={{
                                    padding: "8px 16px",
                                    background:
                                      editState!.items.length === 0
                                        ? "#9ca3af"
                                        : "#16a34a",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor:
                                      editState!.items.length === 0
                                        ? "not-allowed"
                                        : "pointer",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {isDraftInArchibald(order)
                                    ? "Salva su Archibald"
                                    : "Salva"}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  style={{
                                    padding: "8px 16px",
                                    background: "#e5e7eb",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                  }}
                                >
                                  Annulla
                                </button>
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  onClick={() => handleDownloadPDF(order)}
                                  style={{
                                    padding: "6px 12px",
                                    background: "#2563eb",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                  }}
                                >
                                  Scarica PDF
                                </button>
                                <button
                                  onClick={() => handleStartEdit(order)}
                                  style={{
                                    padding: "6px 12px",
                                    background: "#f59e0b",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                  }}
                                >
                                  Modifica
                                </button>
                                <button
                                  onClick={() => setLinkingOrderId(order.id)}
                                  style={{
                                    padding: "6px 12px",
                                    background: order.archibaldOrderId
                                      ? "#6366f1"
                                      : "#7c3aed",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                  }}
                                >
                                  {order.archibaldOrderId
                                    ? "Modifica collegamento"
                                    : "Collega ordine"}
                                </button>
                                {order.archibaldOrderId && (
                                  <button
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          "Sei sicuro di voler scollegare questo ordine?",
                                        )
                                      ) {
                                        handleUnlinkOrder(order.id);
                                      }
                                    }}
                                    style={{
                                      padding: "6px 12px",
                                      background: "#fef2f2",
                                      color: "#dc2626",
                                      border: "1px solid #fca5a5",
                                      borderRadius: "6px",
                                      cursor: "pointer",
                                      fontSize: "13px",
                                    }}
                                  >
                                    Scollega
                                  </button>
                                )}
                                {order.currentState === "spedito" &&
                                  !order.deliveryCompletedDate && (
                                    <button
                                      onClick={() => handleMarkDelivered(order)}
                                      style={{
                                        padding: "6px 12px",
                                        background: "#16a34a",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "6px",
                                        cursor: "pointer",
                                        fontSize: "13px",
                                      }}
                                    >
                                      Segna Consegnato
                                    </button>
                                  )}
                                {deletingFromArchibald === order.id ? (
                                  <div style={{ width: "100%" }}>
                                    <JobProgressBar
                                      progress={deleteProgress?.progress ?? 0}
                                      operation={
                                        deleteProgress?.operation ??
                                        "Avvio cancellazione..."
                                      }
                                      status="processing"
                                    />
                                  </div>
                                ) : isDeleting ? (
                                  <>
                                    <button
                                      onClick={() => handleDelete(order.id)}
                                      style={{
                                        padding: "6px 12px",
                                        background: "#dc2626",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "6px",
                                        cursor: "pointer",
                                        fontSize: "13px",
                                      }}
                                    >
                                      {isDraftInArchibald(order)
                                        ? "Conferma Elimina da Archibald"
                                        : "Conferma Elimina"}
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmId(null)}
                                      style={{
                                        padding: "6px 12px",
                                        background: "#e5e7eb",
                                        border: "1px solid #d1d5db",
                                        borderRadius: "6px",
                                        cursor: "pointer",
                                        fontSize: "13px",
                                      }}
                                    >
                                      Annulla
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirmId(order.id)}
                                    style={{
                                      padding: "6px 12px",
                                      background: "#fee2e2",
                                      color: "#dc2626",
                                      border: "1px solid #dc2626",
                                      borderRadius: "6px",
                                      cursor: "pointer",
                                      fontSize: "13px",
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
              </div>
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          {visibleCount < filteredOrders.length && (
            <div
              ref={sentinelRef}
              style={{
                textAlign: "center",
                padding: "20px",
                color: "#888",
                fontSize: "14px",
              }}
            >
              Caricamento altri ordini...
            </div>
          )}
        </div>
      )}

      {/* Scroll to top */}
      {showScrollToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            backgroundColor: "rgba(25, 118, 210, 0.8)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: "20px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            zIndex: 200,
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(25, 118, 210, 1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(25, 118, 210, 0.8)";
          }}
        >
          {"\u2191"}
        </button>
      )}

      {showImportModal && (
        <ArcaImportModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            fresisHistoryService.syncFromServer().then(() => wsRefetch());
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

      {/* Sync products overlay */}
      {syncingProducts && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 9998,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                marginBottom: "12px",
              }}
            >
              Sincronizzazione prodotti
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "#6b7280",
                marginBottom: "16px",
              }}
            >
              {syncProgress}
            </div>
            <div
              style={{
                width: "40px",
                height: "40px",
                border: "3px solid #e5e7eb",
                borderTop: "3px solid #3b82f6",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto",
              }}
            />
          </div>
        </div>
      )}

      {/* Confirm edit modal */}
      {confirmModal && editState && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            <h3
              style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 600 }}
            >
              Conferma modifiche su Archibald
            </h3>
            <div style={{ fontSize: "13px", marginBottom: "16px" }}>
              {confirmModal.modifications.filter((m) => m.type === "update")
                .length > 0 && (
                <div style={{ marginBottom: "8px" }}>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                    Modifiche:
                  </div>
                  {confirmModal.modifications
                    .filter(
                      (m): m is Extract<typeof m, { type: "update" }> =>
                        m.type === "update",
                    )
                    .map((m, i) => {
                      const orig = confirmModal.originalItems[m.rowIndex];
                      return (
                        <div
                          key={i}
                          style={{ padding: "2px 0", color: "#92400e" }}
                        >
                          Riga {m.rowIndex + 1}:
                          {orig && orig.articleCode !== m.articleCode && (
                            <>
                              {" "}
                              articolo {orig.articleCode} → {m.articleCode}
                            </>
                          )}
                          {orig && orig.quantity !== m.quantity && (
                            <>
                              {" "}
                              qty {orig.quantity} → {m.quantity}
                            </>
                          )}
                          {orig &&
                            (orig.discount ?? 0) !== (m.discount ?? 0) && (
                              <>
                                {" "}
                                sc. {orig.discount ?? 0}% → {m.discount ?? 0}%
                              </>
                            )}
                        </div>
                      );
                    })}
                </div>
              )}
              {confirmModal.modifications.filter((m) => m.type === "add")
                .length > 0 && (
                <div style={{ marginBottom: "8px" }}>
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: "4px",
                      color: "#16a34a",
                    }}
                  >
                    Nuove righe:
                  </div>
                  {confirmModal.modifications
                    .filter(
                      (m): m is Extract<typeof m, { type: "add" }> =>
                        m.type === "add",
                    )
                    .map((m, i) => (
                      <div
                        key={i}
                        style={{ padding: "2px 0", color: "#16a34a" }}
                      >
                        {m.articleCode} - qty {m.quantity}
                        {m.discount ? ` (sc. ${m.discount}%)` : ""}
                      </div>
                    ))}
                </div>
              )}
              {confirmModal.modifications.filter((m) => m.type === "delete")
                .length > 0 && (
                <div style={{ marginBottom: "8px" }}>
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: "4px",
                      color: "#dc2626",
                    }}
                  >
                    Righe da eliminare:
                  </div>
                  {confirmModal.modifications
                    .filter(
                      (m): m is Extract<typeof m, { type: "delete" }> =>
                        m.type === "delete",
                    )
                    .map((m, i) => {
                      const orig = confirmModal.originalItems[m.rowIndex];
                      return (
                        <div
                          key={i}
                          style={{ padding: "2px 0", color: "#dc2626" }}
                        >
                          Riga {m.rowIndex + 1}:{" "}
                          {orig?.productName || orig?.articleCode || "?"}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setConfirmModal(null)}
                style={{
                  padding: "8px 16px",
                  background: "#e5e7eb",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Torna alla modifica
              </button>
              <button
                onClick={handleConfirmEdit}
                style={{
                  padding: "8px 16px",
                  background: "#16a34a",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Conferma e invia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
