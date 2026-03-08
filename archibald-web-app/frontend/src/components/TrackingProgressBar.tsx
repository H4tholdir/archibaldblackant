import type { Order } from "../types/order";

export type ScanEvent = {
  date: string;
  time: string;
  gmtOffset: string;
  status: string;
  statusCD: string;
  scanLocation: string;
  delivered: boolean;
  exception: boolean;
  exceptionDescription?: string;
};

export type TrackingInfo = {
  icon: string;
  label: string;
  location: string;
  dateTime: string;
  rightInfo: string;
  exceptionReason: string;
  dotsCompleted: number;
  dayCount: number;
  delivered: boolean;
  origin: string;
  destination: string;
};

const ITALIAN_MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(d, 10)} ${ITALIAN_MONTHS[parseInt(m, 10) - 1]}`;
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

const STEP_ICONS = ["\u{1F4E6}", "\u{1F69A}", "\u{1F69A}", "\u{1F69B}", "\u2705"];
const STEP_LABELS = ["Ritirato", "In viaggio", "Hub locale", "In consegna", "Consegnato"];

export function getTrackingInfo(order: Order): TrackingInfo {
  const events = (order.trackingEvents || []) as ScanEvent[];
  const destCountry = (order.trackingDestination || "").split(", ").pop() || "IT";
  const origin = order.trackingOrigin || "";
  const destination = order.trackingDestination || "";

  if (events.length === 0) {
    return {
      icon: "", label: "", location: "", dateTime: "", rightInfo: "",
      exceptionReason: "", dotsCompleted: 0, dayCount: 0, delivered: false,
      origin, destination,
    };
  }

  const matchedEvents: Array<ScanEvent | undefined> = Array(5).fill(undefined);
  for (const event of events) {
    for (let step = 0; step < 5; step++) {
      if (!matchedEvents[step] && matchesStep(event, step, destCountry)) {
        matchedEvents[step] = event;
      }
    }
  }

  let highestCompleted = -1;
  for (let i = 4; i >= 0; i--) {
    if (matchedEvents[i]) { highestCompleted = i; break; }
  }

  const dotsCompleted = highestCompleted + 1;
  const activeEvent = highestCompleted >= 0 ? matchedEvents[highestCompleted] : undefined;

  const icon = highestCompleted >= 0 ? STEP_ICONS[highestCompleted] : "";
  const label = highestCompleted >= 0 ? STEP_LABELS[highestCompleted] : "";
  const location = activeEvent ? activeEvent.scanLocation : "";
  const dateTime = activeEvent ? `${formatShortDate(activeEvent.date)} ${formatTime(activeEvent.time)}` : "";

  const isDelivered = highestCompleted === 4;
  const hasException = events.some((e) => e.exception);
  const exceptionEvent = events.find((e) => e.exception);

  let rightInfo = "";
  if (isDelivered && order.deliverySignedBy) {
    rightInfo = `Firmato: ${order.deliverySignedBy}`;
  } else if (hasException) {
    rightInfo = "";
  } else if (highestCompleted === 3) {
    rightInfo = "arr. oggi";
  } else if (order.trackingEstimatedDelivery) {
    rightInfo = `arr. ~${formatShortDate(order.trackingEstimatedDelivery)}`;
  }

  const exceptionReason = exceptionEvent?.exceptionDescription || exceptionEvent?.status || "";

  const firstDate = events[events.length - 1].date;
  const lastEvent = events[0];
  const endDate = lastEvent.delivered ? lastEvent.date : new Date().toISOString().slice(0, 10);
  const start = new Date(firstDate);
  const end = new Date(endDate);
  const dayCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1);

  return {
    icon, label, location, dateTime, rightInfo, exceptionReason,
    dotsCompleted, dayCount, delivered: isDelivered, origin, destination,
  };
}

export function TrackingDotBar({ order, borderColor }: { order: Order; borderColor: string }) {
  const info = getTrackingInfo(order);
  if (info.dotsCompleted === 0 && !info.location) return null;

  return (
    <div style={{ maxWidth: "92%", margin: "0 auto", padding: "6px 0 2px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
        <span style={{ fontSize: "12px", color: "#555" }}>
          {info.icon} {info.label} {"\u2022"} {info.location} {"\u2022"} {info.dateTime}
        </span>
        <span style={{ fontSize: "11px", color: "#999", textAlign: "right", flexShrink: 0, marginLeft: "8px" }}>
          {info.rightInfo}
        </span>
      </div>

      {info.exceptionReason && (
        <div style={{ fontSize: "11px", color: "#e65100", fontWeight: 600, marginBottom: "4px" }}>
          {info.exceptionReason}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < 4 ? 1 : undefined }}>
            <div style={{
              width: "10px", height: "10px", borderRadius: "50%",
              backgroundColor: i < info.dotsCompleted ? borderColor : "#fff",
              border: i < info.dotsCompleted ? `2px solid ${borderColor}` : "2px solid #e0e0e0",
              boxShadow: i === info.dotsCompleted - 1 ? `0 0 0 3px ${borderColor}33` : undefined,
              flexShrink: 0,
            }} />
            {i < 4 && (
              <div style={{
                flex: 1, height: "2px",
                backgroundColor: i < info.dotsCompleted - 1 ? borderColor : "#e0e0e0",
              }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
        <span style={{ fontSize: "10px", color: "#999" }}>
          {info.origin} {"\u2192"} {info.destination}
        </span>
        <span style={{ fontSize: "10px", color: "#999" }}>
          {info.delivered ? `consegnato in ${info.dayCount} giorni` : `${info.dayCount}\u00B0 giorno`}
        </span>
      </div>
    </div>
  );
}
