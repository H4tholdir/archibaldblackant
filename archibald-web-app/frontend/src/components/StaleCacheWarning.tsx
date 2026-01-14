import { useState, useEffect } from "react";
import { cacheService } from "../services/cache-service";

interface StaleCacheWarningProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function StaleCacheWarning({
  onConfirm,
  onCancel,
}: StaleCacheWarningProps) {
  const [cacheAge, setCacheAge] = useState<number | null>(null);

  useEffect(() => {
    cacheService.getCacheAge().then(setCacheAge);
  }, []);

  if (cacheAge === null || cacheAge < 72) {
    return null; // Not stale (< 3 days)
  }

  const daysOld = Math.floor(cacheAge / 24);

  return (
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
        zIndex: 10000,
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "8px",
          padding: "24px",
          maxWidth: "400px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ marginTop: 0, color: "#f57c00" }}>
          ⚠️ Dati non aggiornati
        </h3>
        <p style={{ color: "#666", lineHeight: 1.5 }}>
          I prezzi e i prodotti sono stati aggiornati{" "}
          <strong>{daysOld} giorni fa</strong>.
        </p>
        <p style={{ color: "#666", lineHeight: 1.5 }}>
          Puoi continuare a creare l'ordine, ma i prezzi potrebbero non essere
          corretti. Consigliamo di aggiornare i dati prima di procedere.
        </p>
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "24px",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "1px solid #ddd",
              backgroundColor: "#fff",
              cursor: "pointer",
            }}
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "none",
              backgroundColor: "#f57c00",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Continua comunque
          </button>
        </div>
      </div>
    </div>
  );
}
