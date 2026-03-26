import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Order, OrderArticle } from "../types/order";

import { getOrderStatus, getStatusTabColors, isNotSentToVerona } from "../utils/orderStatus";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { enqueueOperation, waitForJobViaWebSocket } from "../api/operations";
import type { OperationType, SubscribeFn } from "../api/operations";
import { HighlightText } from "./HighlightText";
import { productService } from "../services/products.service";
import type { ProductWithDetails } from "../services/products.service";
import { priceService } from "../services/prices.service";
import { normalizeVatRate } from "../utils/vat-utils";
import {
  formatCurrency,
  formatPriceFromString,
} from "../utils/format-currency";
import { FRESIS_DEFAULT_DISCOUNT } from "../utils/fresis-constants";
import { archibaldLineAmount, calculateShippingCosts, SHIPPING_THRESHOLD } from "../utils/order-calculations";
import { arcaDocumentTotals, arcaLineAmount } from "../utils/arca-math";
import { parseOrderDiscountPercent } from "../utils/parse-order-discount";
import { parseOrderNotesForEdit } from "../utils/parse-order-notes";
import { getDiscountForArticle } from "../api/fresis-discounts";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { useOperationTracking } from "../contexts/OperationTrackingContext";
import { OrderNotes } from "./OrderNotes";
import { TrackingDotBar } from "./TrackingProgressBar";
import { TrackingTimeline } from "./TrackingTimeline";

type DueDaysInfo = {
  absDays: number;
  isOverdue: boolean;
  color: string;
  bgColor: string;
  summaryLabel: string;
  detailLabel: string;
};

function computeDueDaysInfo(dueDateStr: string): DueDaysInfo | null {
  const due = new Date(dueDateStr);
  if (isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  const isOverdue = diffDays < 0;
  const absDays = Math.abs(diffDays);

  const color = isOverdue
    ? absDays > 30 ? "#c62828" : "#e65100"
    : absDays <= 30 ? "#f57c00" : "#2e7d32";
  const bgColor = isOverdue
    ? absDays > 30 ? "#ffebee" : "#fff3e0"
    : absDays <= 30 ? "#fff8e1" : "#e8f5e9";
  const summaryLabel = isOverdue
    ? `⚠️ ${absDays} gg fuori scadenza`
    : absDays <= 30
    ? `⏳ ${absDays} gg alla scadenza`
    : `${absDays} gg alla scadenza`;
  const detailLabel = isOverdue
    ? `Scaduta da ${absDays} giorni`
    : `${absDays} giorni alla scadenza`;

  return { absDays, isOverdue, color, bgColor, summaryLabel, detailLabel };
}

interface OrderCardProps {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
  onSendToVerona?: (orderId: string, customerName: string) => void;
  onEdit?: (orderId: string) => void;
  onDeleteDone?: () => void;
  token?: string;
  searchQuery?: string;
  editing?: boolean;
  onEditDone?: () => void;
  justSentToVerona?: boolean;
  noteSummary?: { total: number; checked: number };
  notePreviews?: Array<{ text: string; checked: boolean }>;
  onNotesChanged?: () => void;
  onHide?: (orderId: string) => void;
  onUnhide?: (orderId: string) => void;
  isHidden?: boolean;
  onClearVerification?: (orderId: string) => void;
  suggestedTab?: "panoramica" | "articoli" | "logistica" | "finanziario" | null;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDate(dateString: string | undefined): string {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const months = [
      "gen",
      "feb",
      "mar",
      "apr",
      "mag",
      "giu",
      "lug",
      "ago",
      "set",
      "ott",
      "nov",
      "dic",
    ];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateString;
  }
}

function formatDateTime(dateString: string | undefined): string {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return dateString;
  }
}

