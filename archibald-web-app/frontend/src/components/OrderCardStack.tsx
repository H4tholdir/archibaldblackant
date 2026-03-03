import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { Order } from "../types/order";
import { OrderCardNew } from "./OrderCardNew";

const STACK_OFFSET = 12;
const STACK_GAP = 14;
const CARD_RADIUS = 16;
const EASE = "cubic-bezier(0.2, 0.9, 0.2, 1)";
const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 0.5;
const FLY_OUT_MS = 200;
const MAX_ROTATION_DEG = 15;

type OrderCardStackProps = {
  orders: Order[];
  stackId: string;
  source: "auto-nc" | "manual";
  expandedOrderId: string | null;
  onToggleOrder: (orderId: string) => void;
  onSendToVerona?: (orderId: string, customerName: string) => void;
  onEdit?: (orderId: string) => void;
  onDeleteDone?: () => void;
  token?: string;
  searchQuery?: string;
  editingOrderId?: string | null;
  onEditDone?: () => void;
  sentToVeronaIds?: Set<string>;
  onUnstack?: (stackId: string, orderId: string) => void;
  onDissolve?: (stackId: string) => void;
  onLabelChange?: (stackId: string, newLabel: string) => void;
  onStackClose?: () => void;
  onReorder?: (stackId: string, orderIds: string[]) => void;
  reason?: string;
  noteSummaries?: Record<string, { total: number; checked: number }>;
  notePreviews?: Record<string, Array<{ text: string; checked: boolean }>>;
  onNotesChanged?: () => void;
  getSuggestedTab?: (order: Order) => "panoramica" | "articoli" | "logistica" | "finanziario" | null;
  forceExpand?: boolean;
};

