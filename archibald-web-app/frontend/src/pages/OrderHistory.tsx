import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSearchMatches } from "../hooks/useSearchMatches";
import { OrderCardNew } from "../components/OrderCardNew";
import { OrderCardStack } from "../components/OrderCardStack";
import { SendToVeronaModal } from "../components/SendToVeronaModal";
import { SyncProgressModal } from "../components/SyncProgressModal";
import { OrderStatusLegend } from "../components/OrderStatusLegend";
import KtSyncDialog from "../components/KtSyncDialog";
import { groupOrdersByPeriod } from "../utils/orderGrouping";
import type { Order } from "../types/order";
import {
  isNotSentToVerona,
  isInvoicePaid,
  isOverdue,
  isInTransit,
} from "../utils/orderStatus";
import { useSyncProgress } from "../hooks/useSyncProgress";
import { toastService } from "../services/toast.service";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { customerService } from "../services/customers.service";
import { useOrderStacks } from "../hooks/useOrderStacks";
import { useHiddenOrders } from "../hooks/useHiddenOrders";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { useOperationTracking } from "../contexts/OperationTrackingContext";
import type { SendToVeronaProgressState } from "../services/fresis-history-realtime.service";
import type { Customer } from "../types/local-customer";

interface OrderFilters {
  dateFrom: string;
  dateTo: string;
  quickFilters: Set<QuickFilterType>;
  search: string;
}

type QuickFilterType =
  | "requiresAttention"
  | "editable"
  | "backorder"
  | "inTransit"
  | "delivered"
  | "invoiced"
  | "overdue"
  | "paid"
  | "stacked";

type TimePreset =
  | "today"
  | "thisWeek"
  | "thisMonth"
  | "last3Months"
  | "thisYear"
  | "custom"
  | null;

interface OrderHistoryResponse {
  success: boolean;
  data: {
    orders: Order[];
    total: number;
    hasMore: boolean;
  };
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type TabId = "panoramica" | "articoli" | "logistica" | "finanziario";

function anyFieldMatches(fields: (string | undefined | null)[], lower: string): boolean {
  for (const val of fields) {
    if (val && String(val).toLowerCase().includes(lower)) return true;
  }
  return false;
}

function matchesGlobalSearch(order: Order, query: string): boolean {
  const lower = query.toLowerCase();

  // Header fields (visible in collapsed card)
  const headerFields: (string | undefined | null)[] = [
    order.id,
    order.orderNumber,
    order.customerName,
    order.total,
    order.orderDescription,
  ];
  if (anyFieldMatches(headerFields, lower)) return true;

  // Panoramica tab fields
  const panoramicaFields: (string | undefined | null)[] = [
    order.customerAccountNum,
    order.orderDate,
    order.date,
    order.deliveryDate,
    order.orderType,
    order.salesOrigin,
    order.grossAmount,
    order.discountPercent,
    order.deliveryName,
    order.deliveryAddress,
    order.customerReference,
    order.state,
    order.status,
    order.documentState,
    order.transferStatus,
    order.transferDate,
    order.completionDate,
    order.deliveryCompletedDate as string | undefined,
    order.notes,
    order.customerNotes,
  ];
  if (anyFieldMatches(panoramicaFields, lower)) return true;

  // Articles
  if (order.articleSearchText && order.articleSearchText.toLowerCase().includes(lower)) return true;

  if (order.items) {
    for (const item of order.items) {
      if (item.article && item.article.toLowerCase().includes(lower)) return true;
      if (item.productName && item.productName.toLowerCase().includes(lower)) return true;
      if (item.description && item.description.toLowerCase().includes(lower)) return true;
    }
  }

  // DDT + tracking (logistica tab)
  for (const ddt of order.ddts) {
    const ddtFields: (string | undefined | null)[] = [
      ddt.trackingNumber, ddt.trackingCourier, ddt.ddtNumber,
      ddt.ddtDeliveryDate, ddt.ddtCustomerAccount, ddt.ddtId,
      ddt.ddtSalesName, ddt.ddtDeliveryName, ddt.deliveryMethod,
      ddt.deliveryTerms, ddt.deliveryCity, ddt.attentionTo,
      ddt.ddtDeliveryAddress, ddt.ddtQuantity, ddt.ddtCustomerReference,
      ddt.ddtDescription,
    ];
    if (anyFieldMatches(ddtFields, lower)) return true;
  }

  if (order.tracking) {
    if (order.tracking.trackingNumber?.toLowerCase().includes(lower)) return true;
    if (order.tracking.trackingCourier?.toLowerCase().includes(lower)) return true;
  }

  // Invoice (finanziario tab)
  const inv = order.invoices?.[0] ?? null;
  const invoiceFields: (string | undefined | null)[] = [
    inv?.invoiceNumber, inv?.invoiceDate, inv?.invoiceAmount,
    inv?.invoiceCustomerAccount, inv?.invoiceBillingName,
    inv?.invoiceRemainingAmount, inv?.invoiceTaxAmount,
    inv?.invoiceLineDiscount, inv?.invoiceTotalDiscount,
    inv?.invoicePurchaseOrder, inv?.invoiceDueDate,
    inv?.invoiceSettledAmount, inv?.invoiceLastPaymentId,
    inv?.invoiceLastSettlementDate,
  ];
  if (anyFieldMatches(invoiceFields, lower)) return true;

  return false;
}

function getMatchingTab(order: Order, query: string): TabId | null {
  if (!query) return null;
  const lower = query.toLowerCase();

  // Header fields — no tab switch needed
  const headerFields: (string | undefined | null)[] = [
    order.orderNumber, order.customerName, order.total, order.orderDescription,
  ];
  if (anyFieldMatches(headerFields, lower)) return null;

  // Panoramica
  const panoramicaFields: (string | undefined | null)[] = [
    order.customerAccountNum, order.orderDate, order.date, order.deliveryDate,
    order.orderType, order.salesOrigin, order.grossAmount, order.discountPercent,
    order.deliveryName, order.deliveryAddress, order.customerReference,
    order.state, order.status, order.documentState, order.transferStatus,
    order.transferDate, order.completionDate, order.deliveryCompletedDate as string | undefined,
    order.notes, order.customerNotes,
  ];
  if (anyFieldMatches(panoramicaFields, lower)) return "panoramica";

  // Articles
  if (order.articleSearchText?.toLowerCase().includes(lower)) return "articoli";
  if (order.items) {
    for (const item of order.items) {
      if (item.article?.toLowerCase().includes(lower)) return "articoli";
      if (item.productName?.toLowerCase().includes(lower)) return "articoli";
      if (item.description?.toLowerCase().includes(lower)) return "articoli";
    }
  }

  // DDT + tracking → logistica
  for (const ddt of order.ddts) {
    const ddtFields: (string | undefined | null)[] = [
      ddt.trackingNumber, ddt.trackingCourier, ddt.ddtNumber,
      ddt.ddtDeliveryDate, ddt.ddtCustomerAccount, ddt.ddtId,
      ddt.ddtSalesName, ddt.ddtDeliveryName, ddt.deliveryMethod,
      ddt.deliveryTerms, ddt.deliveryCity, ddt.attentionTo,
      ddt.ddtDeliveryAddress, ddt.ddtQuantity, ddt.ddtCustomerReference,
      ddt.ddtDescription,
    ];
    if (anyFieldMatches(ddtFields, lower)) return "logistica";
  }
  if (order.tracking?.trackingNumber?.toLowerCase().includes(lower)) return "logistica";
  if (order.tracking?.trackingCourier?.toLowerCase().includes(lower)) return "logistica";

  // Invoice → finanziario
  const inv = order.invoices?.[0] ?? null;
  const invoiceFields: (string | undefined | null)[] = [
    inv?.invoiceNumber, inv?.invoiceDate, inv?.invoiceAmount,
    inv?.invoiceCustomerAccount, inv?.invoiceBillingName,
    inv?.invoiceRemainingAmount, inv?.invoiceTaxAmount,
    inv?.invoiceLineDiscount, inv?.invoiceTotalDiscount,
    inv?.invoicePurchaseOrder, inv?.invoiceDueDate,
    inv?.invoiceSettledAmount, inv?.invoiceLastPaymentId,
    inv?.invoiceLastSettlementDate,
  ];
  if (anyFieldMatches(invoiceFields, lower)) return "finanziario";

  return null;
}

export function OrderHistory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightOrderId = searchParams.get("highlight");
  const [highlightFlash, setHighlightFlash] = useState<string | null>(null);
  const { progress, reset: resetProgress } = useSyncProgress();
  const [orders, setOrders] = useState<Order[]>([]);
  const { stackMap, orderIndex, getStackForOrder, removeFromStack, dissolveStack, createManualStack, updateLabel, reorderStack } = useOrderStacks(orders);
  const { hiddenOrderIds, hideOrder: handleHideOrder, unhideOrder: handleUnhideOrder } = useHiddenOrders();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [filters, setFilters] = useState<OrderFilters>({
    dateFrom: "",
    dateTo: "",
    quickFilters: new Set(),
    search: "",
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncType] = useState<"sync" | "reset">("sync");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalOrderId, setModalOrderId] = useState<string | null>(null);
  const [modalCustomerName, setModalCustomerName] = useState<string>("");
  const [sendingToVerona, setSendingToVerona] = useState(false);
  const [sentToVeronaIds, setSentToVeronaIds] = useState<Set<string>>(
    new Set(),
  );
  const [sendToVeronaProgress, setSendToVeronaProgress] =
    useState<SendToVeronaProgressState | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  // Selection mode for manual stacking
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [stackReasonDialog, setStackReasonDialog] = useState(false);
  const [ktSyncDialogOpen, setKtSyncDialogOpen] = useState(false);
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
  const [batchSendVeronaConfirmOpen, setBatchSendVeronaConfirmOpen] = useState(false);
  const [stackReason, setStackReason] = useState("");
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justEnteredSelectionMode = useRef(false);

