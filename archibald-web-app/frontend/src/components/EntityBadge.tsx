interface EntityBadgeProps {
  type: "customer" | "article" | "quantity" | "price";
  value: string;
  confidence?: number;
  onClick?: () => void;
}

export function EntityBadge({
  type,
  value,
  confidence,
  onClick,
}: EntityBadgeProps) {
  const percentage = confidence !== undefined ? Math.round(confidence * 100) : null;

  // Determine confidence class for visual indication
  const getConfidenceClass = (): string => {
    if (confidence === undefined) return "";
    if (confidence < 0.5) return "entity-low-confidence";
    return "";
  };

  // Build ARIA label
  const ariaLabel = confidence !== undefined
    ? `${type}: ${value} (confidence: ${percentage}%)`
    : `${type}: ${value}`;

  // Determine if clickable
  const isClickable = onClick !== undefined;

  return (
    <span
      className={`entity-badge entity-${type} ${getConfidenceClass()} ${isClickable ? "entity-clickable" : ""}`}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={ariaLabel}
      title={confidence !== undefined ? `Confidence: ${percentage}%` : undefined}
    >
      {value}
      {confidence !== undefined && confidence < 0.7 && (
        <span className="confidence-icon" title={`${percentage}% confidence`}>
          {confidence < 0.5 ? "⚠️" : "ℹ️"}
        </span>
      )}
    </span>
  );
}
