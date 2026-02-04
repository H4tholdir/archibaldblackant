import { HeroStatusData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";
import { GaugeChart } from "../GaugeChart";
import { useConfettiCelebration } from "../../hooks/useConfettiCelebration";

/**
 * Hero Status Widget - Gauge Semicircolare con Comparazioni
 * Design rinnovato con gauge animato e comparazioni temporali
 */

interface HeroStatusWidgetNewProps {
  data: HeroStatusData;
}

// Colors per status (5-level system) - High contrast pairs for maximum readability
const COLORS = {
  champion: {
    bgGradient: "linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)", // Viola scuro
    progressBar: "linear-gradient(90deg, #ffd700 0%, #ffed4e 100%)", // Giallo oro (alto contrasto)
    accentColor: "#ffd700",
    textColor: "#ffffff",
    cardBg: "rgba(255, 215, 0, 0.15)", // Giallo trasparente
  },
  excellent: {
    bgGradient: "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)", // Blu scuro
    progressBar: "linear-gradient(90deg, #00ff88 0%, #00d9ff 100%)", // Verde acqua brillante
    accentColor: "#00ff88",
    textColor: "#ffffff",
    cardBg: "rgba(0, 255, 136, 0.15)", // Verde trasparente
  },
  "on-track": {
    bgGradient: "linear-gradient(135deg, #2c3e50 0%, #2980b9 100%)", // Blu-grigio
    progressBar: "linear-gradient(90deg, #1abc9c 0%, #16a085 100%)", // Verde smeraldo (contrasto)
    accentColor: "#1abc9c",
    textColor: "#ffffff",
    cardBg: "rgba(26, 188, 156, 0.15)", // Verde smeraldo trasparente
  },
  attention: {
    bgGradient: "linear-gradient(135deg, #c44100 0%, #d35400 100%)", // Arancione molto scuro
    progressBar: "linear-gradient(90deg, #ffeb3b 0%, #fdd835 100%)", // Giallo brillante (massimo contrasto)
    accentColor: "#ffeb3b",
    textColor: "#ffffff",
    cardBg: "rgba(255, 235, 59, 0.15)", // Giallo trasparente
  },
  critical: {
    bgGradient: "linear-gradient(135deg, #8b0000 0%, #b91400 100%)", // Rosso molto scuro
    progressBar: "linear-gradient(90deg, #ff6b6b 0%, #ee5a6f 100%)", // Rosso chiaro (contrasto)
    accentColor: "#ff6b6b",
    textColor: "#ffffff",
    cardBg: "rgba(255, 107, 107, 0.15)", // Rosso chiaro trasparente
  },
};

export function HeroStatusWidgetNew({ data }: HeroStatusWidgetNewProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  const colors = COLORS[data.status];

  // Confetti celebration when target reached (≥100%)
  const shouldCelebrate = data.progressMonthly >= 1.0;
  const now = new Date();
  const celebrationKey = `monthly-target-${now.getFullYear()}-${now.getMonth() + 1}`;

  useConfettiCelebration({
    enabled: shouldCelebrate,
    key: celebrationKey,
    cooldownMs: 24 * 60 * 60 * 1000, // 24h cooldown
  });

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
      className="hero-status-widget-new"
      style={{
        background: colors.bgGradient,
        borderRadius: "20px",
        padding: "40px 40px 50px 40px",
        color: "#fff",
        boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        position: "relative",
        overflow: "visible",
      }}
    >
      {/* Title */}
      <h2
        style={{
          margin: "0 0 30px 0",
          fontSize: "28px",
          fontWeight: "bold",
          textAlign: "center",
          textShadow: "0 3px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)",
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
        <GaugeChart
          percentage={progressPercentage}
          size={window.innerWidth < 640 ? 220 : 280}
          thickness={window.innerWidth < 640 ? 28 : 35}
        />

        {/* Current / Target Values */}
        <div
          style={{
            fontSize: "clamp(24px, 5vw, 32px)",
            fontWeight: "700",
            marginTop: "25px",
            marginBottom: "20px",
            textAlign: "center",
            letterSpacing: "0.5px",
            textShadow: "0 3px 15px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.9)",
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
              background: colors.progressBar,
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
              className="comparison-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 20px",
                backgroundColor: colors.cardBg,
                borderRadius: "12px",
                backdropFilter: "blur(10px)",
                animation: "slideIn 0.6s ease-out 0.2s both",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                border: `1px solid ${colors.accentColor}40`,
              }}
            >
              <span style={{ fontSize: "24px" }}>📊</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "clamp(14px, 2.5vw, 16px)",
                    opacity: 0.95,
                    fontWeight: "500",
                  }}
                >
                  vs Mese Scorso:
                </div>
                <div
                  style={{
                    fontSize: "clamp(16px, 3vw, 18px)",
                    fontWeight: "700",
                    marginTop: "4px",
                  }}
                >
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
              className="comparison-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 20px",
                backgroundColor: colors.cardBg,
                borderRadius: "12px",
                backdropFilter: "blur(10px)",
                animation: "slideIn 0.6s ease-out 0.4s both",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                border: `1px solid ${colors.accentColor}40`,
              }}
            >
              <span style={{ fontSize: "24px" }}>📅</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "clamp(14px, 2.5vw, 16px)",
                    opacity: 0.95,
                    fontWeight: "500",
                  }}
                >
                  {data.comparisonSameMonthLastYear.label}:
                </div>
                <div
                  style={{
                    fontSize: "clamp(16px, 3vw, 18px)",
                    fontWeight: "700",
                    marginTop: "4px",
                  }}
                >
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
              className="comparison-card comparison-card-yearly"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 20px",
                backgroundColor: colors.cardBg,
                borderRadius: "12px",
                backdropFilter: "blur(10px)",
                border: `2px solid ${colors.accentColor}50`,
                animation: "slideIn 0.6s ease-out 0.6s both",
                boxShadow: `0 4px 12px ${colors.accentColor}30`,
              }}
            >
              <span style={{ fontSize: "24px" }}>🎯</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "clamp(14px, 2.5vw, 16px)",
                    opacity: 0.95,
                    fontWeight: "500",
                  }}
                >
                  vs Obiettivo Annuo:
                </div>
                <div
                  style={{
                    fontSize: "clamp(16px, 3vw, 18px)",
                    fontWeight: "700",
                    marginTop: "4px",
                  }}
                >
                  {formatCurrency(data.comparisonYearlyProgress.currentValue)} (
                  {data.comparisonYearlyProgress.percentageDelta.toFixed(0)}%)
                  ⚡
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Animations and Responsive styles */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 4px 16px rgba(255,215,0,0.2);
          }
          50% {
            transform: scale(1.02);
            box-shadow: 0 6px 24px rgba(255,215,0,0.4);
          }
        }

        @keyframes glow {
          0%, 100% {
            filter: drop-shadow(0 0 8px rgba(39,174,96,0.6));
          }
          50% {
            filter: drop-shadow(0 0 20px rgba(39,174,96,0.9));
          }
        }

        .comparison-card {
          transition: all 0.3s ease;
        }

        .comparison-card:hover {
          transform: translateX(8px);
          background-color: rgba(255,255,255,0.15) !important;
        }

        @media (max-width: 640px) {
          .hero-status-widget-new {
            padding: 30px 20px !important;
          }
          .comparison-card {
            padding: 12px 16px !important;
            font-size: 12px !important;
          }
          .comparison-card > div:last-child {
            font-size: 10px !important;
            max-width: 180px !important;
          }
          h2 {
            font-size: 22px !important;
          }
        }
      `}</style>
    </div>
  );
}
