import { ActionSuggestion } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * Action Suggestion Widget - Suggerimenti Operativi
 * Shows actionable suggestions to reach next bonus
 * PRD: Section 5.5
 * Logic: if (missingToNextBonus <= averageOrderValue) → suggest 1 order, else → suggest N orders
 */

interface ActionSuggestionWidgetProps {
  data: ActionSuggestion;
}

export function ActionSuggestionWidget({ data }: ActionSuggestionWidgetProps) {
  const { privacyEnabled } = usePrivacy();

  return (
    <div className="action-suggestion-widget">
      <h3 className="widget-title">Cosa conviene fare ora?</h3>

      <div
        className={`action-suggestion-content ${privacyEnabled ? "privacy-blur" : ""}`}
      >
        <div className="action-suggestion-icon">💡</div>
        <div className="action-suggestion-message">{data.message}</div>
      </div>
    </div>
  );
}
