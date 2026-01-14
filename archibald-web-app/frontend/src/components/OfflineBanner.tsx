import { useNetworkStatus } from "../hooks/useNetworkStatus";

export function OfflineBanner() {
  const { isOffline } = useNetworkStatus();

  if (!isOffline) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: "#ffc107", // Yellow (banking app standard)
        color: "#000",
        padding: "12px 16px",
        textAlign: "center",
        fontWeight: 600,
        fontSize: "14px",
        zIndex: 9999,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        borderBottom: "2px solid #ff9800",
      }}
    >
      📵 Modalità Offline
      <div
        style={{
          fontSize: "12px",
          fontWeight: 400,
          marginTop: "4px",
          color: "#333",
        }}
      >
        Puoi continuare a lavorare. Gli ordini saranno inviati quando torni
        online.
      </div>
    </div>
  );
}
