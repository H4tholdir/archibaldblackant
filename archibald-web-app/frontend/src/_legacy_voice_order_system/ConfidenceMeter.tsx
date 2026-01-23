interface ConfidenceMeterProps {
  confidence: number;
  label?: string;
  showPercentage?: boolean;
}

export function ConfidenceMeter({
  confidence,
  label = "Confidence",
  showPercentage = true,
}: ConfidenceMeterProps) {
  const percentage = Math.round(confidence * 100);

  // Determine confidence level for color coding
  const getConfidenceClass = (): string => {
    if (confidence < 0.4) return "confidence-low";
    if (confidence < 0.7) return "confidence-medium";
    return "confidence-high";
  };

  return (
    <div className="confidence-meter">
      <div className="confidence-meter-header">
        {label && <span className="confidence-label">{label}</span>}
        {showPercentage && (
          <span className="confidence-percentage">{percentage}%</span>
        )}
      </div>
      <div
        className="confidence-bar"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`confidence-fill ${getConfidenceClass()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
