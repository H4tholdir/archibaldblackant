import { HeroStatusData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";
import { GaugeChart } from "../GaugeChart";

/**
 * Hero Status Widget - Gauge Semicircolare con Comparazioni
 * Design rinnovato con gauge animato e comparazioni temporali
 */

interface HeroStatusWidgetNewProps {
  data: HeroStatusData;
}

// Colors per status (background gradient)
const COLORS = {
  positive: {
    bgGradient: "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)",
  },
  warning: {
    bgGradient: "linear-gradient(135deg, #2c3e50 0%, #3498db 100%)",
  },
  critical: {
    bgGradient: "linear-gradient(135deg, #2c3e50 0%, #34495e 100%)",
  },
};

export function HeroStatusWidgetNew({ data }: HeroStatusWidgetNewProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  const colors = COLORS[data.status];

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format comparison delta
  const formatDelta = (
    previousValue: number,
    absoluteDelta: number,
    percentageDelta: number,
  ): string => {
    const sign = absoluteDelta >= 0 ? "+" : "";
    const arrow = absoluteDelta >= 0 ? "⚡" : "🔻";
    return `${formatCurrency(previousValue)} (${sign}${formatCurrency(absoluteDelta)}, ${sign}${percentageDelta.toFixed(1)}%) ${arrow}`;
  };

  const progressPercentage = Math.round(data.progressMonthly * 100);

  return (
    <div
      style={{
        background: colors.bgGradient,
        borderRadius: "20px",
        padding: "40px",
        color: "#fff",
        boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative background pattern */}
      <div
        style={{
          position: "absolute",
          top: "-50px",
          right: "-50px",
          width: "200px",
          height: "200px",
          borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-30px",
          left: "-30px",
          width: "150px",
          height: "150px",
          borderRadius: "50%",
          background: "rgba(255,255,255,0.03)",
          pointerEvents: "none",
        }}
      />

      {/* Title */}
      <h2
        style={{
          margin: "0 0 30px 0",
          fontSize: "28px",
          fontWeight: "bold",
          textAlign: "center",
          textShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        🚀 {data.microCopy}
      </h2>

      <div
        className={privacyEnabled ? "privacy-blur" : ""}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Gauge Chart */}
        <GaugeChart percentage={progressPercentage} size={280} thickness={35} />

        {/* Current / Target Values */}
        <div
          style={{
            fontSize: "24px",
            fontWeight: "600",
            marginTop: "20px",
            marginBottom: "15px",
            textAlign: "center",
          }}
        >
          {maskValue(data.currentMonthRevenue, "money")} /{" "}
          {maskValue(data.monthlyTarget, "money")}
        </div>

        {/* Progress Bar */}
        <div
          style={{
            width: "100%",
            maxWidth: "500px",
            height: "12px",
            backgroundColor: "rgba(255,255,255,0.2)",
            borderRadius: "6px",
            overflow: "hidden",
            marginBottom: "30px",
          }}
        >
          <div
            style={{
              width: `${progressPercentage}%`,
              height: "100%",
              background: "linear-gradient(90deg, #27ae60 0%, #2ecc71 100%)",
              borderRadius: "6px",
              transition: "width 1.5s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>

        {/* Temporal Comparisons */}
        <div
          style={{
            width: "100%",
            maxWidth: "600px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* vs Mese Scorso */}
          {data.comparisonPreviousMonth && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 20px",
                backgroundColor: "rgba(255,255,255,0.1)",
                borderRadius: "10px",
                backdropFilter: "blur(10px)",
              }}
            >
              <span style={{ fontSize: "20px" }}>📊</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", opacity: 0.9 }}>
                  vs Mese Scorso:
                </div>
                <div style={{ fontSize: "16px", fontWeight: "600" }}>
                  {formatDelta(
                    data.comparisonPreviousMonth.previousValue,
                    data.comparisonPreviousMonth.absoluteDelta,
                    data.comparisonPreviousMonth.percentageDelta,
                  )}
                </div>
              </div>
            </div>
          )}

          {/* vs Stesso Mese Anno Scorso */}
          {data.comparisonSameMonthLastYear && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 20px",
                backgroundColor: "rgba(255,255,255,0.1)",
                borderRadius: "10px",
                backdropFilter: "blur(10px)",
              }}
            >
              <span style={{ fontSize: "20px" }}>📅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", opacity: 0.9 }}>
                  {data.comparisonSameMonthLastYear.label}:
                </div>
                <div style={{ fontSize: "16px", fontWeight: "600" }}>
                  {formatDelta(
                    data.comparisonSameMonthLastYear.previousValue,
                    data.comparisonSameMonthLastYear.absoluteDelta,
                    data.comparisonSameMonthLastYear.percentageDelta,
                  )}
                </div>
              </div>
            </div>
          )}

          {/* vs Obiettivo Annuo */}
          {data.comparisonYearlyProgress && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 20px",
                backgroundColor: "rgba(255,255,255,0.15)",
                borderRadius: "10px",
                backdropFilter: "blur(10px)",
                border: "2px solid rgba(255,255,255,0.2)",
              }}
            >
              <span style={{ fontSize: "20px" }}>🎯</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", opacity: 0.9 }}>
                  vs Obiettivo Annuo:
                </div>
                <div style={{ fontSize: "16px", fontWeight: "600" }}>
                  {formatCurrency(data.comparisonYearlyProgress.currentValue)} (
                  {data.comparisonYearlyProgress.percentageDelta.toFixed(0)}%)
                  ⚡
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 640px) {
          .hero-status-widget-new {
            padding: 30px 20px !important;
          }
        }
      `}</style>
    </div>
  );
}
