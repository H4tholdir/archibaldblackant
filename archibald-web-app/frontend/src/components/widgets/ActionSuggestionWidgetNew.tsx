import { ActionSuggestion } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * Action Suggestion Widget - Suggerimenti Contestuali
 * Design completamente rinnovato con priorità chiare e azioni concrete
 */

interface ActionSuggestionWidgetNewProps {
  data: ActionSuggestion;
}

const GOAL_ICONS = {
  monthly_target: "🎯",
  next_bonus: "🔥",
  extra_budget: "💎",
};

const GOAL_LABELS = {
  monthly_target: "PRIORITÀ 1: Raggiungi Target Mensile",
  next_bonus: "OPPORTUNITÀ: Prossimo Bonus Vicino",
  extra_budget: "EXTRA: Supera il Budget",
};

export function ActionSuggestionWidgetNew({
  data,
}: ActionSuggestionWidgetNewProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        borderRadius: "16px",
        padding: "30px",
        color: "#fff",
        boxShadow: "0 8px 24px rgba(102, 126, 234, 0.3)",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h3
          style={{
            margin: "0 0 6px 0",
            fontSize: "22px",
            fontWeight: "bold",
            textShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          💡 Cosa Conviene Fare Ora?
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            opacity: 0.95,
          }}
        >
          Suggerimenti strategici basati sulla tua situazione
        </p>
      </div>

      <div className={privacyEnabled ? "privacy-blur" : ""}>
        {/* Primary Goal */}
        <div
          style={{
            backgroundColor: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(10px)",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: data.secondaryGoal ? "16px" : "20px",
            border: "2px solid rgba(255,255,255,0.3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            <span style={{ fontSize: "28px" }}>
              {GOAL_ICONS[data.primaryGoal]}
            </span>
            <div style={{ fontSize: "16px", fontWeight: "700", flex: 1 }}>
              {GOAL_LABELS[data.primaryGoal]}
            </div>
          </div>

          <div
            style={{
              fontSize: "15px",
              lineHeight: "1.6",
              marginBottom: "12px",
            }}
          >
            {data.primaryMessage}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontSize: "14px",
              opacity: 0.95,
            }}
          >
            <div>
              ├─ Con {data.primaryMetrics.ordersNeeded}{" "}
              {data.primaryMetrics.ordersNeeded === 1
                ? "ordine medio"
                : "ordini medi"}{" "}
              da {maskValue(data.primaryMetrics.averageOrderValue, "money")} ci
              sei!
            </div>
          </div>
        </div>

        {/* Secondary Goal */}
        {data.secondaryGoal && data.secondaryMessage && (
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(10px)",
              borderRadius: "12px",
              padding: "18px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "10px",
              }}
            >
              <span style={{ fontSize: "24px" }}>
                {GOAL_ICONS[data.secondaryGoal]}
              </span>
              <div style={{ fontSize: "15px", fontWeight: "600", flex: 1 }}>
                {GOAL_LABELS[data.secondaryGoal]}
              </div>
            </div>

            <div
              style={{
                fontSize: "14px",
                lineHeight: "1.6",
              }}
            >
              {data.secondaryMessage}
              {data.secondaryMetrics?.roi && (
                <span style={{ fontWeight: "700", color: "#ffeaa7" }}>
                  {" "}
                  • ROI: {data.secondaryMetrics.roi}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* Strategic Suggestions */}
        {data.strategySuggestions.length > 0 && (
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(10px)",
              borderRadius: "12px",
              padding: "18px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                fontSize: "15px",
                fontWeight: "600",
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "20px" }}>📊</span>
              Strategia Ottimale
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                fontSize: "14px",
              }}
            >
              {data.strategySuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                  }}
                >
                  <span>•</span>
                  <span>{suggestion}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comparison with last month */}
        {data.comparisonLastMonth && (
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.08)",
              borderRadius: "10px",
              padding: "14px 18px",
              fontSize: "13px",
              opacity: 0.9,
            }}
          >
            <div style={{ marginBottom: "4px" }}>
              📅 {data.comparisonLastMonth.situation}
            </div>
            <div style={{ fontWeight: "600", color: "#ffeaa7" }}>
              ✓ {data.comparisonLastMonth.outcome}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
