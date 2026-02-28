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
const STACK_SCALE_STEP = 0.02;
const STACK_ROTATE_STEP = -0.3;
const SWIPE_THRESHOLD = 40;
const TRANSITION_CSS = "transform 0.45s cubic-bezier(0.2, 0.9, 0.2, 1)";

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

  if (expanded) {
    return (
      <>
        <div
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.12)",
            zIndex: 50,
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 51,
            display: "grid",
            gap: "14px",
            marginBottom: "12px",
          }}
        >
          {source === "auto-nc" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 12px",
                fontSize: "12px",
                color: "#666",
              }}
            >
              <span
                style={{
                  background: "#fff3e0",
                  color: "#e65100",
                  padding: "2px 8px",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "11px",
                }}
              >
                NC
              </span>
              <span>Triade ordine + nota di credito</span>
              {onDissolve && (
                <button
                  onClick={() => onDissolve(stackId)}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "11px",
                    cursor: "pointer",
                    color: "#666",
                  }}
                >
                  Scollega pila
                </button>
              )}
            </div>
          )}
          {source === "manual" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 12px",
                fontSize: "12px",
                color: "#666",
              }}
            >
              <span
                style={{
                  background: "#e3f2fd",
                  color: "#1565c0",
                  padding: "2px 8px",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "11px",
                }}
              >
                Pila
              </span>
              <span>Pila manuale</span>
              {onDissolve && (
                <button
                  onClick={() => onDissolve(stackId)}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "11px",
                    cursor: "pointer",
                    color: "#666",
                  }}
                >
                  Scollega pila
                </button>
              )}
            </div>
          )}
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
      </>
    );
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "relative",
        height: `${containerHeight}px`,
        touchAction: "pan-y",
        marginBottom: "12px",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-8px",
          right: "-4px",
          backgroundColor: source === "auto-nc" ? "#e65100" : "#1565c0",
          color: "#fff",
          borderRadius: "12px",
          padding: "2px 10px",
          fontSize: "11px",
          fontWeight: 700,
          zIndex: 200,
          pointerEvents: "none",
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
    </div>
  );
}

export { OrderCardStack, type OrderCardStackProps };