function getCourierLogo(_courier: string | undefined): string {
  return "📦";
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// ============================================================================
// TAB CONTENT COMPONENTS
// ============================================================================

function getStepInfo(order: Order): { index: number; isError: boolean } {
  const ts = order.transferStatus?.toUpperCase().replace(/_/g, " ") || "";
  const ss = (order.state || order.status)?.toUpperCase() || "";
  const dt = order.documentState?.toUpperCase() || "";
  const ot = order.orderType?.toUpperCase() || "";

  if (ss === "FATTURATO" || dt.includes("FATTURA") || order.invoiceNumber)
    return { index: 3, isError: false };
  if (
    ss === "CONSEGNATO" ||
    ot.includes("ORDINE DI VENDITA") ||
    ts === "TRASFERITO" ||
    ts === "COMPLETATO"
  )
    return { index: 2, isError: false };
  if (ts === "IN ATTESA DI APPROVAZIONE" || ts === "TRANSFER ERROR")
    return { index: 1, isError: ts === "TRANSFER ERROR" };
  return { index: 0, isError: false };
}

function TabPanoramica({
  order,
  searchQuery = "",
}: {
  order: Order;
  searchQuery?: string;
}) {
  const stepLabels = ["Bozza", "Inviato", "Confermato", "Fatturato"];
  const { index: activeStep, isError } = getStepInfo(order);

  const cardStyle: React.CSSProperties = {
    backgroundColor: "#fff",
    border: "1px solid #e8e8e8",
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "16px",
  };

  const cardTitleStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: "12px",
  };

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "#888",
    marginBottom: "2px",
  };

  const fieldValueStyle: React.CSSProperties = {
    fontSize: "14px",
    color: "#333",
    fontWeight: 500,
  };

  return (
    <div style={{ padding: "16px" }}>
      {/* Progress Stepper */}
      <div style={{ ...cardStyle, padding: "20px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          {stepLabels.map((label, i) => {
            const isCompleted = i < activeStep;
            const isActive = i === activeStep;
            const isFuture = i > activeStep;
            const isErrorStep = isActive && isError;

            let circleColor = "#e0e0e0";
            let textColor = "#999";
            if (isCompleted) {
              circleColor = "#4CAF50";
              textColor = "#4CAF50";
            }
            if (isActive && !isError) {
              circleColor = "#1976d2";
              textColor = "#1976d2";
            }
            if (isErrorStep) {
              circleColor = "#F44336";
              textColor = "#F44336";
            }

            return (
              <div
                key={label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flex: 1,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    backgroundColor: isFuture ? "#fff" : circleColor,
                    border: isFuture
                      ? "2px solid #e0e0e0"
                      : `2px solid ${circleColor}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isFuture ? "#ccc" : "#fff",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {isErrorStep ? "!" : isCompleted ? "\u2713" : i + 1}
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: isActive ? 700 : 500,
                    color: textColor,
                    marginTop: "6px",
                    textAlign: "center",
                  }}
                >
                  {label}
                </span>
                {isErrorStep && (
                  <span
                    style={{
                      fontSize: "10px",
                      color: "#F44336",
                      marginTop: "2px",
                    }}
                  >
                    Transfer Error
                  </span>
                )}
              </div>
            );
          })}
          {/* Connector lines */}
          <div
            style={{
              position: "absolute",
              top: "14px",
              left: "calc(12.5% + 14px)",
              right: "calc(12.5% + 14px)",
              height: "2px",
              backgroundColor: "#e0e0e0",
              zIndex: 0,
            }}
          />
          {activeStep > 0 && (
            <div
              style={{
                position: "absolute",
                top: "14px",
                left: "calc(12.5% + 14px)",
                width: `${(activeStep / 3) * 75}%`,
                height: "2px",
                backgroundColor: isError ? "#F44336" : "#4CAF50",
                zIndex: 0,
              }}
            />
          )}
        </div>
      </div>

      {/* Dettagli Ordine + Importi (side by side on desktop) */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "0",
        }}
      >
        {/* Dettagli Ordine */}
        <div style={{ ...cardStyle, flex: "1 1 280px", minWidth: "280px" }}>
          <div style={cardTitleStyle}>Dettagli Ordine</div>
          <div style={{ marginBottom: "10px" }}>
            <div style={fieldLabelStyle}>Numero Ordine</div>
            <div
              style={{
                ...fieldValueStyle,
                fontWeight: 700,
                fontSize: "16px",
                cursor: "pointer",
              }}
              onClick={() => copyToClipboard(order.orderNumber || "")}
              title="Clicca per copiare"
            >
              <HighlightText
                text={order.orderNumber || "N/A"}
                query={searchQuery}
              />
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
            }}
          >
            <div>
              <div style={fieldLabelStyle}>Data Creazione</div>
              <div style={fieldValueStyle}>
                {formatDateTime(order.orderDate || order.date)}
              </div>
            </div>
            <div>
              <div style={fieldLabelStyle}>Data Consegna</div>
              <div style={fieldValueStyle}>
                {formatDate(order.deliveryDate)}
              </div>
            </div>
            <div>
              <div style={fieldLabelStyle}>Tipo</div>
              <div style={fieldValueStyle}>{order.orderType || "N/A"}</div>
            </div>
            <div>
              <div style={fieldLabelStyle}>Origine</div>
              <div style={fieldValueStyle}>{order.salesOrigin || "N/A"}</div>
            </div>
          </div>
        </div>

        {/* Importi */}
        <div style={{ ...cardStyle, flex: "1 1 200px", minWidth: "200px" }}>
          <div style={cardTitleStyle}>Importi</div>
          <div style={{ marginBottom: "10px" }}>
            <div style={fieldLabelStyle}>Lordo</div>
            <div style={{ ...fieldValueStyle, fontSize: "16px" }}>
              {order.grossAmount || "N/A"}
            </div>
          </div>
          <div style={{ marginBottom: "10px" }}>
            <div style={fieldLabelStyle}>Totale</div>
            <div
              style={{ ...fieldValueStyle, fontSize: "18px", fontWeight: 700 }}
            >
              {order.total || "N/A"}
            </div>
          </div>
          {order.discountPercent && (
            <div style={{ marginBottom: "10px" }}>
              <div style={fieldLabelStyle}>Sconto</div>
              <div style={fieldValueStyle}>{order.discountPercent}</div>
            </div>
          )}
          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            {order.isQuote && (
              <span
                style={{
                  fontSize: "12px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "#e8f0ff",
                  color: "#0066cc",
                  fontWeight: 600,
                }}
              >
                Preventivo
              </span>
            )}
            {order.isGiftOrder && (
              <span
                style={{
                  fontSize: "12px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "#fff3e0",
                  color: "#ff6600",
                  fontWeight: 600,
                }}
              >
                Omaggio
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cliente & Consegna */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>Cliente & Consegna</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "10px",
          }}
        >
          <div>
            <div style={fieldLabelStyle}>Profilo</div>
            <div style={fieldValueStyle}>
              <HighlightText
                text={order.customerProfileId || "N/A"}
                query={searchQuery}
              />
            </div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Cliente</div>
            <div style={fieldValueStyle}>
              <HighlightText text={order.customerName} query={searchQuery} />
            </div>
          </div>
          {order.deliveryName && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={fieldLabelStyle}>Nome Consegna</div>
              <div style={fieldValueStyle}>
                <HighlightText text={order.deliveryName} query={searchQuery} />
              </div>
            </div>
          )}
          {order.deliveryAddress && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={fieldLabelStyle}>Indirizzo</div>
              <div style={{ ...fieldValueStyle, whiteSpace: "pre-wrap" }}>
                <HighlightText
                  text={order.deliveryAddress}
                  query={searchQuery}
                />
              </div>
            </div>
          )}
          {order.customerReference && (
            <div>
              <div style={fieldLabelStyle}>Rif. Cliente</div>
              <div style={fieldValueStyle}>
                <HighlightText
                  text={order.customerReference}
                  query={searchQuery}
                />
              </div>
            </div>
          )}
          {order.remainingSalesFinancial && (
            <div>
              <div style={fieldLabelStyle}>Residuo Finanziario</div>
              <div style={fieldValueStyle}>{order.remainingSalesFinancial}</div>
            </div>
          )}
        </div>
      </div>

      {/* Stato & Trasferimento */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>Stato & Trasferimento</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "10px",
          }}
        >
          <div>
            <div style={fieldLabelStyle}>Vendite</div>
            <div style={fieldValueStyle}>
              <HighlightText
                text={order.state || order.status || ""}
                query={searchQuery}
              />
            </div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Documento</div>
            <div style={fieldValueStyle}>
              <HighlightText
                text={order.documentState || "\u2014"}
                query={searchQuery}
              />
            </div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Tipo Ordine</div>
            <div style={fieldValueStyle}>{order.orderType || "\u2014"}</div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Trasferimento</div>
            <div style={fieldValueStyle}>
              <HighlightText
                text={order.transferStatus || "\u2014"}
                query={searchQuery}
              />
            </div>
          </div>
          {order.transferDate && (
            <div>
              <div style={fieldLabelStyle}>Data Trasferimento</div>
              <div style={fieldValueStyle}>
                {formatDate(order.transferDate)}
              </div>
            </div>
          )}
          {order.completionDate && (
            <div>
              <div style={fieldLabelStyle}>Completamento</div>
              <div style={fieldValueStyle}>
                {formatDate(order.completionDate)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface EditItem {
  articleCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  vatAmount: number;
  lineAmount: number;
  lineTotalWithVat: number;
  articleDescription: string;
  _origIdx?: number;
}

interface EditModification {
  type: "update" | "add" | "delete";
  rowIndex?: number;
  articleCode?: string;
  productName?: string;
  articleChanged?: boolean;
  quantity?: number;
  discount?: number;
  oldArticleCode?: string;
  oldQuantity?: number;
  oldDiscount?: number;
}

function computeModifications(
  originalItems: EditItem[],
  editItems: EditItem[],
): EditModification[] {
  const mods: EditModification[] = [];
  const coveredOriginalIndices = new Set<number>();

  for (const edit of editItems) {
    const origIdx = edit._origIdx;

    if (origIdx === undefined) {
      if (edit.articleCode) {
        mods.push({
          type: "add",
          articleCode: edit.articleCode,
          productName: edit.productName || edit.articleDescription || undefined,
          quantity: edit.quantity,
          discount: edit.discountPercent,
        });
      }
    } else {
      const orig = originalItems[origIdx];
      coveredOriginalIndices.add(origIdx);

      if (
        orig.articleCode !== edit.articleCode ||
        orig.quantity !== edit.quantity ||
        orig.discountPercent !== edit.discountPercent
      ) {
        mods.push({
          type: "update",
          rowIndex: origIdx,
          articleCode: edit.articleCode,
          productName: edit.productName || edit.articleDescription || undefined,
          articleChanged: orig.articleCode !== edit.articleCode,
          quantity: edit.quantity,
          discount: edit.discountPercent,
          oldArticleCode: orig.articleCode,
          oldQuantity: orig.quantity,
          oldDiscount: orig.discountPercent,
        });
      }
    }
  }

  for (let i = 0; i < originalItems.length; i++) {
    if (!coveredOriginalIndices.has(i)) {
      mods.push({
        type: "delete",
        rowIndex: i,
        articleCode: originalItems[i].articleCode,
        oldQuantity: originalItems[i].quantity,
      });
    }
  }

  return mods;
}

function recalcLineAmounts(item: EditItem): EditItem {
  const lineAmount = archibaldLineAmount(item.quantity, item.unitPrice, item.discountPercent);
  const vatAmount = Math.round(lineAmount * (item.vatPercent / 100) * 100) / 100;
  const lineTotalWithVat = Math.round((lineAmount + vatAmount) * 100) / 100;
  return { ...item, lineAmount, vatAmount, lineTotalWithVat };
}

function TabArticoli({
  orderId,
  archibaldOrderId,
  token,
  onTotalsUpdate,
  searchQuery = "",
  editing = false,
  onEditDone,
  editProgress,
  onEditProgress,
  customerName,
  initialNotes,
  initialNoShipping,
  initialDiscountPercent,
}: {
  orderId: string;
  archibaldOrderId?: string;
  token?: string;
  onTotalsUpdate?: (totals: {
    totalVatAmount?: number;
    totalWithVat?: number;
  }) => void;
  searchQuery?: string;
  editing?: boolean;
  onEditDone?: () => void;
  editProgress?: { progress: number; operation: string } | null;
  onEditProgress?: (progress: { progress: number; operation: string } | null) => void;
  customerName?: string;
  initialNotes?: string;
  initialNoShipping?: boolean;
  initialDiscountPercent?: number;
}) {
  type VerificationMismatch = {
    type: string;
    snapshotArticleCode: string | null;
    syncedArticleCode: string | null;
    field: string | null;
    expected: number | null;
    found: number | null;
  };

  const [articles, setArticles] = useState<OrderArticle[]>([]);
  const [verificationMismatches, setVerificationMismatches] = useState<VerificationMismatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { subscribe } = useWebSocketContext();
  const { trackOperation } = useOperationTracking();

  // Edit mode state
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [originalItems, setOriginalItems] = useState<EditItem[]>([]);
  const [editingArticleIdx, setEditingArticleIdx] = useState<number | null>(
    null,
  );
  const [articleSearch, setArticleSearch] = useState("");
  const [articleResults, setArticleResults] = useState<ProductWithDetails[]>(
    [],
  );
  const [highlightedArticleIdx, setHighlightedArticleIdx] = useState(-1);
  const [qtyValidation, setQtyValidation] = useState<
    Map<number, string | null>
  >(new Map());
  const [confirmModal, setConfirmModal] = useState<EditModification[] | null>(
    null,
  );
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [syncingArticles, setSyncingArticles] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editNoShipping, setEditNoShipping] = useState(false);
  const [verificationBanner, setVerificationBanner] = useState<{
    status: 'verified' | 'mismatch_detected';
    mismatches?: Array<{
      snapshotArticleCode: string | null;
      syncedArticleCode: string | null;
      field: string | null;
      expected: number | null;
      found: number | null;
    }>;
  } | null>(null);
  const [globalEditDiscount, setGlobalEditDiscount] = useState('');
  const [showImponibileDialog, setShowImponibileDialog] = useState(false);
  const [imponibileTarget, setImponibileTarget] = useState('');
  const [imponibileSelectedItems, setImponibileSelectedItems] = useState<Set<number>>(new Set());
  const [showTotaleDialog, setShowTotaleDialog] = useState(false);
  const [totaleTarget, setTotaleTarget] = useState('');
  const [totaleSelectedItems, setTotaleSelectedItems] = useState<Set<number>>(new Set());
  const [showMarkupPanel, setShowMarkupPanel] = useState(false);
  const [markupAmount, setMarkupAmount] = useState(0);
  const [markupArticleSelection, setMarkupArticleSelection] = useState<Set<number>>(new Set());
  const editTotals = useMemo(() => {
    const itemsSubtotal = editItems.reduce((s, i) => s + i.lineAmount, 0);
    const effectiveNoShipping = editNoShipping && itemsSubtotal < SHIPPING_THRESHOLD;
    const shipping = effectiveNoShipping ? { cost: 0, tax: 0, total: 0 } : calculateShippingCosts(itemsSubtotal);
    const vatFromItems = editItems.reduce((s, i) => s + i.vatAmount, 0);
    const finalVAT = Math.round((vatFromItems + shipping.tax) * 100) / 100;
    const finalTotal = Math.round((itemsSubtotal + shipping.cost + finalVAT) * 100) / 100;
    return { itemsSubtotal, shippingCost: shipping.cost, shippingTax: shipping.tax, finalVAT, finalTotal };
  }, [editItems, editNoShipping]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const qtyTimeoutRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;
  const onTotalsUpdateRef = useRef(onTotalsUpdate);
  onTotalsUpdateRef.current = onTotalsUpdate;

  // Load existing articles from database on mount
  useEffect(() => {
    const loadArticles = async () => {
      if (!token || !orderId) return;

      try {
        const response = await fetchWithRetry(
          `/api/orders/${orderId}/articles`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!response.ok) return;

        const data = await response.json();
        const articlesList = Array.isArray(data.data) ? data.data : [];
        if (data.success && articlesList.length > 0) {
          setArticles(articlesList);
          if (Array.isArray(data.verificationMismatches)) {
            setVerificationMismatches(data.verificationMismatches);
          }

          if (onTotalsUpdateRef.current) {
            const totalVat = articlesList.reduce(
              (sum: number, a: OrderArticle) => sum + (a.vatAmount ?? 0),
              0,
            );
            const totalWithVat = articlesList.reduce(
              (sum: number, a: OrderArticle) => sum + (a.lineTotalWithVat ?? 0),
              0,
            );
            if (totalVat > 0 || totalWithVat > 0) {
              onTotalsUpdateRef.current({ totalVatAmount: totalVat, totalWithVat });
            }
          }
        }
      } catch (err) {
        console.log("No existing articles found");
      }
    };

    loadArticles();
  }, [orderId, token]);

  // Initialize edit items when entering edit mode
  useEffect(() => {
    if (!editing) {
      setEditItems([]);
      setOriginalItems([]);
      setEditingArticleIdx(null);
      setConfirmModal(null);
      setSubmittingEdit(false);
      setSyncingArticles(false);
      return;
    }

    let cancelled = false;

    (async () => {
      // 1. Sync articles from server first
      setSyncingArticles(true);
      let freshArticles = articles;

      if (tokenRef.current && orderId) {
        try {
          const syncResponse = await fetchWithRetry(
            `/api/orders/${orderId}/sync-articles`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${tokenRef.current}`,
                "Content-Type": "application/json",
              },
            },
          );

          if (syncResponse.ok) {
            const enqueueResult = await syncResponse.json();

            if (enqueueResult.jobId) {
              await waitForJobViaWebSocket(enqueueResult.jobId, {
                subscribe: subscribeRef.current,
                maxWaitMs: 120_000,
              });

              const articlesResponse = await fetchWithRetry(
                `/api/orders/${orderId}/articles`,
                {
                  headers: {
                    Authorization: `Bearer ${tokenRef.current}`,
                  },
                },
              );

              if (articlesResponse.ok) {
                const articlesData = await articlesResponse.json();
                if (articlesData.success && articlesData.data.length > 0) {
                  freshArticles = articlesData.data;
                  if (!cancelled) {
                    setArticles(freshArticles);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn("[TabArticoli] Sync articles before edit failed:", err);
        }
      }

      if (cancelled) return;
      setSyncingArticles(false);

      // Product cache sync no longer needed - data comes from API

      if (cancelled) return;

      // 3. Initialize edit items from fresh articles
      const mapped: EditItem[] = freshArticles.map((item: OrderArticle, i: number) => ({
        articleCode: item.productName || item.articleCode || "",
        productName: item.productName || "",
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice ?? 0,
        discountPercent: item.discountPercent ?? 0,
        vatPercent: item.vatPercent ?? 0,
        vatAmount: item.vatAmount ?? 0,
        lineAmount: item.lineAmount ?? 0,
        lineTotalWithVat: item.lineTotalWithVat ?? 0,
        articleDescription: item.articleDescription ?? "",
        _origIdx: i,
      }));
      setEditItems(mapped);
      setOriginalItems(mapped.map((m) => ({ ...m })));
    })();

    return () => {
      cancelled = true;
    };
  }, [editing, orderId]);

  useEffect(() => {
    if (editing) {
      setEditNotes(initialNotes ?? '');
      setEditNoShipping(initialNoShipping ?? false);
      setGlobalEditDiscount(
        initialDiscountPercent && initialDiscountPercent > 0
          ? String(initialDiscountPercent)
          : '',
      );
      setVerificationBanner(null);
    }
  }, [editing, initialNotes, initialNoShipping, initialDiscountPercent]);

  useEffect(() => {
    if (editNoShipping && editTotals.itemsSubtotal >= SHIPPING_THRESHOLD) {
      setEditNoShipping(false);
    }
  }, [editNoShipping, editTotals.itemsSubtotal]);

  useEffect(() => {
    if (!editing) return;
    const unsubscribe = subscribe('VERIFICATION_RESULT', (payload: unknown) => {
      const p = payload as { orderId: string; status: string; mismatches?: Array<{ snapshotArticleCode: string | null; syncedArticleCode: string | null; field: string | null; expected: number | null; found: number | null }> };
      if (p.orderId === orderId) {
        setVerificationBanner({
          status: p.status as 'verified' | 'mismatch_detected',
          mismatches: p.mismatches,
        });
      }
    });
    return () => { unsubscribe(); };
  }, [editing, orderId, subscribe]);

  // Click outside article dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setEditingArticleIdx(null);
        setArticleSearch("");
        setArticleResults([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced article search
  const handleArticleSearchChange = useCallback(
    (idx: number, query: string) => {
      setArticleSearch(query);
      setEditingArticleIdx(idx);
      setHighlightedArticleIdx(-1);

      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

      if (query.length < 2) {
        setArticleResults([]);
        return;
      }

      searchTimeoutRef.current = setTimeout(async () => {
        const results = await productService.searchProducts(query, 10);
        const seen = new Set<string>();
        const deduped = results.filter((r) => {
          if (seen.has(r.name)) return false;
          seen.add(r.name);
          return true;
        });
        setArticleResults(deduped.slice(0, 10));
      }, 300);
    },
    [],
  );

  const handleSelectArticle = useCallback(
    async (idx: number, product: ProductWithDetails) => {
      const currentQty = editItems[idx]?.quantity || 0;
      const packaging = await productService.calculateOptimalPackaging(
        product.name,
        currentQty,
      );

      const isFresisCustomer = customerName?.toLowerCase().includes("fresis") ?? false;

      const hasBreakdown =
        packaging.success &&
        packaging.breakdown &&
        packaging.breakdown.length > 0;

      const breakdownItems: EditItem[] = [];

      if (hasBreakdown) {
        for (const pkg of packaging.breakdown!) {
          const variantPriceId = pkg.variant.variantId || product.id;
          const variantName = pkg.variant.productId || product.name;
          const priceData = await priceService.getPriceAndVat(variantPriceId);
          const unitPrice = priceData?.price ?? product.price ?? 0;
          const vatPercent = normalizeVatRate(priceData?.vat ?? product.vat) ?? 0;

          let discountPercent = editItems[idx]?.discountPercent ?? 0;
          if (isFresisCustomer) {
            const fresisDiscount = await getDiscountForArticle(variantName);
            discountPercent = fresisDiscount?.discountPercent ?? FRESIS_DEFAULT_DISCOUNT;
          }

          breakdownItems.push(
            recalcLineAmounts({
              articleCode: variantName,
              productName: product.name,
              unitPrice,
              vatPercent,
              articleDescription: product.description || product.name,
              quantity: pkg.totalPieces,
              discountPercent,
              vatAmount: 0,
              lineAmount: 0,
              lineTotalWithVat: 0,
            }),
          );
        }
      } else {
        const variantId = product.id;
        const priceData = await priceService.getPriceAndVat(variantId);
        const unitPrice = priceData?.price ?? product.price ?? 0;
        const vatPercent = normalizeVatRate(priceData?.vat ?? product.vat) ?? 0;

        let discountPercent = editItems[idx]?.discountPercent ?? 0;
        if (isFresisCustomer) {
          const fresisDiscount = await getDiscountForArticle(product.name);
          discountPercent = fresisDiscount?.discountPercent ?? FRESIS_DEFAULT_DISCOUNT;
        }

        breakdownItems.push(
          recalcLineAmounts({
            articleCode: product.name,
            productName: product.name,
            unitPrice,
            vatPercent,
            articleDescription: product.description || product.name,
            quantity: packaging.suggestedQuantity ?? currentQty,
            discountPercent,
            vatAmount: 0,
            lineAmount: 0,
            lineTotalWithVat: 0,
          }),
        );
      }

      const newItems = [...editItems];
      const replacedOrigIdx = editItems[idx]?._origIdx;
      breakdownItems[0] = { ...breakdownItems[0], _origIdx: replacedOrigIdx };
      newItems.splice(idx, 1, ...breakdownItems);
      setEditItems(newItems);
      setEditingArticleIdx(null);
      setArticleSearch("");
      setArticleResults([]);

      setTimeout(() => {
        const qtyInput = document.querySelector(`[data-field="qty-${idx}"]`) as HTMLInputElement;
        if (qtyInput) {
          qtyInput.focus();
          qtyInput.select();
        }
      }, 50);
    },
    [editItems, customerName],
  );

  const handleArticleKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      if (articleResults.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedArticleIdx((prev) =>
            prev < articleResults.length - 1 ? prev + 1 : prev,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedArticleIdx((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case "Enter":
          e.preventDefault();
          if (
            highlightedArticleIdx >= 0 &&
            highlightedArticleIdx < articleResults.length
          ) {
            handleSelectArticle(idx, articleResults[highlightedArticleIdx]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setEditingArticleIdx(null);
          setArticleSearch("");
          setArticleResults([]);
          break;
      }
    },
    [articleResults, highlightedArticleIdx, handleSelectArticle],
  );

  const handleQtyChange = useCallback(
    (idx: number, qty: number) => {
      const newItems = [...editItems];
      newItems[idx] = recalcLineAmounts({ ...newItems[idx], quantity: qty });
      setEditItems(newItems);

      const existing = qtyTimeoutRef.current.get(idx);
      if (existing) clearTimeout(existing);

      if (qty <= 0) {
        setQtyValidation((prev) =>
          new Map(prev).set(idx, "error:Quantita' deve essere > 0"),
        );
        return;
      }

      const item = newItems[idx];
      if (!item.productName) {
        setQtyValidation((prev) => {
          const m = new Map(prev);
          m.delete(idx);
          return m;
        });
        return;
      }

      const timeout = setTimeout(async () => {
        const packaging = await productService.calculateOptimalPackaging(
          item.productName,
          qty,
        );
        if (packaging.success) {
          setQtyValidation((prev) => {
            const m = new Map(prev);
            m.delete(idx);
            return m;
          });
          if (
            packaging.suggestedQuantity &&
            packaging.suggestedQuantity !== qty
          ) {
            setQtyValidation((prev) =>
              new Map(prev).set(
                idx,
                `suggest:${packaging.suggestedQuantity}`,
              ),
            );
          }
          if (packaging.breakdown && packaging.breakdown.length > 0) {
            const isFresisCustomer = customerName?.toLowerCase().includes("fresis") ?? false;

            if (packaging.breakdown.length > 1) {
              const breakdownItems: EditItem[] = [];
              for (const pkg of packaging.breakdown) {
                const variantPriceId = pkg.variant.variantId;
                const variantName = pkg.variant.productId || item.productName;
                const priceData = await priceService.getPriceAndVat(variantPriceId);

                let discountPercent = item.discountPercent;
                if (isFresisCustomer) {
                  const fresisDiscount = await getDiscountForArticle(variantName);
                  discountPercent = fresisDiscount?.discountPercent ?? FRESIS_DEFAULT_DISCOUNT;
                }

                breakdownItems.push(
                  recalcLineAmounts({
                    articleCode: variantName,
                    productName: item.productName,
                    unitPrice: priceData?.price ?? item.unitPrice,
                    vatPercent: normalizeVatRate(priceData?.vat ?? item.vatPercent) ?? 0,
                    articleDescription: item.articleDescription,
                    quantity: pkg.totalPieces,
                    discountPercent,
                    vatAmount: 0,
                    lineAmount: 0,
                    lineTotalWithVat: 0,
                  }),
                );
              }
              setEditItems((prev) => {
                const updated = [...prev];
                const replacedOrigIdx = updated[idx]?._origIdx;
                breakdownItems[0] = { ...breakdownItems[0], _origIdx: replacedOrigIdx };
                updated.splice(idx, 1, ...breakdownItems);
                return updated;
              });
            } else {
              const bestVariant = packaging.breakdown[0].variant;
              const variantPriceId = bestVariant.variantId;
              const variantName = bestVariant.productId || item.productName;
              const priceData = await priceService.getPriceAndVat(variantPriceId);

              let discountPercent = item.discountPercent;
              if (isFresisCustomer) {
                const fresisDiscount = await getDiscountForArticle(variantName);
                discountPercent = fresisDiscount?.discountPercent ?? FRESIS_DEFAULT_DISCOUNT;
              }

              setEditItems((prev) => {
                const updated = [...prev];
                updated[idx] = recalcLineAmounts({
                  ...updated[idx],
                  articleCode: variantName,
                  unitPrice: priceData?.price ?? updated[idx].unitPrice,
                  vatPercent: normalizeVatRate(
                    priceData?.vat ?? updated[idx].vatPercent,
                  ) ?? 0,
                  quantity: packaging.breakdown![0].totalPieces,
                  discountPercent,
                });
                return updated;
              });
            }
          }
        } else {
          setQtyValidation((prev) =>
            new Map(prev).set(
              idx,
              `error:${packaging.error || "Quantita' non valida per il packaging"}`,
            ),
          );
        }
      }, 500);
      qtyTimeoutRef.current.set(idx, timeout);
    },
    [editItems, customerName],
  );

  const handleDiscountChange = useCallback(
    (idx: number, discount: number) => {
      const clamped = Math.min(100, Math.max(0, discount));
      const newItems = [...editItems];
      newItems[idx] = recalcLineAmounts({
        ...newItems[idx],
        discountPercent: clamped,
      });
      setEditItems(newItems);
    },
    [editItems],
  );

  const handleRemoveEditItem = useCallback((idx: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
    setQtyValidation((prev) => {
      const m = new Map<number, string | null>();
      prev.forEach((v, k) => {
        if (k < idx) m.set(k, v);
        else if (k > idx) m.set(k - 1, v);
      });
      return m;
    });
  }, []);

  const handleAddEditItem = useCallback(() => {
    setEditItems((prev) => [
      ...prev,
      {
        articleCode: "",
        productName: "",
        quantity: 0,
        unitPrice: 0,
        discountPercent: 0,
        vatPercent: 22,
        vatAmount: 0,
        lineAmount: 0,
        lineTotalWithVat: 0,
        articleDescription: "",
      },
    ]);
  }, []);

  const hasPackagingErrors = Array.from(qtyValidation.values()).some(
    (msg) => msg?.startsWith("error:"),
  );

  const handleSaveClick = () => {
    if (hasPackagingErrors) {
      setError("Correggere gli errori di confezionamento prima di salvare");
      return;
    }
    const mods = computeModifications(originalItems, editItems);
    const notesChanged = editNotes !== (initialNotes ?? '');
    const shippingChanged = editNoShipping !== (initialNoShipping ?? false);
    if (mods.length === 0 && !notesChanged && !shippingChanged) {
      onEditDone?.();
      return;
    }
    setConfirmModal(mods);
  };

  const handleConfirmEdit = async () => {
    if (!confirmModal || !token) return;
    const modifications = confirmModal;
    setConfirmModal(null);
    setSubmittingEdit(true);
    onEditProgress?.(null);

    try {
      const result = await enqueueOperation('edit-order', {
        orderId,
        modifications,
        updatedItems: editItems,
        notes: editNotes,
        noShipping: editNoShipping || undefined,
      });

      if (!result.success) {
        setError(result.error || "Errore durante la modifica");
        setSubmittingEdit(false);
        return;
      }

      trackOperation(orderId, result.jobId, customerName || orderId, 'Modifica ordine...');

      await waitForJobViaWebSocket(result.jobId, {
        subscribe,
        maxWaitMs: 120_000,
        onProgress: (progress, label) => {
          onEditProgress?.({
            progress,
            operation: label ?? `Modifica in corso... ${progress}%`,
          });
        },
      });

      setSubmittingEdit(false);
      onEditProgress?.(null);
      onEditDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di rete");
      setSubmittingEdit(false);
      onEditProgress?.(null);
    }
  };

  const handleGlobalDiscountChange = (val: string) => {
    if (val === '' || /^\d*[.,]?\d{0,2}$/.test(val)) {
      setGlobalEditDiscount(val);
      const disc = parseFloat(val.replace(',', '.')) || 0;
      setEditItems((prev) => prev.map((item) => recalcLineAmounts({ ...item, discountPercent: disc })));
    }
  };

  const handleImponibileViaSconto = () => {
    const target = parseFloat(imponibileTarget.replace(',', '.'));
    if (isNaN(target) || target < 0 || imponibileSelectedItems.size === 0) return;

    const selectedSubtotal = editItems
      .filter((_, i) => imponibileSelectedItems.has(i))
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const unselectedSubtotal = editItems
      .filter((_, i) => !imponibileSelectedItems.has(i))
      .reduce((sum, item) => sum + item.lineAmount, 0);

    const targetForSelected = target - unselectedSubtotal;
    if (targetForSelected < 0 || selectedSubtotal === 0) {
      setError("Impossibile raggiungere l'imponibile target");
      setShowImponibileDialog(false);
      return;
    }

    const scontoNecessario = (1 - targetForSelected / selectedSubtotal) * 100;
    if (scontoNecessario < 0 || scontoNecessario >= 100) {
      setError("Sconto necessario fuori range (0-100%)");
      setShowImponibileDialog(false);
      return;
    }

    const computeImponibile = (disc: number) =>
      editItems.reduce((sum, item, i) => {
        if (!imponibileSelectedItems.has(i)) return sum + item.lineAmount;
        return sum + Math.round(item.unitPrice * item.quantity * (1 - disc / 100) * 100) / 100;
      }, 0);

    let newDiscount = Math.floor(scontoNecessario * 100) / 100;
    while (computeImponibile(newDiscount) < target && newDiscount > 0) {
      newDiscount = Math.round((newDiscount - 0.01) * 100) / 100;
    }
    const stepped = Math.round((newDiscount + 0.01) * 100) / 100;
    if (computeImponibile(stepped) >= target) {
      newDiscount = stepped;
    }

    let updatedItems = editItems.map((item, i) =>
      imponibileSelectedItems.has(i)
        ? recalcLineAmounts({ ...item, discountPercent: newDiscount })
        : item,
    );

    // Correzione centesimi residui sull'ultimo articolo selezionato
    const actualImponibile = updatedItems.reduce((s, i) => s + i.lineAmount, 0);
    const residualCents = Math.round((actualImponibile - target) * 100);
    if (residualCents > 0 && residualCents <= 10) {
      const indices = Array.from(imponibileSelectedItems);
      const lastIdx = indices[indices.length - 1];
      const lastItem = editItems[lastIdx];
      let lo = newDiscount;
      let hi = Math.min(newDiscount + 5, 100);
      let bestDisc = newDiscount;
      for (let iter = 0; iter < 80; iter++) {
        const mid = Math.round(((lo + hi) / 2) * 100) / 100;
        const testItems = updatedItems.map((it, i) =>
          i === lastIdx ? recalcLineAmounts({ ...lastItem, discountPercent: mid }) : it,
        );
        const testImp = testItems.reduce((s, i) => s + i.lineAmount, 0);
        if (testImp === target) { bestDisc = mid; break; }
        if (testImp > target) lo = mid;
        else hi = mid;
        if (testImp >= target && mid > bestDisc) bestDisc = mid;
      }
      if (bestDisc > newDiscount) {
        updatedItems = updatedItems.map((it, i) =>
          i === lastIdx ? recalcLineAmounts({ ...lastItem, discountPercent: bestDisc }) : it,
        );
      }
    }

    setEditItems(updatedItems);
    setShowImponibileDialog(false);
  };

  const handleTotaleCalcola = () => {
    const target = parseFloat(totaleTarget.replace(',', '.'));
    if (isNaN(target) || target <= 0 || totaleSelectedItems.size === 0) return;

    if (target > editTotals.finalTotal) {
      const unselSub = editItems.filter((_, i) => !totaleSelectedItems.has(i)).reduce((s, it) => s + it.lineAmount, 0);
      const unselVAT = editItems.filter((_, i) => !totaleSelectedItems.has(i)).reduce((s, it) => s + it.vatAmount, 0);
      const selItemsForMax = editItems.filter((_, i) => totaleSelectedItems.has(i));
      const maxSub = unselSub + selItemsForMax.reduce((s, it) => s + Math.round(it.unitPrice * it.quantity * 100) / 100, 0);
      const maxVAT = unselVAT + selItemsForMax.reduce((s, it) => s + Math.round(it.unitPrice * it.quantity * (it.vatPercent / 100) * 100) / 100, 0);
      const maxShipping = calculateShippingCosts(maxSub);
      const maxTotal = Math.round((maxSub + maxShipping.cost + maxVAT + maxShipping.tax) * 100) / 100;

      if (target > maxTotal) {
        const diff = target - editTotals.finalTotal;
        setMarkupAmount(diff);
        setMarkupArticleSelection(new Set(totaleSelectedItems));
        setShowMarkupPanel(true);
        setShowTotaleDialog(false);
        return;
      }
    }

    const selItems = editItems.filter((_, i) => totaleSelectedItems.has(i));
    const unselSub = editItems.filter((_, i) => !totaleSelectedItems.has(i)).reduce((s, it) => s + it.lineAmount, 0);
    const unselVAT = editItems.filter((_, i) => !totaleSelectedItems.has(i)).reduce((s, it) => s + it.vatAmount, 0);
    const shipping = calculateShippingCosts(editTotals.itemsSubtotal);
    const fixedPortion = unselSub + unselVAT + shipping.cost + shipping.tax;
    const targetForSelected = target - fixedPortion;
    if (targetForSelected <= 0) {
      setError('Impossibile raggiungere il totale target con gli articoli selezionati');
      setShowTotaleDialog(false);
      return;
    }

    const computeDiscountedTotal = (disc: number) => {
      let testSub = 0; let testVAT = 0;
      for (const it of selItems) {
        const itemSub = Math.round(it.unitPrice * it.quantity * (1 - disc / 100) * 100) / 100;
        testSub += itemSub;
        testVAT += Math.round(itemSub * (it.vatPercent / 100) * 100) / 100;
      }
      // Match editTotals: intermediate round2 on total VAT before final sum
      const totalVAT = Math.round((testVAT + unselVAT + shipping.tax) * 100) / 100;
      return Math.round((testSub + unselSub + shipping.cost + totalVAT) * 100) / 100;
    };

    let low = 0; let high = 100; let bestDiscount = 0;
    for (let iter = 0; iter < 100; iter++) {
      const mid = (low + high) / 2;
      const testTotal = computeDiscountedTotal(mid);
      if (Math.abs(testTotal - target) < 0.005) { bestDiscount = mid; break; }
      if (testTotal > target) low = mid; else high = mid;
      bestDiscount = mid;
    }

    let finalDiscount = Math.floor(bestDiscount * 100) / 100;
    while (computeDiscountedTotal(finalDiscount) < target && finalDiscount > 0) {
      finalDiscount = Math.round((finalDiscount - 0.01) * 100) / 100;
    }
    const stepped = Math.round((finalDiscount + 0.01) * 100) / 100;
    if (computeDiscountedTotal(stepped) >= target) finalDiscount = stepped;

    setEditItems(prev =>
      prev.map((item, i) =>
        totaleSelectedItems.has(i)
          ? recalcLineAmounts({ ...item, discountPercent: finalDiscount })
          : item,
      ),
    );
    setShowTotaleDialog(false);
  };

  const handleApplyMarkup = () => {
    if (markupArticleSelection.size === 0) return;
    const targetTotal = editTotals.finalTotal + markupAmount;
    const selItems = editItems.filter((_, i) => markupArticleSelection.has(i));
    const selSub = selItems.reduce((s, it) => s + it.lineAmount, 0);
    const selVAT = selItems.reduce((s, it) => s + it.vatAmount, 0);
    const avgVatRate = selSub > 0 ? selVAT / selSub : 0.22;
    const netMarkup = markupAmount / (1 + avgVatRate);

    let updatedItems = editItems.map((item, i) => {
      if (!markupArticleSelection.has(i)) return item;
      const weight = selSub > 0 ? item.lineAmount / selSub : 1 / selItems.length;
      const itemMarkup = netMarkup * weight;
      const newUnitPrice = item.quantity > 0 ? item.unitPrice + itemMarkup / item.quantity : item.unitPrice;
      const roundedPrice = Math.round(newUnitPrice * 100) / 100;
      return recalcLineAmounts({ ...item, unitPrice: roundedPrice });
    });

    const computeTotal = (items: typeof editItems) => {
      const sub = items.reduce((s, i) => s + i.lineAmount, 0);
      const sh = calculateShippingCosts(sub);
      const vat = items.reduce((s, i) => s + i.vatAmount, 0);
      return Math.round((sub + sh.cost + vat + sh.tax) * 100) / 100;
    };

    let actualTotal = computeTotal(updatedItems);
    if (actualTotal < targetTotal) {
      const sorted = updatedItems.map((it, idx) => ({ it, idx }))
        .filter(({ idx }) => markupArticleSelection.has(idx))
        .sort((a, b) => a.it.quantity - b.it.quantity);
      for (const { idx } of sorted) {
        if (actualTotal >= targetTotal) break;
        const item = updatedItems[idx];
        updatedItems = updatedItems.map((it, i) =>
          i === idx ? recalcLineAmounts({ ...item, unitPrice: Math.round((item.unitPrice + 0.01) * 100) / 100 }) : it,
        );
        actualTotal = computeTotal(updatedItems);
      }
    }

    setEditItems(updatedItems);
    setShowMarkupPanel(false);
  };

  const handleCancelEdit = () => {
    setEditItems(originalItems.map((m) => ({ ...m })));
    setConfirmModal(null);
    setQtyValidation(new Map());
    onEditDone?.();
  };

  const handleSyncArticles = async () => {
    if (!token) {
      setError("Token di autenticazione mancante");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithRetry(
        `/api/orders/${orderId}/sync-articles`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Errore durante la sincronizzazione",
        );
      }

      const enqueueResult = await response.json();

      if (!enqueueResult.jobId) {
        throw new Error("Nessun job creato per la sincronizzazione");
      }

      const result = await waitForJobViaWebSocket(enqueueResult.jobId, {
        subscribe,
        maxWaitMs: 120_000,
        onProgress: (progress, label) => {
          setSuccess(label ?? `Sincronizzazione in corso... ${progress}%`);
        },
      });

      const articlesResponse = await fetchWithRetry(
        `/api/orders/${orderId}/articles`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (articlesResponse.ok) {
        const articlesData = await articlesResponse.json();
        if (articlesData.success) {
          setArticles(articlesData.data);
        }
      }

      const totalVat = (result.totalVatAmount as number) ?? 0;
      const articlesCount = (result.articlesCount as number) ?? 0;
      setSuccess(
        `Sincronizzati ${articlesCount} articoli. Totale IVA: ${formatCurrency(totalVat)}`,
      );

      if (
        onTotalsUpdate &&
        result.totalVatAmount &&
        result.totalWithVat
      ) {
        onTotalsUpdate({
          totalVatAmount: result.totalVatAmount as number,
          totalWithVat: result.totalWithVat as number,
        });
      }

      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Errore sconosciuto";
      setError(errorMessage);
      console.error("Sync articles error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Syncing articles overlay
  if (editing && syncingArticles) {
    return (
      <div style={{ padding: "32px", textAlign: "center" }}>
        <div
          style={{
            fontSize: "48px",
            marginBottom: "16px",
            animation: "archibald-spinner-spin 1s linear infinite",
          }}
        >
          {"⏳"}
        </div>
        <p style={{ fontSize: "16px", color: "#666", marginBottom: "8px" }}>
          Sincronizzazione articoli da Archibald...
        </p>
        <style>
          {`@keyframes archibald-spinner-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
        </style>
      </div>
    );
  }


  // Confirm modal
  if (confirmModal && !submittingEdit) {
    const updates = confirmModal.filter((m) => m.type === "update");
    const adds = confirmModal.filter((m) => m.type === "add");
    const deletes = confirmModal.filter((m) => m.type === "delete");

    return (
      <div style={{ padding: "16px" }}>
        <div
          style={{
            backgroundColor: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <h3
            style={{
              fontSize: "18px",
              fontWeight: 700,
              marginBottom: "16px",
              color: "#333",
            }}
          >
            Conferma modifiche
          </h3>

          {editNoShipping !== (initialNoShipping ?? false) && (
            <div style={{ marginBottom: "16px", fontSize: "13px", color: "#555" }}>
              Spese di spedizione: {editNoShipping ? "rimosse (NO SPESE DI SPEDIZIONE)" : "ripristinate"}
            </div>
          )}
          {editNotes !== (initialNotes ?? '') && (
            <div style={{ marginBottom: "16px", fontSize: "13px", color: "#555" }}>
              Note aggiornate
            </div>
          )}

          {updates.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#1976d2",
                  marginBottom: "8px",
                }}
              >
                Modifiche ({updates.length})
              </div>
              {updates.map((m, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: "13px",
                    color: "#555",
                    padding: "4px 0",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  Riga {m.rowIndex}: {m.oldArticleCode} {"→"} {m.articleCode}
                  {m.oldQuantity !== m.quantity &&
                    `, Qty: ${m.oldQuantity} → ${m.quantity}`}
                  {m.oldDiscount !== m.discount &&
                    `, Sconto: ${m.oldDiscount}% → ${m.discount}%`}
                </div>
              ))}
            </div>
          )}

          {adds.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#388e3c",
                  marginBottom: "8px",
                }}
              >
                Aggiunte ({adds.length})
              </div>
              {adds.map((m, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: "13px",
                    color: "#555",
                    padding: "4px 0",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  + {m.articleCode}, Qty: {m.quantity}
                  {m.discount ? `, Sconto: ${m.discount}%` : ""}
                </div>
              ))}
            </div>
          )}

          {deletes.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#d32f2f",
                  marginBottom: "8px",
                }}
              >
                Eliminazioni ({deletes.length})
              </div>
              {deletes.map((m, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: "13px",
                    color: "#555",
                    padding: "4px 0",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  - Riga {m.rowIndex}: {m.articleCode} (Qty: {m.oldQuantity})
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
              marginTop: "20px",
            }}
          >
            <button
              onClick={() => setConfirmModal(null)}
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
              Torna alla modifica
            </button>
            <button
              onClick={handleConfirmEdit}
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
              Conferma e invia
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Submitting state with progress
  if (submittingEdit) {
    return (
      <div style={{ padding: "32px", textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>{"⏳"}</div>
        <p style={{ fontSize: "16px", color: "#666", marginBottom: "8px" }}>
          Modifica in corso su Archibald...
        </p>
        {editProgress && (
          <div style={{ maxWidth: "400px", margin: "0 auto" }}>
            <ProgressBar
              percent={editProgress.progress}
              stage={editProgress.operation}
              color="#1976d2"
            />
          </div>
        )}
      </div>
    );
  }

  // EDIT MODE RENDERING
  if (editing) {
    return (
      <div style={{ padding: "16px" }}>
        <style>{`
          .edit-table input[type="number"]::-webkit-outer-spin-button,
          .edit-table input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          .edit-table input[type="number"] {
            -moz-appearance: textfield;
          }
        `}</style>
        {/* Edit mode header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#1976d2" }}>
            Modalita' modifica
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleCancelEdit}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: "#fff",
                color: "#666",
                border: "1px solid #ddd",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Annulla
            </button>
            <button
              onClick={handleSaveClick}
              disabled={
                hasPackagingErrors ||
                editItems.some(
                  (item) => !item.articleCode || item.quantity <= 0,
                )
              }
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor:
                  hasPackagingErrors ||
                  editItems.some(
                    (item) => !item.articleCode || item.quantity <= 0,
                  )
                    ? "#ccc"
                    : "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor:
                  hasPackagingErrors ||
                  editItems.some(
                    (item) => !item.articleCode || item.quantity <= 0,
                  )
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              Salva modifiche
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px",
              backgroundColor: "#ffebee",
              color: "#c62828",
              borderRadius: "4px",
            }}
          >
            {error}
          </div>
        )}

        {/* Edit table */}
        <div className="edit-table" style={{ position: "relative", overflow: "visible" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", overflow: "visible" }}>
            <thead>
              <tr>
                <th style={tableHeaderStyle}>Codice Articolo</th>
                <th style={tableHeaderStyle}>Descrizione</th>
                <th style={{ ...tableHeaderStyle, width: "100px" }}>
                  Quantita'
                </th>
                <th style={tableHeaderStyle}>Prezzo Unit.</th>
                <th style={{ ...tableHeaderStyle, width: "90px" }}>Sconto %</th>
                <th style={tableHeaderStyle}>Imponibile</th>
                <th style={tableHeaderStyle}>IVA %</th>
                <th style={{ ...tableHeaderStyle, width: "50px" }}></th>
              </tr>
            </thead>
            <tbody>
              {editItems.map((item, idx) => {
                const isSearching = editingArticleIdx === idx;
                const qtyError = qtyValidation.get(idx);

                return (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: "1px solid #e0e0e0",
                      backgroundColor: idx % 2 === 0 ? "#fff" : "#fafafa",
                    }}
                  >
                    {/* Article Code - searchable */}
                    <td
                      style={{
                        ...tableCellStyle,
                        position: "relative",
                        minWidth: "200px",
                      }}
                    >
                      <div
                        ref={isSearching ? dropdownRef : undefined}
                        style={{ position: "relative" }}
                      >
                        <input autoComplete="off"
                          type="search"
                          value={isSearching ? articleSearch : (item.productName || item.articleCode)}
                          onChange={(e) =>
                            handleArticleSearchChange(idx, e.target.value)
                          }
                          onFocus={() => {
                            setEditingArticleIdx(idx);
                            setArticleSearch(item.productName || item.articleCode);
                          }}
                          onKeyDown={(e) => handleArticleKeyDown(e, idx)}
                          placeholder="Cerca articolo..."
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            fontSize: "13px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                        {/* Dropdown */}
                        {isSearching && articleResults.length > 0 && (
                          <div
                            style={{
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
                            }}
                          >
                            {articleResults.map((product, pIdx) => (
                              <div
                                key={product.id}
                                onClick={() =>
                                  handleSelectArticle(idx, product)
                                }
                                onMouseEnter={() =>
                                  setHighlightedArticleIdx(pIdx)
                                }
                                style={{
                                  padding: "8px 10px",
                                  cursor: "pointer",
                                  borderBottom:
                                    pIdx < articleResults.length - 1
                                      ? "1px solid #f3f4f6"
                                      : "none",
                                  backgroundColor:
                                    pIdx === highlightedArticleIdx
                                      ? "#E3F2FD"
                                      : "#fff",
                                }}
                              >
                                <div
                                  style={{ fontWeight: 600, fontSize: "13px" }}
                                >
                                  {product.article}
                                </div>
                                <div
                                  style={{ fontSize: "11px", color: "#666" }}
                                >
                                  {product.name}
                                  {product.price != null &&
                                    ` - ${formatCurrency(product.price)}`}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Description */}
                    <td style={tableCellStyle}>
                      <span style={{ fontSize: "13px", color: "#555" }}>
                        {item.articleDescription || item.productName}
                      </span>
                    </td>

                    {/* Quantity */}
                    <td style={tableCellStyle}>
                      <input autoComplete="off"
                        data-field={`qty-${idx}`}
                        type="text"
                        inputMode="numeric"
                        value={item.quantity || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const parsed = parseInt(val, 10);
                          handleQtyChange(idx, isNaN(parsed) ? 0 : parsed);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const discountInput = document.querySelector(
                              `[data-field="discount-${idx}"]`,
                            ) as HTMLInputElement;
                            discountInput?.focus();
                          }
                        }}
                        style={{
                          width: "80px",
                          padding: "6px 8px",
                          fontSize: "13px",
                          border: `1px solid ${qtyError?.startsWith("error:") ? "#d32f2f" : qtyError?.startsWith("suggest:") ? "#1976d2" : "#ddd"}`,
                          borderRadius: "4px",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                      {qtyError && qtyError.startsWith("error:") && (
                        <div
                          style={{
                            fontSize: "10px",
                            color: "#d32f2f",
                            marginTop: "2px",
                          }}
                        >
                          {qtyError.replace("error:", "")}
                        </div>
                      )}
                      {qtyError && qtyError.startsWith("suggest:") && (
                        <button
                          type="button"
                          onClick={() => {
                            const suggested = parseInt(qtyError.replace("suggest:", ""), 10);
                            if (!isNaN(suggested)) {
                              handleQtyChange(idx, suggested);
                            }
                          }}
                          style={{
                            fontSize: "10px",
                            color: "#1976d2",
                            marginTop: "2px",
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          Usa {qtyError.replace("suggest:", "")} pz
                        </button>
                      )}
                    </td>

                    {/* Unit Price */}
                    <td style={tableCellStyle}>
                      <span style={{ fontSize: "13px" }}>
                        {item.unitPrice > 0
                          ? formatCurrency(item.unitPrice)
                          : "-"}
                      </span>
                    </td>

                    {/* Discount */}
                    <td style={tableCellStyle}>
                      <input autoComplete="off"
                        data-field={`discount-${idx}`}
                        type="text"
                        inputMode="decimal"
                        value={item.discountPercent || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const parsed = parseFloat(val.replace(",", "."));
                          if (val === "" || (!isNaN(parsed) && parsed <= 100)) {
                            handleDiscountChange(idx, isNaN(parsed) ? 0 : parsed);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                          }
                        }}
                        style={{
                          width: "70px",
                          padding: "6px 8px",
                          fontSize: "13px",
                          border: "1px solid #ddd",
                          borderRadius: "4px",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </td>

                    {/* Line Amount */}
                    <td style={tableCellStyle}>
                      <span style={{ fontSize: "13px" }}>
                        {item.lineAmount > 0
                          ? formatCurrency(item.lineAmount)
                          : "-"}
                      </span>
                    </td>

                    {/* VAT % */}
                    <td style={tableCellStyle}>
                      <span style={{ fontSize: "13px" }}>
                        {item.vatPercent}%
                      </span>
                    </td>

                    {/* Remove button */}
                    <td style={tableCellStyle}>
                      <button
                        onClick={() => handleRemoveEditItem(idx)}
                        style={{
                          padding: "4px 8px",
                          fontSize: "14px",
                          border: "none",
                          backgroundColor: "transparent",
                          color: "#d32f2f",
                          cursor: "pointer",
                          borderRadius: "4px",
                        }}
                        title="Rimuovi riga"
                      >
                        {"🗑️"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add row button */}
        <div style={{ marginTop: "12px" }}>
          <button
            onClick={handleAddEditItem}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              backgroundColor: "#fff",
              color: "#1976d2",
              border: "1px dashed #1976d2",
              borderRadius: "6px",
              cursor: "pointer",
              width: "100%",
            }}
          >
            + Aggiungi articolo
          </button>
        </div>

        {/* Sconto globale */}
        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px' }}>
            Sconto su tutte le righe (%)
          </label>
          <input
            autoComplete="off"
            type="text"
            inputMode="decimal"
            value={globalEditDiscount}
            onChange={(e) => handleGlobalDiscountChange(e.target.value)}
            style={{ width: '160px', padding: '6px 8px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '4px' }}
          />
        </div>

        {/* Note ordine */}
        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px' }}>
            Note
          </label>
          <textarea
            autoComplete="off"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Note per l'ordine..."
            maxLength={500}
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              fontFamily: 'system-ui',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Riepilogo totali */}
        <div
          style={{
            marginTop: '20px',
            padding: '16px',
            background: 'white',
            borderRadius: '8px',
            border: '2px solid #3b82f6',
          }}
        >
          {/* Subtotale articoli */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span>Subtotale articoli:</span>
            <strong>{formatCurrency(editTotals.itemsSubtotal)}</strong>
          </div>

          {/* Imponibile – cliccabile */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '8px',
              paddingTop: '8px',
              borderTop: '1px solid #e5e7eb',
              fontSize: '13px',
              cursor: editItems.length > 0 ? 'pointer' : 'default',
              ...(editItems.length > 0 ? { background: '#f0f9ff', borderRadius: '4px', padding: '8px 4px', margin: '-4px 0 8px 0' } : {}),
            }}
            onClick={() => {
              if (editItems.length === 0) return;
              setImponibileTarget(editTotals.itemsSubtotal.toFixed(2));
              setImponibileSelectedItems(new Set(editItems.map((_, i) => i)));
              setShowImponibileDialog(true);
            }}
          >
            <span>Imponibile:{editItems.length > 0 ? ' (clicca per modificare)' : ''}</span>
            <strong>{formatCurrency(editTotals.itemsSubtotal)}</strong>
          </div>

          {/* Spese trasporto */}
          {(() => {
            const rawShipping = calculateShippingCosts(editTotals.itemsSubtotal);
            const showShippingRow = rawShipping.cost > 0 || editNoShipping;
            if (!showShippingRow) return null;
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                color: editNoShipping ? '#9ca3af' : '#f59e0b', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editNoShipping}
                    onChange={(e) => setEditNoShipping(e.target.checked)}
                    style={{ accentColor: '#f59e0b', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ textDecoration: editNoShipping ? 'line-through' : 'none' }}>
                    Spese di trasporto K3
                  </span>
                  {!editNoShipping && rawShipping.cost > 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      ({formatCurrency(rawShipping.cost)} + IVA)
                    </span>
                  )}
                </label>
                <strong style={{ textDecoration: editNoShipping ? 'line-through' : 'none' }}>
                  {editNoShipping ? formatCurrency(0) : formatCurrency(editTotals.shippingCost + editTotals.shippingTax)}
                </strong>
              </div>
            );
          })()}

          {/* IVA totale */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#6b7280' }}>
            <span>IVA Totale:</span>
            <strong>{formatCurrency(editTotals.finalVAT)}</strong>
          </div>

          {/* Totale con IVA – cliccabile */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '2px solid #3b82f6',
              fontSize: '15px',
              cursor: editItems.length > 0 ? 'pointer' : 'default',
              ...(editItems.length > 0 ? { background: '#eff6ff', borderRadius: '4px', padding: '8px 4px' } : {}),
            }}
            onClick={() => {
              if (editItems.length === 0) return;
              setTotaleTarget(editTotals.finalTotal.toFixed(2));
              setTotaleSelectedItems(new Set(editItems.map((_, i) => i)));
              setShowTotaleDialog(true);
            }}
          >
            <span style={{ fontWeight: 600 }}>
              TOTALE (con IVA):{editItems.length > 0 ? ' (clicca)' : ''}
            </span>
            <strong style={{ color: '#3b82f6' }}>{formatCurrency(editTotals.finalTotal)}</strong>
          </div>
        </div>

        {verificationBanner && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            borderRadius: '0.375rem',
            backgroundColor: verificationBanner.status === 'verified' ? '#d1fae5' : '#fef3c7',
            border: `1px solid ${verificationBanner.status === 'verified' ? '#6ee7b7' : '#fcd34d'}`,
            fontSize: '0.875rem',
          }}>
            {verificationBanner.status === 'verified' ? (
              <span style={{ color: '#065f46' }}>✅ Modifica confermata da Archibald ERP</span>
            ) : (
              <div>
                <div style={{ color: '#92400e', fontWeight: 600, marginBottom: '0.25rem' }}>
                  ⚠️ Discrepanze rilevate su Archibald:
                </div>
                {verificationBanner.mismatches?.map((m, i) => (
                  <div key={i} style={{ color: '#78350f', fontSize: '0.8125rem' }}>
                    {m.snapshotArticleCode ?? m.syncedArticleCode}: {m.field} atteso {String(m.expected)} → trovato {String(m.found)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dialogs – rendered by subsequent tasks */}
      {/* Imponibile dialog */}
      {showImponibileDialog && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}
          onClick={() => setShowImponibileDialog(false)}
        >
          <div
            style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', maxWidth: '480px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Modifica Imponibile</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Nuovo imponibile target</label>
              <input
                autoComplete="off"
                autoFocus
                type="text"
                inputMode="decimal"
                value={imponibileTarget}
                onChange={(e) => setImponibileTarget(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                <input
                  autoComplete="off"
                  type="checkbox"
                  checked={imponibileSelectedItems.size === editItems.length}
                  onChange={(e) =>
                    setImponibileSelectedItems(
                      e.target.checked ? new Set(editItems.map((_, i) => i)) : new Set(),
                    )
                  }
                />
                Seleziona tutti
              </label>
              {editItems.map((item, idx) => (
                <label
                  key={idx}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', padding: '4px', borderBottom: '1px solid #f3f4f6', background: imponibileSelectedItems.has(idx) ? '#eff6ff' : 'transparent' }}
                >
                  <input
                    autoComplete="off"
                    type="checkbox"
                    checked={imponibileSelectedItems.has(idx)}
                    onChange={(e) => {
                      const next = new Set(imponibileSelectedItems);
                      if (e.target.checked) next.add(idx); else next.delete(idx);
                      setImponibileSelectedItems(next);
                    }}
                  />
                  {item.articleCode} – {formatCurrency(item.lineAmount)}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleImponibileViaSconto}
                disabled={imponibileSelectedItems.size === 0}
                style={{ flex: 1, padding: '10px', background: imponibileSelectedItems.size > 0 ? '#8b5cf6' : '#d1d5db', color: 'white', border: 'none', borderRadius: '6px', cursor: imponibileSelectedItems.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: '13px' }}
              >
                Via sconto
              </button>
              <button
                onClick={() => setShowImponibileDialog(false)}
                style={{ padding: '10px 16px', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Totale dialog */}
      {showTotaleDialog && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}
          onClick={() => setShowTotaleDialog(false)}
        >
          <div
            style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', maxWidth: '480px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Modifica Totale (con IVA)</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Nuovo totale target (con IVA)</label>
              <input
                autoComplete="off"
                autoFocus
                type="text"
                inputMode="decimal"
                value={totaleTarget}
                onChange={(e) => setTotaleTarget(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                <input
                  autoComplete="off"
                  type="checkbox"
                  checked={totaleSelectedItems.size === editItems.length}
                  onChange={(e) =>
                    setTotaleSelectedItems(
                      e.target.checked ? new Set(editItems.map((_, i) => i)) : new Set(),
                    )
                  }
                />
                Seleziona tutti
              </label>
              {editItems.map((item, idx) => (
                <label
                  key={idx}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', padding: '4px', borderBottom: '1px solid #f3f4f6', background: totaleSelectedItems.has(idx) ? '#eff6ff' : 'transparent' }}
                >
                  <input
                    autoComplete="off"
                    type="checkbox"
                    checked={totaleSelectedItems.has(idx)}
                    onChange={(e) => {
                      const next = new Set(totaleSelectedItems);
                      if (e.target.checked) next.add(idx); else next.delete(idx);
                      setTotaleSelectedItems(next);
                    }}
                  />
                  {item.articleCode} – {formatCurrency(item.lineTotalWithVat)}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleTotaleCalcola}
                disabled={totaleSelectedItems.size === 0}
                style={{ flex: 1, padding: '10px', background: totaleSelectedItems.size > 0 ? '#3b82f6' : '#d1d5db', color: 'white', border: 'none', borderRadius: '6px', cursor: totaleSelectedItems.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: '13px' }}
              >
                Calcola
              </button>
              <button
                onClick={() => setShowTotaleDialog(false)}
                style={{ padding: '10px 16px', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maggiorazione panel */}
      {showMarkupPanel && (
        <div style={{ marginTop: '16px', padding: '16px', background: '#fffbeb', borderRadius: '8px', border: '2px solid #f59e0b' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#92400e' }}>
            Maggiorazione: +{formatCurrency(markupAmount)}
          </h4>
          <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#78350f' }}>
            Il totale desiderato è superiore al massimo. Seleziona gli articoli su cui distribuire la maggiorazione:
          </p>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#92400e' }}>
              <input
                autoComplete="off"
                type="checkbox"
                checked={markupArticleSelection.size === editItems.length}
                onChange={(e) =>
                  setMarkupArticleSelection(
                    e.target.checked ? new Set(editItems.map((_, i) => i)) : new Set(),
                  )
                }
              />
              Tutti gli articoli
            </label>
            {editItems.map((item, idx) => (
              <label
                key={idx}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', padding: '3px 4px', borderBottom: '1px solid #fef3c7', background: markupArticleSelection.has(idx) ? '#fef9c3' : 'transparent' }}
              >
                <input
                  autoComplete="off"
                  type="checkbox"
                  checked={markupArticleSelection.has(idx)}
                  onChange={(e) => {
                    const next = new Set(markupArticleSelection);
                    if (e.target.checked) next.add(idx); else next.delete(idx);
                    setMarkupArticleSelection(next);
                  }}
                />
                {item.articleCode} – {formatCurrency(item.unitPrice)}/pz
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleApplyMarkup}
              disabled={markupArticleSelection.size === 0}
              style={{ flex: 1, padding: '10px', background: markupArticleSelection.size > 0 ? '#f59e0b' : '#d1d5db', color: 'white', border: 'none', borderRadius: '6px', cursor: markupArticleSelection.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: '13px' }}
            >
              Applica Maggiorazione
            </button>
            <button
              onClick={() => setShowMarkupPanel(false)}
              style={{ padding: '10px 16px', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}
      </div>
    );
  }

  // NORMAL VIEW MODE
  if (articles.length === 0) {
    return (
      <div style={{ padding: "16px" }}>
        <div
          style={{
            padding: "16px",
            textAlign: "center",
            color: "#999",
            marginBottom: "16px",
          }}
        >
          Nessun articolo disponibile
        </div>
        {token && (
          <div style={{ textAlign: "center" }}>
            <button
              onClick={handleSyncArticles}
              disabled={loading || !archibaldOrderId}
              title={
                !archibaldOrderId
                  ? "Sincronizza prima l'ordine con Archibald"
                  : "Aggiorna gli articoli da Archibald"
              }
              style={{
                padding: "12px 24px",
                backgroundColor:
                  loading || !archibaldOrderId ? "#ccc" : "#2196f3",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor:
                  loading || !archibaldOrderId ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              {loading ? "Sincronizzazione..." : "Aggiorna Articoli"}
            </button>
            {error && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  backgroundColor: "#ffebee",
                  color: "#c62828",
                  borderRadius: "4px",
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      {/* Sync Button */}
      {token && (
        <div style={{ marginBottom: "16px", textAlign: "right" }}>
          <button
            onClick={handleSyncArticles}
            disabled={loading}
            style={{
              padding: "10px 20px",
              backgroundColor: loading ? "#ccc" : "#2196f3",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {loading ? "Sincronizzazione..." : "Aggiorna Articoli"}
          </button>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            backgroundColor: "#e8f5e9",
            color: "#2e7d32",
            borderRadius: "4px",
            fontWeight: 500,
          }}
        >
          {success}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            backgroundColor: "#ffebee",
            color: "#c62828",
            borderRadius: "4px",
          }}
        >
          {error}
        </div>
      )}

      {/* Articles Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Codice Articolo</th>
              <th style={tableHeaderStyle}>Descrizione</th>
              <th style={tableHeaderStyle}>Quantita'</th>
              <th style={tableHeaderStyle}>Prezzo Unitario</th>
              <th style={tableHeaderStyle}>Sconto</th>
              <th style={tableHeaderStyle}>Imponibile</th>
              <th style={tableHeaderStyle}>IVA %</th>
              <th style={tableHeaderStyle}>IVA</th>
              <th style={tableHeaderStyle}>Totale + IVA</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((item, index) => {
              const unitPrice = item.unitPrice ?? 0;
              const discount = item.discountPercent ?? 0;
              const description = item.articleDescription ?? "";
              const lineAmount =
                item.lineAmount ??
                (unitPrice * item.quantity * (100 - discount)) / 100;
              const vatPercent = item.vatPercent ?? 0;
              const vatAmount = item.vatAmount ?? 0;
              const lineTotalWithVat = item.lineTotalWithVat ?? lineAmount;
              const articleMismatches = verificationMismatches.filter(
                (m) => m.syncedArticleCode === item.articleCode || m.snapshotArticleCode === item.articleCode
              );
              const hasMismatch = articleMismatches.length > 0;

              return (
                <tr key={index} style={{
                  borderBottom: "1px solid #e0e0e0",
                  backgroundColor: hasMismatch ? "#FEE2E2" : (index % 2 === 0 ? "#fff" : "#f8f9fa"),
                  borderLeft: hasMismatch ? "3px solid #EF4444" : undefined,
                }}>
                  <td style={tableCellStyle}>
                    <div style={{ fontWeight: 600 }}>
                      <HighlightText
                        text={item.articleCode || ""}
                        query={searchQuery}
                      />
                    </div>
                    {item.productName && (
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        <HighlightText
                          text={item.productName}
                          query={searchQuery}
                        />
                      </div>
                    )}
                    {articleMismatches.map((m, mi) => (
                      <div key={mi} style={{ fontSize: "0.8rem", color: "#B91C1C", marginTop: "4px" }}>
                        {m.type === "missing" && "Articolo mancante nell'ordine Archibald"}
                        {m.type === "extra" && "Articolo extra non previsto nell'ordine"}
                        {m.type === "quantity_diff" && `Quantita' diversa: atteso ${m.expected}, trovato ${m.found}`}
                        {m.type === "price_diff" && `Prezzo diverso: atteso ${m.expected?.toFixed(2)} €, trovato ${m.found?.toFixed(2)} €`}
                        {m.type === "discount_diff" && `Sconto diverso: atteso ${m.expected}%, trovato ${m.found}%`}
                        {m.type === "amount_diff" && `Importo diverso: atteso ${m.expected?.toFixed(2)} €, trovato ${m.found?.toFixed(2)} €`}
                      </div>
                    ))}
                  </td>
                  <td style={tableCellStyle}>
                    <HighlightText text={description} query={searchQuery} />
                  </td>
                  <td style={tableCellStyle}>{item.quantity}</td>
                  <td style={tableCellStyle}>{formatCurrency(unitPrice)}</td>
                  <td style={tableCellStyle}>
                    {discount > 0 ? `${discount}%` : "-"}
                  </td>
                  <td style={tableCellStyle}>{formatCurrency(lineAmount)}</td>
                  <td style={tableCellStyle}>{vatPercent}%</td>
                  <td style={tableCellStyle}>{formatCurrency(vatAmount)}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 600 }}>
                    {formatCurrency(lineTotalWithVat)}
                  </td>
                </tr>
              );
            })}
            {verificationMismatches
              .filter((m) => m.type === "missing" && !articles.some((a) => a.articleCode === m.snapshotArticleCode))
              .map((m, i) => (
                <tr key={`missing-${i}`} style={{
                  borderBottom: "1px solid #e0e0e0",
                  backgroundColor: "#FEE2E2",
                  borderLeft: "3px solid #EF4444",
                }}>
                  <td style={tableCellStyle} colSpan={9}>
                    <span style={{ fontSize: "0.8rem", color: "#B91C1C", fontWeight: 600 }}>
                      Articolo mancante: {m.snapshotArticleCode}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Totals Section */}
      {articles.length > 0 &&
        (() => {
          const subtotalBeforeDiscount = articles.reduce((sum, item) => {
            const unitPrice = item.unitPrice ?? 0;
            const quantity = item.quantity ?? 0;
            return sum + unitPrice * quantity;
          }, 0);

          const lines = articles.map((item) => ({
            prezzotot: arcaLineAmount(
              item.quantity ?? 0,
              item.unitPrice ?? 0,
              item.discountPercent ?? 0,
            ),
            vatRate: item.vatPercent ?? 0,
          }));
          const { totImp: totalImponibile, totIva, totDoc } = arcaDocumentTotals(lines, 1);

          const totalDiscountAmount = subtotalBeforeDiscount - totalImponibile;

          const uniqueDiscounts = new Set(
            articles.map((item) => item.discountPercent ?? 0),
          );
          const hasUniformDiscount =
            uniqueDiscounts.size === 1 && Array.from(uniqueDiscounts)[0] > 0;
          const globalDiscountPercent = hasUniformDiscount
            ? Array.from(uniqueDiscounts)[0]
            : null;

          return (
            <div
              style={{
                marginTop: "24px",
                paddingTop: "16px",
                padding: "16px",
                borderTop: "2px solid #333",
                backgroundColor: "#f0f4f8",
                borderRadius: "0 0 8px 8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: "8px",
                }}
              >
                {totalDiscountAmount > 0.01 && (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        width: "300px",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>Subtotale:</span>
                      <span style={{ fontWeight: 600 }}>
                        {formatCurrency(subtotalBeforeDiscount)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        width: "300px",
                      }}
                    >
                      <span style={{ fontWeight: 500, color: "#d32f2f" }}>
                        Sconto
                        {globalDiscountPercent
                          ? ` (${globalDiscountPercent}%)`
                          : ""}
                        :
                      </span>
                      <span style={{ fontWeight: 600, color: "#d32f2f" }}>
                        - {formatCurrency(totalDiscountAmount)}
                      </span>
                    </div>
                  </>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "300px",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>Totale Imponibile:</span>
                  <span style={{ fontWeight: 600 }}>
                    {formatCurrency(totalImponibile)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "300px",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>Totale IVA:</span>
                  <span style={{ fontWeight: 600 }}>
                    {formatCurrency(totIva)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "300px",
                    padding: "10px 12px",
                    marginTop: "8px",
                    borderTop: "2px solid #333",
                    backgroundColor: "#263238",
                    borderRadius: "4px",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: "18px", color: "#fff" }}>
                    TOTALE:
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "18px",
                      color: "#81c784",
                    }}
                  >
                    {formatCurrency(totDoc)}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

function TabLogistica({
  order,
  token,
  searchQuery = "",
  borderColor = "#999",
}: {
  order: Order;
  token?: string;
  searchQuery?: string;
  borderColor?: string;
}) {
  const { subscribe } = useWebSocketContext();
  const { trackOperation } = useOperationTracking();
  const [ddtProgress, setDdtProgress] = useState<{
    active: boolean;
    percent: number;
    stage: string;
  }>({ active: false, percent: 0, stage: "" });
  const [ddtError, setDdtError] = useState<string | null>(null);

  const ddt = order.ddt;
  const tracking = order.tracking || {
    trackingNumber: ddt?.trackingNumber,
    trackingUrl: ddt?.trackingUrl,
    trackingCourier: ddt?.trackingCourier,
  };

  const handleDownloadDDT = () => {
    if (!token) {
      setDdtError("Token di autenticazione mancante");
      return;
    }

    if (!ddt?.trackingNumber) {
      setDdtError(
        "Tracking non disponibile: il PDF DDT non può essere generato senza un codice di tracciamento attivo",
      );
      return;
    }

    setDdtProgress({ active: true, percent: 0, stage: "Avvio..." });
    setDdtError(null);

    downloadPdfWithProgress(
      order.orderNumber || order.id,
      "ddt",
      token,
      (stage, percent) => setDdtProgress({ active: true, percent, stage }),
      () =>
        setTimeout(
          () => setDdtProgress({ active: false, percent: 0, stage: "" }),
          1500,
        ),
      (error) => {
        setDdtError(error);
        setDdtProgress({ active: false, percent: 0, stage: "" });
      },
      subscribe,
      undefined,
      (jobId) => trackOperation(order.id, jobId, order.customerName || order.id, 'Download DDT...'),
    );
  };

  const hasDestinatario =
    ddt?.ddtDeliveryName ||
    ddt?.deliveryAddress ||
    ddt?.deliveryCity ||
    ddt?.attentionTo;

  const hasDettagliSpedizione =
    ddt?.deliveryTerms || ddt?.deliveryMethod || order.deliveryCompletedDate;

  const cardStyle: React.CSSProperties = {
    backgroundColor: "#fff",
    border: "1px solid #e8e8e8",
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "16px",
  };
  const cardTitleStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "12px",
  };

  return (
    <div style={{ padding: "16px" }}>
      {/* 0. Full tracking timeline */}
      {order.trackingEvents && order.trackingEvents.length > 0 && (
        <TrackingTimeline order={order} borderColor={borderColor} />
      )}

      {/* 1. Tracking — barra compatta orizzontale */}
      {tracking.trackingNumber && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            padding: "12px 16px",
            backgroundColor: "#e3f2fd",
            border: "1px solid #bbdefb",
            borderRadius: "10px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>
              {getCourierLogo(tracking.trackingCourier)}
            </span>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#333" }}>
              {tracking.trackingCourier?.toUpperCase() || "Corriere"}
            </span>
            <span
              style={{
                fontSize: "14px",
                color: "#666",
                fontFamily: "monospace",
              }}
            >
              <HighlightText
                text={tracking.trackingNumber || ""}
                query={searchQuery}
              />
            </span>
            <button
              onClick={() => copyToClipboard(tracking.trackingNumber || "")}
              style={{
                padding: "2px 8px",
                fontSize: "12px",
                border: "none",
                backgroundColor: "#1976d2",
                color: "#fff",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Copia
            </button>
          </div>
          {tracking.trackingUrl && (
            <button
              onClick={() => window.open(tracking.trackingUrl, "_blank")}
              style={{
                padding: "8px 20px",
                backgroundColor: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background-color 0.2s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#1565c0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#1976d2";
              }}
            >
              🔗 Traccia Spedizione
            </button>
          )}
        </div>
      )}

      {/* 2. Destinatario + Dettagli Spedizione — side-by-side */}
      {ddt && (hasDestinatario || hasDettagliSpedizione) && (
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {hasDestinatario && (
            <div style={{ ...cardStyle, flex: "1 1 280px", minWidth: "280px" }}>
              <div style={cardTitleStyle}>Destinatario</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "12px",
                }}
              >
                <InfoField
                  label="Nome Consegna"
                  value={ddt.ddtDeliveryName}
                  bold
                  searchQuery={searchQuery}
                />
                {ddt.attentionTo && (
                  <InfoField
                    label="All'attenzione di"
                    value={ddt.attentionTo}
                    searchQuery={searchQuery}
                  />
                )}
                {ddt.deliveryAddress && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <InfoField
                      label="Indirizzo Consegna"
                      value={ddt.deliveryAddress}
                      searchQuery={searchQuery}
                    />
                  </div>
                )}
                {ddt.deliveryCity && (
                  <InfoField
                    label="Città Consegna"
                    value={ddt.deliveryCity}
                    searchQuery={searchQuery}
                  />
                )}
              </div>
            </div>
          )}

          {hasDettagliSpedizione && (
            <div style={{ ...cardStyle, flex: "1 1 240px", minWidth: "240px" }}>
              <div style={cardTitleStyle}>Dettagli Spedizione</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "12px",
                }}
              >
                {ddt.deliveryMethod && (
                  <InfoField
                    label="Modalità Consegna"
                    value={ddt.deliveryMethod}
                  />
                )}
                {ddt.deliveryTerms && (
                  <InfoField
                    label="Termini Consegna"
                    value={ddt.deliveryTerms}
                  />
                )}
                {order.deliveryCompletedDate && (
                  <InfoField
                    label="Consegna Completata"
                    value={formatDate(order.deliveryCompletedDate)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Documento di Trasporto — card full-width con griglia auto-fill */}
      {ddt && (
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Documento di Trasporto</div>

          {ddt.ddtCustomerAccount && (
            <div
              style={{
                padding: "10px 12px",
                backgroundColor: "#e3f2fd",
                borderRadius: "6px",
                border: "1px solid #bbdefb",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "#1565c0",
                  marginBottom: "2px",
                  fontWeight: 600,
                }}
              >
                Conto Ordine
              </div>
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#0d47a1",
                  fontFamily: "monospace",
                }}
              >
                <HighlightText
                  text={ddt.ddtCustomerAccount}
                  query={searchQuery}
                />
              </div>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "12px",
            }}
          >
            <InfoField
              label="Numero DDT"
              value={ddt.ddtNumber}
              bold
              searchQuery={searchQuery}
            />
            <InfoField
              label="Data Consegna"
              value={formatDate(ddt.ddtDeliveryDate)}
            />
            <InfoField label="ID Ordine Vendita" value={ddt.orderId} />
            <InfoField label="ID DDT" value={ddt.ddtId} small />
            <InfoField
              label="Nome Vendite"
              value={ddt.ddtSalesName}
              searchQuery={searchQuery}
            />
            {ddt.ddtTotal && (
              <InfoField label="Totale DDT" value={ddt.ddtTotal} />
            )}
            {ddt.customerReference && (
              <InfoField
                label="Riferimento Cliente"
                value={ddt.customerReference}
                searchQuery={searchQuery}
              />
            )}
            {ddt.description && (
              <InfoField
                label="Descrizione"
                value={ddt.description}
                searchQuery={searchQuery}
              />
            )}
          </div>

          {/* DDT PDF Download Button */}
          <div style={{ marginTop: "16px", textAlign: "center" }}>
            <button
              onClick={handleDownloadDDT}
              disabled={ddtProgress.active || !ddt.trackingNumber}
              style={{
                maxWidth: "300px",
                width: "100%",
                padding: "12px",
                backgroundColor:
                  ddtProgress.active || !ddt.trackingNumber
                    ? "#ccc"
                    : "#4caf50",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor:
                  ddtProgress.active || !ddt.trackingNumber
                    ? "not-allowed"
                    : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!ddtProgress.active && ddt.trackingNumber) {
                  e.currentTarget.style.backgroundColor = "#388e3c";
                }
              }}
              onMouseLeave={(e) => {
                if (!ddtProgress.active && ddt.trackingNumber) {
                  e.currentTarget.style.backgroundColor = "#4caf50";
                }
              }}
            >
              {ddtProgress.active ? (
                <>
                  <span>⏳</span>
                  <span>{ddtProgress.stage || "Download in corso..."}</span>
                </>
              ) : !ddt.trackingNumber ? (
                <>
                  <span>🔒</span>
                  <span>Download disponibile dopo attivazione tracking</span>
                </>
              ) : (
                <>
                  <span>📄</span>
                  <span>Scarica PDF DDT</span>
                </>
              )}
            </button>
            {ddtProgress.active && (
              <ProgressBar
                percent={ddtProgress.percent}
                stage={ddtProgress.stage}
                color="#4caf50"
              />
            )}
            {ddtError && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px",
                  backgroundColor: "#ffebee",
                  borderRadius: "4px",
                  fontSize: "12px",
                  color: "#c62828",
                }}
              >
                {ddtError}
              </div>
            )}
          </div>
        </div>
      )}

      {!ddt && !tracking.trackingNumber && (
        <div style={{ padding: "16px", textAlign: "center", color: "#999" }}>
          Nessuna informazione di logistica disponibile
        </div>
      )}
    </div>
  );
}

function TabFinanziario({
  order,
  token,
  searchQuery = "",
}: {
  order: Order;
  token?: string;
  searchQuery?: string;
}) {
  const { subscribe } = useWebSocketContext();
  const { trackOperation } = useOperationTracking();
  const [invoiceProgress, setInvoiceProgress] = useState<{
    active: boolean;
    percent: number;
    stage: string;
  }>({ active: false, percent: 0, stage: "" });
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const handleDownloadInvoice = () => {
    if (!token) {
      setInvoiceError("Token di autenticazione mancante");
      return;
    }

    if (!order.invoiceNumber) {
      setInvoiceError("Nessuna fattura disponibile per questo ordine");
      return;
    }

    setInvoiceProgress({ active: true, percent: 0, stage: "Avvio..." });
    setInvoiceError(null);

    const isNC = order.invoiceNumber?.startsWith("NC/");
    downloadPdfWithProgress(
      order.orderNumber || order.id,
      "invoice",
      token,
      (stage, percent) => setInvoiceProgress({ active: true, percent, stage }),
      () =>
        setTimeout(
          () => setInvoiceProgress({ active: false, percent: 0, stage: "" }),
          1500,
        ),
      (error) => {
        setInvoiceError(error);
        setInvoiceProgress({ active: false, percent: 0, stage: "" });
      },
      subscribe,
      isNC ? "NC" : "Fattura",
      (jobId) => trackOperation(order.id, jobId, order.customerName || order.id, isNC ? 'Download NC...' : 'Download fattura...'),
    );
  };

  return (
    <div style={{ padding: "16px" }}>
      {/* Riepilogo Importi */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "20px",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            flex: "1 1 160px",
            padding: "14px 16px",
            backgroundColor: "#f8f9fa",
            borderRadius: "10px",
            border: "1px solid #e9ecef",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              color: "#888",
              marginBottom: "4px",
              textTransform: "uppercase" as const,
              letterSpacing: "0.5px",
            }}
          >
            Totale Ordine
          </div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#333" }}>
            {order.total}
          </div>
          {(() => {
            const parsed = order.totalWithVat ? parseFloat(order.totalWithVat) : NaN;
            return !isNaN(parsed) && parsed > 0;
          })() && (
            <div
              style={{
                fontSize: "13px",
                color: "#2e7d32",
                fontWeight: 600,
                marginTop: "2px",
              }}
            >
              {formatCurrency(parseFloat(order.totalWithVat!))} (con IVA)
            </div>
          )}
          {(() => {
            const parsed = order.totalWithVat ? parseFloat(order.totalWithVat) : NaN;
            return isNaN(parsed) || parsed === 0;
          })() && (
            <div
              style={{
                fontSize: "11px",
                color: "#aaa",
                marginTop: "2px",
                fontStyle: "italic",
              }}
            >
              Sincronizza articoli per IVA
            </div>
          )}
        </div>

        {((order.discountPercent &&
          order.discountPercent !== "0,00 %" &&
          order.discountPercent !== "0%") ||
          order.lineDiscount ||
          order.endDiscount) && (
          <div
            style={{
              flex: "1 1 160px",
              padding: "14px 16px",
              backgroundColor: "#f8f9fa",
              borderRadius: "10px",
              border: "1px solid #e9ecef",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                color: "#888",
                marginBottom: "6px",
                textTransform: "uppercase" as const,
                letterSpacing: "0.5px",
              }}
            >
              Sconti
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                gap: "3px",
              }}
            >
              {order.discountPercent &&
                order.discountPercent !== "0,00 %" &&
                order.discountPercent !== "0%" && (
                  <div style={{ fontSize: "13px", color: "#333" }}>
                    <span style={{ color: "#888" }}>Globale:</span>{" "}
                    {order.discountPercent}
                  </div>
                )}
              {order.lineDiscount && (
                <div style={{ fontSize: "13px", color: "#333" }}>
                  <span style={{ color: "#888" }}>Riga:</span>{" "}
                  {order.lineDiscount}
                </div>
              )}
              {order.endDiscount && (
                <div style={{ fontSize: "13px", color: "#333" }}>
                  <span style={{ color: "#888" }}>Finale:</span>{" "}
                  {order.endDiscount}
                </div>
              )}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            backgroundColor: order.transferredToAccountingOffice
              ? "#e8f5e9"
              : "#fff3e0",
            borderRadius: "10px",
            border: `1px solid ${order.transferredToAccountingOffice ? "#a5d6a7" : "#ffe0b2"}`,
            alignSelf: "center",
          }}
        >
          <span style={{ fontSize: "14px" }}>
            {order.transferredToAccountingOffice ? "✓" : "⏳"}
          </span>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: order.transferredToAccountingOffice
                ? "#2e7d32"
                : "#e65100",
            }}
          >
            {order.transferredToAccountingOffice
              ? "Contabilità"
              : "Non trasferito"}
          </span>
        </div>
      </div>

      {/* Fattura */}
      {order.invoiceNumber ? (
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "12px",
            overflow: "hidden",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 16px",
              backgroundColor: "#f8f9fa",
              borderBottom: "1px solid #e0e0e0",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap" as const,
              }}
            >
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#1565c0",
                }}
              >
                <HighlightText
                  text={order.invoiceNumber || ""}
                  query={searchQuery}
                />
              </span>
              <span style={{ fontSize: "13px", color: "#666" }}>
                {formatDate(order.invoiceDate)}
              </span>
            </div>
            <span
              style={{
                padding: "4px 12px",
                borderRadius: "12px",
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: order.invoiceClosed ? "#e8f5e9" : "#fff3e0",
                color: order.invoiceClosed ? "#2e7d32" : "#e65100",
                whiteSpace: "nowrap" as const,
              }}
            >
              {order.invoiceClosed ? "Chiusa" : "Aperta"}
            </span>
          </div>

          <div
            style={{
              padding: "16px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "14px",
              backgroundColor: "#f8f9fa",
            }}
          >
            <InfoField
              label="Importo"
              value={
                order.invoiceAmount ? `\u20ac${order.invoiceAmount}` : undefined
              }
              bold
              searchQuery={searchQuery}
            />
            <InfoField
              label="Conto Cliente"
              value={order.invoiceCustomerAccount}
              searchQuery={searchQuery}
            />
            <InfoField
              label="Nome Fatturazione"
              value={order.invoiceBillingName}
              searchQuery={searchQuery}
            />
            <InfoField
              label="Quantità"
              value={order.invoiceQuantity?.toString()}
            />
            <InfoField
              label="Importo Residuo"
              value={
                order.invoiceRemainingAmount
                  ? formatPriceFromString(order.invoiceRemainingAmount)
                  : undefined
              }
            />
            <InfoField
              label="Importo Fiscale"
              value={
                order.invoiceTaxAmount
                  ? formatPriceFromString(order.invoiceTaxAmount)
                  : undefined
              }
            />
            <InfoField
              label="Sconto Linea"
              value={
                order.invoiceLineDiscount
                  ? formatPriceFromString(order.invoiceLineDiscount)
                  : undefined
              }
            />
            <InfoField
              label="Sconto Totale"
              value={
                order.invoiceTotalDiscount
                  ? formatPriceFromString(order.invoiceTotalDiscount)
                  : undefined
              }
            />
            <InfoField
              label="Ordine Acquisto"
              value={order.invoicePurchaseOrder}
            />
          </div>

          {order.invoiceDueDate && (() => {
            const dueDaysInfo = computeDueDaysInfo(order.invoiceDueDate);
            return (
            <div
              style={{
                padding: "10px 16px",
                backgroundColor: dueDaysInfo?.bgColor ?? "#e8f5e9",
                borderTop: "1px solid #e0e0e0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap" as const,
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "13px", color: "#555" }}>
                <span style={{ fontWeight: 600 }}>Scadenza:</span>{" "}
                {formatDate(order.invoiceDueDate)}
              </div>
              {dueDaysInfo !== null && (
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: dueDaysInfo.color,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: dueDaysInfo.color,
                      display: "inline-block",
                    }}
                  />
                  {dueDaysInfo.detailLabel}
                </div>
              )}
            </div>
            );
          })()}

          {(order.invoiceSettledAmount ||
            order.invoiceLastPaymentId ||
            order.invoiceLastSettlementDate ||
            (order.invoiceClosedDate &&
              order.invoiceClosedDate.toLowerCase() !== "no")) && (
            <div
              style={{
                padding: "14px 16px",
                borderTop: "1px solid #e0e0e0",
                backgroundColor: "#fafafa",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "#888",
                  marginBottom: "10px",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.5px",
                  fontWeight: 600,
                }}
              >
                Pagamenti
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: "12px",
                }}
              >
                {order.invoiceSettledAmount && (
                  <InfoField
                    label="Importo liquidato"
                    value={formatPriceFromString(order.invoiceSettledAmount)}
                  />
                )}
                {order.invoiceLastPaymentId && (
                  <InfoField
                    label="Ultimo pagamento"
                    value={order.invoiceLastPaymentId}
                  />
                )}
                {order.invoiceLastSettlementDate && (
                  <InfoField
                    label="Data liquidazione"
                    value={formatDate(order.invoiceLastSettlementDate)}
                  />
                )}
                {order.invoiceClosedDate &&
                  order.invoiceClosedDate.toLowerCase() !== "no" && (
                    <InfoField
                      label="Data chiusura"
                      value={formatDate(order.invoiceClosedDate)}
                    />
                  )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            padding: "20px",
            textAlign: "center" as const,
            color: "#999",
            fontSize: "14px",
            backgroundColor: "#f5f5f5",
            borderRadius: "12px",
            marginBottom: "16px",
            border: "1px solid #e9ecef",
          }}
        >
          Nessuna fattura disponibile
        </div>
      )}

      <button
        onClick={handleDownloadInvoice}
        disabled={invoiceProgress.active || !order.invoiceNumber}
        style={{
          width: "100%",
          padding: "12px",
          backgroundColor:
            invoiceProgress.active || !order.invoiceNumber ? "#ccc" : "#4caf50",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: 600,
          cursor:
            invoiceProgress.active || !order.invoiceNumber
              ? "not-allowed"
              : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          transition: "background-color 0.2s",
        }}
        onMouseEnter={(e) => {
          if (!invoiceProgress.active && order.invoiceNumber) {
            e.currentTarget.style.backgroundColor = "#388e3c";
          }
        }}
        onMouseLeave={(e) => {
          if (!invoiceProgress.active && order.invoiceNumber) {
            e.currentTarget.style.backgroundColor = "#4caf50";
          }
        }}
      >
        {invoiceProgress.active ? (
          <>
            <span>⏳</span>
            <span>{invoiceProgress.stage || "Download in corso..."}</span>
          </>
        ) : !order.invoiceNumber ? (
          <>
            <span>📄</span>
            <span>Nessuna fattura disponibile</span>
          </>
        ) : (
          <>
            <span>📄</span>
            <span>Scarica {order.invoiceNumber?.startsWith("NC/") ? "NC" : "Fattura"} {order.invoiceNumber}</span>
          </>
        )}
      </button>
      {invoiceProgress.active && (
        <ProgressBar
          percent={invoiceProgress.percent}
          stage={invoiceProgress.stage}
          color="#4caf50"
        />
      )}
      {invoiceError && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px",
            backgroundColor: "#ffebee",
            borderRadius: "4px",
            fontSize: "12px",
            color: "#c62828",
          }}
        >
          {invoiceError}
        </div>
      )}
    </div>
  );
}

