import { HeroStatusData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * Hero Status Widget - "Sulla Buona Strada"
 * Shows current health status with dynamic micro-copy and progress bars
 * PRD: Section 5.1
 */

interface HeroStatusWidgetProps {
  data: HeroStatusData;
}

// Micro-copy arrays per status (rotate randomly or use first)
const MICRO_COPY = {
  positive: [
    "Sulla buona strada 🚀",
    "Obiettivo sotto controllo",
    "Ritmo giusto, continua così",
  ],
  warning: [
    "Sei vicino al target, spingi ora",
    "Manca poco, questo è il momento",
    "Target a portata di mano",
  ],
  critical: [
    "Serve una accelerazione",
    "È il momento di spingere forte",
    "Recupero necessario, si può fare",
  ],
};

// Colors per status
const COLORS = {
  positive: {
    bgGradient: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
    progressColor: "#27ae60",
  },
  warning: {
    bgGradient: "linear-gradient(135deg, #f39c12 0%, #f1c40f 100%)",
    progressColor: "#f39c12",
  },
  critical: {
    bgGradient: "linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)",
    progressColor: "#e74c3c",
  },
};

export function HeroStatusWidget({ data }: HeroStatusWidgetProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  const colors = COLORS[data.status];

  // Select micro-copy (using first one for consistency, could be randomized)
  const microCopy = data.microCopy || MICRO_COPY[data.status][0];

  return (
    <div
      className="hero-status-widget"
      style={{
        background: colors.bgGradient,
        borderRadius: "16px",
        padding: "32px",
        color: "#fff",
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        transition: "all 0.3s ease",
      }}
    >
      {/* Title with status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontWeight: "700",
          }}
        >
          {microCopy}
        </h2>
      </div>

      {/* Missing amount */}
      <p
        style={{
          fontSize: "1.1rem",
          margin: "0 0 24px 0",
          opacity: 0.95,
        }}
      >
        Mancano{" "}
        <strong>{maskValue(data.missingToMonthlyTarget, "money")}</strong> per
        raggiungere il target mensile
      </p>

      {/* Progress bars */}
      <div className={privacyEnabled ? "privacy-blur" : ""}>
        {/* Target Mensile Progress */}
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
              fontSize: "0.95rem",
            }}
          >
            <span>Target Mensile</span>
            <span style={{ fontWeight: "600" }}>
              {Math.round(data.progressMonthly * 100)}%
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "12px",
              backgroundColor: "rgba(255,255,255,0.3)",
              borderRadius: "6px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${data.progressMonthly * 100}%`,
                height: "100%",
                backgroundColor: "#fff",
                borderRadius: "6px",
                transition: "width 0.5s ease",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              }}
            />
          </div>
        </div>

        {/* Prossimo Bonus Progress */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
              fontSize: "0.95rem",
            }}
          >
            <span>Prossimo Bonus</span>
            <span style={{ fontWeight: "600" }}>
              {Math.round(data.progressNextBonus * 100)}%
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "12px",
              backgroundColor: "rgba(255,255,255,0.3)",
              borderRadius: "6px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${data.progressNextBonus * 100}%`,
                height: "100%",
                backgroundColor: "#fff",
                borderRadius: "6px",
                transition: "width 0.5s ease",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
