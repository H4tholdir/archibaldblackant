import { useState, useEffect, useCallback, useRef } from "react";
import { OrderCardNew } from "../components/OrderCardNew";
import { SendToMilanoModal } from "../components/SendToMilanoModal";
import { SyncProgressModal } from "../components/SyncProgressModal";
import { OrderStatusLegend } from "../components/OrderStatusLegend";
import { groupOrdersByPeriod } from "../utils/orderGrouping";
import type { Order } from "../types/order";
import { useSyncProgress } from "../hooks/useSyncProgress";
import { toastService } from "../services/toast.service";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { customerService } from "../services/customers.service";
import type { Customer } from "../db/schema";

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
  | "paid";

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

function matchesGlobalSearch(order: Order, query: string): boolean {
  const lower = query.toLowerCase();

  const topFields: (string | undefined | null)[] = [
    order.orderNumber,
    order.customerName,
    order.customerProfileId,
    order.orderDate,
    order.date,
    order.deliveryDate,
    order.orderType,
    order.salesOrigin,
    order.total,
    order.grossAmount,
    order.discountPercent,
    order.deliveryName,
    order.deliveryAddress,
    order.customerReference,
    order.remainingSalesFinancial,
    order.state,
    order.status,
    order.documentState,
    order.transferStatus,
    order.transferDate,
    order.completionDate,
    order.deliveryCompletedDate,
    order.articleSearchText,
  ];

  for (const val of topFields) {
    if (val && String(val).toLowerCase().includes(lower)) return true;
  }

  if (order.ddt) {
    const ddtFields: (string | undefined | null)[] = [
      order.ddt.trackingNumber,
      order.ddt.trackingCourier,
      order.ddt.ddtNumber,
      order.ddt.ddtDeliveryDate,
      order.ddt.ddtCustomerAccount,
      order.ddt.orderId,
      order.ddt.ddtSalesName,
      order.ddt.ddtDeliveryName,
      order.ddt.deliveryMethod,
      order.ddt.deliveryTerms,
      order.ddt.deliveryCity,
      order.ddt.attentionTo,
      order.ddt.deliveryAddress,
      order.ddt.ddtTotal,
      order.ddt.customerReference,
      order.ddt.description,
    ];
    for (const val of ddtFields) {
      if (val && String(val).toLowerCase().includes(lower)) return true;
    }
  }

  if (order.tracking) {
    if (
      order.tracking.trackingNumber &&
      order.tracking.trackingNumber.toLowerCase().includes(lower)
    )
      return true;
    if (
      order.tracking.trackingCourier &&
      order.tracking.trackingCourier.toLowerCase().includes(lower)
    )
      return true;
  }

  const invoiceFields: (string | undefined | null)[] = [
    order.invoiceNumber,
    order.invoiceDate,
    order.invoiceAmount,
    order.invoiceCustomerAccount,
    order.invoiceBillingName,
    order.invoiceRemainingAmount,
    order.invoiceTaxAmount,
    order.invoiceLineDiscount,
    order.invoiceTotalDiscount,
    order.invoicePurchaseOrder,
    order.invoiceDueDate,
    order.invoiceSettledAmount,
    order.invoiceLastPaymentId,
    order.invoiceLastSettlementDate,
  ];
  for (const val of invoiceFields) {
    if (val && String(val).toLowerCase().includes(lower)) return true;
  }

  if (order.items) {
    for (const item of order.items) {
      if (item.article && item.article.toLowerCase().includes(lower))
        return true;
      if (item.productName && item.productName.toLowerCase().includes(lower))
        return true;
      if (item.description && item.description.toLowerCase().includes(lower))
        return true;
    }
  }

  return false;
}

function parseItalianAmount(value: string): number {
  return parseFloat(value.replace(/\./g, "").replace(",", "."));
}

function isOrderPaid(order: Order): boolean {
  if (order.invoiceClosed === true) return true;
  if (order.invoiceRemainingAmount) {
    const remaining = parseItalianAmount(order.invoiceRemainingAmount);
    return !isNaN(remaining) && remaining <= 0;
  }
  return false;
}

function isLikelyDelivered(order: Order): boolean {
  if (order.status !== "CONSEGNATO") return false;
  if (order.invoiceNumber) return true;
  const shippedDate = order.ddt?.ddtDeliveryDate || order.date;
  const daysSinceShipped =
    (Date.now() - new Date(shippedDate).getTime()) / 86_400_000;
  return daysSinceShipped >= 6;
}

