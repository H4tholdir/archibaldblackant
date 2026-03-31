import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { savePendingOrder, deletePendingOrder } from "../api/pending-orders";
import { enqueueOperation } from "../api/operations";
import { batchTransfer, batchRelease, batchMarkSold, batchReturnSold } from "../api/warehouse";
import { getFresisDiscounts } from "../api/fresis-discounts";
import { archiveOrders, reassignMergedOrderId } from "../api/fresis-history";
import { toastService } from "../services/toast.service";
import { pdfExportService } from "../services/pdf-export.service";
import type { PendingOrder } from "../types/pending-order";
import { calculateShippingCosts, archibaldLineAmount, SHIPPING_THRESHOLD } from "../utils/order-calculations";
import { arcaDocumentTotals } from "../utils/arca-math";
import { usePendingSync } from "../hooks/usePendingSync";
import { JobProgressBar } from "../components/JobProgressBar";
import { VerificationAlert } from "../components/VerificationAlert";
import { isFresis, FRESIS_DEFAULT_DISCOUNT } from "../utils/fresis-constants";
import { mergeFresisPendingOrders, applyFresisLineDiscounts } from "../utils/order-merge";
import { shareService } from "../services/share.service";
import { EmailShareDialog } from "../components/EmailShareDialog";
import { formatCurrency } from "../utils/format-currency";
import { getCustomers } from "../api/customers";
import { useOperationTracking } from "../contexts/OperationTrackingContext";
import { checkCustomerCompleteness } from "../utils/customer-completeness";
import type { Customer as RichCustomer } from "../types/customer";
import { useVatValidation } from '../hooks/useVatValidation';
import { CustomerQuickFix } from '../components/CustomerQuickFix';
import type { MissingFieldKey } from '../utils/customer-completeness';

function itemSubtotal(
  _order: PendingOrder,
  item: { price: number; quantity: number; discount?: number },
): number {
  return archibaldLineAmount(item.quantity, item.price, item.discount || 0);
}

function isInventtableError(msg: string | undefined | null): boolean {
  return !!msg?.includes('INVENTTABLE field not focused');
}

