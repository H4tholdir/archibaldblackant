import { WarehouseUpload } from "../components/WarehouseUpload";
import { WarehouseInventoryView } from "../components/WarehouseInventoryView";

export default function WarehouseManagementView() {
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

      {/* Upload Component */}
      <WarehouseUpload />

      {/* Inventory View - Always Visible */}
      <WarehouseInventoryView />

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
