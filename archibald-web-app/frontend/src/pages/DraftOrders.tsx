import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { OrderCardNew } from "../components/OrderCardNew";
import {
  getDraftOrders,
  deleteDraftOrder,
  draftToOrder,
  type DraftOrder,
} from "../services/draftOrderStorage";
import type { Order } from "../types/order";

export function DraftOrders() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<DraftOrder[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null); // Track which order is being placed

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = () => {
    const loadedDrafts = getDraftOrders();
    setDrafts(loadedDrafts);
  };

  const handleToggle = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleEdit = (id: string) => {
    navigate(`/?draftId=${id}`);
  };

  const handlePlaceOrder = async (id: string, customerName: string) => {
    const confirmed = window.confirm(
      `Vuoi inviare l'ordine per "${customerName}" ad Archibald?\n\nL'ordine verrà creato e piazzato al cliente.`,
    );

    if (!confirmed) return;

    setPlacing(id);

    try {
      const draft = drafts.find((d) => d.id === id);
      if (!draft) throw new Error("Bozza non trovata");

      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        alert("Sessione scaduta. Effettua il login.");
        navigate("/login");
        return;
      }

      // Call backend API to place order on Archibald
      const response = await fetch("/api/orders/draft/place", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: draft.customerId,
          customerName: draft.customerName,
          items: draft.items,
          discountPercent: draft.discountPercent,
          targetTotalWithVAT: draft.targetTotalWithVAT,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          alert("Sessione scaduta. Effettua il login.");
          navigate("/login");
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || `Errore ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          data.error || "Errore durante la creazione dell'ordine",
        );
      }

      // Delete draft from local storage
      deleteDraftOrder(id);

      // Reload drafts
      loadDrafts();

      alert(
        `✅ Ordine creato e piazzato con successo!\n\nID Ordine: ${data.orderId}\n\nL'ordine è ora visibile nello Storico Ordini.`,
      );

      // Navigate to order history
      navigate("/orders");
    } catch (error) {
      console.error("[DraftOrders] Error placing order:", error);
      alert(
        `❌ Errore durante la creazione dell'ordine:\n\n${error instanceof Error ? error.message : "Errore sconosciuto"}`,
      );
    } finally {
      setPlacing(null);
    }
  };

  const handleDelete = (id: string, customerName: string) => {
    const confirmed = window.confirm(
      `Vuoi eliminare la bozza per "${customerName}"?\n\nQuesta operazione non può essere annullata.`,
    );

    if (!confirmed) return;

    deleteDraftOrder(id);
    loadDrafts();
  };

  // Convert drafts to Order format for display
  const orders: Order[] = drafts.map(draftToOrder);

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#333" }}>
          📝 Ordini in Bozza
        </h1>
        <button
          onClick={() => navigate("/order-form")}
          style={{
            padding: "12px 24px",
            fontSize: "16px",
            fontWeight: 600,
            backgroundColor: "#2196f3",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#1976d2";
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#2196f3";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          + Nuovo Ordine
        </button>
      </div>

      {/* Empty State */}
      {drafts.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            backgroundColor: "#f5f5f5",
            borderRadius: "12px",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📝</div>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 600,
              color: "#666",
              marginBottom: "8px",
            }}
          >
            Nessuna bozza salvata
          </h2>
          <p style={{ fontSize: "16px", color: "#999", marginBottom: "24px" }}>
            Crea un nuovo ordine per iniziare
          </p>
          <button
            onClick={() => navigate("/order-form")}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              fontWeight: 600,
              backgroundColor: "#2196f3",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            + Crea Ordine
          </button>
        </div>
      )}

      {/* Draft Orders List */}
      {orders.map((order) => {
        const draft = drafts.find((d) => d.id === order.id);
        if (!draft) return null;

        const isPlacing = placing === order.id;

        return (
          <div key={order.id} style={{ position: "relative" }}>
            {/* Placing overlay */}
            {isPlacing && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(255, 255, 255, 0.9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 10,
                  borderRadius: "12px",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: "32px",
                      marginBottom: "12px",
                      animation: "spin 1s linear infinite",
                    }}
                  >
                    ⏳
                  </div>
                  <div
                    style={{ fontSize: "16px", fontWeight: 600, color: "#333" }}
                  >
                    Invio ordine ad Archibald...
                  </div>
                </div>
              </div>
            )}

            <OrderCardNew
              order={order}
              expanded={expandedId === order.id}
              onToggle={() => handleToggle(order.id)}
              onEdit={handleEdit}
              // For drafts, we hijack onSendToMilano to mean "Place to Archibald"
              onSendToMilano={() =>
                handlePlaceOrder(order.id, order.customerName)
              }
            />

            {/* Delete button */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "-8px",
                marginBottom: "12px",
              }}
            >
              <button
                onClick={() => handleDelete(order.id, order.customerName)}
                disabled={isPlacing}
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: "#fff",
                  color: "#f44336",
                  border: "1px solid #f44336",
                  borderRadius: "6px",
                  cursor: isPlacing ? "not-allowed" : "pointer",
                  opacity: isPlacing ? 0.5 : 1,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (!isPlacing) {
                    e.currentTarget.style.backgroundColor = "#f44336";
                    e.currentTarget.style.color = "#fff";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isPlacing) {
                    e.currentTarget.style.backgroundColor = "#fff";
                    e.currentTarget.style.color = "#f44336";
                  }
                }}
              >
                🗑️ Elimina Bozza
              </button>
            </div>
          </div>
        );
      })}

      {/* CSS for spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
