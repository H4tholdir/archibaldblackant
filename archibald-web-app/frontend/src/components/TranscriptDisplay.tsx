import { EntityBadge } from "./EntityBadge";
import { highlightEntities } from "../utils/orderParser";
import type { ParsedOrderWithConfidence } from "../utils/orderParser";

interface TranscriptDisplayProps {
  transcript: string;
  parsedOrder: ParsedOrderWithConfidence;
  isFinal: boolean;
}

export function TranscriptDisplay({
  transcript,
  parsedOrder,
  isFinal,
}: TranscriptDisplayProps) {
  const segments = highlightEntities(transcript, parsedOrder);

  return (
    <div
      className={`transcript-display ${isFinal ? "" : "transcript-interim"}`}
      aria-live="polite"
      role="status"
    >
      {segments.map((segment, index) =>
        segment.entity ? (
          <EntityBadge
            key={index}
            type={segment.entity.type}
            value={segment.text}
            confidence={segment.entity.confidence}
          />
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </div>
  );
}
