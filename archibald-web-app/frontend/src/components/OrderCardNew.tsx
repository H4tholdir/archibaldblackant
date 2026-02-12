// @ts-nocheck - Contains legacy code with articleCode
import { useState, useEffect, useRef, useCallback } from "react";
import type { Order, OrderItem } from "../types/order";

import { getOrderStatus, isNotSentToVerona } from "../utils/orderStatus";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { HighlightText } from "./HighlightText";
import { productService } from "../services/products.service";
import type { ProductWithDetails } from "../services/products.service";
import { priceService } from "../services/prices.service";
import { db } from "../db/schema";
import { CachePopulationService } from "../services/cache-population";
import { normalizeVatRate } from "../utils/vat-utils";
import { formatCurrency } from "../utils/format-currency";
import { useWebSocketContext } from "../contexts/WebSocketContext";

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
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDate(dateString: string | undefined): string {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
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

function getCourierLogo(courier: string | undefined): string {
  if (!courier) return "📦";
  const courierLower = courier.toLowerCase();
  if (courierLower.includes("ups")) return "📦"; // UPS brown
  if (courierLower.includes("fedex")) return "📦"; // FedEx purple
  if (courierLower.includes("dhl")) return "📦"; // DHL yellow
  if (courierLower.includes("tnt")) return "📦"; // TNT orange
  if (courierLower.includes("bartolini")) return "📦"; // Bartolini
  if (courierLower.includes("sda")) return "📦"; // SDA
  return "📦";
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// ============================================================================
// TAB CONTENT COMPONENTS
// ============================================================================

function getStepInfo(order: Order): { index: number; isError: boolean } {
  const ts = order.transferStatus?.toUpperCase() || "";
  const ss = (order.state || order.status)?.toUpperCase() || "";
  const dt = order.documentState?.toUpperCase() || "";
  const ot = order.orderType?.toUpperCase() || "";

  if (ss === "FATTURATO" || dt.includes("FATTURA") || order.invoiceNumber)
    return { index: 3, isError: false };
  if (
    ss === "CONSEGNATO" ||
    ot.includes("ORDINE DI VENDITA") ||
    ts === "TRASFERITO"
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
                  backgroundColor: "#E3F2FD",
                  color: "#1565C0",
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
                  backgroundColor: "#FFF3E0",
                  color: "#E65100",
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
}

interface EditModification {
  type: "update" | "add" | "delete";
  rowIndex?: number;
  articleCode?: string;
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

  const maxOriginal = originalItems.length;

  for (let i = 0; i < editItems.length; i++) {
    if (i < maxOriginal) {
      const orig = originalItems[i];
      const edit = editItems[i];
      if (
        orig.articleCode !== edit.articleCode ||
        orig.quantity !== edit.quantity ||
        orig.discountPercent !== edit.discountPercent
      ) {
        mods.push({
          type: "update",
          rowIndex: i,
          articleCode: edit.articleCode,
          quantity: edit.quantity,
          discount: edit.discountPercent,
          oldArticleCode: orig.articleCode,
          oldQuantity: orig.quantity,
          oldDiscount: orig.discountPercent,
        });
      }
    } else {
      mods.push({
        type: "add",
        articleCode: editItems[i].articleCode,
        quantity: editItems[i].quantity,
        discount: editItems[i].discountPercent,
      });
    }
  }

  for (let i = editItems.length; i < maxOriginal; i++) {
    mods.push({
      type: "delete",
      rowIndex: i,
      articleCode: originalItems[i].articleCode,
      oldQuantity: originalItems[i].quantity,
    });
  }

  return mods;
}

function recalcLineAmounts(item: EditItem): EditItem {
  const baseAmount = item.unitPrice * item.quantity;
  const lineAmount = baseAmount * (1 - item.discountPercent / 100);
  const vatAmount = lineAmount * (item.vatPercent / 100);
  const lineTotalWithVat = lineAmount + vatAmount;
  return { ...item, lineAmount, vatAmount, lineTotalWithVat };
}

function TabArticoli({
  items,
  orderId,
  archibaldOrderId,
  token,
  onTotalsUpdate,
  searchQuery = "",
  editing = false,
  onEditDone,
  editProgress,
}: {
  items?: OrderItem[];
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
}) {
  const [articles, setArticles] = useState(items || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
  const [syncingProducts, setSyncingProducts] = useState(false);
  const [syncProductsMsg, setSyncProductsMsg] = useState("");
  const [syncingArticles, setSyncingArticles] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const qtyTimeoutRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const dropdownRef = useRef<HTMLDivElement>(null);

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
        if (data.success && data.data.articles.length > 0) {
          setArticles(data.data.articles);

          if (
            onTotalsUpdate &&
            data.data.totalVatAmount &&
            data.data.totalWithVat
          ) {
            onTotalsUpdate({
              totalVatAmount: data.data.totalVatAmount,
              totalWithVat: data.data.totalWithVat,
            });
          }
        }
      } catch (err) {
        console.log("No existing articles found");
      }
    };

    loadArticles();
  }, [orderId, token, onTotalsUpdate]);

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

      if (token && orderId) {
        try {
          const syncResponse = await fetchWithRetry(
            `/api/orders/${orderId}/sync-articles`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            },
          );

          if (syncResponse.ok) {
            const syncResult = await syncResponse.json();
            if (syncResult.success && syncResult.data.articles.length > 0) {
              freshArticles = syncResult.data.articles;
              if (!cancelled) {
                setArticles(freshArticles);
                if (
                  onTotalsUpdate &&
                  syncResult.data.totalVatAmount &&
                  syncResult.data.totalWithVat
                ) {
                  onTotalsUpdate({
                    totalVatAmount: syncResult.data.totalVatAmount,
                    totalWithVat: syncResult.data.totalWithVat,
                  });
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

      // 2. Sync product cache if empty
      const count = await db.products.count();
      if (count === 0) {
        setSyncingProducts(true);
        const jwt = localStorage.getItem("archibald_jwt") || "";
        await CachePopulationService.getInstance().populateCache(jwt, (p) => {
          if (!cancelled) setSyncProductsMsg(p.message);
        });
        if (!cancelled) setSyncingProducts(false);
      }

      if (cancelled) return;

      // 3. Initialize edit items from fresh articles
      const mapped: EditItem[] = freshArticles.map((item: any) => ({
        articleCode: item.articleCode || "",
        productName: item.productName || "",
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice ?? item.price ?? 0,
        discountPercent: item.discountPercent ?? item.discount ?? 0,
        vatPercent: item.vatPercent ?? 0,
        vatAmount: item.vatAmount ?? 0,
        lineAmount: item.lineAmount ?? 0,
        lineTotalWithVat: item.lineTotalWithVat ?? 0,
        articleDescription: item.articleDescription ?? item.description ?? "",
      }));
      setEditItems(mapped);
      setOriginalItems(mapped.map((m) => ({ ...m })));
    })();

    return () => {
      cancelled = true;
    };
  }, [editing]);

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
      const currentQty = editItems[idx]?.quantity || 1;
      const packaging = await productService.calculateOptimalPackaging(
        product.name,
        currentQty,
      );

      let variantId = product.id;
      let variantArticle = product.article;
      if (
        packaging.success &&
        packaging.breakdown &&
        packaging.breakdown.length > 0
      ) {
        variantId = packaging.breakdown[0].variant.variantId || product.id;
        variantArticle =
          packaging.breakdown[0].variant.variantId || product.article;
      }

      const priceData = await priceService.getPriceAndVat(variantId);
      const unitPrice = priceData?.price ?? product.price ?? 0;
      const vatPercent = normalizeVatRate(priceData?.vat ?? product.vat);

      const newItems = [...editItems];
      newItems[idx] = recalcLineAmounts({
        ...newItems[idx],
        articleCode: variantArticle,
        productName: product.name,
        unitPrice,
        vatPercent,
        articleDescription: product.description || product.name,
        quantity: packaging.suggestedQuantity ?? currentQty,
        discountPercent: newItems[idx]?.discountPercent ?? 0,
        vatAmount: 0,
        lineAmount: 0,
        lineTotalWithVat: 0,
      });
      setEditItems(newItems);
      setEditingArticleIdx(null);
      setArticleSearch("");
      setArticleResults([]);
    },
    [editItems],
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

      const timeout = setTimeout(async () => {
        if (qty <= 0) {
          setQtyValidation((prev) =>
            new Map(prev).set(idx, "Quantita' deve essere > 0"),
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
                `Quantita' suggerita: ${packaging.suggestedQuantity}`,
              ),
            );
          }
          if (packaging.breakdown && packaging.breakdown.length > 0) {
            const bestVariant = packaging.breakdown[0].variant;
            const currentArticle = newItems[idx].articleCode;
            if (
              bestVariant.variantId &&
              bestVariant.variantId !== currentArticle
            ) {
              const priceData = await priceService.getPriceAndVat(
                bestVariant.variantId,
              );
              setEditItems((prev) => {
                const updated = [...prev];
                updated[idx] = recalcLineAmounts({
                  ...updated[idx],
                  articleCode: bestVariant.variantId,
                  unitPrice: priceData?.price ?? updated[idx].unitPrice,
                  vatPercent: normalizeVatRate(
                    priceData?.vat ?? updated[idx].vatPercent,
                  ),
                });
                return updated;
              });
            }
          }
        } else {
          setQtyValidation((prev) =>
            new Map(prev).set(
              idx,
              packaging.error || "Quantita' non valida per il packaging",
            ),
          );
        }
      }, 500);
      qtyTimeoutRef.current.set(idx, timeout);
    },
    [editItems],
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
        quantity: 1,
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

  const handleSaveClick = () => {
    const mods = computeModifications(originalItems, editItems);
    if (mods.length === 0) {
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

    try {
      const response = await fetch(`/api/orders/${orderId}/edit-in-archibald`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modifications,
          updatedItems: editItems,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        setError(result.error || "Errore durante la modifica");
        setSubmittingEdit(false);
        return;
      }

      setTimeout(() => {
        setSubmittingEdit(false);
        onEditDone?.();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di rete");
      setSubmittingEdit(false);
    }
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

      const result = await response.json();
      setArticles(result.data.articles);
      const totalVat = result.data.totalVatAmount ?? 0;
      setSuccess(
        `Sincronizzati ${result.data.articles.length} articoli. Totale IVA: ${totalVat.toFixed(2)}`,
      );

      if (
        onTotalsUpdate &&
        result.data.totalVatAmount &&
        result.data.totalWithVat
      ) {
        onTotalsUpdate({
          totalVatAmount: result.data.totalVatAmount,
          totalWithVat: result.data.totalWithVat,
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
            animation: "spin 1s linear infinite",
          }}
        >
          {"⏳"}
        </div>
        <p style={{ fontSize: "16px", color: "#666", marginBottom: "8px" }}>
          Sincronizzazione articoli da Archibald...
        </p>
        <style>
          {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
        </style>
      </div>
    );
  }

  // Syncing products overlay
  if (editing && syncingProducts) {
    return (
      <div style={{ padding: "32px", textAlign: "center" }}>
        <div
          style={{
            fontSize: "48px",
            marginBottom: "16px",
            animation: "spin 1s linear infinite",
          }}
        >
          {"⏳"}
        </div>
        <p style={{ fontSize: "16px", color: "#666", marginBottom: "8px" }}>
          Sincronizzazione catalogo prodotti...
        </p>
        <p style={{ fontSize: "13px", color: "#999" }}>{syncProductsMsg}</p>
        <style>
          {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
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
  if (editing && editItems.length >= 0) {
    const displayItems = editItems.length > 0 ? editItems : [];
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
              disabled={editItems.some(
                (item) => !item.articleCode || item.quantity <= 0,
              )}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: editItems.some(
                  (item) => !item.articleCode || item.quantity <= 0,
                )
                  ? "#ccc"
                  : "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: editItems.some(
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
        <div className="edit-table" style={{ position: "relative" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
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
              {displayItems.map((item, idx) => {
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
                        <input
                          type="text"
                          value={isSearching ? articleSearch : item.articleCode}
                          onChange={(e) =>
                            handleArticleSearchChange(idx, e.target.value)
                          }
                          onFocus={() => {
                            setEditingArticleIdx(idx);
                            setArticleSearch(item.articleCode);
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
                        {item.productName && !isSearching && (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#666",
                              marginTop: "2px",
                            }}
                          >
                            {item.productName}
                          </div>
                        )}
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
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          handleQtyChange(idx, parseInt(e.target.value) || 0)
                        }
                        style={{
                          width: "80px",
                          padding: "6px 8px",
                          fontSize: "13px",
                          border: `1px solid ${qtyError ? "#d32f2f" : "#ddd"}`,
                          borderRadius: "4px",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                      {qtyError && (
                        <div
                          style={{
                            fontSize: "10px",
                            color: "#d32f2f",
                            marginTop: "2px",
                          }}
                        >
                          {qtyError}
                        </div>
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
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={item.discountPercent}
                        onChange={(e) =>
                          handleDiscountChange(
                            idx,
                            parseFloat(e.target.value) || 0,
                          )
                        }
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
                        {"✕"}
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
            <tr style={{ backgroundColor: "#f5f5f5" }}>
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
              const unitPrice = (item as any).unitPrice ?? item.price ?? 0;
              const discount =
                (item as any).discountPercent ?? item.discount ?? 0;
              const description =
                (item as any).articleDescription ?? item.description ?? "";
              const lineAmount =
                (item as any).lineAmount ??
                (unitPrice * item.quantity * (100 - discount)) / 100;
              const vatPercent = (item as any).vatPercent ?? 0;
              const vatAmount = (item as any).vatAmount ?? 0;
              const lineTotalWithVat =
                (item as any).lineTotalWithVat ?? lineAmount;

              return (
                <tr key={index} style={{ borderBottom: "1px solid #e0e0e0" }}>
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
          </tbody>
        </table>
      </div>

      {/* Totals Section */}
      {articles.length > 0 &&
        (() => {
          const subtotalBeforeDiscount = articles.reduce((sum, item) => {
            const unitPrice = (item as any).unitPrice ?? item.price ?? 0;
            const quantity = item.quantity ?? 0;
            return sum + unitPrice * quantity;
          }, 0);
          const totalImponibile = articles.reduce(
            (sum, item) => sum + ((item as any).lineAmount ?? 0),
            0,
          );
          const totalDiscountAmount = subtotalBeforeDiscount - totalImponibile;

          const uniqueDiscounts = new Set(
            articles.map((item) => (item as any).discountPercent ?? 0),
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
                borderTop: "2px solid #e0e0e0",
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
                    {formatCurrency(
                      articles.reduce(
                        (sum, item) => sum + ((item as any).vatAmount ?? 0),
                        0,
                      ),
                    )}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "300px",
                    paddingTop: "8px",
                    borderTop: "1px solid #e0e0e0",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: "18px" }}>
                    TOTALE:
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "18px",
                      color: "#2e7d32",
                    }}
                  >
                    {formatCurrency(
                      articles.reduce(
                        (sum, item) =>
                          sum + ((item as any).lineTotalWithVat ?? 0),
                        0,
                      ),
                    )}
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
}: {
  order: Order;
  token?: string;
  searchQuery?: string;
}) {
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
          {order.totalWithVat && parseFloat(order.totalWithVat) > 0 && (
            <div
              style={{
                fontSize: "13px",
                color: "#2e7d32",
                fontWeight: 600,
                marginTop: "2px",
              }}
            >
              {formatCurrency(parseFloat(order.totalWithVat))} (con IVA)
            </div>
          )}
          {(!order.totalWithVat || parseFloat(order.totalWithVat) === 0) && (
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
                  ? `€${order.invoiceRemainingAmount}`
                  : undefined
              }
            />
            <InfoField
              label="Importo Fiscale"
              value={
                order.invoiceTaxAmount
                  ? `€${order.invoiceTaxAmount}`
                  : undefined
              }
            />
            <InfoField
              label="Sconto Linea"
              value={
                order.invoiceLineDiscount
                  ? `€${order.invoiceLineDiscount}`
                  : undefined
              }
            />
            <InfoField
              label="Sconto Totale"
              value={
                order.invoiceTotalDiscount
                  ? `€${order.invoiceTotalDiscount}`
                  : undefined
              }
            />
            <InfoField
              label="Ordine Acquisto"
              value={order.invoicePurchaseOrder}
            />
          </div>

          {order.invoiceDueDate && (
            <div
              style={{
                padding: "10px 16px",
                backgroundColor: (() => {
                  const days = order.invoiceDaysPastDue
                    ? parseInt(order.invoiceDaysPastDue)
                    : null;
                  return days !== null && days <= 0 ? "#ffebee" : "#e8f5e9";
                })(),
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
              {order.invoiceDaysPastDue && (
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color:
                      parseInt(order.invoiceDaysPastDue) <= 0
                        ? "#c62828"
                        : "#2e7d32",
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
                      backgroundColor:
                        parseInt(order.invoiceDaysPastDue) <= 0
                          ? "#c62828"
                          : "#2e7d32",
                      display: "inline-block",
                    }}
                  />
                  {parseInt(order.invoiceDaysPastDue) <= 0
                    ? `Scaduta da ${Math.abs(parseInt(order.invoiceDaysPastDue))} giorni`
                    : `${order.invoiceDaysPastDue} giorni rimanenti`}
                </div>
              )}
            </div>
          )}

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
                    value={`€${order.invoiceSettledAmount}`}
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
            <span>Scarica Fattura {order.invoiceNumber}</span>
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

function TabCronologia() {
  return (
    <div style={{ padding: "16px" }}>
      <h3
        style={{
          fontSize: "16px",
          fontWeight: 600,
          marginBottom: "12px",
          color: "#333",
        }}
      >
        Ordini Collegati
      </h3>
      <div
        style={{
          padding: "24px",
          textAlign: "center",
          color: "#999",
          fontSize: "14px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
        }}
      >
        Funzionalita' in fase di sviluppo. Qui verranno mostrati gli ordini
        collegati dallo storico Fresis e altre connessioni.
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function InfoField({
  label,
  value,
  bold,
  small,
  copyable,
  multiline,
  searchQuery = "",
}: {
  label: string;
  value?: string;
  bold?: boolean;
  small?: boolean;
  copyable?: boolean;
  multiline?: boolean;
  searchQuery?: string;
}) {
  if (!value) return null;

  return (
    <div style={{ marginBottom: multiline ? "12px" : "0" }}>
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
          whiteSpace: multiline ? "pre-wrap" : "nowrap",
          overflow: multiline ? "visible" : "hidden",
          textOverflow: multiline ? "clip" : "ellipsis",
        }}
      >
        <HighlightText text={value} query={searchQuery} />
        {copyable && (
          <button
            onClick={() => copyToClipboard(value)}
            style={{
              padding: "2px 8px",
              fontSize: "12px",
              border: "none",
              backgroundColor: "#e0e0e0",
              color: "#333",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            📋
          </button>
        )}
      </div>
    </div>
  );
}

const tableHeaderStyle: React.CSSProperties = {
  padding: "12px",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 600,
  color: "#666",
  borderBottom: "2px solid #e0e0e0",
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
  token: string,
  onProgress: (stage: string, percent: number) => void,
  onComplete: () => void,
  onError: (error: string) => void,
): () => void {
  const encodedId = encodeURIComponent(orderId);
  const url = `/api/orders/${encodedId}/pdf-download?type=${type}&token=${encodeURIComponent(token)}`;

  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "progress") {
        onProgress(data.stage, data.percent);
      } else if (data.type === "complete") {
        onProgress("Download completato!", 100);
        const byteCharacters = atob(data.pdf);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = data.filename;
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        eventSource.close();
        onComplete();
      } else if (data.type === "error") {
        eventSource.close();
        onError(data.error);
      }
    } catch {
      eventSource.close();
      onError("Errore durante il parsing della risposta");
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    onError("Connessione persa durante il download");
  };

  return () => eventSource.close();
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
}: OrderCardProps) {
  const [activeTab, setActiveTab] = useState<
    "panoramica" | "articoli" | "logistica" | "finanziario" | "storico"
  >("panoramica");

  const [editProgress, setEditProgress] = useState<{
    progress: number;
    operation: string;
  } | null>(null);

  // Force articoli tab when entering edit mode
  useEffect(() => {
    if (editing) {
      setActiveTab("articoli");
    }
  }, [editing]);

  // WebSocket subscriptions for edit progress
  const { subscribe } = useWebSocketContext();
  useEffect(() => {
    if (!editing) return;
    const unsub1 = subscribe("ORDER_EDIT_PROGRESS", (payload: any) => {
      if (payload.recordId === order.id) {
        setEditProgress({
          progress: payload.progress,
          operation: payload.operation,
        });
      }
    });
    const unsub2 = subscribe("ORDER_EDIT_COMPLETE", (payload: any) => {
      if (payload.recordId === order.id) {
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
    const unsub1 = subscribe("ORDER_DELETE_PROGRESS", (payload: any) => {
      if (payload.recordId === order.id) {
        setDeleteProgress({
          progress: payload.progress,
          operation: payload.operation,
        });
      }
    });
    const unsub2 = subscribe("ORDER_DELETE_COMPLETE", (payload: any) => {
      if (payload.recordId === order.id && !deleteHandledRef.current) {
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
      const jwt = token || localStorage.getItem("archibald_jwt") || "";
      const response = await fetch(
        `/api/orders/${order.id}/delete-from-archibald`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${jwt}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Errore ${response.status}`);
      }

      // Fallback: if WebSocket ORDER_DELETE_COMPLETE already handled, skip
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

  const canSendToVerona = isNotSentToVerona(order);

  const tabs = [
    { id: "panoramica" as const, label: "Panoramica", icon: "📊" },
    { id: "articoli" as const, label: "Articoli", icon: "📦" },
    { id: "logistica" as const, label: "Logistica", icon: "🚚" },
    { id: "finanziario" as const, label: "Finanziario", icon: "💰" },
    { id: "storico" as const, label: "Ordini Collegati", icon: "🔗" },
  ];

  // Get order status styling (border + background colors)
  const orderStatusStyle = getOrderStatus(order);

  return (
    <div
      style={{
        backgroundColor: orderStatusStyle.backgroundColor,
        borderLeft: `4px solid ${orderStatusStyle.borderColor}`,
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        marginBottom: "12px",
        overflow: "hidden",
        transition: "box-shadow 0.2s",
      }}
    >
      {/* ===== COLLAPSED STATE ===== */}
      <div
        onClick={onToggle}
        style={{
          padding: "16px",
          cursor: "pointer",
          transition: "background-color 0.2s",
          backgroundColor: orderStatusStyle.backgroundColor,
        }}
        onMouseEnter={(e) => {
          // Darken background slightly on hover
          e.currentTarget.style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
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
            </div>

            {/* Order Number + Date */}
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

            {/* Total Amount + Lordo/Sconto inline */}
            <div style={{ marginBottom: "4px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "#333",
                  }}
                >
                  <HighlightText text={order.total || ""} query={searchQuery} />
                </span>
                {order.grossAmount && (
                  <span style={{ fontSize: "13px", color: "#666" }}>
                    Lordo:{" "}
                    <HighlightText
                      text={order.grossAmount}
                      query={searchQuery}
                    />
                  </span>
                )}
                {order.discountPercent && (
                  <span style={{ fontSize: "13px", color: "#e65100" }}>
                    Sconto: {order.discountPercent}
                  </span>
                )}
              </div>
              {!order.invoiceNumber &&
                (() => {
                  const totalWithVat =
                    articlesTotals.totalWithVat ??
                    (order.totalWithVat
                      ? parseFloat(order.totalWithVat)
                      : undefined);

                  if (totalWithVat && totalWithVat > 0) {
                    return (
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#1a7f37",
                          marginTop: "2px",
                        }}
                      >
                        {formatCurrency(totalWithVat)} (IVA incl.)
                      </div>
                    );
                  }
                  return null;
                })()}
            </div>

            {/* Invoice Balance Row */}
            {order.invoiceNumber &&
              (() => {
                const remaining = parseFloat(
                  (order.invoiceRemainingAmount || "0")
                    .replace(/\./g, "")
                    .replace(",", "."),
                );
                const isPaid = order.invoiceClosed === true || remaining <= 0;
                const daysPastDue = order.invoiceDaysPastDue
                  ? parseInt(order.invoiceDaysPastDue, 10)
                  : null;

                return (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                      marginBottom: "8px",
                    }}
                  >
                    {isPaid ? (
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          padding: "3px 10px",
                          borderRadius: "6px",
                          backgroundColor: "#e8f5e9",
                          color: "#2e7d32",
                        }}
                      >
                        Pagata
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          padding: "3px 10px",
                          borderRadius: "6px",
                          backgroundColor: "#fff3e0",
                          color: "#e65100",
                        }}
                      >
                        Saldo: €{" "}
                        {remaining.toLocaleString("it-IT", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                    {order.invoiceDueDate && (
                      <span style={{ fontSize: "12px", color: "#666" }}>
                        Scad: {formatDate(order.invoiceDueDate)}
                      </span>
                    )}
                    {daysPastDue !== null && daysPastDue !== 0 && (
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: daysPastDue < 0 ? "#d32f2f" : "#2e7d32",
                        }}
                      >
                        {daysPastDue < 0
                          ? `${Math.abs(daysPastDue)} gg scaduta`
                          : `${daysPastDue} giorni`}
                      </span>
                    )}
                  </div>
                );
              })()}

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
                {/* Tracking Button */}
                {(order.tracking?.trackingUrl || order.ddt?.trackingUrl) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const url =
                        order.tracking?.trackingUrl || order.ddt?.trackingUrl;
                      if (url) window.open(url, "_blank");
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
                    🚚 Tracking
                  </button>
                )}

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
                      {ddtQuickProgress.active ? "⏳ DDT..." : "📄 DDT"}
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
                        ? "⏳ Fattura..."
                        : "📑 Fattura"}
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

        {/* Delete confirm modal */}
        {deleteConfirm && (
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
              zIndex: 2000,
            }}
            onClick={() => setDeleteConfirm(false)}
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
          {expanded ? "▲" : "▼"}
        </div>
      </div>

      {/* ===== EXPANDED STATE ===== */}
      {expanded && (
        <div style={{ borderTop: "1px solid #e0e0e0" }}>
          {/* Tab Navigation */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #e0e0e0",
              backgroundColor: "#f5f5f5",
              overflowX: "auto",
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab(tab.id);
                }}
                style={{
                  flex: "1 0 auto",
                  padding: "12px 16px",
                  border: "none",
                  backgroundColor:
                    activeTab === tab.id ? "#fff" : "transparent",
                  borderBottom:
                    activeTab === tab.id
                      ? "2px solid #1976d2"
                      : "2px solid transparent",
                  color: activeTab === tab.id ? "#1976d2" : "#666",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.backgroundColor = "#eeeeee";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ minHeight: "300px" }}>
            {activeTab === "panoramica" && (
              <TabPanoramica order={order} searchQuery={searchQuery} />
            )}
            {activeTab === "articoli" && (
              <>
                <TabArticoli
                  items={order.items}
                  orderId={order.id}
                  archibaldOrderId={order.id}
                  token={token}
                  onTotalsUpdate={setArticlesTotals}
                  searchQuery={searchQuery}
                  editing={editing}
                  onEditDone={onEditDone}
                  editProgress={editProgress}
                />
              </>
            )}
            {activeTab === "logistica" && (
              <TabLogistica
                order={order}
                token={token}
                searchQuery={searchQuery}
              />
            )}
            {activeTab === "finanziario" && (
              <TabFinanziario
                order={order}
                token={token}
                searchQuery={searchQuery}
              />
            )}
            {activeTab === "storico" && <TabCronologia />}
          </div>
        </div>
      )}
    </div>
  );
}
