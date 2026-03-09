import { useState } from "react";
import { WarehouseUpload } from "../components/WarehouseUpload";
import { WarehouseInventoryView } from "../components/WarehouseInventoryView";
import { WarehousePickupList } from "../components/WarehousePickupList";
import { AddItemManuallyModal } from "../components/AddItemManuallyModal";
import { BoxManagementModal } from "../components/BoxManagementModal";
import { clearAllWarehouseData } from "../api/warehouse";
import { toastService } from "../services/toast.service";

type ActiveTab = "magazzino" | "pickup";

export default function WarehouseManagementView() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("magazzino");
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showBoxManagementModal, setShowBoxManagementModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [clearing, setClearing] = useState(false);

  const handleRefresh = () => setRefreshKey((prev) => prev + 1);

  const handleClearWarehouse = async () => {
    const confirmed = window.confirm(
      "⚠️ ATTENZIONE!\n\n" +
        "Questa operazione cancellerà TUTTI i dati del magazzino:\n" +
        "• Tutti gli articoli\n" +
        "• Tutti gli scatoli\n" +
        "• Metadati di caricamento\n\n" +
        "I dati verranno rimossi sia dal browser che dal server.\n\n" +
        "Questa operazione NON può essere annullata.\n\n" +
        "Vuoi procedere?",
    );
    if (!confirmed) return;

    const doubleConfirmed = window.confirm(
      "Sei assolutamente sicuro?\n\n" +
        "Dopo questa operazione dovrai ricaricare il file Excel del magazzino.\n\n" +
        "Clicca OK per confermare la cancellazione definitiva.",
    );
    if (!doubleConfirmed) return;

    setClearing(true);
    try {
      await clearAllWarehouseData();
      toastService.success("🗑️ Magazzino completamente svuotato. Ricarica il file Excel.");
      handleRefresh();
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      toastService.error(
        error instanceof Error ? error.message : "Errore durante cancellazione",
      );
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
        padding: "20px",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Page header */}
        <div style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "1.8rem", color: "#1a1a2e", margin: "0 0 6px 0" }}>
            📦 Gestione Magazzino
          </h1>
          <p style={{ color: "#666", margin: 0, fontSize: "14px" }}>
            Carica e gestisci l'inventario del magazzino.
          </p>
        </div>

        {/* Action buttons card — solo nel tab Magazzino */}
        {activeTab === "magazzino" && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              padding: "14px 16px",
              marginBottom: "16px",
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => setShowAddItemModal(true)}
              style={{
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 600,
                border: "none",
                borderRadius: "6px",
                backgroundColor: "#4caf50",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              ➕ Aggiungi Articolo Manuale
            </button>
            <button
              onClick={() => setShowBoxManagementModal(true)}
              style={{
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 600,
                border: "1px solid #ccc",
                borderRadius: "6px",
                backgroundColor: "#fff",
                color: "#333",
                cursor: "pointer",
              }}
            >
              📦 Gestione Scatoli
            </button>
            <button
              onClick={handleClearWarehouse}
              disabled={clearing}
              style={{
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 600,
                border: "none",
                borderRadius: "6px",
                backgroundColor: clearing ? "#ccc" : "#d32f2f",
                color: "#fff",
                cursor: clearing ? "not-allowed" : "pointer",
                opacity: clearing ? 0.6 : 1,
              }}
            >
              {clearing ? "Cancellazione..." : "🗑️ Pulisci Magazzino"}
            </button>
          </div>
        )}

        {/* Tab navigation */}
        <div style={{ display: "flex", gap: 0, marginBottom: 0 }}>
          {(["magazzino", "pickup"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "11px 22px",
                fontSize: "14px",
                fontWeight: 600,
                border: "none",
                borderRadius: "8px 8px 0 0",
                cursor: "pointer",
                background: activeTab === tab ? "#fff" : "rgba(255,255,255,0.35)",
                color: activeTab === tab ? "#1a1a2e" : "#555",
                boxShadow: activeTab === tab ? "0 -1px 0 #e0e0e0" : undefined,
              }}
            >
              {tab === "magazzino" ? "📦 Magazzino" : "🛒 Articoli da prendere"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "0 8px 8px 8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          {activeTab === "magazzino" ? (
            <>
              <WarehouseUpload />
              <WarehouseInventoryView key={refreshKey} />
            </>
          ) : (
            <WarehousePickupList />
          )}
        </div>
      </div>

      {/* Modals */}
      <AddItemManuallyModal
        isOpen={showAddItemModal}
        onClose={() => setShowAddItemModal(false)}
        onSuccess={handleRefresh}
      />
      <BoxManagementModal
        isOpen={showBoxManagementModal}
        onClose={() => setShowBoxManagementModal(false)}
      />

      <style>{`
        @media (max-width: 768px) {
          h1 { font-size: 1.4rem !important; }
        }
      `}</style>
    </div>
  );
}
