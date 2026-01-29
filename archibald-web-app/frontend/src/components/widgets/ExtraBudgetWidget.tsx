import { ExtraBudgetData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * Extra-Budget Widget - Premi oltre target
 * Visible only when annual target is exceeded
 * PRD: Section 5.7
 * Visibility: visible = currentYearRevenue > annualTarget
 * Formula: extraRevenue = currentYearRevenue - annualTarget
 *          extraBonuses = floor(extraRevenue / extraBudgetStep)
 */

interface ExtraBudgetWidgetProps {
  data: ExtraBudgetData;
}

export function ExtraBudgetWidget({ data }: ExtraBudgetWidgetProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  // Don't render if not visible
  if (!data.visible) {
    return null;
  }

  return (
    <div className="extra-budget-widget">
      <h3 className="widget-title">Extra Budget (oltre target) 🎉</h3>

      <div
        className={`extra-budget-content ${privacyEnabled ? "privacy-blur" : ""}`}
      >
        <div className="extra-budget-item">
          <span className="extra-budget-label">Extra fatturato:</span>
          <span className="extra-budget-value">
            {maskValue(data.extraRevenue, "money")}
          </span>
        </div>

        <div className="extra-budget-item">
          <span className="extra-budget-label">Premi extra maturati:</span>
          <span className="extra-budget-value extra-budget-value-highlight">
            {maskValue(data.extraBonusesAmount, "money")}
          </span>
        </div>

        <div className="extra-budget-item">
          <span className="extra-budget-label">Prossimo step:</span>
          <span className="extra-budget-value">
            +{maskValue(data.nextStep, "money")}
          </span>
        </div>
      </div>

      <div className="extra-budget-footer">
        <small>
          Mancano {maskValue(data.missingToNextStep, "money")} al prossimo
          scaglione
        </small>
      </div>
    </div>
  );
}
