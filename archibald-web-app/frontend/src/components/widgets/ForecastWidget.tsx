import { ForecastData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * Forecast Widget - Proiezioni Fine Mese
 * Shows projected revenue, commissions and bonuses
 * PRD: Section 5.4
 * Formula: projectedMonthRevenue = currentMonthRevenue + (averageDailyRevenue * workingDaysRemaining)
 */

interface ForecastWidgetProps {
  data: ForecastData;
}

export function ForecastWidget({ data }: ForecastWidgetProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  return (
    <div className="forecast-widget">
      <h3 className="widget-title">Previsione Fine Mese</h3>

      {/* Copy obbligatoria dal PRD */}
      <p className="forecast-intro">Con questo ritmo chiuderai a:</p>

      {/* Forecast values */}
      <div
        className={`forecast-values ${privacyEnabled ? "privacy-blur" : ""}`}
      >
        <div className="forecast-item">
          <span className="forecast-label">Fatturato previsto:</span>
          <span className="forecast-value">
            {maskValue(data.projectedMonthRevenue, "money")}
          </span>
        </div>

        <div className="forecast-item">
          <span className="forecast-label">Provvigioni previste:</span>
          <span className="forecast-value forecast-value-highlight">
            {maskValue(data.projectedCommissions, "money")}
          </span>
        </div>

        <div className="forecast-item">
          <span className="forecast-label">Bonus stimati:</span>
          <span className="forecast-value forecast-value-success">
            +{maskValue(data.estimatedBonuses, "money")}
          </span>
        </div>
      </div>

      {/* Additional info */}
      <div className="forecast-footer">
        <small>
          Basato su media giornaliera di{" "}
          {maskValue(data.averageDailyRevenue, "money")} •{" "}
          {data.workingDaysRemaining} giorni lavorativi rimanenti
        </small>
      </div>
    </div>
  );
}