export function PendingOrdersPage() {
  const navigate = useNavigate();
  const { trackOperation } = useOperationTracking();

  // 🔧 FIX: Use usePendingSync hook to get real-time updates via WebSocket
  const {
    pendingOrders: orders,
    isSyncing: loading,
    staleJobIds,
    refetch,
    trackJobs,
  } = usePendingSync();

  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set(),
  );
  const [submitting, setSubmitting] = useState(false);

  // Merge Fresis state
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  // Fresis shipping estimate
  const [fresisEstimate, setFresisEstimate] = useState<{
    imponibile: number;
    loading: boolean;
  } | null>(null);

  // Expand/collapse state for each order
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(
    new Set(),
  );

  // Actions toggle - which orders have actions visible
  const [actionsVisibleIds, setActionsVisibleIds] = useState<Set<string>>(
    new Set(),
  );

  // Inline single-order delete confirmation
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<string | null>(null);
  // Batch delete confirmation modal
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  // Share state
  const [emailDialogOrder, setEmailDialogOrder] = useState<PendingOrder | null>(
    null,
  );
  const [emailDialogLoading, setEmailDialogLoading] = useState(false);
  const [sharingOrderId, setSharingOrderId] = useState<string | null>(null);

  const [customersMap, setCustomersMap] = useState<Map<string, RichCustomer>>(new Map());
  const [quickFixCustomer, setQuickFixCustomer] = useState<{
    erpId: string;
    customerName: string;
    missingFields: MissingFieldKey[];
  } | null>(null);
  const [validatingCustomerProfile, setValidatingCustomerProfile] =
    useState<string | null>(null);

  const {
    validate: validateVat,
    status: vatValidationStatus,
    errorMessage: vatValidationError,
    reset: resetVatValidation,
  } = useVatValidation();
  void vatValidationError;

  const refreshCustomer = useCallback(async (erpId: string) => {
    const token = localStorage.getItem('archibald_jwt') ?? '';
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(erpId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body: { success: boolean; data: RichCustomer } = await res.json();
      setCustomersMap((prev) => new Map(prev).set(erpId, body.data));
    } catch (err) {
      console.warn('Failed to refresh customer completeness', err);
    }
  }, []);

  useEffect(() => {
    if ((vatValidationStatus === 'done' || vatValidationStatus === 'error') && validatingCustomerProfile) {
      if (vatValidationStatus === 'done') refreshCustomer(validatingCustomerProfile);
      setValidatingCustomerProfile(null);
      resetVatValidation();
    }
  }, [vatValidationStatus, validatingCustomerProfile, refreshCustomer, resetVatValidation]);

  // Mobile responsiveness
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@keyframes wiggle-pending{0%{transform:rotate(0deg)}25%{transform:rotate(-0.35deg)}50%{transform:rotate(0deg)}75%{transform:rotate(0.35deg)}100%{transform:rotate(0deg)}}`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    if (selectedOrderIds.size === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedOrderIds(new Set());
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedOrderIds.size]);

  useEffect(() => {
    const token = localStorage.getItem("archibald_jwt") ?? "";
    getCustomers(token)
      .then((data) => {
        const customers = (data.data?.customers ?? []) as unknown as RichCustomer[];
        const map = new Map<string, RichCustomer>();
        for (const c of customers) {
          map.set(c.erpId, c);
        }
        setCustomersMap(map);
      })
      .catch((err) => {
        console.warn('Failed to load customers for completeness badges', err);
      });
  }, []);

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(orderId)) {
        updated.delete(orderId);
      } else {
        updated.add(orderId);
      }
      return updated;
    });
  };

  const selectableOrders = orders.filter(
    (o) => o.status !== "completed-warehouse",
  );

  const completableOrders = selectableOrders.filter((o) => {
    const c = customersMap.get(o.customerId);
    if (!c) return true; // map not yet loaded: don't block
    const isGhostOnly = o.items.length > 0 && o.items.every((i) => i.isGhostArticle);
    return checkCustomerCompleteness(c).ok || isGhostOnly;
  });

  const incompleteSelectedOrders = useMemo(() => {
    return orders
      .filter((o) => selectedOrderIds.has(o.id!))
      .filter((o) => {
        const c = customersMap.get(o.customerId);
        if (!c) return false;
        const isGhostOnly = o.items.every((i) => i.isGhostArticle);
        return !checkCustomerCompleteness(c).ok && !isGhostOnly;
      })
      .map((o) => {
        const c = customersMap.get(o.customerId)!;
        return {
          orderId: o.id!,
          erpId: o.customerId,
          customerName: o.customerName,
          missingFields: checkCustomerCompleteness(c).missingFields,
        };
      });
  }, [orders, selectedOrderIds, customersMap]);

  const handleSelectAll = () => {
    if (selectedOrderIds.size === completableOrders.length && completableOrders.length > 0) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(completableOrders.map((o) => o.id)));
    }
  };

  const handleToggleExpand = (orderId: string) => {
    setExpandedOrderIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(orderId)) {
        updated.delete(orderId);
      } else {
        updated.add(orderId);
      }
      return updated;
    });
  };

  const handleSubmitOrders = async () => {
    if (selectedOrderIds.size === 0) return;

    setSubmitting(true);

    try {
      if (!localStorage.getItem("archibald_jwt")) {
        throw new Error("Token non trovato, rifare login");
      }

      const selectedOrders = orders.filter((o) => selectedOrderIds.has(o.id!));

      const incompleteOrders = selectedOrders.filter((o) => {
        const c = customersMap.get(o.customerId);
        if (!c) return false;
        const isGhostOnly = o.items.every((i) => i.isGhostArticle);
        return !checkCustomerCompleteness(c).ok && !isGhostOnly;
      });
      if (incompleteOrders.length > 0) {
        console.warn('[PendingOrdersPage] Filtered out incomplete customers before submit:', incompleteOrders.map((o) => o.customerId));
      }
      const filteredOrders = selectedOrders.filter((o) => !incompleteOrders.includes(o));
      if (filteredOrders.length === 0) return;

      // Pre-load Fresis discounts if any selected order is a Fresis sub-client order
      const hasFresisSubclient = filteredOrders.some(
        (o) => isFresis({ id: o.customerId }) && o.subClientCodice,
      );
      let fresisDiscountMap: Map<string, number> | null = null;
      if (hasFresisSubclient) {
        const allDiscounts = await getFresisDiscounts();
        fresisDiscountMap = new Map<string, number>();
        for (const d of allDiscounts) {
          fresisDiscountMap.set(d.id, d.discountPercent);
          fresisDiscountMap.set(d.articleCode, d.discountPercent);
        }
      }

      const results = await Promise.all(
        filteredOrders.map(async (order) => {
          const isFresisSubclient =
            isFresis({ id: order.customerId }) && !!order.subClientCodice;

          // Archive Fresis sub-client orders to history before transforming
          if (isFresisSubclient) {
            await archiveOrders([order]);
          }

          // Transform items for Fresis sub-client: list price + dealer discounts
          const items = isFresisSubclient && fresisDiscountMap
            ? applyFresisLineDiscounts(order.items, fresisDiscountMap)
            : order.items;

          return enqueueOperation('submit-order', {
            pendingOrderId: order.id,
            customerId: order.customerId,
            customerName: order.customerName,
            items: items.map((item) => ({
              articleCode: item.articleCode,
              productName: item.productName,
              description: item.description,
              quantity: item.quantity,
              price: item.price,
              discount: item.discount,
              vat: item.vat,
              warehouseQuantity: item.warehouseQuantity || 0,
              warehouseSources: item.warehouseSources || [],
            })),
            discountPercent: isFresisSubclient ? undefined : order.discountPercent,
            targetTotalWithVAT: isFresisSubclient ? undefined : order.targetTotalWithVAT,
            noShipping: order.noShipping,
            notes: order.notes,
            deliveryAddressId: order.deliveryAddressId,
          });
        }),
      );
      const jobIds = results.map((r) => r.jobId);

      trackJobs(
        filteredOrders.map((order, i) => ({
          orderId: order.id!,
          jobId: jobIds[i],
        })),
      );

      for (let idx = 0; idx < filteredOrders.length; idx++) {
        const order = filteredOrders[idx];
        const jobId = jobIds[idx];
        if (jobId) {
          trackOperation(order.id!, jobId, order.customerName);
        }
      }

      for (const orderId of selectedOrderIds) {
        const order = orders.find((o) => o.id === orderId);
        if (order) {
          await savePendingOrder({
            ...order,
            status: "syncing",
            updatedAt: new Date().toISOString(),
            needsSync: true,
          });
        }
      }

      toastService.success(
        `Ordini inviati al bot. Job IDs: ${jobIds.join(", ")}`,
      );

      await refetch();
      setSelectedOrderIds(new Set());
    } catch (error) {
      console.error("[PendingOrdersPage] Submission failed:", error);
      toastService.error("Errore durante l'invio degli ordini. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryOrder = async (orderId: string) => {
    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        toastService.error("Ordine non trovato");
        return;
      }

      if (!localStorage.getItem("archibald_jwt")) {
        throw new Error("Token non trovato, rifare login");
      }

      // Reset job fields via API
      await savePendingOrder({
        ...order,
        jobId: undefined,
        jobStatus: "idle",
        jobProgress: 0,
        jobOperation: undefined,
        jobError: undefined,
        status: "pending",
        errorMessage: undefined,
        retryCount: (order.retryCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      });

      const isFresisSubclient =
        isFresis({ id: order.customerId }) && !!order.subClientCodice;

      let items = order.items;
      if (isFresisSubclient) {
        const allDiscounts = await getFresisDiscounts();
        const fresisDiscountMap = new Map<string, number>();
        for (const d of allDiscounts) {
          fresisDiscountMap.set(d.id, d.discountPercent);
          fresisDiscountMap.set(d.articleCode, d.discountPercent);
        }
        items = applyFresisLineDiscounts(order.items, fresisDiscountMap);
      }

      const result = await enqueueOperation('submit-order', {
        pendingOrderId: order.id,
        customerId: order.customerId,
        customerName: order.customerName,
        items: items.map((item) => ({
          articleCode: item.articleCode,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
          vat: item.vat,
          warehouseQuantity: item.warehouseQuantity || 0,
          warehouseSources: item.warehouseSources || [],
        })),
        discountPercent: isFresisSubclient ? undefined : order.discountPercent,
        targetTotalWithVAT: isFresisSubclient ? undefined : order.targetTotalWithVAT,
        noShipping: order.noShipping,
        notes: order.notes,
        deliveryAddressId: order.deliveryAddressId,
      });

      trackJobs([{ orderId: order.id!, jobId: result.jobId }]);
      trackOperation(order.id!, result.jobId, order.customerName);
      toastService.success("Ordine reinviato al bot");
      await refetch();
    } catch (error) {
      console.error("[PendingOrdersPage] Retry failed:", error);
      toastService.error("Errore durante il reinvio");
    }
  };

  const releaseWarehouseForOrder = async (order: PendingOrder) => {
    try {
      await batchRelease(`pending-${order.id}`);
      await batchReturnSold(`pending-${order.id}`, "order_deleted");
    } catch (warehouseError) {
      console.error("[PendingOrdersPage] Failed to release warehouse items", warehouseError);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    setConfirmDeleteOrderId(null);
    try {
      const order = orders.find((o) => o.id === orderId);
      if (order) {
        await releaseWarehouseForOrder(order);
      }
      await deletePendingOrder(orderId);
      toastService.success("Ordine eliminato con successo");
      await refetch();
      setSelectedOrderIds((prev) => {
        const updated = new Set(prev);
        updated.delete(orderId);
        return updated;
      });
    } catch (error) {
      console.error("[PendingOrdersPage] Failed to delete order:", error);
      toastService.error("Errore durante l'eliminazione dell'ordine. Riprova.");
    }
  };

  const handleDeleteSelectedOrders = async () => {
    if (selectedOrderIds.size === 0) return;
    setConfirmBatchDelete(false);
    try {
      for (const orderId of selectedOrderIds) {
        const order = orders.find((o) => o.id === orderId);
        if (order) {
          await releaseWarehouseForOrder(order);
        }
        await deletePendingOrder(orderId);
      }

      await refetch();
      setSelectedOrderIds(new Set());
    } catch (error) {
      console.error(
        "[PendingOrdersPage] Failed to delete selected orders:",
        error,
      );
      toastService.error(
        "Errore durante l'eliminazione degli ordini. Riprova.",
      );
    }
  };

  const selectedFresisOrders = useMemo(
    () => orders.filter(
      (o) => selectedOrderIds.has(o.id!) && isFresis({ id: o.customerId }),
    ),
    [orders, selectedOrderIds],
  );

  const calculateFresisEstimate = useCallback(async () => {
    if (selectedFresisOrders.length < 2) {
      setFresisEstimate(null);
      return;
    }
    setFresisEstimate({ imponibile: 0, loading: true });
    try {
      const allDiscounts = await getFresisDiscounts();
      const discountMap = new Map<string, number>();
      for (const d of allDiscounts) {
        discountMap.set(d.id, d.discountPercent);
        discountMap.set(d.articleCode, d.discountPercent);
      }

      let imponibile = 0;
      for (const order of selectedFresisOrders) {
        for (const item of order.items) {
          const lineDiscount =
            discountMap.get(item.articleId ?? "") ??
            discountMap.get(item.articleCode) ??
            FRESIS_DEFAULT_DISCOUNT;
          const listPrice = item.originalListPrice ?? item.price;
          imponibile += archibaldLineAmount(item.quantity, listPrice, lineDiscount);
        }
      }
      setFresisEstimate({ imponibile, loading: false });
    } catch {
      setFresisEstimate(null);
    }
  }, [selectedFresisOrders]);

  useEffect(() => {
    calculateFresisEstimate();
  }, [calculateFresisEstimate]);

  const handleMergeFresis = async () => {
    if (selectedFresisOrders.length < 2) return;

    try {
      const allDiscounts = await getFresisDiscounts();
      const discountMap = new Map<string, number>();
      for (const d of allDiscounts) {
        discountMap.set(d.id, d.discountPercent);
        discountMap.set(d.articleCode, d.discountPercent);
      }

      const mergedOrder = mergeFresisPendingOrders(
        selectedFresisOrders,
        discountMap,
      );

      // Calculate revenue for merged order
      let mergedRevenue = 0;
      for (const item of mergedOrder.items) {
        const fresisDisc =
          discountMap.get(item.articleId ?? "") ??
          discountMap.get(item.articleCode) ??
          0;
        const originalPrice = item.originalListPrice ?? item.price;
        const prezzoCliente =
          item.price *
          item.quantity *
          (1 - (item.discount || 0) / 100);
        const costoFresis =
          originalPrice * item.quantity * (1 - fresisDisc / 100);
        mergedRevenue += prezzoCliente - costoFresis;
      }
      mergedOrder.revenue = mergedRevenue;

      // Calculate revenue for each original order and tag as created in PWA
      const ordersToArchive = selectedFresisOrders.map((order) => {
        let orderRevenue = 0;
        for (const item of order.items) {
          const fresisDisc =
            discountMap.get(item.articleId ?? "") ??
            discountMap.get(item.articleCode) ??
            0;
          const originalPrice = item.originalListPrice ?? item.price;
          const prezzoCliente =
            item.price *
            item.quantity *
            (1 - (item.discount || 0) / 100);
          const costoFresis =
            originalPrice * item.quantity * (1 - fresisDisc / 100);
          orderRevenue += prezzoCliente - costoFresis;
        }
        return { ...order, revenue: orderRevenue, currentState: "creato_pwa" };
      });

      // Archive original orders to fresisHistory
      await archiveOrders(ordersToArchive, mergedOrder.id);

      // Re-assign existing history entries from old merged orders to new merged order
      for (const order of selectedFresisOrders) {
        await reassignMergedOrderId(order.id!, mergedOrder.id);
      }

      // Save merged order to server
      await savePendingOrder(mergedOrder);

      // Transfer warehouse reservations from original orders to merged order
      const originalIds = selectedFresisOrders.map((o) => `pending-${o.id!}`);
      await batchTransfer(originalIds, `pending-${mergedOrder.id}`);

      // Delete original orders from server (releaseWarehouseReservations will be a no-op since items were transferred)
      for (const original of selectedFresisOrders) {
        await deletePendingOrder(original.id!);
      }

      await refetch();
      setSelectedOrderIds(new Set());
      setShowMergeDialog(false);
      toastService.success(
        `Unione completata: ${selectedFresisOrders.length} ordini uniti con sconti per-riga`,
      );
    } catch (error) {
      console.error("[PendingOrdersPage] Merge failed:", error);
      toastService.error("Errore durante l'unione degli ordini");
    }
  };

  const handleConfirmWarehouseOrder = async (order: PendingOrder) => {
    if (
      !confirm(
        "Confermi di aver verificato l'ordine magazzino? L'ordine verrà archiviato nello storico.",
      )
    ) {
      return;
    }

    try {
      // Mark warehouse items as sold on confirmation
      try {
        await batchMarkSold(`pending-${order.id}`, {
          customerName: order.customerName,
          subClientName: order.subClientName,
          orderDate: order.createdAt,
        });
        console.log("[PendingOrdersPage] Warehouse items marked as sold", { orderId: order.id });
      } catch (warehouseError) {
        console.error("[PendingOrdersPage] Failed to mark warehouse items as sold", warehouseError);
      }

      // Archive to fresisHistory if it's a Fresis sub-client order
      // generateFtNow=true so arca_data and invoice_number are set immediately
      if (isFresis({ id: order.customerId }) && order.subClientCodice) {
        const allDiscounts = await getFresisDiscounts();
        const discountMap = new Map<string, number>();
        for (const d of allDiscounts) {
          discountMap.set(d.id, d.discountPercent);
          discountMap.set(d.articleCode, d.discountPercent);
        }

        let orderRevenue = 0;
        for (const item of order.items) {
          const fresisDisc =
            discountMap.get(item.articleId ?? "") ??
            discountMap.get(item.articleCode) ??
            FRESIS_DEFAULT_DISCOUNT;
          const originalPrice = item.originalListPrice ?? item.price;
          const prezzoCliente = item.price * item.quantity * (1 - (item.discount || 0) / 100);
          const costoFresis = originalPrice * item.quantity * (1 - fresisDisc / 100);
          orderRevenue += prezzoCliente - costoFresis;
        }

        await archiveOrders([{ ...order, revenue: orderRevenue }], undefined, true);
      }

      await deletePendingOrder(order.id!);

      toastService.success("Ordine magazzino confermato e archiviato");
      await refetch();
    } catch (error) {
      console.error(
        "[PendingOrdersPage] Failed to confirm warehouse order:",
        error,
      );
      toastService.error("Errore durante la conferma dell'ordine magazzino");
    }
  };

  const handleEditOrder = (orderId: string) => {
    // Navigate to order form with order ID as query parameter
    navigate(`/order?editOrderId=${orderId}`);
  };

  const enrichForPDF = (order: PendingOrder) => ({
    ...order,
    customerData: customersMap.get(order.customerId),
  });

  const handleDownloadPDF = (order: PendingOrder) => {
    try {
      pdfExportService.downloadOrderPDF(enrichForPDF(order));
      toastService.success("PDF scaricato con successo");
    } catch (error) {
      console.error("[PendingOrdersPage] Failed to generate PDF:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toastService.error(
        `Errore durante la generazione del PDF: ${errorMessage}`,
      );
    }
  };

  const handlePrintOrder = (order: PendingOrder) => {
    try {
      pdfExportService.printOrderPDF(enrichForPDF(order));
      toastService.info("Apertura finestra di stampa...");
    } catch (error) {
      console.error("[PendingOrdersPage] Failed to print order:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toastService.error(`Errore durante la stampa: ${errorMessage}`);
    }
  };

  function getOrderRecipientName(order: PendingOrder): string {
    if (order.subClientData) {
      return (
        order.subClientData.ragioneSociale ||
        order.subClientName ||
        order.customerName
      );
    }
    return order.customerName;
  }

  async function getOrderContactInfo(order: PendingOrder) {
    if (order.subClientData) {
      return {
        phone: order.subClientData.telefono,
        email: order.subClientData.email,
      };
    }
    const token = localStorage.getItem("archibald_jwt") ?? "";
    try {
      const result = await getCustomers(token);
      const customer = result.data?.customers.find((c) => c.id === order.customerId);
      return { phone: customer?.phone ?? undefined, email: customer?.pec ?? undefined };
    } catch {
      return { phone: undefined, email: undefined };
    }
  }

  const handleWhatsApp = async (order: PendingOrder) => {
    try {
      setSharingOrderId(order.id!);
      const blob = pdfExportService.getOrderPDFBlob(enrichForPDF(order));
      const fileName = pdfExportService.getOrderPDFFileName(order);
      const recipientName = getOrderRecipientName(order);
      const message = `Buongiorno, ecco il preventivo per ${recipientName}:`;
      await shareService.shareViaWhatsApp(blob, fileName, message);
    } catch (error) {
      console.error("[PendingOrdersPage] WhatsApp share failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toastService.error(`Errore condivisione WhatsApp: ${errorMessage}`);
    } finally {
      setSharingOrderId(null);
    }
  };

  const handleEmail = (order: PendingOrder) => {
    setEmailDialogOrder(order);
  };

  const handleEmailSend = async (to: string, subject: string, body: string) => {
    if (!emailDialogOrder) return;
    try {
      setEmailDialogLoading(true);
      const blob = pdfExportService.getOrderPDFBlob(enrichForPDF(emailDialogOrder));
      const fileName = pdfExportService.getOrderPDFFileName(emailDialogOrder);
      await shareService.sendEmail(blob, fileName, to, subject, body);
      toastService.success("Email inviata con successo");
      setEmailDialogOrder(null);
    } catch (error) {
      console.error("[PendingOrdersPage] Email send failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toastService.error(`Errore invio email: ${errorMessage}`);
    } finally {
      setEmailDialogLoading(false);
    }
  };

  const handleDropbox = async (order: PendingOrder) => {
    try {
      setSharingOrderId(order.id!);
      const blob = pdfExportService.getOrderPDFBlob(enrichForPDF(order));
      const fileName = pdfExportService.getOrderPDFFileName(order);
      const result = await shareService.uploadToDropbox(blob, fileName);
      toastService.success(`PDF caricato su Dropbox: ${result.path}`);
    } catch (error) {
      console.error("[PendingOrdersPage] Dropbox upload failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toastService.error(`Errore upload Dropbox: ${errorMessage}`);
    } finally {
      setSharingOrderId(null);
    }
  };

  // Email dialog helper: get default email for the order
  const [emailDialogDefaultEmail, setEmailDialogDefaultEmail] = useState("");
  useEffect(() => {
    if (!emailDialogOrder) {
      setEmailDialogDefaultEmail("");
      return;
    }
    getOrderContactInfo(emailDialogOrder).then((contact) => {
      setEmailDialogDefaultEmail(contact.email || "");
    });
  }, [emailDialogOrder]);

  if (loading) {
    return (
      <div
        style={{
          padding: isMobile ? "1.5rem" : "2rem",
          textAlign: "center",
          fontSize: isMobile ? "0.9375rem" : "1rem",
        }}
      >
        Caricamento ordini in attesa...
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div
        style={{
          padding: isMobile ? "1.5rem" : "2rem",
          textAlign: "center",
          color: "#6b7280",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          border: "1px dashed #d1d5db",
          margin: isMobile ? "1rem" : "2rem",
        }}
      >
        <h2
          style={{
            fontSize: isMobile ? "1.25rem" : "1.5rem",
            marginBottom: "0.5rem",
          }}
        >
          Nessun ordine in attesa
        </h2>
        <p style={{ fontSize: isMobile ? "0.875rem" : "1rem" }}>
          Gli ordini creati appariranno qui prima dell'invio.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "1rem" : "2rem", paddingBottom: selectedOrderIds.size > 0 ? (isMobile ? "80px" : "72px") : undefined }}>
      <div style={{ marginBottom: isMobile ? "1rem" : "1.5rem" }}>
        <h1
          style={{
            fontSize: isMobile ? "1.5rem" : "1.875rem",
            fontWeight: "700",
          }}
        >
          Ordini in Attesa ({orders.length})
        </h1>
      </div>


      {/* Merge Fresis Dialog */}
      {showMergeDialog && (
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
            zIndex: 9999,
          }}
          onClick={() => setShowMergeDialog(false)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "1.5rem",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: "700",
                marginBottom: "1rem",
              }}
            >
              Unisci Ordini Fresis
            </h2>
            <p style={{ marginBottom: "0.75rem", color: "#6b7280" }}>
              Unisci {selectedFresisOrders.length} ordini in un unico ordine
              Fresis. Gli articoli con lo stesso codice verranno sommati.
            </p>

            <div
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                backgroundColor: "#fffbeb",
                borderRadius: "8px",
                fontSize: "0.875rem",
              }}
            >
              <strong>Ordini da unire:</strong>
              <ul style={{ margin: "0.5rem 0 0 1rem", padding: 0 }}>
                {selectedFresisOrders.map((o) => (
                  <li key={o.id}>
                    {o.subClientName || o.customerName} - {o.items.length}{" "}
                    articoli
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={handleMergeFresis}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  backgroundColor: "#f59e0b",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Conferma Unione
              </button>
              <button
                onClick={() => setShowMergeDialog(false)}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  backgroundColor: "#e5e7eb",
                  color: "#374151",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {incompleteSelectedOrders.length > 0 && (
        <div
          style={{
            background: '#fff5f5',
            border: '1.5px solid #fca5a5',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#dc2626',
              marginBottom: '8px',
            }}
          >
            ⚠{' '}
            {incompleteSelectedOrders.length === 1
              ? '1 ordine bloccato — scheda cliente incompleta'
              : `${incompleteSelectedOrders.length} ordini bloccati — schede clienti incomplete`}
          </div>
          {incompleteSelectedOrders.map((item) => (
            <div
              key={item.orderId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px',
              }}
            >
              <span style={{ fontSize: '13px', color: '#374151' }}>{item.customerName}</span>
              <button
                onClick={() => setQuickFixCustomer(item)}
                style={{
                  padding: '4px 10px',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Completa →
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          padding: isMobile ? "0.875rem" : "1rem",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          marginBottom: isMobile ? "0.75rem" : "1rem",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
          }}
        >
          <input autoComplete="off"
            type="checkbox"
            checked={selectedOrderIds.size === completableOrders.length && completableOrders.length > 0}
            onChange={handleSelectAll}
            style={{
              width: isMobile ? "1.375rem" : "1.25rem",
              height: isMobile ? "1.375rem" : "1.25rem",
              cursor: "pointer",
              minWidth: "22px", // Touch target
              minHeight: "22px",
            }}
          />
          <span
            style={{
              fontWeight: "500",
              fontSize: isMobile ? "1rem" : "0.95rem",
            }}
          >
            Seleziona Tutti
          </span>
        </label>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {orders.map((order, orderIndex) => {
          const isJobActive =
            order.jobStatus &&
            ["started", "processing"].includes(order.jobStatus);
          const isJobCompleted = order.jobStatus === "completed";
          const isJobFailed = order.jobStatus === "failed";
          const isPersistedError = order.status === "error" && !isJobActive && !isJobFailed;
          const isStale = staleJobIds.has(order.id!);

          const isWarehouseOrder = order.status === "completed-warehouse";
          const isSelected = selectedOrderIds.has(order.id!);
          const cardOpacity = isJobActive || isJobCompleted ? 0.6 : 1;
          const cardBgColor = isJobCompleted
            ? "#f0fdf4"
            : isJobFailed
              ? "#fef2f2"
              : isWarehouseOrder
                ? "#eff6ff"
                : "white";

          return (
            <div
              key={order.id}
              style={{
                borderTop: isSelected ? "2px solid #1976d2" : isWarehouseOrder ? "1px solid #93c5fd" : "1px solid #e5e7eb",
                borderRight: isSelected ? "2px solid #1976d2" : isWarehouseOrder ? "1px solid #93c5fd" : "1px solid #e5e7eb",
                borderBottom: isSelected ? "2px solid #1976d2" : isWarehouseOrder ? "1px solid #93c5fd" : "1px solid #e5e7eb",
                borderLeft: isSelected ? "2px solid #1976d2" : isWarehouseOrder ? "4px solid #3b82f6" : "1px solid #e5e7eb",
                borderRadius: "8px",
                padding: isMobile ? "1rem" : "1.5rem",
                backgroundColor: cardBgColor,
                opacity: cardOpacity,
                transition: "opacity 0.3s ease, background-color 0.3s ease, border-color 0.2s ease",
                boxShadow: isSelected ? "0 0 8px rgba(25, 118, 210, 0.25)" : undefined,
                ...(isSelected
                  ? {
                      animation: "wiggle-pending 1.4s ease-in-out infinite",
                      animationDelay: `${(orderIndex % 3) * 0.12}s`,
                    }
                  : {}),
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  justifyContent: "space-between",
                  alignItems: isMobile ? "stretch" : "flex-start",
                  marginBottom: isMobile ? "0.75rem" : "1rem",
                  gap: isMobile ? "0.75rem" : "0",
                }}
              >
                {/* Checkbox and customer info */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: isMobile ? "0.75rem" : "1rem",
                  }}
                >
                  {(() => {
                    const richCustomer = customersMap.get(order.customerId);
                    const isGhostOnly = order.items.length > 0 && order.items.every((i) => i.isGhostArticle);
                    const checkboxDisabled =
                      !!richCustomer && !checkCustomerCompleteness(richCustomer).ok && !isGhostOnly;

                    return isWarehouseOrder ? (
                      <div
                        style={{
                          width: isMobile ? "1.375rem" : "1.25rem",
                          height: isMobile ? "1.375rem" : "1.25rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1rem",
                        }}
                        title="Ordine magazzino: conferma manuale richiesta"
                      >
                        🏪
                      </div>
                    ) : (
                      <input
                        autoComplete="off"
                        type="checkbox"
                        checked={selectedOrderIds.has(order.id!)}
                        disabled={checkboxDisabled}
                        onChange={() => !checkboxDisabled && handleSelectOrder(order.id!)}
                        style={{
                          width: isMobile ? "1.375rem" : "1.25rem",
                          height: isMobile ? "1.375rem" : "1.25rem",
                          cursor: checkboxDisabled ? "not-allowed" : "pointer",
                          opacity: checkboxDisabled ? 0.45 : 1,
                          marginTop: "0.125rem",
                          minWidth: "22px",
                          minHeight: "22px",
                        }}
                      />
                    );
                  })()}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: "600",
                        fontSize: isMobile ? "1.0625rem" : "1.125rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      {order.customerName}
                    </div>
                    {(() => {
                      const richCustomer = customersMap.get(order.customerId);
                      if (!richCustomer) return null;
                      const completeness = checkCustomerCompleteness(richCustomer);
                      if (completeness.ok) return null;
                      const onlyVatMissing =
                        completeness.missing.length === 1 &&
                        completeness.missing[0] === 'P.IVA non validata';
                      const canValidateVat = onlyVatMissing && !!richCustomer.vatNumber;
                      const isValidatingThis = validatingCustomerProfile === order.customerId;
                      return (
                        <div
                          style={{
                            background: '#fff3cd',
                            color: '#856404',
                            border: '1px solid #ffc107',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '0.25rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>⚠ {completeness.missing.join(', ')}</span>
                          {canValidateVat ? (
                            <button
                              onClick={() => {
                                if (validatingCustomerProfile !== null) return;
                                setValidatingCustomerProfile(order.customerId);
                                validateVat(richCustomer.erpId, richCustomer.vatNumber!);
                              }}
                              disabled={validatingCustomerProfile !== null}
                              style={{
                                marginLeft: '4px',
                                background: 'none',
                                border: '1px solid #856404',
                                color: '#856404',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                cursor: validatingCustomerProfile !== null ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                opacity: validatingCustomerProfile !== null ? 0.6 : 1,
                              }}
                            >
                              {isValidatingThis ? 'Validazione in corso…' : 'Valida ora →'}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                const completeness = checkCustomerCompleteness(richCustomer);
                                setQuickFixCustomer({
                                  erpId: richCustomer.erpId,
                                  customerName: richCustomer.name,
                                  missingFields: completeness.missingFields,
                                });
                              }}
                              style={{
                                marginLeft: '4px',
                                background: 'none',
                                border: '1px solid #856404',
                                color: '#856404',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              Completa scheda →
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {order.subClientCodice && (
                      <div
                        style={{
                          fontSize: isMobile ? "0.75rem" : "0.8125rem",
                          color: "#92400e",
                          backgroundColor: "#fef3c7",
                          padding: "0.125rem 0.5rem",
                          borderRadius: "4px",
                          display: "inline-block",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Sotto-cliente:{" "}
                        {order.subClientName || order.subClientCodice}
                      </div>
                    )}
                    {order.deliveryAddressResolved && (
                      <div style={{ fontSize: '0.78rem', color: '#666', marginTop: 2 }}>
                        {'📍 '}
                        {[order.deliveryAddressResolved.via, order.deliveryAddressResolved.citta]
                          .filter(Boolean)
                          .join(' — ')}
                        {order.deliveryAddressResolved.tipo && ` (${order.deliveryAddressResolved.tipo})`}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: isMobile ? "0.8125rem" : "0.875rem",
                        color: "#6b7280",
                      }}
                    >
                      Creato:{" "}
                      {new Date(order.createdAt).toLocaleString("it-IT")}
                    </div>
                    {/* Status badge visible on mobile under customer name */}
                    {isMobile && (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          display: "inline-block",
                        }}
                      >
                        <div
                          style={{
                            padding: "0.375rem 0.875rem",
                            borderRadius: "9999px",
                            fontSize: "0.8125rem",
                            fontWeight: "600",
                            backgroundColor:
                              order.status === "pending"
                                ? "#fef3c7"
                                : order.status === "error"
                                  ? "#fee2e2"
                                  : order.status === "completed-warehouse"
                                    ? "#dbeafe"
                                    : "#dbeafe",
                            color:
                              order.status === "pending"
                                ? "#92400e"
                                : order.status === "error"
                                  ? "#991b1b"
                                  : order.status === "completed-warehouse"
                                    ? "#1e40af"
                                    : "#1e40af",
                            display: "inline-block",
                          }}
                        >
                          {order.status === "pending"
                            ? "In Attesa"
                            : order.status === "error"
                              ? "Errore"
                              : order.status === "completed-warehouse"
                                ? "Da Magazzino"
                                : "In Elaborazione"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons - desktop layout */}
                {!isMobile && (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {/* Status badge */}
                    <div
                      style={{
                        padding: "0.25rem 0.75rem",
                        borderRadius: "9999px",
                        fontSize: "0.875rem",
                        fontWeight: "600",
                        backgroundColor: order.status === "pending" ? "#fef3c7" : order.status === "error" ? "#fee2e2" : "#dbeafe",
                        color: order.status === "pending" ? "#92400e" : order.status === "error" ? "#991b1b" : "#1e40af",
                      }}
                    >
                      {order.status === "pending" ? "In Attesa" : order.status === "error" ? "Errore" : order.status === "completed-warehouse" ? "Da Magazzino" : "In Elaborazione"}
                    </div>

                    {!actionsVisibleIds.has(order.id!) ? (
                      /* Collapsed: show "⋯ Azioni" toggle */
                      <button
                        onClick={() => setActionsVisibleIds((prev) => new Set(prev).add(order.id!))}
                        style={{ padding: "0.5rem 0.75rem", background: "#6b7280", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", fontWeight: "500" }}
                      >
                        ⋯ Azioni
                      </button>
                    ) : (
                      /* Expanded: actions with hierarchy */
                      <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", flexWrap: "wrap" }}>
                        {/* PRIMARY: Modifica */}
                        <button onClick={() => handleEditOrder(order.id!)} style={{ padding: "0.5rem 1rem", background: "#2563eb", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", fontWeight: "600" }} title="Modifica ordine">✎ Modifica</button>

                        {/* PRIMARY: Conferma e Archivia (solo magazzino) */}
                        {isWarehouseOrder && (
                          <button onClick={() => handleConfirmWarehouseOrder(order)} style={{ padding: "0.5rem 1rem", background: "#16a34a", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", fontWeight: "600" }} title="Conferma e archivia">✓ Conferma</button>
                        )}

                        {/* DIVIDER */}
                        <div style={{ width: "1px", height: "24px", background: "#d1d5db", margin: "0 0.125rem" }} />

                        {/* SHARE GROUP: utility actions */}
                        <button onClick={() => handleDownloadPDF(order)} style={{ padding: "0.5rem 0.625rem", background: "#059669", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.8125rem", fontWeight: "500" }} title="Scarica PDF">PDF</button>
                        <button onClick={() => handlePrintOrder(order)} style={{ padding: "0.5rem 0.625rem", background: "#7c3aed", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.8125rem", fontWeight: "500" }} title="Stampa ordine">Stampa</button>
                        <button onClick={() => handleWhatsApp(order)} disabled={sharingOrderId === order.id} style={{ padding: "0.5rem 0.625rem", background: sharingOrderId === order.id ? "#9ca3af" : "#16a34a", color: "white", border: "none", borderRadius: "6px", cursor: sharingOrderId === order.id ? "not-allowed" : "pointer", fontSize: "0.8125rem", fontWeight: "500" }} title="Invia via WhatsApp">{sharingOrderId === order.id ? "…" : "WA"}</button>
                        <button onClick={() => handleEmail(order)} disabled={sharingOrderId === order.id} style={{ padding: "0.5rem 0.625rem", background: sharingOrderId === order.id ? "#9ca3af" : "#ea580c", color: "white", border: "none", borderRadius: "6px", cursor: sharingOrderId === order.id ? "not-allowed" : "pointer", fontSize: "0.8125rem", fontWeight: "500" }} title="Invia via Email">Email</button>
                        <button onClick={() => handleDropbox(order)} disabled={sharingOrderId === order.id} style={{ padding: "0.5rem 0.625rem", background: sharingOrderId === order.id ? "#9ca3af" : "#0061FF", color: "white", border: "none", borderRadius: "6px", cursor: sharingOrderId === order.id ? "not-allowed" : "pointer", fontSize: "0.8125rem", fontWeight: "500" }} title="Carica su Dropbox">{sharingOrderId === order.id ? "…" : "Dropbox"}</button>

                        {/* DIVIDER */}
                        <div style={{ width: "1px", height: "24px", background: "#d1d5db", margin: "0 0.125rem" }} />

                        {/* DESTRUCTIVE: Elimina (inline confirm) */}
                        {confirmDeleteOrderId === order.id ? (
                          <>
                            <span style={{ fontSize: "0.8125rem", color: "#dc2626", fontWeight: 600 }}>Sicuro?</span>
                            <button onClick={() => handleDeleteOrder(order.id!)} style={{ padding: "0.5rem 0.75rem", background: "#dc2626", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.8125rem", fontWeight: "600" }}>Sì, elimina</button>
                            <button onClick={() => setConfirmDeleteOrderId(null)} style={{ padding: "0.5rem 0.625rem", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.8125rem" }}>No</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDeleteOrderId(order.id!)} style={{ padding: "0.5rem 0.75rem", background: "none", color: "#dc2626", border: "1px solid #dc2626", borderRadius: "6px", cursor: "pointer", fontSize: "0.8125rem", fontWeight: "500" }} title="Elimina ordine">🗑 Elimina</button>
                        )}

                        {/* CLOSE: collapse actions */}
                        <button
                          onClick={() => { setActionsVisibleIds((prev) => { const s = new Set(prev); s.delete(order.id!); return s; }); setConfirmDeleteOrderId(null); }}
                          style={{ padding: "0.5rem 0.5rem", background: "none", color: "#9ca3af", border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem" }}
                          title="Chiudi azioni"
                        >✕</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons - mobile layout */}
                {isMobile && !actionsVisibleIds.has(order.id!) && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <button
                      onClick={() => setActionsVisibleIds((prev) => new Set(prev).add(order.id!))}
                      style={{ padding: "0.75rem 1.5rem", background: "#6b7280", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.9375rem", fontWeight: "600", width: "100%", minHeight: "44px" }}
                    >
                      ⋯ Azioni
                    </button>
                  </div>
                )}
                {isMobile && actionsVisibleIds.has(order.id!) && (
                  <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {/* PRIMARY row */}
                    <div style={{ display: "grid", gridTemplateColumns: isWarehouseOrder ? "1fr 1fr" : "1fr", gap: "0.5rem" }}>
                      <button onClick={() => handleEditOrder(order.id!)} style={{ padding: "0.75rem", background: "#2563eb", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.9375rem", fontWeight: "600", minHeight: "44px" }} title="Modifica ordine">✎ Modifica</button>
                      {isWarehouseOrder && (
                        <button onClick={() => handleConfirmWarehouseOrder(order)} style={{ padding: "0.75rem", background: "#16a34a", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.9375rem", fontWeight: "600", minHeight: "44px" }} title="Conferma e archivia">✓ Conferma</button>
                      )}
                    </div>
                    {/* SHARE group */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                      <button onClick={() => handleDownloadPDF(order)} style={{ padding: "0.75rem", background: "#059669", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", fontWeight: "600", minHeight: "44px" }} title="Scarica PDF">PDF</button>
                      <button onClick={() => handlePrintOrder(order)} style={{ padding: "0.75rem", background: "#7c3aed", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", fontWeight: "600", minHeight: "44px" }} title="Stampa ordine">Stampa</button>
                      <button onClick={() => handleWhatsApp(order)} disabled={sharingOrderId === order.id} style={{ padding: "0.75rem", background: sharingOrderId === order.id ? "#9ca3af" : "#16a34a", color: "white", border: "none", borderRadius: "6px", cursor: sharingOrderId === order.id ? "not-allowed" : "pointer", fontSize: "0.875rem", fontWeight: "600", minHeight: "44px" }} title="Invia via WhatsApp">{sharingOrderId === order.id ? "…" : "WA"}</button>
                      <button onClick={() => handleEmail(order)} disabled={sharingOrderId === order.id} style={{ padding: "0.75rem", background: sharingOrderId === order.id ? "#9ca3af" : "#ea580c", color: "white", border: "none", borderRadius: "6px", cursor: sharingOrderId === order.id ? "not-allowed" : "pointer", fontSize: "0.875rem", fontWeight: "600", minHeight: "44px" }} title="Invia via Email">Email</button>
                      <button onClick={() => handleDropbox(order)} disabled={sharingOrderId === order.id} style={{ padding: "0.75rem", background: sharingOrderId === order.id ? "#9ca3af" : "#0061FF", color: "white", border: "none", borderRadius: "6px", cursor: sharingOrderId === order.id ? "not-allowed" : "pointer", fontSize: "0.875rem", fontWeight: "600", minHeight: "44px" }} title="Carica su Dropbox">{sharingOrderId === order.id ? "…" : "Dropbox"}</button>
                    </div>
                    {/* DESTRUCTIVE row: Elimina (inline confirm) + Chiudi */}
                    {confirmDeleteOrderId === order.id ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                        <button onClick={() => handleDeleteOrder(order.id!)} style={{ padding: "0.75rem", background: "#dc2626", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.9375rem", fontWeight: "600", minHeight: "44px" }}>Sì, elimina</button>
                        <button onClick={() => setConfirmDeleteOrderId(null)} style={{ padding: "0.75rem", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.9375rem", fontWeight: "600", minHeight: "44px" }}>Annulla</button>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                        <button onClick={() => setConfirmDeleteOrderId(order.id!)} style={{ padding: "0.75rem", background: "none", color: "#dc2626", border: "1.5px solid #dc2626", borderRadius: "6px", cursor: "pointer", fontSize: "0.9375rem", fontWeight: "600", minHeight: "44px" }} title="Elimina ordine">🗑 Elimina</button>
                        <button onClick={() => { setActionsVisibleIds((prev) => { const s = new Set(prev); s.delete(order.id!); return s; }); setConfirmDeleteOrderId(null); }} style={{ padding: "0.75rem", background: "none", color: "#6b7280", border: "1px solid #d1d5db", borderRadius: "6px", cursor: "pointer", fontSize: "0.9375rem", fontWeight: "600", minHeight: "44px" }}>✕ Chiudi</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PHASE 72: Job Progress Bar */}
              {(isJobActive || isJobCompleted || isJobFailed) && (
                <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
                  <JobProgressBar
                    progress={order.jobProgress || 0}
                    operation={order.jobOperation || "In attesa..."}
                    status={order.jobStatus || "idle"}
                    error={isJobFailed ? order.jobError : undefined}
                  />
                  {isStale && !isJobFailed && (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        padding: "0.5rem 0.75rem",
                        backgroundColor: "#fffbeb",
                        border: "1px solid #f59e0b",
                        borderRadius: "6px",
                        fontSize: isMobile ? "0.8125rem" : "0.875rem",
                        color: "#92400e",
                      }}
                    >
                      Verifica stato in corso...
                    </div>
                  )}
                  {isJobFailed && isInventtableError(order.jobError) && (
                    <div
                      style={{
                        marginTop: '0.75rem',
                        padding: '0.75rem 1rem',
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        color: '#991b1b',
                        fontSize: isMobile ? '0.8125rem' : '0.875rem',
                      }}
                    >
                      <p style={{ margin: '0 0 0.5rem 0' }}>
                        La scheda anagrafica del cliente <strong>{order.customerName}</strong> non è
                        completa in Archibald ERP e non è stato possibile inserire gli articoli.
                        Aggiorna i dati del cliente e reinvia l&apos;ordine.
                      </p>
                      {customersMap.get(order.customerId) && (
                        <button
                          type="button"
                          onClick={() => {
                            const c = customersMap.get(order.customerId);
                            if (!c) return;
                            const completeness = checkCustomerCompleteness(c);
                            setQuickFixCustomer({
                              erpId: c.erpId,
                              customerName: c.name,
                              missingFields: completeness.missingFields,
                            });
                          }}
                          style={{
                            background: 'none',
                            border: '1px solid #991b1b',
                            color: '#991b1b',
                            borderRadius: '4px',
                            padding: '4px 10px',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                          }}
                        >
                          Completa scheda →
                        </button>
                      )}
                    </div>
                  )}
                  {isJobFailed && (
                    <button
                      onClick={() => handleRetryOrder(order.id!)}
                      style={{
                        padding: "0.75rem 1.25rem",
                        backgroundColor: "#f59e0b",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "0.9375rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        marginTop: "0.75rem",
                        width: isMobile ? "100%" : "auto",
                      }}
                    >
                      🔄 Riprova Ordine
                    </button>
                  )}
                </div>
              )}

              {isPersistedError && (
                <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
                  <div
                    style={{
                      padding: "0.75rem 1rem",
                      backgroundColor: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "6px",
                      color: "#991b1b",
                      fontSize: isMobile ? "0.8125rem" : "0.875rem",
                    }}
                  >
                    {isInventtableError(order.errorMessage) ? (
                      <>
                        <p style={{ margin: '0 0 0.5rem 0' }}>
                          La scheda anagrafica del cliente <strong>{order.customerName}</strong> non è
                          completa in Archibald ERP e non è stato possibile inserire gli articoli.
                          Aggiorna i dati del cliente e reinvia l&apos;ordine.
                        </p>
                        {customersMap.get(order.customerId) && (
                          <button
                            type="button"
                            onClick={() => {
                              const c = customersMap.get(order.customerId);
                              if (!c) return;
                              const completeness = checkCustomerCompleteness(c);
                              setQuickFixCustomer({
                                erpId: c.erpId,
                                customerName: c.name,
                                missingFields: completeness.missingFields,
                              });
                            }}
                            style={{
                              background: 'none',
                              border: '1px solid #991b1b',
                              color: '#991b1b',
                              borderRadius: '4px',
                              padding: '4px 10px',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                            }}
                          >
                            Completa scheda →
                          </button>
                        )}
                      </>
                    ) : (
                      <>Errore: {order.errorMessage || 'Errore sconosciuto'}</>
                    )}
                  </div>
                  <button
                    onClick={() => handleRetryOrder(order.id!)}
                    style={{
                      padding: "0.75rem 1.25rem",
                      backgroundColor: "#f59e0b",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "0.9375rem",
                      fontWeight: "600",
                      cursor: "pointer",
                      marginTop: "0.75rem",
                      width: isMobile ? "100%" : "auto",
                    }}
                  >
                    🔄 Riprova Ordine
                  </button>
                </div>
              )}

              {order.verificationNotification && (
                <VerificationAlert notification={order.verificationNotification} />
              )}

              {/* DETAILED ORDER ITEMS - PREVENTIVO STYLE */}
              <div
                style={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  marginBottom: isMobile ? "0.75rem" : "1rem",
                  overflow: "hidden",
                }}
              >
                {/* Header with expand/collapse button */}
                <div
                  style={{
                    backgroundColor: "#f9fafb",
                    padding: isMobile ? "0.75rem" : "0.75rem 1rem",
                    borderBottom: "2px solid #e5e7eb",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                  onClick={() => handleToggleExpand(order.id!)}
                >
                  <span
                    style={{
                      fontWeight: "600",
                      fontSize: isMobile ? "0.9375rem" : "0.875rem",
                      color: "#374151",
                    }}
                  >
                    Dettaglio Articoli ({order.items.length})
                  </span>
                  <span
                    style={{
                      fontSize: isMobile ? "1.125rem" : "1rem",
                      color: "#6b7280",
                    }}
                  >
                    {expandedOrderIds.has(order.id!) ? "▼" : "▶"}
                  </span>
                </div>

                {/* Content - only shown when expanded */}
                {expandedOrderIds.has(order.id!) && (
                  <>
                    {/* Sub-client details for Fresis orders */}
                    {order.subClientData && (
                      <div
                        style={{
                          padding: "0.75rem 1rem",
                          backgroundColor: "#fffbeb",
                          borderBottom: "1px solid #f59e0b",
                          fontSize: "0.8125rem",
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
                          gap: "0.25rem 1rem",
                        }}
                      >
                        <div>
                          <strong>Codice:</strong> {order.subClientData.codice}
                        </div>
                        <div>
                          <strong>Ragione Sociale:</strong>{" "}
                          {order.subClientData.ragioneSociale}
                        </div>
                        {order.subClientData.supplRagioneSociale && (
                          <div>
                            <strong>Suppl.:</strong>{" "}
                            {order.subClientData.supplRagioneSociale}
                          </div>
                        )}
                        {order.subClientData.indirizzo && (
                          <div>
                            <strong>Indirizzo:</strong>{" "}
                            {order.subClientData.indirizzo}
                          </div>
                        )}
                        {order.subClientData.localita && (
                          <div>
                            <strong>Localita:</strong>{" "}
                            {order.subClientData.localita}{" "}
                            {order.subClientData.cap} {order.subClientData.prov}
                          </div>
                        )}
                        {order.subClientData.partitaIva && (
                          <div>
                            <strong>P.IVA:</strong>{" "}
                            {order.subClientData.partitaIva}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Table Header - desktop only */}
                    {!isMobile && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr 1fr 1fr",
                          gap: "0.5rem",
                          padding: "0.75rem 1rem",
                          backgroundColor: "#f9fafb",
                          borderBottom: "1px solid #e5e7eb",
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          color: "#6b7280",
                          textTransform: "uppercase",
                        }}
                      >
                        <div>Articolo</div>
                        <div style={{ textAlign: "right" }}>Qnt.</div>
                        <div style={{ textAlign: "right" }}>Prezzo Unit.</div>
                        <div style={{ textAlign: "right" }}>Sconto</div>
                        <div style={{ textAlign: "right" }}>Subtotale</div>
                        <div style={{ textAlign: "right" }}>IVA</div>
                        <div style={{ textAlign: "right" }}>Totale</div>
                      </div>
                    )}

                    {/* Items */}
                    {order.items.map((item, index) => {
                      const subtotal = itemSubtotal(order, item);
                      // Apply global discount if present
                      const subtotalAfterGlobal = order.discountPercent
                        ? subtotal * (1 - order.discountPercent / 100)
                        : subtotal;
                      const vatAmount = subtotalAfterGlobal * (item.vat / 100);
                      const total = subtotalAfterGlobal + vatAmount;

                      return (
                        <div
                          key={index}
                          style={{
                            display: isMobile ? "block" : "grid",
                            gridTemplateColumns: isMobile
                              ? undefined
                              : "3fr 1fr 1fr 1fr 1fr 1fr 1fr",
                            gap: isMobile ? undefined : "0.5rem",
                            padding: isMobile ? "0.75rem" : "1rem",
                            borderBottom:
                              index < order.items.length - 1
                                ? "1px solid #f3f4f6"
                                : "none",
                            fontSize: isMobile ? "0.875rem" : "0.875rem",
                          }}
                        >
                          {/* Desktop Layout - Grid */}
                          {!isMobile && (
                            <>
                              {/* Product Name & Code */}
                              <div>
                                <div
                                  style={{
                                    fontWeight: "600",
                                    marginBottom: "0.25rem",
                                  }}
                                >
                                  {item.productName || item.articleCode}
                                </div>
                                {/* Only show "Cod:" if it's different from productName */}
                                {item.productName &&
                                  item.productName !== item.articleCode && (
                                    <div
                                      style={{
                                        fontSize: "0.75rem",
                                        color: "#9ca3af",
                                        marginBottom: "0.25rem",
                                      }}
                                    >
                                      Cod: {item.articleCode}
                                    </div>
                                  )}
                                {item.description && (
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "#6b7280",
                                    }}
                                  >
                                    {item.description}
                                  </div>
                                )}
                                {/* Warehouse badge */}
                                {item.warehouseQuantity &&
                                  item.warehouseQuantity > 0 && (
                                    <div
                                      style={{
                                        fontSize: "0.75rem",
                                        color: "#059669",
                                        fontWeight: "600",
                                        marginTop: "0.25rem",
                                      }}
                                    >
                                      🏪 {item.warehouseQuantity} pz da
                                      magazzino
                                    </div>
                                  )}
                              </div>

                              {/* Quantity */}
                              <div
                                style={{
                                  textAlign: "right",
                                  alignSelf: "center",
                                }}
                              >
                                {item.quantity}
                              </div>

                              {/* Unit Price */}
                              <div
                                style={{
                                  textAlign: "right",
                                  alignSelf: "center",
                                }}
                              >
                                {formatCurrency(item.price)}
                              </div>

                              {/* Discount */}
                              <div
                                style={{
                                  textAlign: "right",
                                  alignSelf: "center",
                                  color:
                                    item.discount && item.discount > 0
                                      ? "#059669"
                                      : "#9ca3af",
                                }}
                              >
                                {item.discount && item.discount > 0
                                  ? `${item.discount}%`
                                  : "—"}
                              </div>

                              {/* Subtotal */}
                              <div
                                style={{
                                  textAlign: "right",
                                  alignSelf: "center",
                                  fontWeight: "500",
                                }}
                              >
                                {formatCurrency(subtotal)}
                              </div>

                              {/* VAT */}
                              <div
                                style={{
                                  textAlign: "right",
                                  alignSelf: "center",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "#6b7280",
                                  }}
                                >
                                  {item.vat === 0 ? <span style={{ color: "#dc2626", fontWeight: 600 }}>mancante</span> : `(${item.vat}%)`}
                                </div>
                                <div>{formatCurrency(vatAmount)}</div>
                              </div>

                              {/* Total */}
                              <div
                                style={{
                                  textAlign: "right",
                                  alignSelf: "center",
                                  fontWeight: "600",
                                  color: "#1e40af",
                                }}
                              >
                                {formatCurrency(total)}
                              </div>
                            </>
                          )}

                          {/* Mobile Layout - Vertical Card */}
                          {isMobile && (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.625rem",
                              }}
                            >
                              {/* Product Name & Code */}
                              <div>
                                <div
                                  style={{
                                    fontWeight: "600",
                                    marginBottom: "0.25rem",
                                    fontSize: "0.9375rem",
                                  }}
                                >
                                  {item.productName || item.articleCode}
                                </div>
                                {/* Only show "Cod:" if it's different from productName */}
                                {item.productName &&
                                  item.productName !== item.articleCode && (
                                    <div
                                      style={{
                                        fontSize: "0.8125rem",
                                        color: "#9ca3af",
                                        marginBottom: "0.25rem",
                                      }}
                                    >
                                      Cod: {item.articleCode}
                                    </div>
                                  )}
                                {item.description && (
                                  <div
                                    style={{
                                      fontSize: "0.8125rem",
                                      color: "#6b7280",
                                    }}
                                  >
                                    {item.description}
                                  </div>
                                )}
                                {/* Warehouse badge */}
                                {item.warehouseQuantity &&
                                  item.warehouseQuantity > 0 && (
                                    <div
                                      style={{
                                        fontSize: "0.8125rem",
                                        color: "#059669",
                                        fontWeight: "600",
                                        marginTop: "0.25rem",
                                      }}
                                    >
                                      🏪 {item.warehouseQuantity} pz da
                                      magazzino
                                    </div>
                                  )}
                              </div>

                              {/* Details Grid - 2 columns */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: "0.5rem",
                                  fontSize: "0.875rem",
                                }}
                              >
                                {/* Quantity */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    Quantità
                                  </div>
                                  <div style={{ fontWeight: "500" }}>
                                    {item.quantity}
                                  </div>
                                </div>

                                {/* Unit Price */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    Prezzo Unit.
                                  </div>
                                  <div style={{ fontWeight: "500" }}>
                                    {formatCurrency(item.price)}
                                  </div>
                                </div>

                                {/* Discount */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    Sconto
                                  </div>
                                  <div
                                    style={{
                                      fontWeight: "500",
                                      color:
                                        item.discount && item.discount > 0
                                          ? "#059669"
                                          : "#9ca3af",
                                    }}
                                  >
                                    {item.discount && item.discount > 0
                                      ? `${item.discount}%`
                                      : "—"}
                                  </div>
                                </div>

                                {/* Subtotal */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    Subtotale
                                  </div>
                                  <div style={{ fontWeight: "600" }}>
                                    {formatCurrency(subtotal)}
                                  </div>
                                </div>

                                {/* VAT */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    {item.vat === 0 ? <span style={{ color: "#dc2626" }}>IVA: mancante</span> : `IVA (${item.vat}%)`}
                                  </div>
                                  <div style={{ fontWeight: "500" }}>
                                    {formatCurrency(vatAmount)}
                                  </div>
                                </div>

                                {/* Total */}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: "#6b7280",
                                      fontWeight: "600",
                                      textTransform: "uppercase",
                                      marginBottom: "0.125rem",
                                    }}
                                  >
                                    Totale
                                  </div>
                                  <div
                                    style={{
                                      fontWeight: "700",
                                      color: "#1e40af",
                                      fontSize: "1rem",
                                    }}
                                  >
                                    {formatCurrency(total)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Order Totals */}
                    <div
                      style={{
                        backgroundColor: "#f9fafb",
                        padding: isMobile ? "0.75rem" : "1rem",
                        borderTop: "2px solid #e5e7eb",
                      }}
                    >
                      {/* Calculate totals */}
                      {(() => {
                        const scontif = 1 - (order.discountPercent ?? 0) / 100;
                        const lines = order.items.map((item) => ({
                          prezzotot: itemSubtotal(order, item),
                          vatRate: item.vat ?? 0,
                        }));

                        // subtotalAfterGlobalDiscount via round2 canonico (TOTNETTO = round2(TOTMERCE × scontif))
                        const {
                          totMerce: orderSubtotal,
                          totSconto: globalDiscountAmount,
                          totNetto: subtotalAfterGlobalDiscount,
                        } = arcaDocumentTotals(lines, scontif);

                        // Spedizione: usa il subtotale netto come soglia (identico alla logica esistente)
                        const shippingCosts = order.noShipping
                          ? { cost: 0, tax: 0, total: 0 }
                          : calculateShippingCosts(subtotalAfterGlobalDiscount);
                        const shippingCost = shippingCosts.cost;
                        const shippingTax = shippingCosts.tax;

                        // Totali documento con IVA per-gruppo (non per-riga) + spedizione
                        const { totIva: orderVAT, totDoc: orderTotal } = arcaDocumentTotals(
                          lines,
                          scontif,
                          shippingCost > 0 ? shippingCost : undefined,
                          shippingCost > 0 ? 22 : undefined,
                        );

                        return (
                          <>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "0.5rem",
                                fontSize: isMobile ? "0.8125rem" : "0.875rem",
                              }}
                            >
                              <span style={{ color: "#6b7280" }}>
                                Subtotale (senza IVA):
                              </span>
                              <span style={{ fontWeight: "500" }}>
                                {formatCurrency(orderSubtotal)}
                              </span>
                            </div>

                            {/* Show global discount if present */}
                            {order.discountPercent &&
                              order.discountPercent > 0 && (
                                <>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      marginBottom: "0.5rem",
                                      fontSize: isMobile
                                        ? "0.8125rem"
                                        : "0.875rem",
                                    }}
                                  >
                                    <span style={{ color: "#dc2626" }}>
                                      Sconto globale (
                                      {order.discountPercent.toFixed(2)}
                                      %):
                                    </span>
                                    <span
                                      style={{
                                        fontWeight: "500",
                                        color: "#dc2626",
                                      }}
                                    >
                                      -{formatCurrency(globalDiscountAmount)}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      marginBottom: "0.5rem",
                                      fontSize: isMobile
                                        ? "0.8125rem"
                                        : "0.875rem",
                                    }}
                                  >
                                    <span style={{ color: "#6b7280" }}>
                                      Subtotale scontato:
                                    </span>
                                    <span style={{ fontWeight: "500" }}>
                                      {formatCurrency(
                                        subtotalAfterGlobalDiscount,
                                      )}
                                    </span>
                                  </div>
                                </>
                              )}

                            {/* Shipping Costs */}
                            {order.noShipping ? (
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginBottom: "0.5rem",
                                  fontSize: isMobile ? "0.8125rem" : "0.875rem",
                                  color: "#9ca3af",
                                }}
                              >
                                <span style={{ textDecoration: "line-through" }}>
                                  Spese di trasporto K3
                                </span>
                                <span style={{ fontWeight: "500", textDecoration: "line-through" }}>
                                  {formatCurrency(0)}
                                </span>
                              </div>
                            ) : shippingCost > 0 ? (
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginBottom: "0.5rem",
                                  fontSize: isMobile ? "0.8125rem" : "0.875rem",
                                }}
                              >
                                <span style={{ color: "#f59e0b" }}>
                                  Spese di trasporto K3
                                  <span
                                    style={{
                                      fontSize: "0.75rem",
                                      marginLeft: "0.25rem",
                                    }}
                                  >
                                    ({formatCurrency(shippingCost)} + IVA)
                                  </span>
                                </span>
                                <span
                                  style={{
                                    fontWeight: "500",
                                    color: "#f59e0b",
                                  }}
                                >
                                  {formatCurrency(shippingCost + shippingTax)}
                                </span>
                              </div>
                            ) : null}

                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "0.5rem",
                                fontSize: isMobile ? "0.8125rem" : "0.875rem",
                              }}
                            >
                              <span style={{ color: "#6b7280" }}>
                                IVA Totale:
                              </span>
                              <span style={{ fontWeight: "500" }}>
                                {formatCurrency(orderVAT)}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                paddingTop: isMobile ? "0.625rem" : "0.75rem",
                                borderTop: "2px solid #3b82f6",
                                fontSize: isMobile ? "1rem" : "1.125rem",
                              }}
                            >
                              <span
                                style={{ fontWeight: "700", color: "#1e40af" }}
                              >
                                TOTALE (con IVA):
                              </span>
                              <span
                                style={{ fontWeight: "700", color: "#1e40af" }}
                              >
                                {formatCurrency(orderTotal)}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>

              {order.notes && (
                <div
                  style={{
                    padding: isMobile ? "0.625rem" : "0.75rem",
                    backgroundColor: "#fffbeb",
                    borderTop: "1px solid #fbbf24",
                    fontSize: isMobile ? "0.8125rem" : "0.875rem",
                  }}
                >
                  <span style={{ fontWeight: "600", color: "#92400e" }}>Note: </span>
                  <span style={{ color: "#78350f" }}>{order.notes}</span>
                </div>
              )}

              {order.status === "error" && order.errorMessage && !isInventtableError(order.errorMessage) && (
                <div
                  style={{
                    padding: isMobile ? "0.625rem" : "0.75rem",
                    backgroundColor: "#fee2e2",
                    border: "1px solid #dc2626",
                    borderRadius: "4px",
                    color: "#991b1b",
                    fontSize: isMobile ? "0.8125rem" : "0.875rem",
                    marginTop: isMobile ? "0.5rem" : "0",
                  }}
                >
                  <strong>Errore:</strong> {order.errorMessage}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <EmailShareDialog
        isOpen={emailDialogOrder !== null}
        onClose={() => setEmailDialogOrder(null)}
        onSend={handleEmailSend}
        defaultEmail={emailDialogDefaultEmail}
        customerName={
          emailDialogOrder ? getOrderRecipientName(emailDialogOrder) : ""
        }
        isLoading={emailDialogLoading}
      />
      {quickFixCustomer && (
        <CustomerQuickFix
          erpId={quickFixCustomer.erpId}
          customerName={quickFixCustomer.customerName}
          missingFields={quickFixCustomer.missingFields}
          onSaved={() => {
            void refreshCustomer(quickFixCustomer.erpId);
            setQuickFixCustomer(null);
          }}
          onDismiss={() => setQuickFixCustomer(null)}
        />
      )}

      {/* Bottom selection toolbar — visible when at least 1 order is selected */}
      {selectedOrderIds.size > 0 && (
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
            padding: "10px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {/* Fresis shipping estimate (compact, only when relevant) */}
          {selectedFresisOrders.length >= 2 && fresisEstimate && !fresisEstimate.loading && (
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: fresisEstimate.imponibile >= SHIPPING_THRESHOLD ? "#166534" : "#991b1b",
                backgroundColor: fresisEstimate.imponibile >= SHIPPING_THRESHOLD ? "#f0fdf4" : "#fef2f2",
                borderRadius: "4px",
                padding: "4px 8px",
                alignSelf: "flex-start",
              }}
            >
              {fresisEstimate.imponibile >= SHIPPING_THRESHOLD ? "✅ Spedizione gratuita" : `⚠ Sotto soglia — +15,45 €`}
              {" · "}Imponibile: {formatCurrency(fresisEstimate.imponibile)}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#333" }}>
              {selectedOrderIds.size} {selectedOrderIds.size === 1 ? "ordine selezionato" : "ordini selezionati"}
            </span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() => setSelectedOrderIds(new Set())}
                style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, backgroundColor: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}
              >
                Deseleziona
              </button>
              {selectedFresisOrders.length >= 2 && (
                <button
                  onClick={() => setShowMergeDialog(true)}
                  style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, backgroundColor: "#f59e0b", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}
                >
                  Unisci Fresis ({selectedFresisOrders.length})
                </button>
              )}
              <button
                onClick={() => setConfirmBatchDelete(true)}
                style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, backgroundColor: "#c62828", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}
              >
                Elimina ({selectedOrderIds.size})
              </button>
              <button
                onClick={handleSubmitOrders}
                disabled={submitting}
                style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, backgroundColor: submitting ? "#9ca3af" : "#2e7d32", color: "#fff", border: "none", borderRadius: "8px", cursor: submitting ? "not-allowed" : "pointer" }}
              >
                {submitting ? "Invio…" : `Invia (${selectedOrderIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch delete confirmation modal */}
      {confirmBatchDelete && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { e.stopPropagation(); setConfirmBatchDelete(false); }}
        >
          <div
            style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "360px", width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700, color: "#b91c1c" }}>Elimina ordini</h3>
            <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#374151" }}>
              Stai per eliminare <strong>{selectedOrderIds.size} ordini</strong> in modo definitivo. Questa azione non è reversibile.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={handleDeleteSelectedOrders}
                style={{ flex: 1, padding: "10px", fontSize: "14px", fontWeight: 700, backgroundColor: "#dc2626", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}
              >
                Sì, elimina tutto
              </button>
              <button
                onClick={() => setConfirmBatchDelete(false)}
                style={{ flex: 1, padding: "10px", fontSize: "14px", fontWeight: 600, backgroundColor: "#f3f4f6", color: "#374151", border: "none", borderRadius: "8px", cursor: "pointer" }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
