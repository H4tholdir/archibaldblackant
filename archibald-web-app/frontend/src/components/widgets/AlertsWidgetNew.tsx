import { AlertData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * Alerts Widget - Avvisi con Spiegazioni Chiare
 * Design rinnovato con informazioni dettagliate e azioni di recupero
 */

interface AlertsWidgetNewProps {
  data: AlertData;
}

export function AlertsWidgetNew({ data }: AlertsWidgetNewProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  // Don't render if not visible
  if (!data.visible) {
    return null;
  }

  const severityStyles = {
    warning: {
      background: "linear-gradient(135deg, #f39c12 0%, #f1c40f 100%)",
      icon: "⚠️",
      title: "ATTENZIONE: Rischio Target",
    },
    critical: {
      background: "linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)",
      icon: "🚨",
      title: "URGENTE: Gap Significativo",
    },
  };

  const style = severityStyles[data.severity];

  return (
    <div
      style={{
        background: style.background,
        borderRadius: "16px",
        padding: "30px",
        color: "#fff",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <span style={{ fontSize: "32px" }}>{style.icon}</span>
        <h3
          style={{
            margin: 0,
            fontSize: "22px",
            fontWeight: "bold",
            textShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {style.title}
        </h3>
      </div>

      <div className={privacyEnabled ? "privacy-blur" : ""}>
        {/* Situation Analysis */}
        <div
          style={{
            backgroundColor: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(10px)",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: "600",
              marginBottom: "12px",
            }}
          >
            📊 Situazione
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontSize: "14px",
            }}
          >
            {data.projectedMonthRevenue && data.monthlyTarget && (
              <>
                <div>
                  • Proiezione fine mese:{" "}
                  <strong>
                    {maskValue(data.projectedMonthRevenue, "money")}
                  </strong>{" "}
                  (
                  {Math.round(
                    (data.projectedMonthRevenue / data.monthlyTarget) * 100,
                  )}
                  % del target)
                </div>
                <div>
                  • Gap:{" "}
                  <strong style={{ color: "#ffeaa7" }}>
                    -{maskValue(data.gap || 0, "money")}
                  </strong>{" "}
                  (-
                  {data.percentageGap?.toFixed(0)}%)
                </div>
                <div>
                  • Giorni rimanenti: <strong>{data.daysRemaining}</strong>{" "}
                  lavorativi
                </div>
              </>
            )}
          </div>
        </div>

        {/* Recovery Plan */}
        <div
          style={{
            backgroundColor: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(10px)",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: data.comparisonLastMonth ? "16px" : "0",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: "600",
              marginBottom: "12px",
            }}
          >
            🎯 Per Recuperare Serve
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontSize: "14px",
            }}
          >
            {data.recoverySuggestions?.map((suggestion, index) => (
              <div key={index} style={{ display: "flex", gap: "8px" }}>
                <span>✓</span>
                <span>{suggestion}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Motivational comparison */}
        {data.comparisonLastMonth && (
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.1)",
              borderRadius: "10px",
              padding: "16px",
              fontSize: "14px",
            }}
          >
            <div
              style={{
                fontWeight: "600",
                marginBottom: "8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "18px" }}>💪</span>
              Ricorda
            </div>
            <div style={{ opacity: 0.95, lineHeight: "1.5" }}>
              📊 {data.comparisonLastMonth.situation}
              <br />✅ <strong>{data.comparisonLastMonth.outcome}</strong>
              <br />
              🚀 {data.comparisonLastMonth.message}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