  // Customer autocomplete state
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [highlightedCustomerIndex, setHighlightedCustomerIndex] = useState(-1);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Time presets
  const [activeTimePreset, setActiveTimePreset] = useState<TimePreset>(null);

  // Show hidden orders toggle
  const [showHidden, setShowHidden] = useState(false);


  // Note summaries and previews derived from order data (included in the orders query via JOIN)
  const [noteSummaries, setNoteSummaries] = useState<Record<string, { total: number; checked: number }>>({});
  const [notePreviews, setNotePreviews] = useState<Record<string, Array<{ text: string; checked: boolean }>>>({});

  // Backorder banner dismiss
  const [backorderDismissed, setBackorderDismissed] = useState(false);

  // Scroll state
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // Infinite scroll state
  const [visibleCount, setVisibleCount] = useState(30);

  // Refs
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useSearchMatches(resultsContainerRef, debouncedSearch);

  const { subscribe } = useWebSocketContext();
  const { trackOperation } = useOperationTracking();

  // Debounce global search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Order-level search navigation: tracks which order is currently focused
  const [searchFocusIndex, setSearchFocusIndex] = useState(-1);
  const searchActiveRef = useRef(false);

  // When search query changes, focus the first matching order
  useEffect(() => {
    if (debouncedSearch) {
      searchActiveRef.current = true;
      setSearchFocusIndex(0);
    } else {
      // Search cleared: collapse and reset
      if (searchActiveRef.current) {
        setExpandedOrderId(null);
        setSearchExpandedStackId(null);
        searchActiveRef.current = false;
      }
      setSearchFocusIndex(-1);
    }
  }, [debouncedSearch]);

