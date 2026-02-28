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

const STACK_OFFSET = 16;
const STACK_SCALE_STEP = 0.02;
const STACK_ROTATE_STEP = -0.3;
const SWIPE_THRESHOLD = 40;
const TRANSITION_CSS = "transform 0.45s cubic-bezier(0.2, 0.9, 0.2, 1)";
const DOTS_AREA_HEIGHT = 24;

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
}: OrderCardStackProps): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [cardOrder, setCardOrder] = useState<string[]>(() =>
    orders.map((o) => o.id),
  );
  const [shuffleTransform, setShuffleTransform] = useState<string | null>(null);
  const [shufflingId, setShufflingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstCardRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(140);
  const [animateIn, setAnimateIn] = useState(false);

  const pointerStart = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  useEffect(() => {
    setCardOrder(orders.map((o) => o.id));
  }, [orders]);

  useLayoutEffect(() => {
    if (!expanded && firstCardRef.current) {
      const h =
        firstCardRef.current.getBoundingClientRect().height +
        (orders.length - 1) * STACK_OFFSET;
      setContainerHeight(h);
    }
  });

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const orderedCards = cardOrder
    .map((id) => orderById.get(id))
    .filter(Boolean) as Order[];

  const activeIndex = orderedCards.length > 0
    ? orders.findIndex((o) => o.id === orderedCards[0].id)
    : 0;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (expanded) return;
      pointerStart.current = { x: e.clientX, y: e.clientY };
      moved.current = false;
    },
    [expanded],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (expanded) return;
      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        moved.current = true;
      }
    },
    [expanded],
  );

  const shuffleNext = useCallback(() => {
    if (orderedCards.length < 2) return;
    const firstId = cardOrder[0];
    setShufflingId(firstId);
    setShuffleTransform("translateX(110%) rotate(8deg)");
    setTimeout(() => {
      setCardOrder((prev) => [...prev.slice(1), prev[0]]);
      setShuffleTransform(null);
      setShufflingId(null);
    }, 150);
  }, [cardOrder, orderedCards.length]);

  const shufflePrev = useCallback(() => {
    if (orderedCards.length < 2) return;
    const lastId = cardOrder[cardOrder.length - 1];
    setShufflingId(lastId);
    setCardOrder((prev) => [prev[prev.length - 1], ...prev.slice(0, -1)]);
    setShuffleTransform("translateX(-110%) rotate(-8deg)");
    requestAnimationFrame(() => {
      setShuffleTransform(null);
      setShufflingId(null);
    });
  }, [cardOrder, orderedCards.length]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (expanded) return;
      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;

      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) shuffleNext();
        else shufflePrev();
      } else if (!moved.current) {
        setExpanded(true);
      }
    },
    [expanded, shuffleNext, shufflePrev],
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

  useEffect(() => {
    if (expanded) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [expanded]);

  useEffect(() => {
    if (expanded) {
      requestAnimationFrame(() => setAnimateIn(true));
    } else {
      setAnimateIn(false);
    }
  }, [expanded]);

  if (expanded) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "#f5f5f5",
          display: "flex",
          flexDirection: "column",
          transform: animateIn ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.35s cubic-bezier(0.2, 0.9, 0.2, 1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 16px",
            background: "#fff",
            borderBottom: "1px solid #e0e0e0",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              background: source === "auto-nc" ? "#fff3e0" : "#e3f2fd",
              color: source === "auto-nc" ? "#e65100" : "#1565c0",
              padding: "3px 10px",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "12px",
            }}
          >
            {source === "auto-nc" ? "NC" : "Pila"}
          </span>
          <span style={{ fontSize: "13px", color: "#555" }}>
            {orders.length} ordini
          </span>
          <button
            onClick={close}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              fontSize: "22px",
              cursor: "pointer",
              color: "#888",
              padding: "4px 8px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 12px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
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
              />
              {onUnstack && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnstack(stackId, order.id);
                  }}
                  style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                    background: "rgba(255,255,255,0.9)",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    padding: "2px 8px",
                    fontSize: "10px",
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

        {onDissolve && (
          <div
            style={{
              padding: "12px 16px",
              background: "#fff",
              borderTop: "1px solid #e0e0e0",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => onDissolve(stackId)}
              style={{
                width: "100%",
                background: "none",
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "10px",
                fontSize: "13px",
                cursor: "pointer",
                color: "#666",
              }}
            >
              Scollega pila
            </button>
          </div>
        )}
      </div>
    );
  }

  const showDots = orders.length > 1;
  const totalHeight = containerHeight + (showDots ? DOTS_AREA_HEIGHT : 0);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "relative",
        height: `${totalHeight}px`,
        touchAction: "pan-y",
        marginBottom: "12px",
        cursor: "pointer",
        isolation: "isolate",
        borderLeft: `4px solid ${source === "auto-nc" ? "#e65100" : "#1565c0"}`,
        borderRadius: "4px",
        paddingLeft: "4px",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-10px",
          right: "-6px",
          backgroundColor: source === "auto-nc" ? "#e65100" : "#1565c0",
          color: "#fff",
          borderRadius: "14px",
          padding: "4px 12px",
          fontSize: "12px",
          fontWeight: 700,
          zIndex: 202,
          pointerEvents: "none",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          letterSpacing: "0.3px",
        }}
      >
        {orders.length} {source === "auto-nc" ? "NC" : "ordini"}
      </div>

      {orderedCards.map((order, i) => {
        const isShuffling = shufflingId === order.id && shuffleTransform;
        return (
          <div
            key={order.id}
            ref={i === 0 ? firstCardRef : undefined}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              transform: isShuffling
                ? shuffleTransform
                : `translateY(${i * STACK_OFFSET}px) scale(${1 - i * STACK_SCALE_STEP}) rotate(${i * STACK_ROTATE_STEP}deg)`,
              zIndex: 100 - i,
              transition: TRANSITION_CSS,
              willChange: "transform",
              userSelect: "none",
              pointerEvents: i === 0 ? "auto" : "none",
              boxShadow: i === 0
                ? "0 2px 8px rgba(0,0,0,0.1)"
                : `0 ${2 + i * 2}px ${8 + i * 4}px rgba(0,0,0,${0.06 + i * 0.03})`,
              opacity: i === 0 ? 1 : Math.max(0.6, 1 - i * 0.15),
            }}
          >
            <OrderCardNew
              order={order}
              expanded={false}
              onToggle={() => {}}
              token={token}
              searchQuery={searchQuery}
            />
          </div>
        );
      })}

      {showDots && (
        <div
          style={{
            position: "absolute",
            top: `${containerHeight + 8}px`,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "6px",
            pointerEvents: "none",
          }}
        >
          {orders.map((o, i) => (
            <div
              key={o.id}
              style={{
                width: i === activeIndex ? "10px" : "6px",
                height: i === activeIndex ? "10px" : "6px",
                borderRadius: "50%",
                backgroundColor: i === activeIndex
                  ? (source === "auto-nc" ? "#e65100" : "#1565c0")
                  : "#ccc",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>
      )}

      {orders.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); shufflePrev(); }}
            style={{
              position: "absolute",
              left: "-14px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "#fff",
              border: "none",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              color: "#555",
              pointerEvents: "auto",
              zIndex: 201,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ‹
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); shuffleNext(); }}
            style={{
              position: "absolute",
              right: "-14px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "#fff",
              border: "none",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              color: "#555",
              pointerEvents: "auto",
              zIndex: 201,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

export { OrderCardStack, type OrderCardStackProps };