function OrderCardStack({
  orders,
  stackId,
  source,
  expandedOrderId,
  onToggleOrder,
  onSendToVerona,
  onEdit,
  onDeleteDone,
  token,
  searchQuery,
  editingOrderId,
  onEditDone,
  sentToVeronaIds,
  // onUnstack not destructured — per-card unlink button removed
  onDissolve,
  onLabelChange,
  onStackClose,
  onReorder,
  reason,
  noteSummaries,
  notePreviews,
  onNotesChanged,
  getSuggestedTab,
  forceExpand = false,
}: OrderCardStackProps): ReactNode {
  const [expanded, setExpanded] = useState(false);

  // Force expand when parent requests it (e.g., search navigation)
  useEffect(() => {
    if (forceExpand && !expanded) {
      setExpanded(true);
    }
    if (!forceExpand && expanded && searchQuery) {
      // Search moved to a different stack, collapse this one
    }
  }, [forceExpand]);
  const [cardOrder, setCardOrder] = useState<string[]>(() =>
    orders.map((o) => o.id),
  );
  const [topCardHeight, setTopCardHeight] = useState(140);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const [showSwipeHint, setShowSwipeHint] = useState(true);

  const topCardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pointerDownPos = useRef({ x: 0, y: 0 });
  const pointerDownTime = useRef(0);
  const dragging = useRef(false);
  const movedSignificantly = useRef(false);
  const isAnimating = useRef(false);

  useEffect(() => {
    const newIds = orders.map((o) => o.id);
    const currentIds = new Set(cardOrder);
    const hasChanged = newIds.length !== cardOrder.length || newIds.some(id => !currentIds.has(id));
    if (hasChanged) {
      setCardOrder(newIds);
    }
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showSwipeHint && orders.length > 1) {
      const timer = setTimeout(() => setShowSwipeHint(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSwipeHint, orders.length]);

  useLayoutEffect(() => {
    if (!expanded && topCardRef.current) {
      const h = topCardRef.current.getBoundingClientRect().height;
      setTopCardHeight(h);
    }
  });


  const orderById = new Map(orders.map((o) => [o.id, o]));
  const orderedCards = cardOrder
    .map((id) => orderById.get(id))
    .filter(Boolean) as Order[];

  const activeIndex =
    orderedCards.length > 0
      ? orders.findIndex((o) => o.id === orderedCards[0].id)
      : 0;

  const accentColor = "#e65100";
  const bannerGradient = "linear-gradient(135deg, #e65100, #ff6d00)";
  const expandedBg = "#fff3e0";
  const expandedBorder = "#ffcc80";

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (expanded || isAnimating.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
      pointerDownTime.current = Date.now();
      dragging.current = true;
      movedSignificantly.current = false;
      setIsDragging(true);
      setDragProgress(0);

      if (topCardRef.current) {
        topCardRef.current.style.transition = "none";
      }
    },
    [expanded],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (expanded || !dragging.current || !topCardRef.current) return;
      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;

      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        movedSignificantly.current = true;
      }

      if (movedSignificantly.current) {
        const rotation = Math.max(
          -MAX_ROTATION_DEG,
          Math.min(MAX_ROTATION_DEG, dx * 0.06),
        );
        topCardRef.current.style.transform = `translateX(${dx}px) rotate(${rotation}deg)`;
        const progress = Math.min(1, Math.abs(dx) / 200);
        setDragProgress(progress);
      }
    },
    [expanded],
  );

  const shuffleInDirection = useCallback(
    (direction: 1 | -1) => {
      if (orderedCards.length < 2 || !topCardRef.current) return;
      isAnimating.current = true;
      const card = topCardRef.current;
      const exitX = direction * window.innerWidth;
      const exitRotation = Math.max(
        -MAX_ROTATION_DEG,
        Math.min(MAX_ROTATION_DEG, direction * 12),
      );
      card.style.transition = `transform ${FLY_OUT_MS}ms ease-in`;
      card.style.transform = `translateX(${exitX}px) rotate(${exitRotation}deg)`;

      setTimeout(() => {
        let reordered: string[] | undefined;
        setCardOrder((prev) => {
          reordered = [...prev.slice(1), prev[0]];
          return reordered;
        });
        if (reordered) {
          onReorder?.(stackId, reordered);
        }
        if (topCardRef.current) {
          topCardRef.current.style.transition = "none";
          topCardRef.current.style.transform = "";
        }
        isAnimating.current = false;
      }, FLY_OUT_MS);
    },
    [orderedCards.length, onReorder, stackId],
  );

  const snapBack = useCallback(() => {
    if (!topCardRef.current) return;
    topCardRef.current.style.transition = `transform 0.35s ${EASE}`;
    topCardRef.current.style.transform = "";
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (expanded || !dragging.current) return;
      dragging.current = false;
      setIsDragging(false);
      setDragProgress(0);

      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      const elapsed = Math.max(1, Date.now() - pointerDownTime.current);
      const velocity = Math.abs(dx) / elapsed;
      const isHorizontal = Math.abs(dx) > Math.abs(dy);

      const flickTriggered =
        velocity > VELOCITY_THRESHOLD && Math.abs(dx) > 10;
      const dragTriggered = Math.abs(dx) > SWIPE_THRESHOLD;

      if (
        (flickTriggered || dragTriggered) &&
        isHorizontal &&
        orderedCards.length > 1
      ) {
        const direction: 1 | -1 = dx < 0 ? -1 : 1;
        shuffleInDirection(direction);
      } else if (!movedSignificantly.current) {
        snapBack();
        setExpanded(true);
      } else {
        snapBack();
      }
    },
    [expanded, orderedCards.length, shuffleInDirection, snapBack],
  );

  const close = useCallback(() => {
    setExpanded(false);
    onStackClose?.();
  }, [onStackClose]);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expanded, close]);

  const collapsedHeight = topCardHeight + (orders.length - 1) * STACK_OFFSET;
  const dotsHeight = orders.length > 1 ? 28 : 0;

  if (expanded) {
    const bannerButtonStyle: React.CSSProperties = {
      background: "rgba(255,255,255,0.2)",
      border: "1px solid rgba(255,255,255,0.4)",
      borderRadius: 20,
      padding: "4px 14px",
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer",
      color: "#fff",
    };

    return (
      <div
        data-order-card
        style={{
          marginBottom: 12,
        }}
      >
        {/* Backdrop overlay */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 50,
          }}
          onClick={close}
        />

        {/* Expanded content wrapper */}
        <div
          style={{
            position: "relative",
            zIndex: 51,
            transition: "all 0.3s ease",
          }}
        >
          {/* Top banner */}
          <div
            style={{
              background: bannerGradient,
              color: "#fff",
              padding: "14px 18px",
              borderRadius: `${CARD_RADIUS}px ${CARD_RADIUS}px 0 0`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {source === "auto-nc"
                  ? "Nota di Credito"
                  : reason || "Pila manuale"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                {orders.length} ordini collegati
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={close} style={bannerButtonStyle}>
                Richiudi pila
              </button>
              {onDissolve && (
                <button
                  onClick={() => onDissolve(stackId)}
                  style={bannerButtonStyle}
                >
                  Scollega pila
                </button>
              )}
              {onLabelChange && (
                <button
                  onClick={() => {
                    const newLabel = prompt("Etichetta pila:", reason ?? "");
                    if (newLabel !== null) onLabelChange(stackId, newLabel);
                  }}
                  style={bannerButtonStyle}
                >
                  Modifica
                </button>
              )}
            </div>
          </div>

          {/* Expanded cards wrapper */}
          <div
            style={{
              background: expandedBg,
              border: `2px solid ${expandedBorder}`,
              borderTop: "none",
              borderBottom: "none",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: STACK_GAP,
            }}
          >
            {orderedCards.map((order) => (
              <div
                key={order.id}
                style={{
                  position: "relative",
                  transition: "all 0.3s ease",
                }}
              >
                <div
                  style={{
                    borderRadius: CARD_RADIUS,
                  }}
                >
                  <OrderCardNew
                    order={order}
                    expanded={expandedOrderId === order.id}
                    onToggle={() => onToggleOrder(order.id)}
                    onSendToVerona={onSendToVerona}
                    onEdit={onEdit}
                    onDeleteDone={onDeleteDone}
                    token={token}
                    searchQuery={searchQuery}
                    editing={editingOrderId === order.id}
                    onEditDone={onEditDone}
                    justSentToVerona={sentToVeronaIds?.has(order.id) ?? false}
                    noteSummary={noteSummaries?.[order.id]}
                    notePreviews={notePreviews?.[order.id]}
                    onNotesChanged={onNotesChanged}
                    suggestedTab={getSuggestedTab?.(order) ?? null}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Bottom banner */}
          <div
            style={{
              background: bannerGradient,
              color: "#fff",
              padding: "12px 18px",
              borderRadius: `0 0 ${CARD_RADIUS}px ${CARD_RADIUS}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            <button
              onClick={close}
              style={{
                background: "rgba(255,255,255,0.2)",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 10,
                padding: "8px 28px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                color: "#fff",
              }}
            >
              Richiudi pila
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-order-card style={{ marginBottom: 12 }}>
      {/* Collapsed stack container */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: "relative",
          height: collapsedHeight,
          touchAction: "pan-y",
          cursor: "pointer",
          isolation: "isolate",
        }}
      >
        {/* Badge: count + source type */}
        <div
          style={{
            position: "absolute",
            top: -10,
            right: -6,
            backgroundColor: accentColor,
            color: "#fff",
            borderRadius: 14,
            padding: "4px 12px",
            fontSize: 12,
            fontWeight: 700,
            zIndex: 202,
            pointerEvents: "none",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            letterSpacing: 0.3,
          }}
        >
          {orders.length} {source === "auto-nc" ? "NC" : "ordini"}
        </div>

        {/* Cards wrapper with overflow hidden to clip behind cards of different heights */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: CARD_RADIUS }}>
          {orderedCards.map((order, i) => {
            const isTop = i === 0;
            const behindCardTransform = `translateY(${i * STACK_OFFSET}px) scale(${1 - i * 0.02})`;

            if (isTop) {
              return (
                <div
                  key={order.id}
                  ref={topCardRef}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    zIndex: 100,
                    willChange: "transform",
                    userSelect: "none",
                    borderRadius: CARD_RADIUS,
                    transition: isDragging
                      ? "none"
                      : `transform 0.45s ${EASE}`,
                  }}
                >
                  <OrderCardNew
                    order={order}
                    expanded={false}
                    onToggle={() => {}}
                    token={token}
                    searchQuery={searchQuery}
                    noteSummary={noteSummaries?.[order.id]}
                    notePreviews={notePreviews?.[order.id]}
                  />
                </div>
              );
            }

            const behindDragTransform =
              i === 1 && dragProgress > 0
                ? `translateY(${i * STACK_OFFSET * (1 - dragProgress)}px) scale(${1 - i * 0.02 + dragProgress * i * 0.02})`
                : behindCardTransform;

            return (
              <div
                key={order.id}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  minHeight: topCardHeight,
                  zIndex: 100 - i,
                  pointerEvents: "none",
                  borderRadius: CARD_RADIUS,
                  transform: behindDragTransform,
                  transition:
                    isDragging && i === 1
                      ? "none"
                      : `transform 0.45s ${EASE}`,
                  willChange: "transform",
                  userSelect: "none",
                }}
              >
                <OrderCardNew
                  order={order}
                  expanded={false}
                  onToggle={() => {}}
                  token={token}
                  searchQuery={searchQuery}
                  noteSummary={noteSummaries?.[order.id]}
                  notePreviews={notePreviews?.[order.id]}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Dots below the stack */}
      {orders.length > 1 && (
        <div
          style={{
            height: dotsHeight,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(0,0,0,0.08)",
              borderRadius: 10,
              padding: "3px 8px",
            }}
          >
            {orders.map((o, i) => (
              <div
                key={o.id}
                style={{
                  width: i === activeIndex ? 8 : 5,
                  height: i === activeIndex ? 8 : 5,
                  borderRadius: "50%",
                  backgroundColor:
                    i === activeIndex ? accentColor : "rgba(0,0,0,0.2)",
                  transition: "all 0.3s ease",
                }}
              />
            ))}
          </div>
          {showSwipeHint && (
            <div
              style={{
                fontSize: 10,
                color: "#888",
                transition: "opacity 1s ease",
              }}
            >
              Scorri per vedere le altre schede
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { OrderCardStack, type OrderCardStackProps };
