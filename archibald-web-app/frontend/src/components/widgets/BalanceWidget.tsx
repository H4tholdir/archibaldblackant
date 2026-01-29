import { BalanceData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * Balance Widget - Anticipi vs Maturato
 * Shows commission balance: matured vs advance payments
 * PRD: Section 5.6
 * Formula: balance = totalCommissionsMatured - totalAdvancePaid
 * Tooltip OBBLIGATORIO: "Gli anticipi sono un acconto sulle provvigioni future"
 */

interface BalanceWidgetProps {
  data: BalanceData;
}

export function BalanceWidget({ data }: BalanceWidgetProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  const isPositive = data.balanceStatus === "positive";
  const balanceColor = isPositive ? "#27ae60" : "#e74c3c";

  return (
    <div className="balance-widget">
      <h3 className="widget-title">Anticipi vs Provvigioni</h3>

      <div className={`balance-values ${privacyEnabled ? "privacy-blur" : ""}`}>
        {/* Provvigioni maturate */}
        <div className="balance-item balance-item-positive">
          <span className="balance-label">Provvigioni maturate:</span>
          <span className="balance-value">
            {maskValue(data.totalCommissionsMatured, "money")}
          </span>
        </div>

        {/* Anticipi ricevuti */}
        <div className="balance-item balance-item-negative">
          <span className="balance-label">Anticipi ricevuti:</span>
          <span className="balance-value">
            -{maskValue(data.totalAdvancePaid, "money")}
          </span>
        </div>

        {/* Divider */}
        <div className="balance-divider"></div>

        {/* Saldo attuale */}
        <div className="balance-item balance-item-total">
          <span className="balance-label">Saldo attuale:</span>
          <span
            className="balance-value balance-value-total"
            style={{ color: balanceColor }}
          >
            {maskValue(data.balance, "money")} {isPositive ? "🟢" : "🔴"}
          </span>
        </div>
      </div>

      {/* Tooltip OBBLIGATORIO dal PRD */}
      <div className="balance-footer">
        <small>(gli anticipi sono un acconto sulle provvigioni future)</small>
      </div>
    </div>
  );
}
