export interface StatusUpdate {
  status: string;
  timestamp: string; // ISO 8601
  note?: string;
}

export interface StateHistoryEntry {
  state: string;
  changedAt: string; // ISO 8601
  notes?: string;
}

interface OrderTimelineProps {
  updates?: StatusUpdate[];
  stateHistory?: StateHistoryEntry[];
  currentState?: string;
}

// Italian state labels mapping
const stateLabels: Record<string, string> = {
  creato: "Creato",
  piazzato: "Piazzato su Archibald",
  inviato_milano: "Inviato a Milano",
  modifica: "In modifica",
  trasferito: "Trasferito",
  transfer_error: "Errore trasferimento",
  ordine_aperto: "Ordine aperto",
  spedito: "Spedito",
  consegnato: "Consegnato",
  fatturato: "Fatturato",
};

function getStateLabel(state: string): string {
  return stateLabels[state] || state;
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    const months = [
      "gen",
      "feb",
      "mar",
      "apr",
      "mag",
      "giu",
      "lug",
      "ago",
      "set",
      "ott",
      "nov",
      "dic",
    ];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${day} ${month}, ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();
  if (statusLower.includes("evaso") || statusLower.includes("consegnato"))
    return "#4caf50"; // Green
  if (statusLower.includes("spedito")) return "#9c27b0"; // Purple
  if (
    statusLower.includes("lavorazione") ||
    statusLower.includes("ordine_aperto")
  )
    return "#2196f3"; // Blue
  if (
    statusLower.includes("creato") ||
    statusLower.includes("piazzato") ||
    statusLower.includes("inviato_milano")
  )
    return "#9e9e9e"; // Gray
  return "#9e9e9e"; // Gray default
}

function TimelineItem({
  update,
  isFirst,
  isLast,
}: {
  update: StatusUpdate;
  isFirst: boolean;
  isLast: boolean;
}) {
  const statusColor = getStatusColor(update.status);
  const dotSize = isFirst ? 16 : 12;

  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        paddingBottom: isLast ? "0" : "20px",
      }}
    >
      {/* Vertical line */}
      {!isLast && (
        <div
          style={{
            position: "absolute",
            left: `${dotSize / 2 - 1}px`,
            top: `${dotSize}px`,
            width: "2px",
            height: "calc(100% - 20px)",
            backgroundColor: "#e0e0e0",
          }}
        />
      )}

      {/* Status dot */}
      <div
        style={{
          width: `${dotSize}px`,
          height: `${dotSize}px`,
          borderRadius: "50%",
          backgroundColor: statusColor,
          flexShrink: 0,
          marginRight: "12px",
          zIndex: 1,
          boxShadow: isFirst ? "0 2px 4px rgba(0, 0, 0, 0.2)" : "none",
        }}
      />

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: isFirst ? 700 : 600,
            color: isFirst ? "#333" : "#666",
            marginBottom: "2px",
          }}
        >
          {update.status}
        </div>
        <div
          style={{
            fontSize: "12px",
            color: "#999",
            marginBottom: update.note ? "4px" : "0",
          }}
        >
          {formatTimestamp(update.timestamp)}
        </div>
        {update.note && (
          <div
            style={{
              fontSize: "13px",
              color: "#666",
              fontStyle: "italic",
              marginTop: "4px",
            }}
          >
            {update.note}
          </div>
        )}
      </div>
    </div>
  );
}

export function OrderTimeline({
  updates,
  stateHistory,
  currentState,
}: OrderTimelineProps) {
  // Convert stateHistory to StatusUpdate format if provided
  let sortedUpdates: StatusUpdate[];

  if (stateHistory && stateHistory.length > 0) {
    // New format: StateHistoryEntry[] from 11-04 API
    sortedUpdates = stateHistory.map((entry) => ({
      status: getStateLabel(entry.state),
      timestamp: entry.changedAt,
      note: entry.notes,
    }));

    // Sort by timestamp descending (newest first)
    sortedUpdates.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  } else if (updates && updates.length > 0) {
    // Legacy format: StatusUpdate[]
    sortedUpdates = [...updates].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  } else {
    // No updates available
    return null;
  }

  // If no updates, return null
  if (sortedUpdates.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        padding: "12px",
        backgroundColor: "#fafafa",
        borderRadius: "8px",
      }}
    >
      {sortedUpdates.map((update, index) => (
        <TimelineItem
          key={`${update.timestamp}-${index}`}
          update={update}
          isFirst={index === 0}
          isLast={index === sortedUpdates.length - 1}
        />
      ))}
    </div>
  );
}
