import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { groupEventsByDay, TrackingTimeline } from "./TrackingTimeline";
import type { ScanEvent } from "./TrackingProgressBar";
import type { Order } from "../types/order";

describe("groupEventsByDay", () => {
  test("groups events across two days with correct labels and isLatest", () => {
    const events: ScanEvent[] = [
      { date: "2026-03-07", time: "14:30:00", gmtOffset: "+01:00", status: "In consegna", statusCD: "OD", scanLocation: "Milano, IT", delivered: false, exception: false },
      { date: "2026-03-07", time: "10:15:00", gmtOffset: "+01:00", status: "Hub locale", statusCD: "AR", scanLocation: "Milano Hub, IT", delivered: false, exception: false },
      { date: "2026-03-07", time: "06:00:00", gmtOffset: "+01:00", status: "In transito", statusCD: "IT", scanLocation: "Bologna, IT", delivered: false, exception: false },
      { date: "2026-03-06", time: "22:00:00", gmtOffset: "+01:00", status: "Partito", statusCD: "DP", scanLocation: "Roma, IT", delivered: false, exception: false },
      { date: "2026-03-06", time: "18:30:00", gmtOffset: "+01:00", status: "Ritirato", statusCD: "PU", scanLocation: "Roma, IT", delivered: false, exception: false },
      { date: "2026-03-06", time: "15:00:00", gmtOffset: "+01:00", status: "Etichetta creata", statusCD: "OC", scanLocation: "Roma, IT", delivered: false, exception: false },
      { date: "2026-03-06", time: "12:00:00", gmtOffset: "+01:00", status: "Info ricevute", statusCD: "OC", scanLocation: "Roma, IT", delivered: false, exception: false },
      { date: "2026-03-06", time: "09:00:00", gmtOffset: "+01:00", status: "Ordine creato", statusCD: "OC", scanLocation: "Roma, IT", delivered: false, exception: false },
    ];

    const result = groupEventsByDay(events);

    expect(result).toEqual([
      {
        dayLabel: "Sabato, 7 mar 2026",
        events: [
          { time: "14:30", status: "In consegna", location: "Milano, IT", isLatest: true, exceptionDescription: "" },
          { time: "10:15", status: "Hub locale", location: "Milano Hub, IT", isLatest: false, exceptionDescription: "" },
          { time: "06:00", status: "In transito", location: "Bologna, IT", isLatest: false, exceptionDescription: "" },
        ],
      },
      {
        dayLabel: "Venerdi, 6 mar 2026",
        events: [
          { time: "22:00", status: "Partito", location: "Roma, IT", isLatest: false, exceptionDescription: "" },
          { time: "18:30", status: "Ritirato", location: "Roma, IT", isLatest: false, exceptionDescription: "" },
          { time: "15:00", status: "Etichetta creata", location: "Roma, IT", isLatest: false, exceptionDescription: "" },
          { time: "12:00", status: "Info ricevute", location: "Roma, IT", isLatest: false, exceptionDescription: "" },
          { time: "09:00", status: "Ordine creato", location: "Roma, IT", isLatest: false, exceptionDescription: "" },
        ],
      },
    ]);
  });

  test("single event returns one group with isLatest true", () => {
    const events: ScanEvent[] = [
      { date: "2026-03-07", time: "08:00:00", gmtOffset: "+01:00", status: "Ritirato", statusCD: "PU", scanLocation: "Napoli, IT", delivered: false, exception: false },
    ];

    const result = groupEventsByDay(events);

    expect(result).toEqual([
      {
        dayLabel: "Sabato, 7 mar 2026",
        events: [
          { time: "08:00", status: "Ritirato", location: "Napoli, IT", isLatest: true, exceptionDescription: "" },
        ],
      },
    ]);
  });

  test("empty array returns empty array", () => {
    expect(groupEventsByDay([])).toEqual([]);
  });
});

