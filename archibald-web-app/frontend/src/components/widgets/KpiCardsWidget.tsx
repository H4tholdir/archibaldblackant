import { KpiCardData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * KPI Cards Widget - 4 Fixed Cards
 * Shows primary dashboard metrics in card format
 * PRD: Section 5.2 - Fixed cards (NON modificabile)
 */

interface KpiCardsWidgetProps {
  cards: KpiCardData[];
}

export function KpiCardsWidget({ cards }: KpiCardsWidgetProps) {
  const { privacyEnabled } = usePrivacy();

  // Validate that we have exactly 4 cards
  if (cards.length !== 4) {
    console.warn(
      `KpiCardsWidget expects exactly 4 cards, received ${cards.length}`,
    );
  }

  return (
    <div className="kpi-cards-widget">
      <div className="kpi-cards-grid">
        {cards.map((card, index) => (
          <div key={index} className="kpi-card">
            <div className="kpi-card-content">
              {/* Label */}
              <div className="kpi-card-label">
                {card.icon && (
                  <span className="kpi-card-icon">{card.icon}</span>
                )}
                <span>{card.label}</span>
              </div>

              {/* Value */}
              <div
                className={`kpi-card-value ${privacyEnabled ? "privacy-blur" : ""}`}
              >
                {card.value}
              </div>

              {/* Tooltip (if present) */}
              {card.tooltip && (
                <div className="kpi-card-tooltip" title={card.tooltip}>
                  ℹ️
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
