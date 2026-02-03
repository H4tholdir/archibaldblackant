import { ForecastData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * Forecast Widget - Previsione Fine Mese Rinnovata
 * Design completamente ridisegnato per chiarezza e intuibilità
 */

interface ForecastWidgetNewProps {
  data: ForecastData;
}

export function ForecastWidgetNew({ data }: ForecastWidgetNewProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate percentages for visual progress
  const currentPercentage =
    data.monthlyTarget > 0
      ? (data.currentMonthRevenue / data.monthlyTarget) * 100
      : 0;
  const projectedPercentage =
    data.monthlyTarget > 0
      ? (data.projectedMonthRevenue / data.monthlyTarget) * 100
      : 0;

  const willReachTarget = data.projectedMonthRevenue >= data.monthlyTarget;
  const gap = data.monthlyTarget - data.projectedMonthRevenue;

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
          📈 Previsione Fine Mese
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "#7f8c8d",
          }}
        >
          Scenario attuale basato sul tuo ritmo
        </p>
      </div>

      <div className={privacyEnabled ? "privacy-blur" : ""}>
        {/* Visual Timeline: OGGI → PROIEZIONE → TARGET */}
        <div
          style={{
            backgroundColor: "#f8f9fa",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "16px",
            }}
          >
            {/* OGGI */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#95a5a6",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                OGGI
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: "bold",
                  color: "#3498db",
                }}
              >
                {maskValue(data.currentMonthRevenue, "money")}
              </div>
              <div
                style={{ fontSize: "13px", color: "#7f8c8d", marginTop: "4px" }}
              >
                {Math.round(currentPercentage)}%
              </div>
            </div>

            {/* Arrow */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 20px",
                fontSize: "24px",
                color: "#95a5a6",
              }}
            >
              →
            </div>

            {/* PROIEZIONE */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#95a5a6",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                PROIEZIONE
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: "bold",
                  color: willReachTarget ? "#27ae60" : "#e67e22",
                }}
              >
                {maskValue(data.projectedMonthRevenue, "money")}
              </div>
              <div
                style={{ fontSize: "13px", color: "#7f8c8d", marginTop: "4px" }}
              >
                {Math.round(projectedPercentage)}%
              </div>
            </div>

            {/* Arrow */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 20px",
                fontSize: "24px",
                color: "#95a5a6",
              }}
            >
              →
            </div>

            {/* TARGET */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#95a5a6",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                TARGET
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: "bold",
                  color: "#2c3e50",
                }}
              >
                {maskValue(data.monthlyTarget, "money")}
              </div>
              <div
                style={{ fontSize: "13px", color: "#7f8c8d", marginTop: "4px" }}
              >
                100%
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "12px",
              backgroundColor: "#e0e0e0",
              borderRadius: "6px",
              overflow: "hidden",
            }}
          >
            {/* Current position */}
            <div
              style={{
                position: "absolute",
                left: 0,
                width: `${Math.min(100, currentPercentage)}%`,
                height: "100%",
                backgroundColor: "#3498db",
                transition: "width 1s ease-out",
              }}
            />
            {/* Projected position marker */}
            <div
              style={{
                position: "absolute",
                left: `${Math.min(100, projectedPercentage)}%`,
                top: "-4px",
                width: "20px",
                height: "20px",
                backgroundColor: willReachTarget ? "#27ae60" : "#e67e22",
                borderRadius: "50%",
                border: "3px solid #fff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                transform: "translateX(-50%)",
              }}
            />
          </div>
        </div>

        {/* Scenario analysis */}
        <div
          style={{
            padding: "16px 20px",
            backgroundColor: willReachTarget ? "#e8f8f0" : "#fff3cd",
            borderRadius: "10px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{ fontSize: "14px", color: "#2c3e50", lineHeight: "1.6" }}
          >
            <strong>
              Con media giornaliera di{" "}
              {maskValue(data.averageDailyRevenue, "money")}/gg:
            </strong>
            <div style={{ marginTop: "8px" }}>
              {willReachTarget ? (
                <>
                  ✅ Raggiungerai il target con{" "}
                  <strong style={{ color: "#27ae60" }}>
                    {maskValue(
                      data.projectedMonthRevenue - data.monthlyTarget,
                      "money",
                    )}
                  </strong>{" "}
                  di margine
                </>
              ) : (
                <>
                  ⚠️ Mancheranno{" "}
                  <strong style={{ color: "#e67e22" }}>
                    {maskValue(gap, "money")}
                  </strong>{" "}
                  in {data.workingDaysRemaining} giorni lavorativi
                  <br />
                  🎯 Serve accelerare a{" "}
                  <strong style={{ color: "#e74c3c" }}>
                    {maskValue(data.requiredDailyRevenue, "money")}/gg
                  </strong>{" "}
                  per raggiungere il target
                </>
              )}
            </div>
          </div>
        </div>

        {/* Earnings breakdown */}
        <div
          style={{
            backgroundColor: "#f8f9fa",
            borderRadius: "10px",
            padding: "20px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              fontSize: "15px",
              fontWeight: "600",
              color: "#2c3e50",
              marginBottom: "12px",
            }}
          >
            💰 Proiezione Guadagno
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "14px", color: "#7f8c8d" }}>
                Provvigioni
              </span>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#2c3e50",
                }}
              >
                {maskValue(data.projectedCommissions, "money")}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "14px", color: "#7f8c8d" }}>
                Bonus previsti
              </span>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#27ae60",
                }}
              >
                +{maskValue(data.estimatedBonuses, "money")}
              </span>
            </div>
            <div
              style={{
                borderTop: "2px solid #dee2e6",
                marginTop: "8px",
                paddingTop: "10px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: "600",
                  color: "#2c3e50",
                }}
              >
                Totale stimato
              </span>
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  color: "#27ae60",
                }}
              >
                {maskValue(
                  data.projectedCommissions + data.estimatedBonuses,
                  "money",
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Temporal comparisons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {data.comparisonPreviousMonth && (
            <div
              style={{
                padding: "12px 16px",
                backgroundColor: "#e8f5e9",
                borderRadius: "8px",
                fontSize: "13px",
                color: "#27ae60",
                fontWeight: "600",
              }}
            >
              📊 vs Mese Scorso:{" "}
              {formatCurrency(data.comparisonPreviousMonth.previousValue)} (
              {data.comparisonPreviousMonth.absoluteDelta >= 0 ? "+" : ""}
              {formatCurrency(data.comparisonPreviousMonth.absoluteDelta)},{" "}
              {data.comparisonPreviousMonth.absoluteDelta >= 0 ? "+" : ""}
              {data.comparisonPreviousMonth.percentageDelta.toFixed(1)}%)
            </div>
          )}
          {data.comparisonSameMonthLastYear && (
            <div
              style={{
                padding: "12px 16px",
                backgroundColor: "#e3f2fd",
                borderRadius: "8px",
                fontSize: "13px",
                color: "#3498db",
                fontWeight: "600",
              }}
            >
              📅 {data.comparisonSameMonthLastYear.label}:{" "}
              {formatCurrency(data.comparisonSameMonthLastYear.previousValue)} (
              {data.comparisonSameMonthLastYear.absoluteDelta >= 0 ? "+" : ""}
              {formatCurrency(
                data.comparisonSameMonthLastYear.absoluteDelta,
              )},{" "}
              {data.comparisonSameMonthLastYear.absoluteDelta >= 0 ? "+" : ""}
              {data.comparisonSameMonthLastYear.percentageDelta.toFixed(1)}%)
            </div>
          )}
        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .forecast-timeline {
            flex-direction: column !important;
            gap: 20px !important;
          }
          .forecast-arrow {
            transform: rotate(90deg);
          }
        }
      `}</style>
    </div>
  );
}
