import { BonusRoadmapData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";

/**
 * Bonus Roadmap Widget - Timeline Progressiva
 * Shows progressive bonus steps with completion status
 * PRD: Section 5.3
 * Displays only 4 steps at a time, highlighting the next one
 */

interface BonusRoadmapWidgetProps {
  data: BonusRoadmapData;
}

const STATUS_ICONS = {
  completed: "✅",
  active: "➡️",
  locked: "🎯",
};

export function BonusRoadmapWidget({ data }: BonusRoadmapWidgetProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  // Show only 4 steps at a time
  const visibleSteps = data.steps.slice(0, 4);

  return (
    <div className="bonus-roadmap-widget">
      <h3 className="widget-title">Bonus Progressivo</h3>

      {/* Timeline */}
      <div
        className={`bonus-roadmap-timeline ${privacyEnabled ? "privacy-blur" : ""}`}
      >
        {visibleSteps.map((step, index) => (
          <div key={index} className={`bonus-step bonus-step-${step.status}`}>
            <div className="bonus-step-icon">{STATUS_ICONS[step.status]}</div>
            <div className="bonus-step-content">
              <div className="bonus-step-threshold">
                {maskValue(step.threshold, "money")}
              </div>
              <div className="bonus-step-bonus">
                {maskValue(step.bonusAmount, "money")}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Progress message */}
      <div className="bonus-roadmap-message">
        Mancano <strong>{maskValue(data.missingToNextBonus, "money")}</strong>{" "}
        al prossimo bonus da{" "}
        <strong>{maskValue(data.nextBonusAmount, "money")}</strong>
      </div>
    </div>
  );
}
