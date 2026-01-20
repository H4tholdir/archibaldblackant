import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  increases: number;
  decreases: number;
  onDismiss: () => void;
}

export function PriceSyncNotification({
  increases,
  decreases,
  onDismiss,
}: Props) {
  const [visible, setVisible] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-dismiss after 10s (longer than standard toast)
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // Wait for fade-out animation
    }, 10000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        backgroundColor: "white",
        padding: "20px",
        borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        zIndex: 2000,
        minWidth: "300px",
        transition: "opacity 0.3s",
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "10px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "16px" }}>📊 Variazioni Prezzi</h3>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: "none",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            padding: "0",
          }}
        >
          ×
        </button>
      </div>

      <div style={{ display: "flex", gap: "20px", marginTop: "15px" }}>
        <div style={{ flex: 1 }}>
          <div
            style={{ fontSize: "24px", fontWeight: "bold", color: "#c62828" }}
          >
            {increases} 🔴
          </div>
          <div style={{ fontSize: "12px", color: "#666" }}>Aumenti</div>
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{ fontSize: "24px", fontWeight: "bold", color: "#2e7d32" }}
          >
            {decreases} 🟢
          </div>
          <div style={{ fontSize: "12px", color: "#666" }}>Diminuzioni</div>
        </div>
      </div>

      <button
        onClick={() => navigate("/prezzi-variazioni")}
        style={{
          marginTop: "15px",
          width: "100%",
          padding: "10px",
          backgroundColor: "#1976d2",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        Vedi Dashboard →
      </button>
    </div>
  );
}