export function OrderHistory() {
  const { progress, reset: resetProgress } = useSyncProgress();
  const [orders, setOrders] = useState<Order[]>([]);
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
  const [sendingToMilano, setSendingToMilano] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

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

  // Hide zero amount toggle
  const [hideZeroAmount, setHideZeroAmount] = useState(true);

  // Backorder banner dismiss
  const [backorderDismissed, setBackorderDismissed] = useState(false);

  // Scroll state
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // Refs
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Debounce global search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Scroll listener for scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato. Effettua il login.");
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (selectedCustomer?.name)
        params.append("customer", selectedCustomer.name);
      if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.append("dateTo", filters.dateTo);
      params.append("limit", "100");

      const response = await fetchWithRetry(
        `/api/orders/history?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401) {
          setError("Sessione scaduta. Effettua il login.");
          localStorage.removeItem("archibald_jwt");
          return;
        }
        throw new Error(`Errore ${response.status}: ${response.statusText}`);
      }

      const data: OrderHistoryResponse = await response.json();
      if (!data.success) {
        throw new Error("Errore nel caricamento degli ordini");
      }

      setOrders(data.data.orders);
      setBackorderDismissed(false);
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError(err instanceof Error ? err.message : "Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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
    setHideZeroAmount(true);
  };

  const handleSendToMilano = (orderId: string, customerName: string) => {
    setModalOrderId(orderId);
    setModalCustomerName(customerName);
    setModalOpen(true);
  };

  const handleConfirmSendToMilano = async () => {
    if (!modalOrderId) return;

    setSendingToMilano(true);
    setError(null);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato. Effettua il login.");
        setSendingToMilano(false);
        return;
      }

      const response = await fetchWithRetry(
        `/api/orders/${modalOrderId}/send-to-milano`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401) {
          setError("Sessione scaduta. Effettua il login.");
          localStorage.removeItem("archibald_jwt");
          return;
        }
        throw new Error(`Errore ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Errore nell'invio a Milano");
      }

      setModalOpen(false);
      setModalOrderId(null);
      setModalCustomerName("");

      await fetchOrders();

      toastService.success("Ordine inviato a Milano con successo!");
    } catch (err) {
      console.error("Error sending to Milano:", err);
      setError(
        err instanceof Error ? err.message : "Errore nell'invio a Milano",
      );
    } finally {
      setSendingToMilano(false);
    }
  };

  const handleEdit = (orderId: string) => {
    window.location.href = `/order?orderId=${orderId}`;
  };

  // Apply quick filters client-side (OR logic: order matches if ANY selected filter matches)
  const applyQuickFilters = (ordersToFilter: Order[]): Order[] => {
    if (filters.quickFilters.size === 0) return ordersToFilter;

    return ordersToFilter.filter((order) => {
      for (const filterType of filters.quickFilters) {
        let matches = false;

        switch (filterType) {
          case "requiresAttention":
            matches =
              order.state === "IN ATTESA DI APPROVAZIONE" ||
              order.state === "TRANSFER ERROR";
            break;

          case "editable":
            matches =
              order.orderType === "GIORNALE" && order.state === "MODIFICA";
            break;

          case "backorder": {
            const hoursElapsed =
              (Date.now() - new Date(order.date).getTime()) / 3_600_000;
            matches =
              order.status === "ORDINE APERTO" && hoursElapsed > 36;
            break;
          }

          case "inTransit":
            matches =
              order.status === "CONSEGNATO" && !isLikelyDelivered(order);
            break;

          case "delivered":
            matches = isLikelyDelivered(order);
            break;

          case "invoiced":
            matches = !!order.invoiceNumber && !isOrderPaid(order);
            break;

          case "paid":
            matches = !!order.invoiceNumber && isOrderPaid(order);
            break;
        }

        if (matches) return true;
      }

      return false;
    });
  };

  // Filtering pipeline: hideZeroAmount → quick filters → global search
  let result = orders;
  if (hideZeroAmount) {
    result = result.filter((o) => {
      const t = parseFloat(
        String(o.total)
          .replace(/[^\d.,-]/g, "")
          .replace(",", "."),
      );
      return isNaN(t) || t !== 0;
    });
  }

  // Orders after hideZero, used for chip counts
  const ordersForCounts = result;

  const backorderCount = ordersForCounts.filter((o) => {
    const hoursElapsed =
      (Date.now() - new Date(o.date).getTime()) / 3_600_000;
    return o.status === "ORDINE APERTO" && hoursElapsed > 36;
  }).length;

  result = applyQuickFilters(result);
  if (debouncedSearch) {
    result = result.filter((o) => matchesGlobalSearch(o, debouncedSearch));
  }
  const filteredOrders = result;

  const hasActiveFilters =
    selectedCustomer !== null ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.quickFilters.size > 0 ||
    filters.search !== "" ||
    !hideZeroAmount;

  const orderGroups = groupOrdersByPeriod(filteredOrders);

  // Quick filter definitions
  const quickFilterDefs: {
    id: QuickFilterType;
    label: string;
    color: string;
    bgColor: string;
    count: number;
  }[] = [
    {
      id: "requiresAttention",
      label: "\u26a0\ufe0f Richiede attenzione",
      color: "#F44336",
      bgColor: "#FFEBEE",
      count: ordersForCounts.filter(
        (o) =>
          o.state === "IN ATTESA DI APPROVAZIONE" ||
          o.state === "TRANSFER ERROR",
      ).length,
    },
    {
      id: "editable",
      label: "\u270f\ufe0f Modificabili",
      color: "#757575",
      bgColor: "#F5F5F5",
      count: ordersForCounts.filter(
        (o) => o.orderType === "GIORNALE" && o.state === "MODIFICA",
      ).length,
    },
    {
      id: "backorder",
      label: "\u23f0 Possibile Backorder",
      color: "#E65100",
      bgColor: "#FFF3E0",
      count: ordersForCounts.filter((o) => {
        const hoursElapsed =
          (Date.now() - new Date(o.date).getTime()) / 3_600_000;
        return o.status === "ORDINE APERTO" && hoursElapsed > 36;
      }).length,
    },
    {
      id: "inTransit",
      label: "\ud83d\ude9a In transito",
      color: "#2196F3",
      bgColor: "#E3F2FD",
      count: ordersForCounts.filter(
        (o) => o.status === "CONSEGNATO" && !isLikelyDelivered(o),
      ).length,
    },
    {
      id: "delivered",
      label: "\ud83d\udce6 Consegnati",
      color: "#4CAF50",
      bgColor: "#E8F5E9",
      count: ordersForCounts.filter((o) => isLikelyDelivered(o)).length,
    },
    {
      id: "invoiced",
      label: "\ud83d\udcd1 Fatturati",
      color: "#9C27B0",
      bgColor: "#F3E5F5",
      count: ordersForCounts.filter((o) => !!o.invoiceNumber && !isOrderPaid(o))
        .length,
    },
    {
      id: "paid",
      label: "\u2705 Pagati",
      color: "#2E7D32",
      bgColor: "#E8F5E9",
      count: ordersForCounts.filter((o) => !!o.invoiceNumber && isOrderPaid(o))
        .length,
    },
  ];

  const timePresets: { id: TimePreset; label: string }[] = [
    { id: "today", label: "Oggi" },
    { id: "thisWeek", label: "Questa sett." },
    { id: "thisMonth", label: "Questo mese" },
    { id: "last3Months", label: "Ultimi 3 mesi" },
    { id: "thisYear", label: "Quest'anno" },
    { id: "custom", label: "Personalizzato" },
  ];

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
                  type="text"
                  placeholder="Cerca cliente per nome, P.IVA, citta\u0300, CAP..."
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
            <input
              id="global-search"
              type="text"
              placeholder="Cerca in tutti i campi: tracking, DDT, fatture, articoli..."
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
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
              <input
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
              <input
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
          {/* Hide zero amount toggle */}
          <div
            onClick={() => setHideZeroAmount(!hideZeroAmount)}
            role="switch"
            aria-checked={hideZeroAmount}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setHideZeroAmount(!hideZeroAmount);
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
                backgroundColor: hideZeroAmount ? "#1976d2" : "#ccc",
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
                  left: hideZeroAmount ? "20px" : "2px",
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </div>
            <span>{"Nascondi importo 0 \u20ac"}</span>
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
              onClick={fetchOrders}
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
        filteredOrders.length === 0 && (
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
      {!loading &&
        !error &&
        backorderCount > 0 &&
        !backorderDismissed && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              marginBottom: "16px",
              backgroundColor: "#FFF3E0",
              border: "1px solid #FF9800",
              borderRadius: "8px",
            }}
          >
            <span style={{ fontSize: "20px" }}>{"\u23f0"}</span>
            <span style={{ flex: 1, fontSize: "14px", color: "#E65100" }}>
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
                backgroundColor: "#E65100",
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
      {!loading && !error && filteredOrders.length > 0 && (
        <div>
          {/* Results summary */}
          <div
            style={{
              fontSize: "13px",
              color: "#888",
              marginBottom: "12px",
            }}
          >
            {filteredOrders.length === orders.length
              ? `${orders.length} ordini`
              : `${filteredOrders.length} di ${orders.length} ordini`}
          </div>

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

              <div>
                {group.orders.map((order) => {
                  const isExpanded = expandedOrderId === order.id;

                  return (
                    <OrderCardNew
                      key={order.id}
                      order={order}
                      expanded={isExpanded}
                      onToggle={() => handleToggle(order.id)}
                      onSendToMilano={handleSendToMilano}
                      onEdit={handleEdit}
                      token={localStorage.getItem("archibald_jwt") || undefined}
                    />
                  );
                })}
              </div>
            </div>
          ))}
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

      {/* Send to Milano Modal */}
      <SendToMilanoModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalOrderId(null);
          setModalCustomerName("");
        }}
        onConfirm={handleConfirmSendToMilano}
        orderId={modalOrderId || ""}
        customerName={modalCustomerName}
        isLoading={sendingToMilano}
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
    </div>
  );
}
