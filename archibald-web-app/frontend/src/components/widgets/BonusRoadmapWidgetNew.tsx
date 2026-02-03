import { BonusRoadmapData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * Bonus Roadmap Widget - Linea Temporale Intuitiva
 * Design rinnovato con linea orizzontale e milestone chiare
 */

interface BonusRoadmapWidgetNewProps {
  data: BonusRoadmapData;
}

const STATUS_COLORS = {
  completed: "#27ae60",
  active: "#3498db",
  locked: "#95a5a6",
};

const STATUS_LABELS = {
  completed: "FATTO",
  active: "ATTIVO",
  locked: "BLOCCATO",
};

export function BonusRoadmapWidgetNew({ data }: BonusRoadmapWidgetNewProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatShort = (amount: number): string => {
    if (amount >= 1000) {
      return `€${(amount / 1000).toFixed(0)}k`;
    }
    return formatCurrency(amount);
  };

  // Calculate progress percentage along the roadmap
  const firstThreshold = data.steps[0]?.threshold || 0;
  const lastThreshold = data.steps[data.steps.length - 1]?.threshold || 100000;
  const progressPercentage =
    ((data.currentYearRevenue - firstThreshold) /
      (lastThreshold - firstThreshold)) *
    100;
  const clampedProgress = Math.max(0, Math.min(100, progressPercentage));

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "16px",
        padding: "30px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h3
          style={{
            margin: "0 0 6px 0",
            fontSize: "22px",
            fontWeight: "bold",
            color: "#2c3e50",
          }}
        >
          🎯 Roadmap Bonus Progressivi
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "#7f8c8d",
          }}
        >
          Fatturato Annuale:{" "}
          <strong className={privacyEnabled ? "privacy-blur" : ""}>
            {maskValue(data.currentYearRevenue, "money")}
          </strong>
        </p>
      </div>

      <div className={privacyEnabled ? "privacy-blur" : ""}>
        {/* Roadmap Timeline */}
        <div style={{ position: "relative", marginBottom: "60px" }}>
          {/* Background line */}
          <div
            style={{
              position: "absolute",
              top: "24px",
              left: "0",
              right: "0",
              height: "8px",
              backgroundColor: "#e0e0e0",
              borderRadius: "4px",
            }}
          />

          {/* Progress line */}
          <div
            style={{
              position: "absolute",
              top: "24px",
              left: "0",
              width: `${clampedProgress}%`,
              height: "8px",
              background: "linear-gradient(90deg, #27ae60 0%, #2ecc71 100%)",
              borderRadius: "4px",
              transition: "width 1s ease-out",
            }}
          />

          {/* Current position indicator */}
          <div
            style={{
              position: "absolute",
              top: "12px",
              left: `${clampedProgress}%`,
              transform: "translateX(-50%)",
              width: "32px",
              height: "32px",
              backgroundColor: "#3498db",
              borderRadius: "50%",
              border: "4px solid #fff",
              boxShadow: "0 4px 12px rgba(52, 152, 219, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              zIndex: 10,
              animation: "pulse 2s infinite",
            }}
          >
            📍
          </div>

          {/* Milestone steps */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              position: "relative",
            }}
          >
            {data.steps.map((step, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flex: 1,
                  position: "relative",
                }}
              >
                {/* Step circle */}
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    backgroundColor:
                      step.status === "completed"
                        ? STATUS_COLORS.completed
                        : step.status === "active"
                          ? STATUS_COLORS.active
                          : STATUS_COLORS.locked,
                    border: "4px solid #fff",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    transition: "all 0.3s ease",
                    zIndex: 5,
                  }}
                >
                  {step.status === "completed"
                    ? "✅"
                    : step.status === "active"
                      ? "➡️"
                      : "🔒"}
                </div>

                {/* Step info */}
                <div
                  style={{
                    marginTop: "12px",
                    textAlign: "center",
                  }}
                >
                  {/* Threshold */}
                  <div
                    style={{
                      fontSize: "16px",
                      fontWeight: "bold",
                      color: STATUS_COLORS[step.status],
                      marginBottom: "4px",
                    }}
                  >
                    {formatShort(step.threshold)}
                  </div>

                  {/* Bonus amount */}
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "#2c3e50",
                      marginBottom: "6px",
                    }}
                  >
                    {formatShort(step.bonusAmount)}
                  </div>

                  {/* Status label */}
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: "600",
                      color: STATUS_COLORS[step.status],
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      padding: "3px 8px",
                      backgroundColor: `${STATUS_COLORS[step.status]}15`,
                      borderRadius: "4px",
                    }}
                  >
                    {STATUS_LABELS[step.status]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Missing to next bonus */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 24px",
            backgroundColor: "#f8f9fa",
            borderRadius: "12px",
            border: "2px solid #e9ecef",
            marginBottom: "20px",
          }}
        >
          <span style={{ fontSize: "18px", marginRight: "10px" }}>🎯</span>
          <span style={{ fontSize: "15px", color: "#2c3e50" }}>
            Mancano{" "}
            <strong style={{ color: "#3498db" }}>
              {maskValue(data.missingToNextBonus, "money")}
            </strong>{" "}
            al prossimo bonus da{" "}
            <strong style={{ color: "#27ae60" }}>
              {maskValue(data.nextBonusAmount, "money")}
            </strong>
          </span>
        </div>

        {/* Comparison with last year */}
        {data.comparisonLastYear && (
          <div
            style={{
              padding: "14px 20px",
              backgroundColor: "#e8f8f0",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span style={{ fontSize: "18px" }}>📊</span>
            <div
              style={{ fontSize: "14px", color: "#27ae60", fontWeight: "600" }}
            >
              vs Anno Scorso:{" "}
              {formatCurrency(data.comparisonLastYear.previousValue)} (
              {data.comparisonLastYear.absoluteDelta >= 0 ? "+" : ""}
              {formatCurrency(data.comparisonLastYear.absoluteDelta)},{" "}
              {data.comparisonLastYear.absoluteDelta >= 0 ? "+" : ""}
              {data.comparisonLastYear.percentageDelta.toFixed(1)}%)
            </div>
          </div>
        )}
      </div>

      {/* Pulse animation for current position */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            transform: translateX(-50%) scale(1);
            box-shadow: 0 4px 12px rgba(52, 152, 219, 0.4);
          }
          50% {
            transform: translateX(-50%) scale(1.1);
            box-shadow: 0 6px 20px rgba(52, 152, 219, 0.6);
          }
        }

        @media (max-width: 768px) {
          .bonus-roadmap-responsive {
            overflow-x: auto;
          }
        }
      `}</style>
    </div>
  );
}
