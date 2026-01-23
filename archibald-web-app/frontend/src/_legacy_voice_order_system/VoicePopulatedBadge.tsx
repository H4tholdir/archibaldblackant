interface VoicePopulatedBadgeProps {
  confidence?: number;
  onEdit?: () => void;
}

export function VoicePopulatedBadge({
  confidence = 0.8,
  onEdit,
}: VoicePopulatedBadgeProps) {
  const confidencePercent = Math.round(confidence * 100);
  const isHighConfidence = confidence > 0.7;

  return (
    <span className="voice-badge-container">
      <span
        className={`voice-badge ${isHighConfidence ? "voice-badge-high" : "voice-badge-medium"}`}
        title={`Populated by voice input (${confidencePercent}% confidence)`}
      >
        🎤 {confidencePercent}%
      </span>
      {onEdit && (
        <button
          type="button"
          className="voice-badge-edit"
          onClick={onEdit}
          aria-label="Edit field"
          title="Edit this field"
        >
          ✏️
        </button>
      )}
    </span>
  );
}
