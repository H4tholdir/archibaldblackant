export type ScanEvent = {
  date: string;
  time: string;
  gmtOffset: string;
  status: string;
  statusCD: string;
  scanLocation: string;
  delivered: boolean;
  exception: boolean;
};

export type TrackingStep = {
  label: string;
  detail: string;
  date: string;
  completed: boolean;
  active: boolean;
};

const STEP_LABELS = ["Ritirato", "In viaggio", "Hub locale", "In consegna", "Consegnato"] as const;

const ITALIAN_MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function formatShortDate(dateStr: string): string {
  const [, monthStr, dayStr] = dateStr.split("-");
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  return `${day} ${ITALIAN_MONTHS[month]}`;
}

function formatTime(time: string): string {
  const parts = time.split(":");
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return time;
}

function matchesStep(event: ScanEvent, stepIndex: number, destinationCountryCode: string): boolean {
  switch (stepIndex) {
    case 0: return event.statusCD === "PU";
    case 1: return (event.statusCD === "DP" || event.statusCD === "IT" || event.statusCD === "AR") && !matchesStep(event, 2, destinationCountryCode);
    case 2: return event.statusCD === "AR" && event.scanLocation.endsWith(` ${destinationCountryCode}`);
    case 3: return event.statusCD === "OD";
    case 4: return event.delivered || event.statusCD === "DL";
    default: return false;
  }
}

export function getTrackingSteps(scanEvents: ScanEvent[], destinationCountryCode: string): TrackingStep[] {
  const matchedEvents: Array<ScanEvent | undefined> = Array(5).fill(undefined);
  for (const event of scanEvents) {
    for (let step = 0; step < 5; step++) {
      if (!matchedEvents[step] && matchesStep(event, step, destinationCountryCode)) {
        matchedEvents[step] = event;
      }
    }
  }
  let highestCompleted = -1;
  for (let i = 4; i >= 0; i--) {
    if (matchedEvents[i]) { highestCompleted = i; break; }
  }
  return STEP_LABELS.map((label, i) => {
    const event = matchedEvents[i];
    const completed = i <= highestCompleted;
    const active = i === highestCompleted;
    const detail = active && event ? `${event.scanLocation}, ${formatTime(event.time)}` : "";
    const date = event ? formatShortDate(event.date) : "";
    return { label, detail, date, completed, active };
  });
}

export function getDayCount(scanEvents: ScanEvent[]): number {
  if (scanEvents.length === 0) return 0;
  const firstDate = scanEvents[scanEvents.length - 1].date;
  const lastEvent = scanEvents[0];
  const endDate = lastEvent.delivered ? lastEvent.date : new Date().toISOString().slice(0, 10);
  const start = new Date(firstDate);
  const end = new Date(endDate);
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

export function TrackingProgressBar({
  steps, borderColor, origin, destination, dayCount, delivered,
}: {
  steps: TrackingStep[];
  borderColor: string;
  origin: string;
  destination: string;
  dayCount: number;
  delivered: boolean;
}) {
  const activeStep = steps.find((s) => s.active);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: "6px 0 2px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
        <span style={{ fontSize: "10px", color: "#999" }}>{origin}</span>
        <span style={{ fontSize: "10px", color: "#999" }}>{destination}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
        {steps.map((step, i) => (
          <div key={step.label} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{
              width: "12px", height: "12px", borderRadius: "50%",
              backgroundColor: step.completed ? borderColor : "#fff",
              border: step.completed ? `2px solid ${borderColor}` : "2px solid #e0e0e0",
              boxShadow: step.active ? `0 0 0 3px ${borderColor}33` : undefined,
              flexShrink: 0,
            }} />
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: "2px",
                backgroundColor: step.completed && steps[i + 1].completed ? borderColor : "#e0e0e0",
              }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", width: "100%", marginTop: "2px" }}>
        {steps.map((step, i) => (
          <div key={`date-${step.label}`} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
            <span style={{
              fontSize: "9px", color: step.active ? borderColor : "#aaa",
              fontWeight: step.active ? 600 : 400,
              width: "12px", textAlign: "center",
              whiteSpace: "nowrap",
              marginLeft: "-8px",
              marginRight: "-8px",
            }}>
              {step.completed ? step.date : ""}
            </span>
            {i < steps.length - 1 && <div style={{ flex: 1 }} />}
          </div>
        ))}
      </div>

      {activeStep && activeStep.detail && (
        <div style={{ fontSize: "11px", color: "#666", marginTop: "2px", textAlign: "center" }}>
          {activeStep.detail}
        </div>
      )}

      {dayCount > 0 && (
        <div style={{ fontSize: "10px", color: "#999", marginTop: "1px", textAlign: "right" }}>
          {delivered ? `consegnato in ${dayCount} giorni` : `${dayCount}° giorno`}
        </div>
      )}
    </div>
  );
}
