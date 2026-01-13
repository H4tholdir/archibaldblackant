interface VoicePopulatedBadgeProps {
  confidence?: number;
}

export function VoicePopulatedBadge({
  confidence = 0.8,
}: VoicePopulatedBadgeProps) {
  const confidencePercent = Math.round(confidence * 100);
  const isHighConfidence = confidence > 0.7;

  return (
    <span
      className={`voice-badge ${isHighConfidence ? "voice-badge-high" : "voice-badge-medium"}`}
      title={`Populated by voice input (${confidencePercent}% confidence)`}
    >
      🎤 {confidencePercent}%
    </span>
  );
}