  // Keep the search navigation bar visible for a short time after clearing
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [lastSearch, setLastSearch] = useState("");
  const searchBarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debouncedSearch) {
      setShowSearchBar(true);
      setLastSearch(debouncedSearch);
      if (searchBarTimerRef.current) {
        clearTimeout(searchBarTimerRef.current);
        searchBarTimerRef.current = null;
      }
    } else if (showSearchBar) {
      // Keep bar visible for 3 seconds after clearing
      searchBarTimerRef.current = setTimeout(() => {
        setShowSearchBar(false);
        searchBarTimerRef.current = null;
      }, 3000);
    }
    return () => {
      if (searchBarTimerRef.current) clearTimeout(searchBarTimerRef.current);
    };
  }, [debouncedSearch]);

  // Hide floating bar when it would overlap the filter section
  const [filterBarVisible, setFilterBarVisible] = useState(true);
  useEffect(() => {
    const filterEl = filterBarRef.current;
    if (!filterEl) return;
    const observer = new IntersectionObserver(
      ([entry]) => setFilterBarVisible(entry.isIntersecting),
      { threshold: 0, rootMargin: "-60px 0px 0px 0px" },
    );
    observer.observe(filterEl);
    return () => observer.disconnect();
  }, []);

  // Hide navbar only when floating search bar is visible (scrolled past filters)
  useEffect(() => {
    const nav = document.querySelector("nav");
    if (!nav) return;
    const shouldHide = !!debouncedSearch && !filterBarVisible;
    nav.style.transform = shouldHide ? "translateY(-100%)" : "";
    nav.style.transition = "transform 0.3s ease";
    return () => {
      nav.style.transform = "";
      nav.style.transition = "";
    };
  }, [debouncedSearch, filterBarVisible]);

  // Clear search helper
  const clearSearch = useCallback(() => {
    setFilters((prev) => ({ ...prev, search: "" }));
    setShowSearchBar(false);
  }, []);

  // Scroll listener for scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes wiggle {
        0%   { transform: rotate(0deg); }
        25%  { transform: rotate(-0.35deg); }
        50%  { transform: rotate(0deg); }
        75%  { transform: rotate(0.35deg); }
        100% { transform: rotate(0deg); }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    if (!selectionMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancelSelection();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMode]);

  // Click outside customer dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted customer into view
  useEffect(() => {
    if (highlightedCustomerIndex < 0) return;
    const dropdown = customerDropdownRef.current;
    if (!dropdown) return;
    const items = dropdown.querySelectorAll("[data-customer-item]");
    const item = items[highlightedCustomerIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedCustomerIndex]);

  // When search is active, bypass date filters to search all documents
  const isSearchMode = debouncedSearch.length > 0;

  // Fetch orders — background=true skips loading spinner and preserves scroll
  const fetchOrders = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (!background) {
      setLoading(true);
    }
    setError(null);

    const scrollY = background ? window.scrollY : 0;

    try {
      const params = new URLSearchParams();
      if (selectedCustomer?.code)
        params.append("customerAccountNum", selectedCustomer.code);
      else if (selectedCustomer?.name)
        params.append("customer", selectedCustomer.name);
      if (!isSearchMode) {
        params.append("dateFrom", filters.dateFrom || `${new Date().getFullYear()}-01-01`);
        if (filters.dateTo) params.append("dateTo", filters.dateTo);
      }
      params.append("limit", "10000");

      const response = await fetchWithRetry(
        `/api/orders/history?${params.toString()}`,
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const errorMsg =
          errorBody?.error || response.statusText || "Errore sconosciuto";
        throw new Error(`Errore ${response.status}: ${errorMsg}`);
      }

      const data: OrderHistoryResponse = await response.json();
      if (!data.success) {
        throw new Error("Errore nel caricamento degli ordini");
      }

      setOrders(data.data.orders);
      if (!background) {
        setBackorderDismissed(false);
      }

      if (background) {
        requestAnimationFrame(() => window.scrollTo(0, scrollY));
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError(err instanceof Error ? err.message : "Errore di rete. Riprova.");
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [selectedCustomer, filters.dateFrom, filters.dateTo, isSearchMode]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const backgroundRefresh = () => { fetchOrders({ background: true }); };
    const unsubs = [
      subscribe("JOB_COMPLETED", backgroundRefresh),
      subscribe("ORDER_EDIT_COMPLETE", backgroundRefresh),
      subscribe("ORDER_DELETE_COMPLETE", backgroundRefresh),
    ];
    return () => { unsubs.forEach((u) => u()); };
  }, [subscribe, fetchOrders]);

  useEffect(() => {
    const summaries: Record<string, { total: number; checked: number }> = {};
    const previews: Record<string, Array<{ text: string; checked: boolean }>> = {};
    for (const o of orders) {
      if (o.noteSummary) summaries[o.id] = o.noteSummary;
      if (o.notePreviews) previews[o.id] = o.notePreviews;
    }
    setNoteSummaries(summaries);
    setNotePreviews(previews);
  }, [orders]);

  // Auto-expand and scroll to highlighted order from URL param
  useEffect(() => {
    if (!highlightOrderId || orders.length === 0) return;

    const target = orders.find((o) => o.id === highlightOrderId);
    if (!target) return;

    setExpandedOrderId(target.id);
    setHighlightFlash(target.id);

    // Ensure the order is within the visible infinite-scroll window
    const targetIndex = orders.indexOf(target);
    if (targetIndex >= visibleCount) {
      setVisibleCount(targetIndex + 5);
    }

    // Clean up highlight param from URL
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("highlight");
      return next;
    }, { replace: true });

    // Scroll to the order after render
    setTimeout(() => {
      document
        .getElementById(`order-${target.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);

    // Remove flash after animation
    setTimeout(() => {
      setHighlightFlash(null);
    }, 2500);
  }, [highlightOrderId, orders, setSearchParams, visibleCount]);

  // Scroll-highlight by orderNumber (from notification navigate-to links)
  useEffect(() => {
    if (!highlightOrderId || orders.length === 0) return;
    const target = orders.find((o) => o.orderNumber === highlightOrderId);
    if (!target) return;

    // Ensure the order is within the visible infinite-scroll window
    const targetIndex = orders.indexOf(target);
    if (targetIndex >= visibleCount) {
      setVisibleCount(targetIndex + 5);
    }

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("highlight");
      return next;
    }, { replace: true });

    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-order-number="${target.orderNumber}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.transition = "box-shadow 0.3s";
        el.style.boxShadow = "0 0 0 3px #cc0066";
        setTimeout(() => { el.style.boxShadow = ""; }, 2000);
      }
    }, 300);
  }, [highlightOrderId, orders, setSearchParams, visibleCount]);

  // Customer search handler
  const handleCustomerSearch = async (query: string) => {
    setCustomerSearchQuery(query);
    setHighlightedCustomerIndex(-1);
    if (query.length < 2) {
      setCustomerResults([]);
      setShowCustomerDropdown(false);
      return;
    }

    setSearchingCustomer(true);
    setShowCustomerDropdown(true);
    try {
      const results = await customerService.searchCustomers(query);
      setCustomerResults(results.slice(0, 10));
    } catch (error) {
      console.error("Customer search failed:", error);
    } finally {
      setSearchingCustomer(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearchQuery(customer.name);
    setCustomerResults([]);
    setShowCustomerDropdown(false);
    setHighlightedCustomerIndex(-1);
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearchQuery("");
    setCustomerResults([]);
    setShowCustomerDropdown(false);
    setHighlightedCustomerIndex(-1);
  };

  const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (customerResults.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedCustomerIndex((prev) =>
          prev < customerResults.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedCustomerIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (
          highlightedCustomerIndex >= 0 &&
          highlightedCustomerIndex < customerResults.length
        ) {
          handleSelectCustomer(customerResults[highlightedCustomerIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowCustomerDropdown(false);
        setHighlightedCustomerIndex(-1);
        break;
    }
  };

  // Time preset handler
  const handleTimePreset = (preset: TimePreset) => {
    setActiveTimePreset(preset);
    const today = new Date();

    switch (preset) {
      case "today":
        setFilters((prev) => ({
          ...prev,
          dateFrom: formatDate(today),
          dateTo: formatDate(today),
        }));
        break;
      case "thisWeek": {
        const monday = getMonday(today);
        setFilters((prev) => ({
          ...prev,
          dateFrom: formatDate(monday),
          dateTo: formatDate(today),
        }));
        break;
      }
      case "thisMonth":
        setFilters((prev) => ({
          ...prev,
          dateFrom: formatDate(
            new Date(today.getFullYear(), today.getMonth(), 1),
          ),
          dateTo: formatDate(today),
        }));
        break;
      case "last3Months": {
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        setFilters((prev) => ({
          ...prev,
          dateFrom: formatDate(threeMonthsAgo),
          dateTo: formatDate(today),
        }));
        break;
      }
      case "thisYear":
        setFilters((prev) => ({
          ...prev,
          dateFrom: formatDate(new Date(today.getFullYear(), 0, 1)),
          dateTo: formatDate(today),
        }));
        break;
      case "custom":
        break;
      default:
        break;
    }
  };

  // Toggle order expansion
  const handleToggle = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  // Close expanded card when clicking outside
  function handleBackgroundClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest('[data-order-card]')) return;
    if (selectionMode) {
      if (!justEnteredSelectionMode.current) handleCancelSelection();
      return;
    }
    if (!expandedOrderId) return;
    setExpandedOrderId(null);
  }

  // Clear all filters
  const handleClearFilters = () => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      quickFilters: new Set(),
      search: "",
    });
    handleClearCustomer();
    setActiveTimePreset(null);
    setShowHidden(false);
  };

  const handleSendToVerona = (orderId: string, customerName: string) => {
    setModalOrderId(orderId);
    setModalCustomerName(customerName);
    setModalOpen(true);
  };

  const handleConfirmSendToVerona = async () => {
    if (!modalOrderId) return;

    setSendingToVerona(true);
    setError(null);

    try {
      const response = await fetchWithRetry(
        `/api/orders/${modalOrderId}/send-to-verona`,
        { method: "POST" },
        { maxRetries: 0, totalTimeout: 200000 },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const errorMsg =
          errorBody?.error || response.statusText || "Errore sconosciuto";
        throw new Error(`Errore ${response.status}: ${errorMsg}`);
      }

      const data = await response.json();

      if (!data.jobId) {
        if (!data.success) {
          throw new Error(data.message || "Errore nell'invio a Verona");
        }
      } else {
        trackOperation(modalOrderId, data.jobId, modalCustomerName || modalOrderId, 'Invio a Verona...', 'Inviato a Verona', '/orders');
      }

      setSentToVeronaIds((prev) => new Set(prev).add(modalOrderId));
      setModalOpen(false);
      setModalOrderId(null);
      setModalCustomerName("");
    } catch (err) {
      console.error("Error sending to Verona:", err);
      setError(
        err instanceof Error ? err.message : "Errore nell'invio a Verona",
      );
    } finally {
      setSendingToVerona(false);
      setSendToVeronaProgress(null);
    }
  };

  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const handleEdit = (orderId: string) => {
    setEditingOrderId(orderId);
    setExpandedOrderId(orderId);
  };

  function handleLongPressStart(orderId: string, e: React.PointerEvent) {
    const startX = e.clientX;
    const startY = e.clientY;
    longPressTimer.current = setTimeout(() => {
      setSelectionMode(true);
      setSelectedOrderIds(new Set([orderId]));
      justEnteredSelectionMode.current = true;
      setTimeout(() => { justEnteredSelectionMode.current = false; }, 300);
    }, 500);
    const moveHandler = (me: PointerEvent) => {
      if (Math.abs(me.clientX - startX) > 10 || Math.abs(me.clientY - startY) > 10) {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        window.removeEventListener("pointermove", moveHandler);
      }
    };
    window.addEventListener("pointermove", moveHandler);
    const upHandler = () => {
      window.removeEventListener("pointermove", moveHandler);
    };
    window.addEventListener("pointerup", upHandler, { once: true });
  }

  function handleLongPressEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }

  function handleToggleSelection(orderId: string) {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }

  function handleCancelSelection() {
    setSelectionMode(false);
    setSelectedOrderIds(new Set());
    setStackReasonDialog(false);
    setBatchDeleteConfirmOpen(false);
    setBatchSendVeronaConfirmOpen(false);
    setStackReason("");
  }

  async function handleBatchDelete() {
    const ids = Array.from(selectedOrderIds);
    if (ids.length === 0) return;
    setBatchDeleteConfirmOpen(false);
    try {
      const response = await fetchWithRetry(
        `/api/orders/batch-delete`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderIds: ids }) },
        { maxRetries: 0, totalTimeout: 60000 },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Errore eliminazione batch");
      if (data.jobId) {
        trackOperation(ids[0], data.jobId, `${ids.length} ordini`, "Eliminazione batch...", undefined, '/orders');
      }
      handleCancelSelection();
    } catch (err) {
      toastService.error(err instanceof Error ? err.message : "Errore eliminazione batch");
    }
  }

  async function handleBatchSendToVerona() {
    const ids = Array.from(selectedOrderIds);
    if (ids.length === 0) return;
    setBatchSendVeronaConfirmOpen(false);
    try {
      const response = await fetchWithRetry(
        `/api/orders/batch-send-to-verona`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderIds: ids }) },
        { maxRetries: 0, totalTimeout: 60000 },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "Errore invio batch");
      if (data.jobId) {
        trackOperation(ids[0], data.jobId, `${ids.length} ordini`, "Invio a Verona...", "Inviato a Verona", '/orders');
      }
      setSentToVeronaIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      handleCancelSelection();
    } catch (err) {
      toastService.error(err instanceof Error ? err.message : "Errore invio batch a Verona");
    }
  }

  async function handleConfirmStack() {
    if (selectedOrderIds.size < 2) return;
    try {
      await createManualStack(Array.from(selectedOrderIds), stackReason);
      toastService.success(`Pila creata con ${selectedOrderIds.size} ordini`);
    } catch (err) {
      console.error("handleConfirmStack failed:", err);
      toastService.error("Errore nella creazione della pila");
    }
    handleCancelSelection();
  }

  async function handleDissolveStack(stackId: string) {
    const stack = stackMap.get(stackId);
    if (!stack) return;
    if (stack.source === "auto-nc") {
      await createManualStack(stack.orderIds, "__dismissed__");
    } else {
      await dissolveStack(stackId);
    }
  }

  // Apply quick filters client-side (OR logic: order matches if ANY selected filter matches)
  const applyQuickFilters = (ordersToFilter: Order[]): Order[] => {
    if (filters.quickFilters.size === 0) return ordersToFilter;

    return ordersToFilter.filter((order) => {
      for (const filterType of filters.quickFilters) {
        let matches = false;

        switch (filterType) {
          case "requiresAttention": {
            const tsUpper =
              order.transferStatus?.toUpperCase().replace(/_/g, " ") ?? "";
            matches =
              order.state === "IN ATTESA DI APPROVAZIONE" ||
              tsUpper === "IN ATTESA DI APPROVAZIONE" ||
              order.state === "TRANSFER ERROR" ||
              tsUpper === "TRANSFER ERROR";
            break;
          }

          case "editable":
            matches = isNotSentToVerona(order);
            break;

          case "backorder": {
            const hoursElapsed =
              (Date.now() - new Date(order.date).getTime()) / 3_600_000;
            matches =
              order.status?.toUpperCase() === "ORDINE APERTO" &&
              hoursElapsed > 36;
            break;
          }

          case "inTransit":
            matches = !order.ddts.every(d => !!d.deliveryConfirmedAt) && (
              order.ddts.some(d =>
                d.trackingStatus === 'in_transit'
                || d.trackingStatus === 'out_for_delivery'
                || d.trackingStatus === 'exception'
                || d.trackingStatus === 'pending'
              )
              || isInTransit(order)
            );
            break;

          case "delivered":
            matches = order.ddts.some(d => !!d.deliveryConfirmedAt);
            break;

          case "invoiced":
            matches = !!order.invoices[0]?.invoiceNumber && !isInvoicePaid(order) && !isOverdue(order);
            break;

          case "paid":
            matches = !!order.invoices[0]?.invoiceNumber && isInvoicePaid(order);
            break;

          case "overdue":
            matches = isOverdue(order);
            break;

          case "stacked":
            matches = orderIndex.has(order.id);
            break;
        }

        if (matches) return true;
      }

      return false;
    });
  };

  // Reset visibleCount when filters change
  const filterKey = `${selectedCustomer?.id ?? ""}_${filters.dateFrom}_${filters.dateTo}_${[...filters.quickFilters].sort().join(",")}_${debouncedSearch}_${showHidden}_${[...hiddenOrderIds].sort().join(",")}`;
  const prevFilterKeyRef = useRef(filterKey);
  if (prevFilterKeyRef.current !== filterKey) {
    prevFilterKeyRef.current = filterKey;
    if (visibleCount !== 30) {
      setVisibleCount(30);
    }
  }

  // Filtering pipeline: hidden orders → quick filters → global search
  const { filteredOrders, backorderCount, ordersForCounts } = useMemo(() => {
    let result = orders;
    if (!showHidden) {
      result = result.filter((o) => !hiddenOrderIds.has(o.id));
    }

    const forCounts = result;

    const bCount = forCounts.filter((o) => {
      const hoursElapsed = (Date.now() - new Date(o.date).getTime()) / 3_600_000;
      return o.status?.toUpperCase() === "ORDINE APERTO" && hoursElapsed > 36;
    }).length;

    result = applyQuickFilters(result);
    if (debouncedSearch) {
      result = result.filter((o) => matchesGlobalSearch(o, debouncedSearch));
    }

    return { filteredOrders: result, backorderCount: bCount, ordersForCounts: forCounts };
  }, [orders, showHidden, hiddenOrderIds, filters.quickFilters, debouncedSearch, orderIndex]);

  const displayedOrders = filteredOrders;

  const hasActiveFilters =
    selectedCustomer !== null ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.quickFilters.size > 0 ||
    filters.search !== "" ||
    showHidden;

  // Track which stack was force-expanded by search so we can close it
  const [searchExpandedStackId, setSearchExpandedStackId] = useState<string | null>(null);

  // When searchFocusIndex changes, expand that order + open the right tab + scroll
  useEffect(() => {
    if (searchFocusIndex < 0 || !debouncedSearch || filteredOrders.length === 0) return;
    const idx = searchFocusIndex % filteredOrders.length;
    const order = filteredOrders[idx];
    if (!order) return;

    // Ensure the order is in the visible set (may need more loaded for lazy scroll)
    const orderIdxInFiltered = filteredOrders.indexOf(order);
    if (orderIdxInFiltered >= visibleCount) {
      setVisibleCount(orderIdxInFiltered + 10);
    }

    // Check if order is inside a stack
    const stack = getStackForOrder(order.id);
    if (stack && stack.orderIds.length > 1) {
      setSearchExpandedStackId(stack.stackId);
    } else if (searchExpandedStackId) {
      setSearchExpandedStackId(null);
    }

    setExpandedOrderId(order.id);

    // Scroll with delay to allow DOM to update after expansion
    setTimeout(() => {
      const el = document.getElementById(`order-${order.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
  }, [searchFocusIndex, debouncedSearch, filteredOrders]);

  const searchGoNext = useCallback(() => {
    if (filteredOrders.length === 0) return;
    setSearchFocusIndex((i) => (i + 1) % filteredOrders.length);
  }, [filteredOrders.length]);

  const searchGoPrev = useCallback(() => {
    if (filteredOrders.length === 0) return;
    setSearchFocusIndex((i) => (i - 1 + filteredOrders.length) % filteredOrders.length);
  }, [filteredOrders.length]);

  const visibleOrders = displayedOrders.slice(0, visibleCount);
  const hasMoreOrders = visibleCount < displayedOrders.length;
  const orderGroups = useMemo(() => groupOrdersByPeriod(visibleOrders), [visibleOrders]);
  const visibleOrdersById = useMemo(() => new Map(visibleOrders.map((o) => [o.id, o])), [visibleOrders]);

  // Infinite scroll: re-create observer after each batch so it fires again
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMoreOrders) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 30, displayedOrders.length));
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, hasMoreOrders, displayedOrders.length]);

  // Quick filter definitions
  const quickFilterDefs = useMemo<{
    id: QuickFilterType;
    label: string;
    color: string;
    bgColor: string;
    count: number;
  }[]>(() => [
    {
      id: "requiresAttention",
      label: "\u26a0\ufe0f Richiede attenzione",
      color: "#F44336",
      bgColor: "#FFEBEE",
      count: ordersForCounts.filter((o) => {
        const ts = o.transferStatus?.toUpperCase().replace(/_/g, " ") ?? "";
        return (
          o.state === "IN ATTESA DI APPROVAZIONE" ||
          ts === "IN ATTESA DI APPROVAZIONE" ||
          o.state === "TRANSFER ERROR" ||
          ts === "TRANSFER ERROR"
        );
      }).length,
    },
    {
      id: "editable",
      label: "\u270f\ufe0f Modificabili",
      color: "#808080",
      bgColor: "#f3f4f6",
      count: ordersForCounts.filter((o) => isNotSentToVerona(o)).length,
    },
    {
      id: "backorder",
      label: "\u23f0 Possibile Backorder",
      color: "#ff6600",
      bgColor: "#fff3e0",
      count: ordersForCounts.filter((o) => {
        const hoursElapsed =
          (Date.now() - new Date(o.date).getTime()) / 3_600_000;
        return o.status?.toUpperCase() === "ORDINE APERTO" && hoursElapsed > 36;
      }).length,
    },
    {
      id: "inTransit",
      label: "\ud83d\ude9a In transito",
      color: "#0066cc",
      bgColor: "#e8f0ff",
      count: ordersForCounts.filter((o) =>
        !o.ddts.every(d => !!d.deliveryConfirmedAt) && (
          o.ddts.some(d =>
            d.trackingStatus === 'in_transit'
            || d.trackingStatus === 'out_for_delivery'
            || d.trackingStatus === 'exception'
            || d.trackingStatus === 'pending'
          )
          || isInTransit(o)
        )
      ).length,
    },
    {
      id: "delivered",
      label: "\ud83d\udce6 Consegnati",
      color: "#0277BD",
      bgColor: "#B3E5FC",
      count: ordersForCounts.filter((o) => o.ddts.some(d => !!d.deliveryConfirmedAt)).length,
    },
    {
      id: "invoiced",
      label: "\ud83d\udcd1 Fatturati",
      color: "#6633cc",
      bgColor: "#f2eaff",
      count: ordersForCounts.filter((o) => !!o.invoices[0]?.invoiceNumber && !isInvoicePaid(o) && !isOverdue(o)).length,
    },
    {
      id: "paid",
      label: "\u2705 Pagati",
      color: "#006666",
      bgColor: "#e6f5f5",
      count: ordersForCounts.filter((o) => !!o.invoices[0]?.invoiceNumber && isInvoicePaid(o)).length,
    },
    {
      id: "overdue",
      label: "\ud83d\udd34 Scaduti",
      color: "#cc3300",
      bgColor: "#ffede6",
      count: ordersForCounts.filter((o) => isOverdue(o)).length,
    },
    {
      id: "stacked",
      label: "\ud83d\udcda Impilati",
      color: "#808080",
      bgColor: "#f3f4f6",
      count: ordersForCounts.filter((o) => orderIndex.has(o.id)).length,
    },
  ], [ordersForCounts, orderIndex]);

  const timePresets: { id: TimePreset; label: string }[] = [
    { id: "today", label: "Oggi" },
    { id: "thisWeek", label: "Questa sett." },
    { id: "thisMonth", label: "Questo mese" },
    { id: "last3Months", label: "Ultimi 3 mesi" },
    { id: "thisYear", label: "Quest'anno" },
    { id: "custom", label: "Personalizzato" },
  ];

  const token = localStorage.getItem("archibald_jwt") || undefined;

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
            {"\ud83d\udce6"} Ordini
          </h1>
          <p style={{ fontSize: "16px", color: "#666" }}>
            Consulta lo storico dei tuoi ordini e il loro stato
          </p>
        </div>
        <button
          onClick={() => setLegendOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            fontSize: "14px",
            fontWeight: 600,
            backgroundColor: "#fff",
            color: "#1976d2",
            border: "2px solid #1976d2",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#1976d2";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#fff";
            e.currentTarget.style.color = "#1976d2";
          }}
        >
          {"\u2139\ufe0f"} Leggi gli stati
        </button>
      </div>

      {/* Filter bar */}
      <div
        ref={filterBarRef}
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        }}
      >
        {/* Row 1: Customer search + Global search */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          {/* Customer search */}
          <div
            ref={customerDropdownRef}
            style={{ flex: "1 1 45%", minWidth: "250px", position: "relative" }}
          >
            <label
              htmlFor="customer-search"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "8px",
              }}
            >
              {"\ud83d\udc64"} Cliente
            </label>
            {selectedCustomer ? (
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
                  {selectedCustomer.name}
                </span>
                {selectedCustomer.code && (
                  <span style={{ color: "#666", fontSize: "12px" }}>
                    {selectedCustomer.code}
                  </span>
                )}
                <button
                  onClick={handleClearCustomer}
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
                  id="customer-search"
                  type="search"
                  placeholder="Cerca cliente per nome, P.IVA, città, CAP..."
                  value={customerSearchQuery}
                  onChange={(e) => handleCustomerSearch(e.target.value)}
                  onKeyDown={handleCustomerKeyDown}
                  onFocus={() => {
                    if (customerResults.length > 0)
                      setShowCustomerDropdown(true);
                  }}
                  autoComplete="off"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                    transition: "border-color 0.2s",
                    boxSizing: "border-box",
                  }}
                />
                {searchingCustomer && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#999",
                      marginTop: "4px",
                    }}
                  >
                    Ricerca...
                  </div>
                )}
                {showCustomerDropdown && customerResults.length > 0 && (
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
                    {customerResults.map((customer, index) => (
                      <div
                        key={customer.id}
                        data-customer-item
                        onClick={() => handleSelectCustomer(customer)}
                        onMouseEnter={() => setHighlightedCustomerIndex(index)}
                        style={{
                          padding: "10px 12px",
                          cursor: "pointer",
                          borderBottom:
                            index < customerResults.length - 1
                              ? "1px solid #f3f4f6"
                              : "none",
                          backgroundColor:
                            index === highlightedCustomerIndex
                              ? "#E3F2FD"
                              : "#fff",
                          transition: "background-color 0.1s",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                          }}
                        >
                          <strong style={{ fontSize: "14px" }}>
                            {customer.name}
                          </strong>
                          {customer.code && (
                            <span
                              style={{
                                marginLeft: "8px",
                                color: "#6b7280",
                                fontSize: "12px",
                                flexShrink: 0,
                              }}
                            >
                              {customer.code}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            marginTop: "2px",
                          }}
                        >
                          {customer.taxCode && (
                            <span
                              style={{
                                fontWeight: 600,
                                color: "#374151",
                              }}
                            >
                              P.IVA: {customer.taxCode}
                            </span>
                          )}
                          {(customer.address ||
                            customer.cap ||
                            customer.city) && (
                            <span
                              style={{
                                marginLeft: customer.taxCode ? "8px" : 0,
                              }}
                            >
                              {[
                                customer.address,
                                customer.cap,
                                customer.city &&
                                  `${customer.city}${customer.province ? ` (${customer.province})` : ""}`,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          )}
                          {customer.lastOrderDate &&
                            customer.lastOrderDate >
                              new Date(
                                Date.now() - 30 * 24 * 60 * 60 * 1000,
                              ).toISOString() && (
                              <span
                                style={{
                                  marginLeft: "8px",
                                  background: "#dcfce7",
                                  color: "#166534",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: 500,
                                }}
                              >
                                Ordine recente
                              </span>
                            )}
                        </div>
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
              {"\ud83d\udd0d"} Ricerca globale
            </label>
            <input autoComplete="off"
              id="global-search"
              type="search"
              placeholder="Cerca in tutti i campi: tracking, DDT, fatture, articoli..."
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.shiftKey) { searchGoPrev(); } else { searchGoNext(); }
                }
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "14px",
                border: "1px solid #ddd",
                borderRadius: "8px",
                outline: "none",
                transition: "border-color 0.2s",
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
              Filtra negli ordini caricati
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
            {timePresets.map((preset) => {
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
          {isSearchMode && (
            <span style={{ fontSize: "11px", color: "#1976d2", fontStyle: "italic", marginTop: "4px" }}>
              Ricerca su tutti i documenti
            </span>
          )}
        </div>

        {/* Row 3: Custom date inputs (only if preset === "custom") */}
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
              <input autoComplete="off"
                id="date-from"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => {
                  setFilters((prev) => ({
                    ...prev,
                    dateFrom: e.target.value,
                  }));
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
              <input autoComplete="off"
                id="date-to"
                type="date"
                value={filters.dateTo}
                onChange={(e) => {
                  setFilters((prev) => ({
                    ...prev,
                    dateTo: e.target.value,
                  }));
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

        {/* Row 4: Quick filter chips */}
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
            Filtri veloci
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {quickFilterDefs.map((quickFilter) => {
              const isActive = filters.quickFilters.has(quickFilter.id);
              return (
                <button
                  key={quickFilter.id}
                  onClick={() => {
                    setFilters((prev) => {
                      const newQuickFilters = new Set(prev.quickFilters);
                      if (isActive) {
                        newQuickFilters.delete(quickFilter.id);
                      } else {
                        newQuickFilters.add(quickFilter.id);
                      }
                      return { ...prev, quickFilters: newQuickFilters };
                    });
                  }}
                  style={{
                    padding: "8px 16px",
                    fontSize: "14px",
                    fontWeight: 600,
                    border: isActive
                      ? `2px solid ${quickFilter.color}`
                      : "1px solid #ddd",
                    borderRadius: "20px",
                    backgroundColor: isActive ? quickFilter.bgColor : "#fff",
                    color: isActive ? quickFilter.color : "#666",
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
                  {quickFilter.label} ({quickFilter.count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 5: Hide zero toggle + Clear filters */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Show hidden orders toggle */}
          <div
            onClick={() => setShowHidden(!showHidden)}
            role="switch"
            aria-checked={showHidden}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setShowHidden(!showHidden);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
              fontSize: "14px",
              color: "#555",
              userSelect: "none",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "22px",
                borderRadius: "11px",
                backgroundColor: showHidden ? "#1976d2" : "#ccc",
                position: "relative",
                transition: "background-color 0.2s",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  backgroundColor: "#fff",
                  position: "absolute",
                  top: "2px",
                  left: showHidden ? "20px" : "2px",
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </div>
            <span>Mostra ordini nascosti{hiddenOrderIds.size > 0 ? ` (${hiddenOrderIds.size})` : ""}</span>
          </div>

          {/* Clear filters button */}
          {hasActiveFilters && (
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
                marginLeft: "auto",
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
          )}
        </div>
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

      {/* Error state */}
      {error && !loading && (
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            border: "2px solid #f44336",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              textAlign: "center",
              marginBottom: "16px",
            }}
          >
            {"\u26a0\ufe0f"}
          </div>
          <p
            style={{
              fontSize: "16px",
              color: "#f44336",
              textAlign: "center",
              marginBottom: "16px",
            }}
          >
            {error}
          </p>
          <div style={{ textAlign: "center" }}>
            <button
              onClick={() => fetchOrders()}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#1565c0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#1976d2";
              }}
            >
              Riprova
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && orders.length === 0 && (
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
            Nessun ordine trovato
          </p>
          <p style={{ fontSize: "14px", color: "#666" }}>
            {hasActiveFilters
              ? "Prova a modificare i filtri di ricerca"
              : "Non hai ancora effettuato ordini"}
          </p>
        </div>
      )}

      {/* No results after filtering (orders loaded but all filtered out) */}
      {!loading &&
        !error &&
        orders.length > 0 &&
        displayedOrders.length === 0 && (
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
              style={{ fontSize: "14px", color: "#666", marginBottom: "16px" }}
            >
              {orders.length} ordini caricati, nessuno corrisponde ai filtri
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

      {/* Backorder warning banner */}
      {!loading && !error && backorderCount > 0 && !backorderDismissed && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 16px",
            marginBottom: "16px",
            backgroundColor: "#fff3e0",
            border: "1px solid #ff9800",
            borderRadius: "8px",
          }}
        >
          <span style={{ fontSize: "20px" }}>{"\u23f0"}</span>
          <span style={{ flex: 1, fontSize: "14px", color: "#ff6600" }}>
            <strong>{backorderCount}</strong>{" "}
            {backorderCount === 1 ? "ordine" : "ordini"} in &quot;ORDINE
            APERTO&quot; da oltre 36 ore — possibile backorder
          </span>
          <button
            onClick={() => {
              setFilters((prev) => ({
                ...prev,
                quickFilters: new Set(["backorder"]),
              }));
            }}
            style={{
              padding: "6px 12px",
              fontSize: "13px",
              fontWeight: 600,
              backgroundColor: "#ff6600",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Mostra
          </button>
          <button
            onClick={() => setBackorderDismissed(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "18px",
              color: "#999",
              padding: "2px 6px",
            }}
          >
            {"\u2715"}
          </button>
        </div>
      )}

      {/* Timeline content */}
      {!loading && !error && displayedOrders.length > 0 && (
        <div onClick={handleBackgroundClick}>
          {/* Results summary */}
          <div
            style={{
              fontSize: "13px",
              color: "#888",
              marginBottom: "12px",
            }}
          >
            {displayedOrders.length === orders.length
              ? `${orders.length} ordini`
              : `${displayedOrders.length} di ${orders.length} ordini`}
            {hasMoreOrders && ` (${visibleCount} visualizzati)`}
          </div>

          {/* Fixed search bar that follows the user */}
          {showSearchBar && !filterBarVisible && (
            <div
              style={{
                position: "fixed",
                top: debouncedSearch ? "8px" : "60px",
                left: "50%",
                transform: "translateX(-50%)",
                width: "min(calc(100% - 32px), 1160px)",
                zIndex: 99,
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap" as const,
                gap: "8px 12px",
                padding: "8px 12px",
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                opacity: debouncedSearch ? 1 : 0.6,
                transition: "opacity 0.3s",
              }}
            >
              <input autoComplete="off"
                type="text"
                placeholder="Ricerca..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, search: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) { searchGoPrev(); } else { searchGoNext(); }
                  }
                }}
                style={{
                  flex: "1 1 120px",
                  minWidth: "120px",
                  padding: "6px 10px",
                  fontSize: "13px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#1976d2";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#d1d5db";
                }}
              />
              {debouncedSearch && filteredOrders.length > 0 && (
                <>
                  <button
                    onClick={searchGoPrev}
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
                    style={{ fontSize: "13px", fontWeight: 500, color: "#333", whiteSpace: "nowrap" }}
                  >
                    {(searchFocusIndex % filteredOrders.length) + 1}/{filteredOrders.length}
                  </span>
                  <button
                    onClick={searchGoNext}
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
                </>
              )}
              <span
                style={{
                  fontSize: "12px",
                  color: "#888",
                  whiteSpace: "nowrap",
                }}
              >
                {debouncedSearch
                  ? `"${debouncedSearch}" in ${filteredOrders.length} ordini`
                  : `"${lastSearch}" - ricerca cancellata`}
              </span>
              <button
                onClick={clearSearch}
                title="Chiudi ricerca"
                style={{
                  padding: "2px 8px",
                  fontSize: "12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                  color: "#888",
                  marginLeft: "auto",
                }}
              >
                {"\u2715"}
              </button>
            </div>
          )}

          <div ref={resultsContainerRef}>
            {(() => {
              const renderedStackIds = new Set<string>();
              return orderGroups.map((group) => (
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

                <div>
                  {group.orders.map((order, orderIndex) => {
                      const stack = getStackForOrder(order.id);

                      if (stack && renderedStackIds.has(stack.stackId)) {
                        return null;
                      }

                      if (stack) {
                        const stackOrders = stack.orderIds
                          .map((id) => visibleOrdersById.get(id))
                          .filter(Boolean) as Order[];

                        if (stackOrders.length > 1) {
                          renderedStackIds.add(stack.stackId);
                          const stackContainsExpanded = expandedOrderId !== null && stack.orderIds.includes(expandedOrderId);
                          const isStackDimmed = expandedOrderId !== null && !selectionMode && !stackContainsExpanded;
                          return (
                            <div
                              key={`stack-${stack.stackId}`}
                              style={{
                                transition: "opacity 0.3s ease",
                                ...(isStackDimmed ? { opacity: 0.3, pointerEvents: "none" as const } : {}),
                              }}
                            >
                              <OrderCardStack
                                orders={stackOrders}
                                stackId={stack.stackId}
                                source={stack.source}
                                expandedOrderId={expandedOrderId}
                                onToggleOrder={(id) => handleToggle(id)}
                                onSendToVerona={handleSendToVerona}
                                onEdit={handleEdit}
                                onDeleteDone={() => fetchOrders({ background: true })}
                                token={token}
                                searchQuery={debouncedSearch}
                                editingOrderId={editingOrderId}
                                onEditDone={() => {
                                  setEditingOrderId(null);
                                  fetchOrders({ background: true });
                                }}
                                sentToVeronaIds={sentToVeronaIds}
                                onUnstack={stack.source === "manual" ? removeFromStack : undefined}
                                onDissolve={handleDissolveStack}
                                onLabelChange={stack.source === "manual" ? updateLabel : undefined}
                                onStackClose={() => setExpandedOrderId(null)}
                                onReorder={stack.source === "manual" ? reorderStack : undefined}
                                reason={stack.reason}
                                noteSummaries={noteSummaries}
                                notePreviews={notePreviews}
                                onNotesChanged={() => fetchOrders({ background: true })}
                                getSuggestedTab={debouncedSearch ? (o) => getMatchingTab(o, debouncedSearch) : undefined}
                                forceExpand={searchExpandedStackId === stack.stackId}
                              />
                            </div>
                          );
                        }
                      }

                      const isExpanded = expandedOrderId === order.id;
                      const isHighlighted = highlightFlash === order.id;
                      const isSelected = selectedOrderIds.has(order.id);
                      const someCardExpanded = expandedOrderId !== null && !selectionMode;
                      const isDimmed = someCardExpanded && !isExpanded;
                      const orderIsHidden = hiddenOrderIds.has(order.id);

                      return (
                        <div
                          key={order.id}
                          id={`order-${order.id}`}
                          data-order-card
                          data-order-number={order.orderNumber}
                          style={{
                            borderRadius: "12px",
                            transition: "box-shadow 0.5s ease, outline 0.5s ease, opacity 0.3s ease",
                            position: "relative",
                            ...(isDimmed
                              ? {
                                  opacity: 0.3,
                                  pointerEvents: "none" as const,
                                }
                              : {}),
                            ...(orderIsHidden && showHidden
                              ? {
                                  opacity: 0.5,
                                  border: "2px dashed #999",
                                }
                              : {}),
                            ...(isExpanded && someCardExpanded
                              ? {
                                  zIndex: 2,
                                  boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
                                }
                              : {}),
                            ...(isHighlighted
                              ? {
                                  outline: "3px solid #0066cc",
                                  boxShadow: "0 0 16px rgba(0, 102, 204, 0.35)",
                                }
                              : {}),
                            ...(selectionMode && isSelected
                              ? {
                                  outline: "2px solid #1976d2",
                                  boxShadow: "0 0 8px rgba(25, 118, 210, 0.3)",
                                }
                              : {}),
                            ...(selectionMode
                              ? {
                                  animation: "wiggle 1.4s ease-in-out infinite",
                                  animationDelay: `${(orderIndex % 3) * 0.12}s`,
                                }
                              : {}),
                          }}
                          onPointerDown={!selectionMode ? (e) => handleLongPressStart(order.id, e) : undefined}
                          onPointerUp={!selectionMode ? handleLongPressEnd : undefined}
                          onPointerLeave={!selectionMode ? handleLongPressEnd : undefined}
                          onPointerCancel={!selectionMode ? handleLongPressEnd : undefined}
                          onClick={selectionMode ? (e) => { e.stopPropagation(); if (justEnteredSelectionMode.current) return; handleToggleSelection(order.id); } : undefined}
                        >
                          {selectionMode && (
                            <div
                              style={{
                                position: "absolute",
                                top: "12px",
                                left: "12px",
                                zIndex: 10,
                                width: "28px",
                                height: "28px",
                                borderRadius: "50%",
                                border: isSelected ? "none" : "2px solid #9e9e9e",
                                backgroundColor: isSelected ? "#1976d2" : "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                                transition: "all 0.15s ease",
                              }}
                              onClick={(e) => { e.stopPropagation(); handleToggleSelection(order.id); }}
                            >
                              {isSelected && (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                  <path d="M3.5 8L6.5 11L12.5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          )}
                          <div style={selectionMode ? { pointerEvents: "none" } : undefined}>
                            <OrderCardNew
                              order={order}
                              expanded={selectionMode ? false : isExpanded}
                              onToggle={() => handleToggle(order.id)}
                              onSendToVerona={handleSendToVerona}
                              onEdit={handleEdit}
                              token={token}
                              searchQuery={debouncedSearch}
                              editing={editingOrderId === order.id}
                              onEditDone={() => {
                                setEditingOrderId(null);
                                fetchOrders({ background: true });
                              }}
                              onDeleteDone={() => fetchOrders({ background: true })}
                              justSentToVerona={sentToVeronaIds.has(order.id)}
                              noteSummary={noteSummaries[order.id]}
                              notePreviews={notePreviews[order.id]}
                              onNotesChanged={() => fetchOrders({ background: true })}
                              onHide={(id) => { setExpandedOrderId(null); handleHideOrder(id); }}
                              onUnhide={handleUnhideOrder}
                              isHidden={hiddenOrderIds.has(order.id)}
                              onClearVerification={async (id) => {
                                await fetchWithRetry(`/api/orders/${id}/verification/clear`, { method: 'POST' });
                                fetchOrders({ background: true });
                              }}
                              suggestedTab={debouncedSearch ? getMatchingTab(order, debouncedSearch) : null}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ));
            })()}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} style={{ height: "1px" }} />
        </div>
      )}

      {/* Scroll to top button */}
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

      {/* Send to Verona Modal */}
      <SendToVeronaModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalOrderId(null);
          setModalCustomerName("");
        }}
        onConfirm={handleConfirmSendToVerona}
        orderId={modalOrderId || ""}
        customerName={modalCustomerName}
        isLoading={sendingToVerona}
        progress={sendToVeronaProgress?.progress}
        progressOperation={sendToVeronaProgress?.operation}
      />

      {/* Sync Progress Modal */}
      <SyncProgressModal
        isOpen={syncModalOpen}
        type={syncType}
        progress={progress}
        onClose={() => {
          setSyncModalOpen(false);
          resetProgress();
        }}
      />

      {/* Order Status Legend Modal */}
      <OrderStatusLegend
        isOpen={legendOpen}
        onClose={() => setLegendOpen(false)}
      />

      {/* Selection mode bottom toolbar */}
      {selectionMode && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 300,
            backgroundColor: "#fff",
            borderTop: "1px solid #e0e0e0",
            boxShadow: "0 -2px 12px rgba(0,0,0,0.15)",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#333" }}>
            {selectedOrderIds.size} {selectedOrderIds.size === 1 ? "ordine selezionato" : "ordini selezionati"}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleCancelSelection}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: "#fff",
                color: "#666",
                border: "1px solid #ddd",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Annulla
            </button>
            <button
              onClick={() => setKtSyncDialogOpen(true)}
              disabled={selectedOrderIds.size === 0}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: selectedOrderIds.size === 0 ? "#bdbdbd" : "#7c3aed",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: selectedOrderIds.size === 0 ? "not-allowed" : "pointer",
                transition: "background-color 0.2s",
              }}
            >
              Sync KT
            </button>
            <button
              onClick={() => setStackReasonDialog(true)}
              disabled={selectedOrderIds.size < 2}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: selectedOrderIds.size < 2 ? "#bdbdbd" : "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: selectedOrderIds.size < 2 ? "not-allowed" : "pointer",
                transition: "background-color 0.2s",
              }}
            >
              Impila ({selectedOrderIds.size})
            </button>
            <button
              onClick={() => setBatchSendVeronaConfirmOpen(true)}
              disabled={selectedOrderIds.size === 0}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: selectedOrderIds.size === 0 ? "#bdbdbd" : "#2e7d32",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: selectedOrderIds.size === 0 ? "not-allowed" : "pointer",
                transition: "background-color 0.2s",
              }}
            >
              Invia a Verona ({selectedOrderIds.size})
            </button>
            <button
              onClick={() => setBatchDeleteConfirmOpen(true)}
              disabled={selectedOrderIds.size === 0}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: selectedOrderIds.size === 0 ? "#bdbdbd" : "#c62828",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: selectedOrderIds.size === 0 ? "not-allowed" : "pointer",
                transition: "background-color 0.2s",
              }}
            >
              Elimina ({selectedOrderIds.size})
            </button>
          </div>
        </div>
      )}

      {/* KT Sync dialog */}
      {ktSyncDialogOpen && (
        <KtSyncDialog
          orders={orders.filter((o) => selectedOrderIds.has(o.id))}
          onClose={() => setKtSyncDialogOpen(false)}
          onComplete={() => {
            setSelectionMode(false);
            setSelectedOrderIds(new Set());
          }}
        />
      )}

      {/* Batch delete confirm dialog */}
      {batchDeleteConfirmOpen && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 500, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setBatchDeleteConfirmOpen(false)}
        >
          <div
            style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "24px", maxWidth: "360px", width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#c62828", marginBottom: "12px" }}>Elimina ordini</div>
            <div style={{ fontSize: "14px", color: "#444", marginBottom: "20px" }}>
              Sei sicuro di voler eliminare <strong>{selectedOrderIds.size}</strong> {selectedOrderIds.size === 1 ? "ordine" : "ordini"} da Archibald?<br />
              <span style={{ color: "#c62828" }}>Questa operazione non può essere annullata.</span>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button onClick={() => setBatchDeleteConfirmOpen(false)} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 600, backgroundColor: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>Annulla</button>
              <button onClick={handleBatchDelete} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 700, backgroundColor: "#c62828", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch send to Verona confirm dialog */}
      {batchSendVeronaConfirmOpen && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 500, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setBatchSendVeronaConfirmOpen(false)}
        >
          <div
            style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "24px", maxWidth: "360px", width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#2e7d32", marginBottom: "12px" }}>Invia a Verona</div>
            <div style={{ fontSize: "14px", color: "#444", marginBottom: "20px" }}>
              Sei sicuro di voler inviare <strong>{selectedOrderIds.size}</strong> {selectedOrderIds.size === 1 ? "ordine" : "ordini"} a Verona?
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button onClick={() => setBatchSendVeronaConfirmOpen(false)} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 600, backgroundColor: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>Annulla</button>
              <button onClick={handleBatchSendToVerona} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 700, backgroundColor: "#2e7d32", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}>Invia</button>
            </div>
          </div>
        </div>
      )}

      {/* Stack reason dialog */}
      {stackReasonDialog && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 400,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setStackReasonDialog(false)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#333", marginBottom: "16px" }}>
              Impila {selectedOrderIds.size} ordini
            </h3>
            <label
              htmlFor="stack-reason"
              style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#555", marginBottom: "8px" }}
            >
              Motivo (opzionale)
            </label>
            <input autoComplete="off"
              id="stack-reason"
              type="text"
              placeholder="Es: stesso cliente, stessa spedizione..."
              value={stackReason}
              onChange={(e) => setStackReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirmStack();
                }
              }}
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "14px",
                border: "1px solid #ddd",
                borderRadius: "8px",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: "20px",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#1976d2"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#ddd"; }}
            />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setStackReasonDialog(false)}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#fff",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmStack}
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
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