type FresisChildFT = {
  id: string;
  subClientName?: string;
  subClientCodice?: string;
  archibaldOrderNumber?: string;
  createdAt?: string;
  targetTotalWithVAT?: number;
  revenue?: number;
  currentState?: string;
};

function TabCronologia({ order, token }: { order: Order; token?: string }) {
  const [childFTs, setChildFTs] = useState<FresisChildFT[]>([]);
  const [ftLoading, setFtLoading] = useState(false);
  const [ftError, setFtError] = useState<string | null>(null);

  const isFresisOrder =
    order.customerProfileId === "55.261" ||
    order.customerProfileId === "57.213";

  useEffect(() => {
    if (!isFresisOrder || !token) return;
    setFtLoading(true);
    setFtError(null);
    fetchWithRetry(
      `/api/fresis-history/by-mother-order/${order.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setChildFTs(data.records || []);
        } else {
          setFtError(data.error || "Errore sconosciuto");
        }
      })
      .catch((err) => setFtError(err.message))
      .finally(() => setFtLoading(false));
  }, [isFresisOrder, order.id, token]);

  if (!isFresisOrder) {
    return (
      <div style={{ padding: "16px", textAlign: "center", color: "#999", fontSize: "14px" }}>
        Nessun ordine Fresis collegato.
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#333", margin: 0 }}>
          Ordini Collegati (FT Fresis)
        </h3>
        {childFTs.length > 0 && (
          <a
            href={`/fresis-history?motherOrderId=${order.id}`}
            style={{ fontSize: "12px", color: "#1976d2", textDecoration: "none" }}
          >
            Vedi nello storico Fresis &rarr;
          </a>
        )}
      </div>
      {ftLoading && (
        <div style={{ textAlign: "center", padding: "16px", color: "#888" }}>
          Caricamento...
        </div>
      )}
      {ftError && (
        <div style={{ padding: "8px", backgroundColor: "#ffebee", borderRadius: "4px", color: "#c62828", fontSize: "12px" }}>
          {ftError}
        </div>
      )}
      {!ftLoading && !ftError && childFTs.length === 0 && (
        <div style={{ textAlign: "center", padding: "16px", color: "#999", fontSize: "14px", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
          Nessuna FT collegata a questo ordine.
        </div>
      )}
      {!ftLoading && childFTs.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5", borderBottom: "2px solid #ddd" }}>
                <th style={ftThStyle}>Sub-cliente</th>
                <th style={ftThStyle}>N. FT</th>
                <th style={ftThStyle}>Data</th>
                <th style={{ ...ftThStyle, textAlign: "right" }}>Totale</th>
                <th style={{ ...ftThStyle, textAlign: "right" }}>Ricavo</th>
                <th style={ftThStyle}>Stato</th>
              </tr>
            </thead>
            <tbody>
              {childFTs.map((ft) => (
                <tr key={ft.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={ftTdStyle}>{ft.subClientName || ft.subClientCodice}</td>
                  <td style={ftTdStyle}>{ft.archibaldOrderNumber || "-"}</td>
                  <td style={ftTdStyle}>{ft.createdAt ? new Date(ft.createdAt).toLocaleDateString("it-IT") : "-"}</td>
                  <td style={{ ...ftTdStyle, textAlign: "right" }}>
                    {ft.targetTotalWithVAT != null
                      ? Number(ft.targetTotalWithVAT).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : "-"}
                  </td>
                  <td style={{ ...ftTdStyle, textAlign: "right", color: (ft.revenue ?? 0) >= 0 ? "#2e7d32" : "#c62828", fontWeight: 600 }}>
                    {ft.revenue != null
                      ? Number(ft.revenue).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : "-"}
                  </td>
                  <td style={ftTdStyle}>{ft.currentState || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ftThStyle: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "left",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const ftTdStyle: React.CSSProperties = {
  padding: "6px 8px",
  whiteSpace: "nowrap",
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function InfoField({
  label,
  value,
  bold,
  small,
  searchQuery = "",
}: {
  label: string;
  value?: string;
  bold?: boolean;
  small?: boolean;
  searchQuery?: string;
}) {
  if (!value) return null;

  return (
    <div>
      <div style={{ fontSize: "12px", color: "#999", marginBottom: "4px" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: small ? "12px" : "14px",
          fontWeight: bold ? 600 : 400,
          color: small ? "#666" : "#333",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <HighlightText text={value} query={searchQuery} />
      </div>
    </div>
  );
}

const tableHeaderStyle: React.CSSProperties = {
  padding: "12px",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 700,
  color: "#37474f",
  borderBottom: "2px solid #bbdefb",
  backgroundColor: "#e3f2fd",
};

const tableCellStyle: React.CSSProperties = {
  padding: "12px",
  fontSize: "14px",
  color: "#333",
};

// ============================================================================
// PDF DOWNLOAD WITH SSE PROGRESS
// ============================================================================

function downloadPdfWithProgress(
  orderId: string,
  type: "invoice" | "ddt",
  _token: string,
  onProgress: (stage: string, percent: number) => void,
  onComplete: () => void,
  onError: (error: string) => void,
  subscribe: SubscribeFn,
  docLabel?: string,
  onJobEnqueued?: (jobId: string) => void,
): () => void {
  let cancelled = false;

  (async () => {
    try {
      onProgress("Avvio download...", 5);

      const operationType: OperationType = type === "invoice" ? "download-invoice-pdf" : "download-ddt-pdf";
      const { jobId } = await enqueueOperation(operationType, { orderId, searchTerm: orderId });

      if (cancelled) return;

      onJobEnqueued?.(jobId);
      onProgress("In coda...", 10);

      const result = await waitForJobViaWebSocket(jobId, {
        subscribe,
        intervalMs: 1500,
        maxWaitMs: 180_000,
        onProgress: (progress, label) => {
          if (!cancelled) {
            onProgress(label ?? "Download in corso...", progress);
          }
        },
      });

      if (cancelled) return;

      const resultData = (result.data ?? result) as Record<string, unknown>;
      const pdfBase64 = resultData.pdf as string;
      if (!pdfBase64) {
        onError("Nessun PDF ricevuto dal server");
        return;
      }

      onProgress("Download completato!", 100);

      const byteCharacters = atob(pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${type === "ddt" ? "DDT" : docLabel ?? "Fattura"}_${orderId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(downloadUrl);

      onComplete();
    } catch (err) {
      if (!cancelled) {
        onError(err instanceof Error ? err.message : "Errore durante il download");
      }
    }
  })();

  return () => { cancelled = true; };
}

function ProgressBar({
  percent,
  stage,
  color,
}: {
  percent: number;
  stage: string;
  color: string;
}) {
  return (
    <div style={{ width: "100%", marginTop: "6px" }}>
      <div
        style={{
          width: "100%",
          height: "6px",
          backgroundColor: "#e0e0e0",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: "3px",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <div
        style={{
          fontSize: "10px",
          color: "#666",
          marginTop: "2px",
          textAlign: "center",
        }}
      >
        {stage}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OrderCardNew({
  order,
  expanded,
  onToggle,
  onSendToVerona,
  onEdit,
  onDeleteDone,
  token,
  searchQuery = "",
  editing = false,
  onEditDone,
  justSentToVerona = false,
  noteSummary,
  notePreviews,
  onNotesChanged,
  onHide,
  onUnhide,
  isHidden = false,
  onClearVerification,
  suggestedTab,
}: OrderCardProps) {
  const [activeTab, setActiveTab] = useState<
    "panoramica" | "articoli" | "logistica" | "finanziario" | "storico"
  >("articoli");

  const [editProgress, setEditProgress] = useState<{
    progress: number;
    operation: string;
  } | null>(null);

  // Switch to suggested tab from search
  useEffect(() => {
    if (suggestedTab && expanded && !editing) {
      setActiveTab(suggestedTab);
    }
  }, [suggestedTab, expanded, editing]);

  // Force articoli tab when entering edit mode
  useEffect(() => {
    if (editing) {
      setActiveTab("articoli");
    }
  }, [editing]);

  // WebSocket subscriptions for edit progress
  const { subscribe } = useWebSocketContext();
  const { trackOperation } = useOperationTracking();
  useEffect(() => {
    if (!editing) return;
    const unsub1 = subscribe("ORDER_EDIT_PROGRESS", (payload: unknown) => {
      const p = payload as { recordId?: string; progress?: number; operation?: string };
      if (p.recordId === order.id) {
        setEditProgress({
          progress: p.progress ?? 0,
          operation: p.operation ?? "",
        });
      }
    });
    const unsub2 = subscribe("ORDER_EDIT_COMPLETE", (payload: unknown) => {
      const p = payload as { recordId?: string };
      if (p.recordId === order.id) {
        setEditProgress(null);
        onEditDone?.();
      }
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [editing, order.id, subscribe, onEditDone]);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  useEffect(() => {
    if (deleteConfirm) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [deleteConfirm]);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{
    progress: number;
    operation: string;
  } | null>(null);
  const deleteHandledRef = useRef(false);

  // WebSocket subscriptions for delete progress
  useEffect(() => {
    if (!deletingOrder) return;
    deleteHandledRef.current = false;
    const unsub1 = subscribe("ORDER_DELETE_PROGRESS", (payload: unknown) => {
      const p = payload as { recordId?: string; progress?: number; operation?: string };
      if (p.recordId === order.id) {
        setDeleteProgress({
          progress: p.progress ?? 0,
          operation: p.operation ?? "",
        });
      }
    });
    const unsub2 = subscribe("ORDER_DELETE_COMPLETE", (payload: unknown) => {
      const p = payload as { recordId?: string };
      if (p.recordId === order.id && !deleteHandledRef.current) {
        deleteHandledRef.current = true;
        setDeleteProgress(null);
        setDeletingOrder(false);
        onDeleteDone?.();
      }
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [deletingOrder, order.id, subscribe, onDeleteDone]);

  const handleDeleteOrder = async () => {
    setDeleteConfirm(false);
    setDeletingOrder(true);
    setDeleteProgress({ progress: 5, operation: "Avvio eliminazione..." });

    try {
      const result = await enqueueOperation('delete-order', {
        orderId: order.id,
      });

      if (!result.success) {
        throw new Error(result.error || `Errore eliminazione ordine`);
      }

      trackOperation(order.id, result.jobId, order.customerName || order.id, 'Eliminazione ordine...');

      if (deleteHandledRef.current) return;
      setDeleteProgress({ progress: 20, operation: "Eliminazione in corso..." });

      await waitForJobViaWebSocket(result.jobId, {
        subscribe,
        maxWaitMs: 120_000,
        onProgress: (progress, label) => {
          if (!deleteHandledRef.current) {
            setDeleteProgress({ progress, operation: label ?? "Eliminazione in corso..." });
          }
        },
      });

      if (!deleteHandledRef.current) {
        deleteHandledRef.current = true;
        setDeleteProgress(null);
        setDeletingOrder(false);
        onDeleteDone?.();
      }
    } catch (err) {
      console.error("Delete order failed:", err);
      setDeleteProgress(null);
      setDeletingOrder(false);
      alert(
        `Errore durante l'eliminazione: ${err instanceof Error ? err.message : "Errore sconosciuto"}`,
      );
    }
  };

  const [ddtQuickProgress, setDdtQuickProgress] = useState<{
    active: boolean;
    percent: number;
    stage: string;
  }>({ active: false, percent: 0, stage: "" });
  const [invoiceQuickProgress, setInvoiceQuickProgress] = useState<{
    active: boolean;
    percent: number;
    stage: string;
  }>({ active: false, percent: 0, stage: "" });

  // Articles totals state (updated when articles are loaded/synced)
  // Initialize from order prop if available
  const [articlesTotals, setArticlesTotals] = useState<{
    totalVatAmount?: number;
    totalWithVat?: number;
  }>(() => {
    const totalVatAmount = order.totalVatAmount
      ? parseFloat(order.totalVatAmount)
      : undefined;
    const totalWithVat = order.totalWithVat
      ? parseFloat(order.totalWithVat)
      : undefined;
    return { totalVatAmount, totalWithVat };
  });

  // Sync header totals when order prop is refreshed (e.g. after edit + fetchOrders)
  useEffect(() => {
    const newTotal = order.totalWithVat ? parseFloat(order.totalWithVat) : undefined;
    const newVat = order.totalVatAmount ? parseFloat(order.totalVatAmount) : undefined;
    if (newTotal !== undefined && !isNaN(newTotal) && newTotal !== 0) {
      setArticlesTotals(prev => ({ ...prev, totalWithVat: newTotal, totalVatAmount: newVat }));
    }
  }, [order.totalWithVat, order.totalVatAmount]);

  const canSendToVerona = isNotSentToVerona(order) && !justSentToVerona;

  const tabs = [
    { id: "panoramica" as const, label: "Panoramica", icon: "📊" },
    { id: "articoli" as const, label: "Articoli", icon: "📦" },
    { id: "logistica" as const, label: "Logistica", icon: "🚚" },
    { id: "finanziario" as const, label: "Finanziario", icon: "💰" },
    { id: "storico" as const, label: "Ordini Collegati", icon: "🔗" },
  ];

  // Get order status styling (border + background colors)
  const orderStatusStyle = getOrderStatus(order);
  const tabColors = getStatusTabColors(orderStatusStyle);

  return (
    <div
      id={`order-card-${order.orderNumber}`}
      style={{
        display: "flex",
        borderRadius: "12px",
        boxShadow: expanded
          ? "0 12px 40px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.1)"
          : "0 6px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.08)",
        marginBottom: "12px",
        overflow: "hidden",
        transition: "box-shadow 0.2s",
        ...(expanded
          ? {
              border: "2px solid #333",
            }
          : {}),
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 48,
          flexShrink: 0,
          background: `linear-gradient(180deg, ${orderStatusStyle.borderColor}dd, ${orderStatusStyle.borderColor})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "10px 0",
        }}
      >
        <span style={{ fontSize: 20 }}>{orderStatusStyle.icon}</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "rgba(255,255,255,0.9)",
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: "rotate(180deg)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          {orderStatusStyle.sidebarLabel}
        </span>
      </div>
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, backgroundColor: "#fff" }}>
      {/* ===== COLLAPSED STATE ===== */}
      <div
        onClick={(e) => {
          if (e.detail >= 2) return;
          const sel = window.getSelection();
          if (sel && sel.toString().length > 0) return;
          onToggle();
        }}
        style={{
          padding: "16px",
          cursor: "pointer",
          transition: "background-color 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#f9f9f9";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "";
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          {/* Left: Customer Name + Order Info + Status Badge */}
          <div style={{ flex: 1 }}>
            {/* Customer Name (Bold) + Status Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "4px",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#333",
                }}
              >
                <HighlightText text={order.customerName} query={searchQuery} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 10px",
                    borderRadius: "12px",
                    backgroundColor: orderStatusStyle.borderColor,
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  {orderStatusStyle.label}
                </span>
                {order.trackingStatus === 'delivered' && (() => {
                  const events = order.trackingEvents ?? [];
                  const exceptionsCount = events.filter((ev) => ev.exception).length;
                  return exceptionsCount > 0 ? (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontWeight: 600, color: '#b45309',
                      background: '#fef3c7', border: '1px solid #fcd34d',
                      borderRadius: 20, padding: '2px 8px', marginTop: 6,
                    }}>
                      ⚠️ {exceptionsCount} {exceptionsCount === 1 ? 'eccezione' : 'eccezioni'} in transito
                    </div>
                  ) : null;
                })()}
                {(order.verificationStatus === "correction_failed" || order.verificationStatus === "mismatch_detected") && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 10px",
                      borderRadius: "12px",
                      backgroundColor: "#EF4444",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}
                  >
                    Verifica fallita
                    {onClearVerification && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearVerification(order.id);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
                          padding: "0 0 0 2px",
                          fontSize: "13px",
                          lineHeight: 1,
                          fontWeight: 700,
                        }}
                        title="Rimuovi flag verifica"
                      >
                        ×
                      </button>
                    )}
                  </span>
                )}
                {order.arcaKtSyncedAt && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 8px",
                      borderRadius: "12px",
                      backgroundColor: "#7c3aed",
                      color: "#fff",
                      fontSize: "10px",
                      fontWeight: 600,
                    }}
                  >
                    KT
                  </span>
                )}
                {expanded && (onHide || onUnhide) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isHidden) {
                        onUnhide?.(order.id);
                      } else {
                        onHide?.(order.id);
                      }
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 10px",
                      borderRadius: "12px",
                      border: "1px solid #ddd",
                      background: isHidden ? "#e0e0e0" : "rgba(255,255,255,0.8)",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#888",
                    }}
                  >
                    {isHidden ? "Mostra" : "Nascondi"}
                  </button>
                )}
              </div>
            </div>

            <div
              style={{
                fontSize: "14px",
                color: "#666",
                marginBottom: "8px",
              }}
            >
              {order.orderNumber ? (
                <>
                  <span style={{ fontWeight: 600 }}>
                    <HighlightText
                      text={order.orderNumber}
                      query={searchQuery}
                    />
                  </span>
                  {" \u2022 "}
                </>
              ) : null}
              {formatDate(order.orderDate || order.date)}
            </div>

            {order.trackingStatus && order.trackingEvents && order.trackingEvents.length > 0 && !expanded && (
              <TrackingDotBar order={order} borderColor={orderStatusStyle.borderColor} />
            )}

            {/* Residuo Finanziario (used as order notes) */}
            {order.remainingSalesFinancial && (
              <div
                style={{
                  fontSize: "12px",
                  color: "#5a3e00",
                  backgroundColor: "#fff8e1",
                  border: "1px solid #ffe082",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  marginBottom: "8px",
                  lineHeight: "1.4",
                }}
              >
                <HighlightText
                  text={order.remainingSalesFinancial}
                  query={searchQuery}
                />
              </div>
            )}

            <div style={{ marginBottom: "8px" }}>
              {(() => {
                const isPaid = order.invoiceNumber && (order.invoiceClosed === true ||
                  parseFloat((order.invoiceRemainingAmount || "0").replace(/\./g, "").replace(",", ".")) <= 0);

                if (isPaid) {
                  return (
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#2e7d32" }}>
                        ✅ Pagato{order.invoiceLastSettlementDate ? `: ${formatDate(order.invoiceLastSettlementDate)}` : order.invoiceClosedDate ? `: ${formatDate(order.invoiceClosedDate)}` : ""}
                      </div>
                      <div style={{ fontSize: "13px", color: "#666", marginTop: "2px" }}>
                        {order.invoiceNumber} • {order.invoiceAmount ? `€${order.invoiceAmount}` : ""}
                      </div>
                    </div>
                  );
                }

                const parsedTotalWithVat = order.totalWithVat
                  ? parseFloat(order.totalWithVat)
                  : undefined;
                const totalWithVat =
                  articlesTotals.totalWithVat ??
                  (parsedTotalWithVat !== undefined && !isNaN(parsedTotalWithVat) && parsedTotalWithVat !== 0
                    ? parsedTotalWithVat
                    : undefined);

                const dueDaysInfo = order.invoiceDueDate ? computeDueDaysInfo(order.invoiceDueDate) : null;

                return (
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "18px", fontWeight: 700, color: "#333" }}>
                        {totalWithVat ? `${formatCurrency(totalWithVat)} (IVA incl.)` : (order.total || "")}
                      </span>
                      {order.invoiceNumber && order.invoiceDueDate && (
                        <span style={{ fontSize: "12px", color: "#666" }}>
                          Scad: {formatDate(order.invoiceDueDate)}
                          {dueDaysInfo !== null && (
                            <span style={{ marginLeft: "6px", fontWeight: 600, color: dueDaysInfo.color }}>
                              {dueDaysInfo.summaryLabel}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    {totalWithVat && order.total && (
                      <div style={{ fontSize: "13px", color: "#888", marginTop: "2px" }}>
                        {order.total}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Buttons Row: Download (left) + Actions (right) */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "8px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Left: Download Buttons */}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {/* DDT Download Button */}
                {order.ddt?.ddtNumber && order.ddt?.trackingNumber && (
                  <div
                    style={{
                      display: "inline-flex",
                      flexDirection: "column",
                      minWidth: ddtQuickProgress.active ? "160px" : undefined,
                    }}
                  >
                    <button
                      disabled={ddtQuickProgress.active}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (ddtQuickProgress.active || !token) return;
                        setDdtQuickProgress({
                          active: true,
                          percent: 0,
                          stage: "Avvio...",
                        });
                        downloadPdfWithProgress(
                          order.orderNumber || order.id,
                          "ddt",
                          token,
                          (stage, percent) =>
                            setDdtQuickProgress({
                              active: true,
                              percent,
                              stage,
                            }),
                          () =>
                            setTimeout(
                              () =>
                                setDdtQuickProgress({
                                  active: false,
                                  percent: 0,
                                  stage: "",
                                }),
                              1500,
                            ),
                          (error) => {
                            console.error("DDT download error:", error);
                            setDdtQuickProgress({
                              active: false,
                              percent: 0,
                              stage: "",
                            });
                          },
                          subscribe,
                          undefined,
                          (jobId) => trackOperation(order.id, jobId, order.customerName || order.id, 'Download DDT...'),
                        );
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: ddtQuickProgress.active
                          ? "#e8f5e9"
                          : "#fff",
                        color: ddtQuickProgress.active ? "#81c784" : "#388e3c",
                        border: `1px solid ${ddtQuickProgress.active ? "#81c784" : "#388e3c"}`,
                        borderRadius: "6px",
                        cursor: ddtQuickProgress.active ? "wait" : "pointer",
                        transition: "all 0.2s",
                        opacity: ddtQuickProgress.active ? 0.85 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!ddtQuickProgress.active) {
                          e.currentTarget.style.backgroundColor = "#388e3c";
                          e.currentTarget.style.color = "#fff";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!ddtQuickProgress.active) {
                          e.currentTarget.style.backgroundColor = "#fff";
                          e.currentTarget.style.color = "#388e3c";
                        }
                      }}
                    >
                      {ddtQuickProgress.active ? "⏳ Scaricando DDT..." : "📄 Scarica DDT"}
                    </button>
                    {ddtQuickProgress.active && (
                      <ProgressBar
                        percent={ddtQuickProgress.percent}
                        stage={ddtQuickProgress.stage}
                        color="#388e3c"
                      />
                    )}
                  </div>
                )}

                {/* Invoice Download Button */}
                {order.invoiceNumber && (
                  <div
                    style={{
                      display: "inline-flex",
                      flexDirection: "column",
                      minWidth: invoiceQuickProgress.active
                        ? "160px"
                        : undefined,
                    }}
                  >
                    <button
                      disabled={invoiceQuickProgress.active}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (invoiceQuickProgress.active || !token) return;
                        setInvoiceQuickProgress({
                          active: true,
                          percent: 0,
                          stage: "Avvio...",
                        });
                        const isNC = order.invoiceNumber?.startsWith("NC/");
                        downloadPdfWithProgress(
                          order.orderNumber || order.id,
                          "invoice",
                          token,
                          (stage, percent) =>
                            setInvoiceQuickProgress({
                              active: true,
                              percent,
                              stage,
                            }),
                          () =>
                            setTimeout(
                              () =>
                                setInvoiceQuickProgress({
                                  active: false,
                                  percent: 0,
                                  stage: "",
                                }),
                              1500,
                            ),
                          (error) => {
                            console.error("Invoice download error:", error);
                            setInvoiceQuickProgress({
                              active: false,
                              percent: 0,
                              stage: "",
                            });
                          },
                          subscribe,
                          isNC ? "NC" : "Fattura",
                          (jobId) => trackOperation(order.id, jobId, order.customerName || order.id, isNC ? 'Download NC...' : 'Download fattura...'),
                        );
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: invoiceQuickProgress.active
                          ? "#f3e5f5"
                          : "#fff",
                        color: invoiceQuickProgress.active
                          ? "#ba68c8"
                          : "#7b1fa2",
                        border: `1px solid ${invoiceQuickProgress.active ? "#ba68c8" : "#7b1fa2"}`,
                        borderRadius: "6px",
                        cursor: invoiceQuickProgress.active
                          ? "wait"
                          : "pointer",
                        transition: "all 0.2s",
                        opacity: invoiceQuickProgress.active ? 0.85 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!invoiceQuickProgress.active) {
                          e.currentTarget.style.backgroundColor = "#7b1fa2";
                          e.currentTarget.style.color = "#fff";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!invoiceQuickProgress.active) {
                          e.currentTarget.style.backgroundColor = "#fff";
                          e.currentTarget.style.color = "#7b1fa2";
                        }
                      }}
                    >
                      {invoiceQuickProgress.active
                        ? `⏳ Scaricando...`
                        : `📑 Scarica ${order.invoiceNumber?.startsWith("NC/") ? "NC" : "Fattura"}`}
                    </button>
                    {invoiceQuickProgress.active && (
                      <ProgressBar
                        percent={invoiceQuickProgress.percent}
                        stage={invoiceQuickProgress.stage}
                        color="#7b1fa2"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Right: Action Buttons (placeholder) */}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {canSendToVerona && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSendToVerona?.(order.id, order.customerName);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: "#fff",
                      color: "#388e3c",
                      border: "1px solid #388e3c",
                      borderRadius: "6px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#388e3c";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#fff";
                      e.currentTarget.style.color = "#388e3c";
                    }}
                  >
                    📤 Invia a Verona
                  </button>
                )}
                {canSendToVerona && !editing && !deletingOrder && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit?.(order.id);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: "#fff",
                      color: "#1976d2",
                      border: "1px solid #1976d2",
                      borderRadius: "6px",
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
                    ✏ Modifica
                  </button>
                )}
                {canSendToVerona && !editing && (
                  <button
                    disabled={deletingOrder}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(true);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: deletingOrder ? "#ffcdd2" : "#fff",
                      color: "#d32f2f",
                      border: "1px solid #d32f2f",
                      borderRadius: "6px",
                      cursor: deletingOrder ? "not-allowed" : "pointer",
                      opacity: deletingOrder ? 0.6 : 1,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (!deletingOrder) {
                        e.currentTarget.style.backgroundColor = "#d32f2f";
                        e.currentTarget.style.color = "#fff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!deletingOrder) {
                        e.currentTarget.style.backgroundColor = "#fff";
                        e.currentTarget.style.color = "#d32f2f";
                      }
                    }}
                  >
                    🗑 Elimina
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Delete progress bar */}
        {deletingOrder && deleteProgress && (
          <div style={{ marginTop: "12px" }}>
            <div
              style={{
                fontSize: "12px",
                color: "#d32f2f",
                marginBottom: "4px",
                fontWeight: 600,
              }}
            >
              {deleteProgress.operation}
            </div>
            <div
              style={{
                height: "6px",
                backgroundColor: "#ffcdd2",
                borderRadius: "3px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${deleteProgress.progress}%`,
                  backgroundColor: "#d32f2f",
                  borderRadius: "3px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Delete confirm modal - rendered via portal to escape card stacking context */}
        {deleteConfirm && createPortal(
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
            }}
            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(false); }}
          >
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "12px",
                padding: "24px",
                maxWidth: "400px",
                width: "90%",
                boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 12px", color: "#d32f2f" }}>
                Conferma eliminazione
              </h3>
              <p style={{ margin: "0 0 8px", color: "#333" }}>
                Vuoi eliminare l'ordine{" "}
                <strong>{order.orderNumber || order.id}</strong> da Archibald?
              </p>
              <p
                style={{
                  margin: "0 0 20px",
                  color: "#666",
                  fontSize: "13px",
                }}
              >
                L'ordine verra' cancellato sia dal sistema locale che da
                Archibald ERP. Questa azione non e' reversibile.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setDeleteConfirm(false)}
                  style={{
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: 600,
                    backgroundColor: "#fff",
                    color: "#666",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Annulla
                </button>
                <button
                  onClick={handleDeleteOrder}
                  style={{
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: 600,
                    backgroundColor: "#d32f2f",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Elimina definitivamente
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {/* Notes preview in collapsed header */}
        {!expanded && notePreviews && notePreviews.length > 0 && (
          <div style={{
            margin: '8px 0 4px',
            padding: '8px 12px',
            backgroundColor: '#fafafa',
            borderRadius: '8px',
            border: '1px solid #f0f0f0',
          }}>
            {notePreviews.map((note, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                fontSize: '12px',
                lineHeight: '1.4',
                padding: '2px 0',
                color: note.checked ? '#999' : '#444',
                textDecoration: note.checked ? 'line-through' : 'none',
              }}>
                <span style={{ fontSize: '13px', flexShrink: 0 }}>
                  {note.checked ? '\u2611' : '\u2610'}
                </span>
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {note.text}
                </span>
              </div>
            ))}
            {noteSummary && noteSummary.total > 3 && (
              <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                ...e altre {noteSummary.total - 3}
              </div>
            )}
          </div>
        )}

        {/* Expand/collapse icon */}
        <div
          style={{
            marginTop: "12px",
            textAlign: "center",
            fontSize: "20px",
            color: "#999",
          }}
        >
          {expanded ? "\u25B2" : "\u25BC"}
        </div>
      </div>

      {/* ===== EXPANDED STATE ===== */}
      {expanded && (
        <div style={{ borderTop: "1px solid #e0e0e0" }}>
          {/* Order Notes */}
          <OrderNotes orderId={order.id} expanded={expanded} onNotesChanged={onNotesChanged} />

          {/* Tab Navigation */}
          <div
            style={{
              display: "flex",
              gap: "4px",
              paddingLeft: "12px",
              paddingRight: "12px",
              paddingTop: "8px",
              backgroundColor: "transparent",
              overflow: "hidden",
              flexWrap: "wrap",
            }}
          >
            {tabs.map((tab, tabIndex) => {
              const isActive = activeTab === tab.id;
              const tabColor = tabColors[tabIndex];
              return (
                <button
                  key={tab.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab(tab.id);
                  }}
                  style={{
                    flex: "0 0 auto",
                    padding: "10px 16px",
                    background: isActive ? tabColor : "#f5f5f5",
                    borderTop: isActive
                      ? `2px solid ${orderStatusStyle.borderColor}`
                      : "1px solid #e0e0e0",
                    borderLeft: isActive ? "1px solid #ddd" : "1px solid #e0e0e0",
                    borderRight: isActive ? "1px solid #ddd" : "1px solid #e0e0e0",
                    borderBottom: "none",
                    borderRadius: "8px 8px 0 0",
                    marginBottom: isActive ? "-1px" : "0",
                    color: isActive ? orderStatusStyle.borderColor : "#888",
                    fontSize: "14px",
                    fontWeight: isActive ? 700 : 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    whiteSpace: "nowrap",
                    position: isActive ? "relative" : undefined,
                    zIndex: isActive ? 1 : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = tabColors[tabIndex];
                      e.currentTarget.style.opacity = "0.7";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "#f5f5f5";
                      e.currentTarget.style.opacity = "1";
                    }
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div style={{ minHeight: "300px", borderTop: "1px solid #ddd", backgroundColor: tabColors[tabs.findIndex(t => t.id === activeTab)] + "22", overflow: "visible" }}>
            {activeTab === "panoramica" && (
              <TabPanoramica order={order} searchQuery={searchQuery} />
            )}
            {activeTab === "articoli" && (
              <>
                {(() => {
                  const parsedOrderNotes = parseOrderNotesForEdit(order.notes ?? undefined);
                  return (
                    <TabArticoli
                      orderId={order.id}
                      archibaldOrderId={order.id}
                      token={token}
                      onTotalsUpdate={setArticlesTotals}
                      searchQuery={searchQuery}
                      editing={editing}
                      onEditDone={onEditDone}
                      editProgress={editProgress}
                      onEditProgress={setEditProgress}
                      customerName={order.customerName}
                      initialNotes={parsedOrderNotes.notes}
                      initialNoShipping={parsedOrderNotes.noShipping}
                      initialDiscountPercent={parseOrderDiscountPercent(order.discountPercent)}
                    />
                  );
                })()}
              </>
            )}
            {activeTab === "logistica" && (
              <TabLogistica
                order={order}
                token={token}
                searchQuery={searchQuery}
                borderColor={orderStatusStyle.borderColor}
              />
            )}
            {activeTab === "finanziario" && (
              <TabFinanziario
                order={order}
                token={token}
                searchQuery={searchQuery}
              />
            )}
            {activeTab === "storico" && <TabCronologia order={order} token={token} />}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
