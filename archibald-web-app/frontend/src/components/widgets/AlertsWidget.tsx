import { AlertData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * Alerts Widget - Avvisi e Rischi
 * Shows alerts when performance is below threshold
 * PRD: Section 5.8
 * Visibility: visible = projectedMonthRevenue < monthlyTarget * 0.9
 * RULE: Mai più di un alert attivo contemporaneamente
 */

interface AlertsWidgetProps {
  data: AlertData;
}

export function AlertsWidget({ data }: AlertsWidgetProps) {
  const { privacyEnabled } = usePrivacy();

  // Don't render if not visible
  if (!data.visible) {
    return null;
  }

  const severityStyles = {
    warning: {
      background: "linear-gradient(135deg, #f39c12 0%, #f1c40f 100%)",
      icon: "⚠️",
    },
    critical: {
      background: "linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)",
      icon: "🚨",
    },
  };

  const style = severityStyles[data.severity];

  return (
    <div className="alerts-widget" style={{ background: style.background }}>
      <div className="alerts-content">
        <div className="alerts-icon">{style.icon}</div>
        <div
          className={`alerts-message ${privacyEnabled ? "privacy-blur" : ""}`}
        >
          {data.message}
        </div>
      </div>
    </div>
  );
}