describe("TrackingTimeline", () => {
  const baseOrder: Order = {
    id: "test-order-1",
    customerName: "Test Customer",
    date: "2026-03-07",
    total: "1.000,00",
    status: "Confermato",
  };

  test("renders estimated delivery and event descriptions", () => {
    const order: Order = {
      ...baseOrder,
      trackingEstimatedDelivery: "2026-03-10",
      trackingOrigin: "VERONA, IT",
      trackingDestination: "NAPOLI, IT",
      trackingEvents: [
        { date: "2026-03-07", time: "14:00:00", gmtOffset: "+01:00", status: "In transito verso destinazione", statusCD: "IT", scanLocation: "Bologna Hub, IT", delivered: false, exception: false },
        { date: "2026-03-06", time: "10:00:00", gmtOffset: "+01:00", status: "Spedizione ritirata", statusCD: "PU", scanLocation: "Verona, IT", delivered: false, exception: false },
      ],
    };

    render(<TrackingTimeline order={order} borderColor="#4caf50" />);

    expect(screen.getByText("Consegna prevista: 10 mar 2026")).toBeTruthy();
    expect(screen.getByText(/VERONA, IT/)).toBeTruthy();
    expect(screen.getByText(/NAPOLI, IT/)).toBeTruthy();
    expect(screen.getByText("In transito verso destinazione")).toBeTruthy();
    expect(screen.getByText("Spedizione ritirata")).toBeTruthy();
    expect(screen.getByText("Bologna Hub, IT")).toBeTruthy();
    expect(screen.getByText("Verona, IT")).toBeTruthy();
  });

  test("renders delivery confirmed with signed by", () => {
    const order: Order = {
      ...baseOrder,
      deliveryConfirmedAt: "2026-03-08T10:30:00Z",
      deliverySignedBy: "Mario Rossi",
      trackingEvents: [
        { date: "2026-03-08", time: "10:30:00", gmtOffset: "+01:00", status: "Consegnato", statusCD: "DL", scanLocation: "Napoli, IT", delivered: true, exception: false },
      ],
    };

    render(<TrackingTimeline order={order} borderColor="#4caf50" />);

    expect(screen.getByText(/Consegnato il/)).toBeTruthy();
    expect(screen.getByText("Firmato da: Mario Rossi")).toBeTruthy();
  });

  test("renders without crashing when optional fields are missing", () => {
    const order: Order = {
      ...baseOrder,
      trackingEvents: [],
    };

    const { container } = render(
      <TrackingTimeline order={order} borderColor="#999" />,
    );

    expect(container.firstChild).toBeTruthy();
  });

  test("translates English event descriptions to Italian", () => {
    const order: Order = {
      ...baseOrder,
      trackingEvents: [
        { date: "2026-03-07", time: "14:00:00", gmtOffset: "+01:00", status: "On the way", statusCD: "IT", scanLocation: "Bologna, IT", delivered: false, exception: false },
        { date: "2026-03-06", time: "10:00:00", gmtOffset: "+01:00", status: "Picked up", statusCD: "PU", scanLocation: "Verona, IT", delivered: false, exception: false },
      ],
    };
    render(<TrackingTimeline order={order} borderColor="#4caf50" />);
    expect(screen.getByText("In viaggio")).toBeTruthy();
    expect(screen.getByText("Ritirato")).toBeTruthy();
    expect(screen.queryByText("On the way")).toBeNull();
    expect(screen.queryByText("Picked up")).toBeNull();
  });

  test("renders FedEx tracking link when trackingUrl exists", () => {
    const order: Order = {
      ...baseOrder,
      tracking: {
        trackingNumber: "123456789",
        trackingUrl: "https://fedex.com/track/123456789",
      },
      trackingEvents: [
        { date: "2026-03-07", time: "08:00:00", gmtOffset: "+01:00", status: "Ritirato", statusCD: "PU", scanLocation: "Verona, IT", delivered: false, exception: false },
      ],
    };

    render(<TrackingTimeline order={order} borderColor="#1976d2" />);

    expect(screen.getByText("Apri tracking su FedEx")).toBeTruthy();
  });
});
