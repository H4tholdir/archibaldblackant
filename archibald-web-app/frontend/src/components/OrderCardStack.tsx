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

const STACK_PEEK = 12;
const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 0.5;
const SNAP_BACK_CSS = "transform 0.35s cubic-bezier(0.2, 0.9, 0.2, 1)";
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
  reason?: string;
  noteSummaries?: Record<string, { total: number; checked: number }>;
  notePreviews?: Record<string, Array<{ text: string; checked: boolean }>>;
  onNotesChanged?: () => void;
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
  onUnstack,
  onDissolve,
  onLabelChange,
  reason,
  noteSummaries,
  notePreviews,
  onNotesChanged,
}: OrderCardStackProps): ReactNode {
  const [expanded, setExpanded] = useState(false);
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
    setCardOrder(orders.map((o) => o.id));
  }, [orders]);

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

  const accentColor = source === "auto-nc" ? "#e65100" : "#1565c0";

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
        if (direction > 0) {
          setCardOrder((prev) => [prev[prev.length - 1], ...prev.slice(0, -1)]);
        } else {
          setCardOrder((prev) => [...prev.slice(1), prev[0]]);
        }
        if (topCardRef.current) {
          topCardRef.current.style.transition = "none";
          topCardRef.current.style.transform = "";
        }
        isAnimating.current = false;
      }, FLY_OUT_MS);
    },
    [orderedCards.length],
  );

  const snapBack = useCallback(() => {
    if (!topCardRef.current) return;
    topCardRef.current.style.transition = SNAP_BACK_CSS;
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

      const flickTriggered = velocity > VELOCITY_THRESHOLD && Math.abs(dx) > 10;
      const dragTriggered = Math.abs(dx) > SWIPE_THRESHOLD;

      if ((flickTriggered || dragTriggered) && isHorizontal && orderedCards.length > 1) {
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
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expanded, close]);

  const collapsedHeight = topCardHeight + (orders.length - 1) * STACK_PEEK;

  if (expanded) {
    const bannerGradient = source === "auto-nc"
      ? "linear-gradient(135deg, #e65100, #ff6d00)"
      : "linear-gradient(135deg, #1565c0, #1976d2)";
    const bannerBaseColor = source === "auto-nc" ? "#e65100" : "#1565c0";

    return (
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            background: bannerGradient,
            color: "#fff",
            padding: "14px 18px",
            borderRadius: 12,
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {source === "auto-nc" ? "Nota di Credito" : reason || "Pila manuale"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {orders.length} ordini collegati
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {onLabelChange && (
              <button
                onClick={() => {
                  const newLabel = prompt("Etichetta pila:", reason ?? "");
                  if (newLabel !== null) onLabelChange(stackId, newLabel);
                }}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "1px solid rgba(255,255,255,0.4)",
                  borderRadius: 20,
                  padding: "4px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "#fff",
                }}
              >
                Modifica
              </button>
            )}
            {onDissolve && (
              <button
                onClick={() => onDissolve(stackId)}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "1px solid rgba(255,255,255,0.4)",
                  borderRadius: 20,
                  padding: "4px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "#fff",
                }}
              >
                Scollega pila
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {orderedCards.map((order) => (
            <div key={order.id} style={{ position: "relative" }}>
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
              />
              {onUnstack && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnstack(stackId, order.id);
                  }}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    background: "rgba(255,255,255,0.9)",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: 10,
                    cursor: "pointer",
                    color: "#888",
                    zIndex: 10,
                  }}
                  title="Rimuovi da pila"
                >
                  Scollega
                </button>
              )}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 12,
            textAlign: "center",
          }}
        >
          <button
            onClick={close}
            style={{
              background: bannerBaseColor,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 32px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            {"\u25B2"} Richiudi pila
          </button>
        </div>
      </div>
    );
  }

  const totalPeekHeight = (orders.length - 1) * STACK_PEEK;
  const dotsHeight = orders.length > 1 ? 28 : 0;

  return (
    <div
      style={{
        border: `2px solid ${source === "auto-nc" ? "#ffcc80" : "#90caf9"}`,
        borderRadius: 14,
        padding: 2,
        background: source === "auto-nc" ? "#fff8f0" : "#f0f7ff",
        marginBottom: 12,
      }}
    >
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: "relative",
          height: collapsedHeight + dotsHeight,
          touchAction: "pan-y",
          cursor: "pointer",
          isolation: "isolate",
        }}
      >
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

        <div
          ref={topCardRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            zIndex: 100,
            willChange: "transform",
            userSelect: "none",
          }}
        >
          <OrderCardNew
            order={orderedCards[0]}
            expanded={false}
            onToggle={() => {}}
            token={token}
            searchQuery={searchQuery}
            noteSummary={noteSummaries?.[orderedCards[0]?.id]}
            notePreviews={notePreviews?.[orderedCards[0]?.id]}
          />

          {orderedCards.length > 1 && dragProgress > 0 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                zIndex: -1,
                opacity: dragProgress,
                transform: `scale(${0.95 + dragProgress * 0.05})`,
                transition: isDragging ? "none" : "opacity 0.2s ease, transform 0.2s ease",
                pointerEvents: "none",
              }}
            >
              <OrderCardNew
                order={orderedCards[1]}
                expanded={false}
                onToggle={() => {}}
                token={token}
                searchQuery={searchQuery}
                noteSummary={noteSummaries?.[orderedCards[1]?.id]}
                notePreviews={notePreviews?.[orderedCards[1]?.id]}
              />
            </div>
          )}
        </div>

        {orderedCards.slice(1).map((_, i) => (
          <div
            key={`peek-${i}`}
            style={{
              position: "absolute",
              left: 8 + i * 4,
              right: 8 + i * 4,
              top: topCardHeight + i * STACK_PEEK,
              height: STACK_PEEK,
              background: source === "auto-nc" ? "#ffe0b2" : "#bbdefb",
              borderRadius: "0 0 12px 12px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
              zIndex: 99 - i,
              pointerEvents: "none",
            }}
          />
        ))}

        {orders.length > 1 && (
          <div
            style={{
              position: "absolute",
              top: topCardHeight + totalPeekHeight + 4,
              left: 0,
              right: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "rgba(0,0,0,0.15)",
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
    </div>
  );
}

export { OrderCardStack, type OrderCardStackProps };
