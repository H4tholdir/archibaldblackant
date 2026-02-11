import { getAllStatusStyles } from "../utils/orderStatus";

export interface OrderStatusLegendProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OrderStatusLegend({ isOpen, onClose }: OrderStatusLegendProps) {
  if (!isOpen) return null;

  const statusStyles = getAllStatusStyles();

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
        overflowY: "auto",
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          maxWidth: "700px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
          animation: "modalSlideIn 0.3s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 24px 16px 24px",
            borderBottom: "1px solid #e0e0e0",
            position: "sticky",
            top: 0,
            backgroundColor: "#fff",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#333",
                margin: 0,
              }}
            >
              📋 Legenda Stati Ordini
            </h2>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "28px",
                cursor: "pointer",
                color: "#666",
                padding: "0",
                lineHeight: 1,
              }}
              aria-label="Chiudi"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "24px" }}>
          {/* Colori Schede Section */}
          <section style={{ marginBottom: "32px" }}>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#333",
                marginTop: 0,
                marginBottom: "16px",
                borderBottom: "2px solid #e0e0e0",
                paddingBottom: "8px",
              }}
            >
              🎨 Colori Schede
            </h3>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {statusStyles.map((style) => (
                <div
                  key={style.category}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "12px",
                    backgroundColor: style.backgroundColor,
                    borderLeft: `4px solid ${style.borderColor}`,
                    borderRadius: "6px",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "14px",
                        color: "#333",
                        marginBottom: "4px",
                      }}
                    >
                      {style.label}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#666",
                        lineHeight: 1.4,
                      }}
                    >
                      {style.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Glossario Tag Section */}
          <section style={{ marginBottom: "32px" }}>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#333",
                marginTop: 0,
                marginBottom: "16px",
                borderBottom: "2px solid #e0e0e0",
                paddingBottom: "8px",
              }}
            >
              📖 Glossario Tag
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: "12px",
              }}
            >
              <GlossaryItem
                term="GIORNALE"
                definition="Ordine ancora modificabile o cancellabile"
              />
              <GlossaryItem
                term="ORDINE DI VENDITA"
                definition="Assegnato numero ORD/xxxxxxxx definitivo"
              />
              <GlossaryItem
                term="ORDINE APERTO"
                definition="Ordine non spedito o spedito parzialmente (backorder)"
              />
              <GlossaryItem
                term="IN ATTESA DI APPROVAZIONE"
                definition="Ricevuto da Verona, in coda per elaborazione"
              />
              <GlossaryItem
                term="TRANSFER ERROR"
                definition="Bloccato per problemi anagrafica o pagamenti"
              />
              <GlossaryItem
                term="MODIFICA"
                definition="Ordine ancora modificabile/cancellabile"
              />
              <GlossaryItem
                term="CONSEGNATO"
                definition="Affidato a corriere (NON consegna fisica effettiva)"
              />
              <GlossaryItem
                term="TRASFERITO"
                definition="Non più modificabile, gestito dal sistema Verona"
              />
              <GlossaryItem
                term="FATTURATO"
                definition="Fattura generata e disponibile"
              />
            </div>
          </section>

          {/* Timeline Section */}
          <section style={{ marginBottom: "32px" }}>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#333",
                marginTop: 0,
                marginBottom: "16px",
                borderBottom: "2px solid #e0e0e0",
                paddingBottom: "8px",
              }}
            >
              🕐 Timeline Tipica
            </h3>
            <div
              style={{
                backgroundColor: "#f5f5f5",
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              <TimelineStep
                number={1}
                icon="📱"
                title="Piazzato su PWA"
                description="Cliente crea l'ordine sulla Progressive Web App"
              />
              <TimelineArrow />
              <TimelineStep
                number={2}
                icon="📤"
                title="Inviato ad Archibald"
                description="GIORNALE + MODIFICA + NESSUNO"
              />
              <TimelineArrow />
              <TimelineStep
                number={3}
                icon="📨"
                title="Inviato a Verona"
                description="IN ATTESA DI APPROVAZIONE"
              />
              <TimelineArrow />
              <TimelineStep
                number={4}
                icon="✅"
                title="Approvato"
                description="Assegnato ORD/xxxxxxxx"
              />
              <TimelineArrow />
              <TimelineStep
                number={5}
                icon="🚚"
                title="Affidato a corriere"
                description="CONSEGNATO + TRASFERITO (FedEx)"
              />
              <TimelineArrow />
              <TimelineStep
                number={6}
                icon="📄"
                title="Generata DDT"
                description="Con tracking number disponibile"
              />
              <TimelineArrow />
              <TimelineStep
                number={7}
                icon="📦"
                title="Consegnato"
                description="Consegna al cliente confermata"
              />
              <TimelineArrow />
              <TimelineStep
                number={8}
                icon="📑"
                title="Fatturato"
                description="FATTURATO + FATTURA emessa"
              />
            </div>
          </section>

          {/* Documenti Section */}
          <section>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#333",
                marginTop: 0,
                marginBottom: "16px",
                borderBottom: "2px solid #e0e0e0",
                paddingBottom: "8px",
              }}
            >
              📄 Documenti
            </h3>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <DocumentItem
                title="NESSUNO"
                description="Nessun documento ancora generato"
              />
              <DocumentItem
                title="DOCUMENTO DI TRASPORTO (DDT)"
                description="Documento di trasporto, scaricabile quando disponibile"
              />
              <DocumentItem
                title="FATTURA"
                description="Fattura fiscale, scaricabile dopo emissione"
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e0e0e0",
            display: "flex",
            justifyContent: "flex-end",
            position: "sticky",
            bottom: 0,
            backgroundColor: "#fff",
          }}
        >
          <button
            onClick={onClose}
            style={{
              backgroundColor: "#2196f3",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#1976d2";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#2196f3";
            }}
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function GlossaryItem({
  term,
  definition,
}: {
  term: string;
  definition: string;
}) {
  return (
    <div
      style={{
        padding: "12px",
        backgroundColor: "#f9f9f9",
        borderRadius: "6px",
        borderLeft: "3px solid #2196f3",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: "13px",
          color: "#333",
          marginBottom: "4px",
        }}
      >
        {term}
      </div>
      <div style={{ fontSize: "12px", color: "#666", lineHeight: 1.4 }}>
        {definition}
      </div>
    </div>
  );
}

function TimelineStep({
  number,
  icon,
  title,
  description,
}: {
  number: number;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
      <div
        style={{
          minWidth: "32px",
          height: "32px",
          backgroundColor: "#2196f3",
          color: "#fff",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 600,
          fontSize: "14px",
        }}
      >
        {number}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: "14px",
            color: "#333",
            marginBottom: "2px",
          }}
        >
          {icon} {title}
        </div>
        <div style={{ fontSize: "12px", color: "#666", lineHeight: 1.4 }}>
          {description}
        </div>
      </div>
    </div>
  );
}

function TimelineArrow() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        margin: "8px 0",
        color: "#2196f3",
        fontSize: "20px",
      }}
    >
      ↓
    </div>
  );
}

function DocumentItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        padding: "12px",
        backgroundColor: "#f9f9f9",
        borderRadius: "6px",
        borderLeft: "3px solid #9c27b0",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: "13px",
          color: "#333",
          marginBottom: "4px",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: "12px", color: "#666", lineHeight: 1.4 }}>
        {description}
      </div>
    </div>
  );
}
