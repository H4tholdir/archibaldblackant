import type { Order } from "../types/order";
import type { ScanEvent } from "./TrackingProgressBar";

export type GroupedDay = {
  dayLabel: string;
  events: Array<{
    time: string;
    status: string;
    location: string;
    isLatest: boolean;
  }>;
};

const ITALIAN_DAYS = [
  "Domenica",
  "Lunedi",
  "Martedi",
  "Mercoledi",
  "Giovedi",
  "Venerdi",
  "Sabato",
];

const ITALIAN_MONTHS = [
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

function formatDayLabel(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  const d = new Date(year, month, day);
  const weekday = ITALIAN_DAYS[d.getDay()];
  const monthName = ITALIAN_MONTHS[month];
  return `${weekday}, ${day} ${monthName} ${year}`;
}

function formatTime(time: string): string {
  const parts = time.split(":");
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return time;
}

const EVENT_TRANSLATIONS: Record<string, string> = {
  "Picked up": "Ritirato",
  "Shipment information sent to FedEx": "Informazioni spedizione inviate a FedEx",
  "Left FedEx origin facility": "Partito dal centro FedEx di origine",
  "Departed FedEx hub": "Partito dall'hub FedEx",
  "Departed FedEx location": "Partito dal centro FedEx",
  "In transit": "In transito",
  "On the way": "In viaggio",
  "Arrived at FedEx hub": "Arrivato all'hub FedEx",
  "Arrived at FedEx location": "Arrivato al centro FedEx",
  "At local FedEx facility": "Presso centro FedEx locale",
  "Out for delivery": "In consegna",
  "On FedEx vehicle for delivery": "Sul veicolo FedEx per la consegna",
  "Delivered": "Consegnato",
  "Delivery exception": "Eccezione di consegna",
  "Shipment arriving On-Time": "Spedizione in arrivo nei tempi previsti",
  "Customer not available or business closed": "Destinatario non disponibile",
  "International shipment release - Import": "Sdoganamento completato",
  "Clearance in progress": "Sdoganamento in corso",
  "Package available for clearance": "Pacco in attesa di sdoganamento",
  "Clearance delay - Loss report": "Ritardo sdoganamento",
};

export function translateStatus(status: string): string {
  return EVENT_TRANSLATIONS[status] ?? status;
}

export function groupEventsByDay(scanEvents: ScanEvent[]): GroupedDay[] {
  if (scanEvents.length === 0) return [];

  const groupMap = new Map<string, ScanEvent[]>();

  for (const event of scanEvents) {
    const existing = groupMap.get(event.date);
    if (existing) {
      existing.push(event);
    } else {
      groupMap.set(event.date, [event]);
    }
  }

  const groups: GroupedDay[] = [];
  let isFirst = true;

  for (const [date, events] of groupMap) {
    groups.push({
      dayLabel: formatDayLabel(date),
      events: events.map((ev) => {
        const entry = {
          time: formatTime(ev.time),
          status: translateStatus(ev.status),
          location: ev.scanLocation,
          isLatest: isFirst,
        };
        isFirst = false;
        return entry;
      }),
    });
  }

  return groups;
}

function formatDeliveryDate(isoStr: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const day = d.getDate();
  const monthName = ITALIAN_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${monthName} ${year}`;
}

export function TrackingTimeline({
  order,
  borderColor,
}: {
  order: Order;
  borderColor: string;
}) {
  const events = order.trackingEvents ?? [];
  const groups = groupEventsByDay(events);
  const trackingUrl =
    order.tracking?.trackingUrl || order.ddt?.trackingUrl || undefined;

  return (
    <div
      style={{
        backgroundColor: "#fff",
        border: "1px solid #e8e8e8",
        borderRadius: "12px",
        padding: "16px",
        marginBottom: "16px",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        {order.deliveryConfirmedAt ? (
          <div>
            <div
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "#2e7d32",
              }}
            >
              Consegnato il {formatDeliveryDate(order.deliveryConfirmedAt)}
            </div>
            {order.deliverySignedBy && (
              <div style={{ fontSize: "13px", color: "#555", marginTop: "4px" }}>
                Firmato da: {order.deliverySignedBy}
              </div>
            )}
          </div>
        ) : order.trackingEstimatedDelivery ? (
          <div
            style={{
              fontSize: "15px",
              fontWeight: 700,
              color: "#333",
            }}
          >
            Consegna prevista: {formatDeliveryDate(order.trackingEstimatedDelivery)}
          </div>
        ) : null}

        {(order.trackingOrigin || order.trackingDestination) && (
          <div
            style={{
              fontSize: "12px",
              color: "#999",
              marginTop: "4px",
            }}
          >
            {order.trackingOrigin || "?"} {"->"} {order.trackingDestination || "?"}
          </div>
        )}
      </div>

      {/* Timeline */}
      {groups.map((group, gi) => (
        <div key={gi} style={{ marginBottom: gi < groups.length - 1 ? "16px" : "0" }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "#888",
              marginBottom: "8px",
            }}
          >
            {group.dayLabel}
          </div>
          {group.events.map((ev, ei) => (
            <div
              key={ei}
              style={{
                display: "flex",
                alignItems: "flex-start",
                minHeight: "32px",
              }}
            >
              {/* Time */}
              <div
                style={{
                  width: "50px",
                  flexShrink: 0,
                  fontSize: "13px",
                  fontFamily: "monospace",
                  color: "#666",
                  paddingTop: "2px",
                }}
              >
                {ev.time}
              </div>

              {/* Dot + Line */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: "20px",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: ev.isLatest ? borderColor : "transparent",
                    border: ev.isLatest
                      ? `2px solid ${borderColor}`
                      : "2px solid #ccc",
                    marginTop: "4px",
                    flexShrink: 0,
                  }}
                />
                {!(gi === groups.length - 1 && ei === group.events.length - 1) && (
                  <div
                    style={{
                      width: "2px",
                      flex: 1,
                      minHeight: "16px",
                      backgroundColor: "#e0e0e0",
                    }}
                  />
                )}
              </div>

              {/* Status + Location */}
              <div style={{ flex: 1, paddingLeft: "8px", paddingBottom: "8px" }}>
                <div
                  style={{
                    fontSize: "13px",
                    color: ev.isLatest ? "#333" : "#555",
                    fontWeight: ev.isLatest ? 600 : 400,
                  }}
                >
                  {ev.status}
                </div>
                {ev.location && (
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "2px" }}>
                    {ev.location}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Footer */}
      {trackingUrl && (
        <div style={{ marginTop: "12px", textAlign: "center" }}>
          <button
            onClick={() => window.open(trackingUrl, "_blank")}
            style={{
              padding: "8px 20px",
              backgroundColor: "transparent",
              color: "#1976d2",
              border: "1px solid #1976d2",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Apri tracking su FedEx
          </button>
        </div>
      )}
    </div>
  );
}
