import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { orderService } from "../services/orders.service";

export function OfflineSyncBanner() {
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (isOnline) {
      checkPendingOrders();
    }
  }, [isOnline]);

  const checkPendingOrders = async () => {
    try {
      const orders = await orderService.getPendingOrders();
      const pendingOrders = orders.filter((o) => o.status === "pending");

      if (pendingOrders.length > 0) {
        setPendingCount(pendingOrders.length);
        setShowBanner(true);
      }
    } catch (error) {
      console.error("[OfflineSyncBanner] Failed to check orders:", error);
    }
  };

  const handleNavigateToQueue = () => {
    setShowBanner(false);
    navigate("/pending-orders");
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  if (!showBanner || !isOnline) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "2rem",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "#3b82f6",
        color: "white",
        padding: "1rem 1.5rem",
        borderRadius: "8px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: "1rem",
      }}
    >
      <div>
        <div style={{ fontWeight: "600", marginBottom: "0.25rem" }}>
          Sei di nuovo online!
        </div>
        <div style={{ fontSize: "0.875rem" }}>
          Hai {pendingCount} {pendingCount === 1 ? "ordine" : "ordini"} da
          inviare. Vuoi inviarli ora?
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          onClick={handleNavigateToQueue}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "white",
            color: "#3b82f6",
            border: "none",
            borderRadius: "4px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Vai agli Ordini
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "transparent",
            color: "white",
            border: "1px solid white",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Dopo
        </button>
      </div>
    </div>
  );
}
