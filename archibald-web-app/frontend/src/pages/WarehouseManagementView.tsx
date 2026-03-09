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
    <div style={{ minHeight: "100vh", padding: "20px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>

        {/* Action buttons card — solo nel tab Magazzino */}
        {activeTab === "magazzino" && (
          <div
            style={{
              background: "rgba(255,255,255,0.15)",
              borderRadius: "10px",
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
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: 700,
                border: "2px solid #4caf50",
                borderRadius: "8px",
                backgroundColor: "#4caf50",
                color: "#fff",
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(76,175,80,0.35)",
              }}
            >
              ➕ Aggiungi Articolo Manuale
            </button>
            <button
              onClick={() => setShowBoxManagementModal(true)}
              style={{
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: 700,
                border: "2px solid rgba(255,255,255,0.7)",
                borderRadius: "8px",
                backgroundColor: "rgba(255,255,255,0.9)",
                color: "#333",
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
              }}
            >
              📦 Gestione Scatoli
            </button>
            <button
              onClick={handleClearWarehouse}
              disabled={clearing}
              style={{
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: 700,
                border: "2px solid #d32f2f",
                borderRadius: "8px",
                backgroundColor: clearing ? "#ccc" : "#d32f2f",
                color: "#fff",
                cursor: clearing ? "not-allowed" : "pointer",
                opacity: clearing ? 0.6 : 1,
                boxShadow: clearing ? undefined : "0 2px 6px rgba(211,47,47,0.35)",
              }}
            >
              {clearing ? "Cancellazione..." : "🗑️ Pulisci Magazzino"}
            </button>
          </div>
        )}

        {/* Tab navigation */}
        <div style={{ display: "flex", gap: "6px", marginBottom: 0 }}>
          <button
            onClick={() => setActiveTab("magazzino")}
            style={{
              padding: "12px 26px",
              fontSize: "15px",
              fontWeight: 700,
              border: "none",
              borderRadius: "10px 10px 0 0",
              cursor: "pointer",
              background: activeTab === "magazzino" ? "#fff" : "rgba(255,255,255,0.25)",
              color: activeTab === "magazzino" ? "#1a1a2e" : "rgba(255,255,255,0.9)",
              boxShadow: activeTab === "magazzino" ? "0 -2px 8px rgba(0,0,0,0.08)" : undefined,
              letterSpacing: "0.01em",
            }}
          >
            📦 Magazzino
          </button>
          <button
            onClick={() => setActiveTab("pickup")}
            style={{
              padding: "12px 26px",
              fontSize: "15px",
              fontWeight: 700,
              border: "none",
              borderRadius: "10px 10px 0 0",
              cursor: "pointer",
              background: activeTab === "pickup"
                ? "linear-gradient(135deg, #f59e0b, #f97316)"
                : "rgba(245,158,11,0.22)",
              color: activeTab === "pickup" ? "#fff" : "rgba(255,255,255,0.9)",
              boxShadow: activeTab === "pickup" ? "0 -2px 8px rgba(245,158,11,0.4)" : undefined,
              letterSpacing: "0.01em",
            }}
          >
            🛒 Articoli da prendere
          </button>
        </div>

        {/* Tab content */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: activeTab === "pickup" ? "0 8px 8px 8px" : "0 8px 8px 8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
          }}
        >
          {activeTab === "magazzino" ? (
            <>
              <WarehouseInventoryView key={refreshKey} />
              <WarehouseUpload />
            </>
          ) : (
            <>
              <div
                style={{
                  padding: "14px 20px 10px",
                  borderBottom: "1px solid #fde68a",
                  background: "linear-gradient(90deg, #fffbeb, #fff)",
                  borderRadius: "0 8px 0 0",
                }}
              >
                <p style={{ margin: 0, fontSize: "13px", color: "#92400e" }}>
                  <strong>Cosa serve:</strong> mostra gli articoli da prelevare fisicamente dal magazzino per gli ordini della giornata selezionata — quelli con quantità magazzino &gt; 0. Usa i checkbox per segnare i pezzi già raccolti, poi stampa la lista.
                </p>
              </div>
              <WarehousePickupList />
            </>
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
    </div>
  );
}
