import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ScanEvent, TrackingInfo } from "./TrackingProgressBar";
import { getTrackingInfo, TrackingDotBar } from "./TrackingProgressBar";
import type { Order } from "../types/order";

function makeScanEvent(overrides: Partial<ScanEvent> = {}): ScanEvent {
  return {
    date: "2026-03-05",
    time: "10:30:00",
    gmtOffset: "+01:00",
    status: "Picked up",
    statusCD: "PU",
    scanLocation: "VERONA IT",
    delivered: false,
    exception: false,
    exceptionCode: "",
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "test-1",
    date: "2026-03-03",
    customerName: "Test Customer",
    grossAmount: "100,00 \u20AC",
    trackingOrigin: "VERONA, IT",
    trackingDestination: "NAPOLI, IT",
    ...overrides,
  } as Order;
}

describe("getTrackingInfo", () => {
  test("in-transit order returns correct icon, label, dotsCompleted=2, rightInfo with ETA", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "IT", scanLocation: "FRANKFURT DE", date: "2026-03-04", time: "14:30:00", status: "In transit" }),
      makeScanEvent({ statusCD: "DP", scanLocation: "VERONA IT", date: "2026-03-03", time: "08:00:00", status: "Departed" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
    ];

    const order = makeOrder({
      trackingEvents: events,
      trackingEstimatedDelivery: "2026-03-07",
    });

    const info = getTrackingInfo(order);

    expect(info).toEqual<TrackingInfo>({
      icon: "\u{1F69A}",
      label: "In viaggio",
      location: "FRANKFURT DE",
      dateTime: "4 mar 14:30",
      rightInfo: "arr. ~7 mar",
      exceptionReason: "",
      dotsCompleted: 2,
      dayCount: expect.any(Number),
      delivered: false,
      origin: "VERONA, IT",
      destination: "NAPOLI, IT",
    });
  });

  test("delivered order returns dotsCompleted=5, signature, and day count", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "DL", scanLocation: "NAPOLI IT", date: "2026-03-06", time: "14:30:00", status: "Delivered", delivered: true }),
      makeScanEvent({ statusCD: "OD", scanLocation: "NAPOLI IT", date: "2026-03-06", time: "08:00:00", status: "On vehicle" }),
      makeScanEvent({ statusCD: "AR", scanLocation: "NAPOLI IT", date: "2026-03-05", time: "16:00:00", status: "Arrived" }),
      makeScanEvent({ statusCD: "IT", scanLocation: "FRANKFURT DE", date: "2026-03-04", time: "10:00:00", status: "In transit" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
    ];

    const order = makeOrder({
      trackingEvents: events,
      deliverySignedBy: "M.ROSSI",
    });

    const info = getTrackingInfo(order);

    expect(info).toEqual<TrackingInfo>({
      icon: "\u2705",
      label: "Consegnato",
      location: "NAPOLI IT",
      dateTime: "6 mar 14:30",
      rightInfo: "Firmato: M.ROSSI",
      exceptionReason: "",
      dotsCompleted: 5,
      dayCount: 4,
      delivered: true,
      origin: "VERONA, IT",
      destination: "NAPOLI, IT",
    });
  });

  test("exception order returns exceptionReason from scan events", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "SE", scanLocation: "NAPOLI IT", date: "2026-03-05", time: "09:00:00", status: "Customer not available", exception: true }),
      makeScanEvent({ statusCD: "OD", scanLocation: "NAPOLI IT", date: "2026-03-05", time: "07:00:00", status: "On vehicle" }),
      makeScanEvent({ statusCD: "AR", scanLocation: "NAPOLI IT", date: "2026-03-04", time: "16:00:00", status: "Arrived" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
    ];

    const order = makeOrder({
      trackingEvents: events,
      trackingDestination: "NAPOLI, IT",
    });

    const info = getTrackingInfo(order);

    expect(info.exceptionReason).toEqual("Customer not available");
    expect(info.dotsCompleted).toEqual(4);
  });

  test("empty events returns dotsCompleted=0", () => {
    const order = makeOrder({ trackingEvents: [] });

    const info = getTrackingInfo(order);

    expect(info).toEqual<TrackingInfo>({
      icon: "",
      label: "",
      location: "",
      dateTime: "",
      rightInfo: "",
      exceptionReason: "",
      dotsCompleted: 0,
      dayCount: 0,
      delivered: false,
      origin: "VERONA, IT",
      destination: "NAPOLI, IT",
    });
  });

  test("OD step returns 'arr. oggi' as rightInfo", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "OD", scanLocation: "NAPOLI IT", date: "2026-03-05", time: "07:00:00", status: "On vehicle" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
    ];

    const order = makeOrder({ trackingEvents: events });

    const info = getTrackingInfo(order);

    expect(info.rightInfo).toEqual("arr. oggi");
    expect(info.dotsCompleted).toEqual(4);
  });
});

