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
};

export type StripInfo = {
  icon: string;
  label: string;
  location: string;
  dateTime: string;
  rightInfo: string;
  dayLabel: string;
  progressPercent: number;
};

const ITALIAN_MONTHS = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];

function formatItalianDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const day = parseInt(parts[2], 10);
  const monthIndex = parseInt(parts[1], 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return dateStr;
  return `${day} ${ITALIAN_MONTHS[monthIndex]}`;
}

function formatTime(time: string): string {
  const parts = time.split(":");
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return time;
}

function getStepIndex(
  event: ScanEvent,
  destinationCountryCode: string,
): number {
  if (event.delivered || event.statusCD === "DL") return 4;
  if (event.statusCD === "OD") return 3;
  if (event.statusCD === "AR" && event.scanLocation.endsWith(` ${destinationCountryCode}`)) return 2;
  if (event.statusCD === "DP" || event.statusCD === "IT" || event.statusCD === "AR") return 1;
  if (event.statusCD === "PU") return 0;
  if (event.exception || event.statusCD === "DE") return -1;
  return -2;
}

const STEP_PERCENT: Record<number, number> = {
  0: 10,
  1: 40,
  2: 65,
  3: 85,
  4: 100,
};

const STEP_ICONS: Record<number, string> = {
  [-1]: "\u26A0\uFE0F",
  0: "\uD83D\uDCE6",
  1: "\uD83D\uDE9A",
  2: "\uD83D\uDE9A",
  3: "\uD83D\uDE9B",
  4: "\u2705",
};

const STEP_LABELS: Record<number, string> = {
  [-1]: "Eccezione",
  0: "Ritirato",
  1: "In viaggio",
  2: "Hub locale",
  3: "In consegna",
  4: "Consegnato",
};

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function computeDayLabel(
  events: ScanEvent[],
  highestStep: number,
  deliveredEvent: ScanEvent | undefined,
  today: Date,
): string {
  if (events.length === 0) return "";
  const firstDate = events[events.length - 1].date;
  if (highestStep === 4 && deliveredEvent) {
    const days = daysBetween(firstDate, deliveredEvent.date);
    return `consegnato in ${days + 1} giorni`;
  }
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const days = daysBetween(firstDate, todayStr);
  return `${days + 1}\u00B0 giorno`;
}

export function getStripInfo(order: Order, today?: Date): StripInfo {
  const events = order.trackingEvents;
  if (!events || events.length === 0) {
    return {
      icon: "",
      label: "",
      location: "",
      dateTime: "",
      rightInfo: "",
      dayLabel: "",
      progressPercent: 0,
    };
  }

  const destCountry = (order.trackingDestination || "").split(", ").pop() || "IT";
  const now = today ?? new Date();

  let highestStep = -2;
  let activeEvent: ScanEvent | undefined;
  let exceptionEvent: ScanEvent | undefined;
  let deliveredEvent: ScanEvent | undefined;

  for (const event of events) {
    if (event.exception || event.statusCD === "DE") {
      if (!exceptionEvent) exceptionEvent = event;
    }
    const step = getStepIndex(event, destCountry);
    if (step > highestStep) {
      highestStep = step;
      activeEvent = event;
    }
    if (step === 4) deliveredEvent = event;
  }

  if (exceptionEvent && highestStep < 4) {
    const prevPercent = highestStep >= 0 ? STEP_PERCENT[highestStep] : 0;
    const ev = exceptionEvent;
    return {
      icon: STEP_ICONS[-1],
      label: STEP_LABELS[-1],
      location: ev.scanLocation,
      dateTime: `${formatItalianDate(ev.date)} ${formatTime(ev.time)}`,
      rightInfo: ev.status,
      dayLabel: computeDayLabel(events, highestStep, undefined, now),
      progressPercent: prevPercent,
    };
  }

  if (!activeEvent || highestStep < 0) {
    return {
      icon: "",
      label: "",
      location: "",
      dateTime: "",
      rightInfo: "",
      dayLabel: "",
      progressPercent: 0,
    };
  }

  const percent = STEP_PERCENT[highestStep];
  const location = activeEvent.scanLocation;
  const showTime = highestStep > 0;
  const dateTime = showTime
    ? `${formatItalianDate(activeEvent.date)} ${formatTime(activeEvent.time)}`
    : formatItalianDate(activeEvent.date);

  let rightInfo = "";
  if (highestStep === 4) {
    rightInfo = order.deliverySignedBy
      ? `Firmato: ${order.deliverySignedBy}`
      : "";
  } else if (highestStep === 3) {
    rightInfo = "arr. oggi";
  } else {
    const eta = order.trackingEstimatedDelivery;
    if (eta) {
      rightInfo = `arr. ~${formatItalianDate(eta)}`;
    }
  }

  const dayLabel = computeDayLabel(events, highestStep, deliveredEvent, now);

  return {
    icon: STEP_ICONS[highestStep],
    label: STEP_LABELS[highestStep],
    location,
    dateTime,
    rightInfo,
    dayLabel,
    progressPercent: percent,
  };
}

export function TrackingStrip({
  order,
  borderColor,
}: {
  order: Order;
  borderColor: string;
}) {
  const info = getStripInfo(order);

  if (!info.label) return null;

  const origin = order.trackingOrigin || "";
  const destination = order.trackingDestination || "";

  return (
    <div
      style={{
        borderRadius: "8px",
        background: "#f8f9fa",
        padding: "8px 12px",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          marginBottom: "6px",
        }}
      >
        <span style={{ color: "#333" }}>
          {info.icon} {info.label} &bull; {info.location} &bull; {info.dateTime}
        </span>
        {info.rightInfo && (
          <span style={{ color: "#666", flexShrink: 0, marginLeft: "8px" }}>
            {info.rightInfo}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            flex: 1,
            height: "6px",
            borderRadius: "3px",
            background: "#e8e8e8",
            overflow: "hidden",
          }}
        >
          <div
            data-testid="progress-fill"
            style={{
              width: `${info.progressPercent}%`,
              height: "100%",
              borderRadius: "3px",
              backgroundColor: borderColor,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "#999",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span>{origin} → {destination}</span>
          {info.dayLabel && (
            <>
              <span style={{ color: "#ccc" }}>|</span>
              <span>{info.dayLabel}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
