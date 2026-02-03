import { useState } from "react";
import { WarehouseUpload } from "../components/WarehouseUpload";
import { WarehouseInventoryView } from "../components/WarehouseInventoryView";
import { AddItemManuallyModal } from "../components/AddItemManuallyModal";
import { BoxManagementModal } from "../components/BoxManagementModal";
import { clearWarehouseData } from "../services/warehouse-service";
import { toastService } from "../services/toast.service";

export default function WarehouseManagementView() {
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showBoxManagementModal, setShowBoxManagementModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [clearing, setClearing] = useState(false);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleClearWarehouse = async () => {
    // Conferma con alert
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

    if (!confirmed) {
      return;
    }

    // Seconda conferma
    const doubleConfirmed = window.confirm(
      "Sei assolutamente sicuro?\n\n" +
        "Dopo questa operazione dovrai ricaricare il file Excel del magazzino.\n\n" +
        "Clicca OK per confermare la cancellazione definitiva.",
    );

    if (!doubleConfirmed) {
      return;
    }

    setClearing(true);

    try {
      await clearWarehouseData();
      toastService.success(
        "🗑️ Magazzino completamente svuotato. Ricarica il file Excel.",
      );
      handleRefresh();

      // Reload pagina dopo 2 secondi per pulire tutto
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error("Clear warehouse error:", error);
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
        padding: "20px",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "10px" }}>
          📦 Gestione Magazzino
        </h1>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          Carica e gestisci l'inventario del magazzino. Gli articoli caricati
          saranno disponibili durante la creazione degli ordini.
        </p>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
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

      {/* Upload Component */}
      <WarehouseUpload />

      {/* Inventory View - Always Visible */}
      <WarehouseInventoryView key={refreshKey} />

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
          div[style*="padding: 20px"] {
            padding: 10px;
          }

          h1 {
            font-size: 1.5rem !important;
          }
        }
      `}</style>
    </div>
  );
}