describe("getTrackingInfo — held/returning/canceled states and exceptionCode", () => {
  test("status held → label contiene giacenza", () => {
    const events: ScanEvent[] = [
      makeScanEvent({
        date: "2026-03-26",
        time: "09:00:00",
        gmtOffset: "",
        status: "Held at location",
        statusCD: "HL",
        scanLocation: "NAPOLI, IT",
        delivered: false,
        exception: false,
        exceptionCode: "",
      }),
    ];
    const info = getTrackingInfo(makeOrder({ trackingStatus: "held", trackingEvents: events }));
    expect(info.label.toLowerCase()).toContain("giacenza");
  });

  test("status returning → label contiene ritorno", () => {
    const events: ScanEvent[] = [
      makeScanEvent({
        date: "2026-03-26",
        time: "10:00:00",
        gmtOffset: "",
        status: "Return in progress",
        statusCD: "RS",
        scanLocation: "MILANO, IT",
        delivered: false,
        exception: false,
        exceptionCode: "",
      }),
    ];
    const info = getTrackingInfo(makeOrder({ trackingStatus: "returning", trackingEvents: events }));
    expect(info.label.toLowerCase()).toContain("ritorno");
  });

  test("exceptionCode viene prefissato nella exceptionReason", () => {
    const exceptionCode = "DEX08";
    const exceptionDescription = "Recipient not in";
    const events: ScanEvent[] = [
      makeScanEvent({
        date: "2026-03-25",
        time: "10:14:00",
        gmtOffset: "",
        status: "Delivery exception",
        statusCD: "DE",
        scanLocation: "NAPOLI, IT",
        delivered: false,
        exception: true,
        exceptionCode,
        exceptionDescription,
      }),
    ];
    const info = getTrackingInfo(makeOrder({ trackingStatus: "exception", trackingEvents: events }));
    expect(info.exceptionReason).toContain(exceptionCode);
    expect(info.exceptionReason).toContain(exceptionDescription);
  });

  test("exceptionCode vuoto → mostra solo exceptionDescription", () => {
    const exceptionDescription = "Customer not available";
    const events: ScanEvent[] = [
      makeScanEvent({
        date: "2026-03-25",
        time: "10:14:00",
        gmtOffset: "",
        status: "Delivery exception",
        statusCD: "DE",
        scanLocation: "NAPOLI, IT",
        delivered: false,
        exception: true,
        exceptionCode: "",
        exceptionDescription,
      }),
    ];
    const info = getTrackingInfo(makeOrder({ trackingStatus: "exception", trackingEvents: events }));
    expect(info.exceptionReason).toBe(exceptionDescription);
  });
});

describe("TrackingDotBar", () => {
  test("renders info row, dots, and footer", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "IT", scanLocation: "FRANKFURT DE", date: "2026-03-04", time: "14:30:00", status: "In transit" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
    ];

    const order = makeOrder({
      trackingEvents: events,
      trackingEstimatedDelivery: "2026-03-07",
    });

    render(<TrackingDotBar order={order} borderColor="#4A90D9" />);

    expect(screen.getByText(/In viaggio/)).toBeDefined();
    expect(screen.getByText(/FRANKFURT DE/)).toBeDefined();
    expect(screen.getByText(/arr\. ~7 mar/)).toBeDefined();
    expect(screen.getByText(/VERONA, IT/)).toBeDefined();
    expect(screen.getByText(/NAPOLI, IT/)).toBeDefined();
    expect(screen.getByText(/giorno/)).toBeDefined();
  });

  test("returns null for empty events", () => {
    const order = makeOrder({ trackingEvents: [] });

    const { container } = render(<TrackingDotBar order={order} borderColor="#4A90D9" />);

    expect(container.innerHTML).toEqual("");
  });

  test("renders exception reason when present", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "SE", scanLocation: "NAPOLI IT", date: "2026-03-05", time: "09:00:00", status: "Customer not available", exception: true }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
    ];

    const order = makeOrder({ trackingEvents: events });

    render(<TrackingDotBar order={order} borderColor="#4A90D9" />);

    expect(screen.getByText("Customer not available")).toBeDefined();
  });

  test("renders delivered state with signature and day count", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "DL", scanLocation: "NAPOLI IT", date: "2026-03-06", time: "14:30:00", status: "Delivered", delivered: true }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
    ];

    const order = makeOrder({
      trackingEvents: events,
      deliverySignedBy: "M.ROSSI",
    });

    render(<TrackingDotBar order={order} borderColor="#4A90D9" />);

    expect(screen.getByText(/Firmato: M\.ROSSI/)).toBeDefined();
    expect(screen.getByText("consegnato in 4 giorni")).toBeDefined();
  });
});
