import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Order } from "../types/order";
import type { ScanEvent, StripInfo } from "./TrackingProgressBar";
import { getStripInfo, TrackingStrip } from "./TrackingProgressBar";

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
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "test-1",
    customerName: "Test Customer",
    date: "2026-03-01",
    total: "1000",
    status: "confirmed",
    trackingStatus: "IN_TRANSIT",
    trackingOrigin: "VERONA IT",
    trackingDestination: "NAPOLI, IT",
    trackingEstimatedDelivery: "2026-03-08",
    trackingEvents: [
      makeScanEvent({ statusCD: "IT", scanLocation: "FRANKFURT DE", date: "2026-03-04", time: "14:30:00", status: "In transit" }),
      makeScanEvent({ statusCD: "DP", scanLocation: "VERONA IT", date: "2026-03-03", time: "08:00:00", status: "Departed" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
    ],
    ...overrides,
  };
}

const FIXED_TODAY = new Date("2026-03-07");

describe("getStripInfo", () => {
  test("in-transit order returns truck icon, In viaggio label, and ETA", () => {
    const order = makeOrder();
    const result = getStripInfo(order, FIXED_TODAY);

    expect(result).toEqual<StripInfo>({
      icon: "\uD83D\uDE9A",
      label: "In viaggio",
      location: "FRANKFURT DE",
      dateTime: "4 mar 14:30",
      rightInfo: "arr. ~8 mar",
      dayLabel: "5\u00B0 giorno",
      progressPercent: 40,
    });
  });

  test("delivered order returns checkmark, signature, and delivery day count", () => {
    const order = makeOrder({
      trackingEvents: [
        makeScanEvent({ statusCD: "DL", scanLocation: "NAPOLI IT", date: "2026-03-06", time: "14:30:00", status: "Delivered", delivered: true }),
        makeScanEvent({ statusCD: "OD", scanLocation: "NAPOLI IT", date: "2026-03-06", time: "08:00:00", status: "On vehicle" }),
        makeScanEvent({ statusCD: "AR", scanLocation: "NAPOLI IT", date: "2026-03-05", time: "16:00:00", status: "Arrived" }),
        makeScanEvent({ statusCD: "IT", scanLocation: "FRANKFURT DE", date: "2026-03-04", time: "10:00:00", status: "In transit" }),
        makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
      ],
      deliverySignedBy: "ROSSI",
    });

    const result = getStripInfo(order, FIXED_TODAY);

    expect(result).toEqual<StripInfo>({
      icon: "\u2705",
      label: "Consegnato",
      location: "NAPOLI IT",
      dateTime: "6 mar 14:30",
      rightInfo: "Firmato: ROSSI",
      dayLabel: "consegnato in 4 giorni",
      progressPercent: 100,
    });
  });

  test("pickup-only returns package icon, date without time, 1 giorno", () => {
    const order = makeOrder({
      trackingEvents: [
        makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-07", time: "07:15:00", status: "Picked up" }),
      ],
      trackingEstimatedDelivery: "2026-03-10",
    });

    const result = getStripInfo(order, FIXED_TODAY);

    expect(result).toEqual<StripInfo>({
      icon: "\uD83D\uDCE6",
      label: "Ritirato",
      location: "VERONA IT",
      dateTime: "7 mar",
      rightInfo: "arr. ~10 mar",
      dayLabel: "1\u00B0 giorno",
      progressPercent: 10,
    });
  });

  test("exception event returns warning icon and event status as rightInfo", () => {
    const order = makeOrder({
      trackingEvents: [
        makeScanEvent({ statusCD: "DE", scanLocation: "MILANO IT", date: "2026-03-05", time: "11:00:00", status: "Delivery exception", exception: true }),
        makeScanEvent({ statusCD: "IT", scanLocation: "FRANKFURT DE", date: "2026-03-04", time: "10:00:00", status: "In transit" }),
        makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
      ],
    });

    const result = getStripInfo(order, FIXED_TODAY);

    expect(result).toEqual<StripInfo>({
      icon: "\u26A0\uFE0F",
      label: "Eccezione",
      location: "MILANO IT",
      dateTime: "5 mar 11:00",
      rightInfo: "Delivery exception",
      dayLabel: "5\u00B0 giorno",
      progressPercent: 40,
    });
  });

  test("no events returns empty strip info", () => {
    const order = makeOrder({ trackingEvents: [] });
    const result = getStripInfo(order, FIXED_TODAY);

    expect(result).toEqual<StripInfo>({
      icon: "",
      label: "",
      location: "",
      dateTime: "",
      rightInfo: "",
      dayLabel: "",
      progressPercent: 0,
    });
  });

  test("out-for-delivery returns truck icon and arr. oggi", () => {
    const order = makeOrder({
      trackingEvents: [
        makeScanEvent({ statusCD: "OD", scanLocation: "NAPOLI IT", date: "2026-03-07", time: "08:00:00", status: "On vehicle" }),
        makeScanEvent({ statusCD: "AR", scanLocation: "NAPOLI IT", date: "2026-03-06", time: "16:00:00", status: "Arrived" }),
        makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
      ],
    });

    const result = getStripInfo(order, FIXED_TODAY);

    expect(result).toEqual<StripInfo>({
      icon: "\uD83D\uDE9B",
      label: "In consegna",
      location: "NAPOLI IT",
      dateTime: "7 mar 08:00",
      rightInfo: "arr. oggi",
      dayLabel: "5\u00B0 giorno",
      progressPercent: 85,
    });
  });

  test("hub locale when AR at destination country", () => {
    const order = makeOrder({
      trackingDestination: "PARIS, FR",
      trackingEvents: [
        makeScanEvent({ statusCD: "AR", scanLocation: "PARIS FR", date: "2026-03-05", time: "12:00:00", status: "Arrived" }),
        makeScanEvent({ statusCD: "IT", scanLocation: "FRANKFURT DE", date: "2026-03-04", time: "10:00:00", status: "In transit" }),
        makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
      ],
      trackingEstimatedDelivery: "2026-03-08",
    });

    const result = getStripInfo(order, FIXED_TODAY);

    expect(result).toEqual<StripInfo>({
      icon: "\uD83D\uDE9A",
      label: "Hub locale",
      location: "PARIS FR",
      dateTime: "5 mar 12:00",
      rightInfo: "arr. ~8 mar",
      dayLabel: "5\u00B0 giorno",
      progressPercent: 65,
    });
  });
});

describe("TrackingStrip", () => {
  test("renders icon, label, location, progress bar, and route info", () => {
    const order = makeOrder();

    const { container } = render(
      <TrackingStrip order={order} borderColor="#4A90D9" />,
    );

    expect(screen.getByText(/In viaggio/)).toBeDefined();
    expect(screen.getByText(/FRANKFURT DE/)).toBeDefined();
    expect(screen.getByText(/VERONA IT → NAPOLI, IT/)).toBeDefined();

    const fill = container.querySelector("[data-testid='progress-fill']") as HTMLElement;
    expect(fill.style.width).toBe("40%");
    expect(fill.style.backgroundColor).toBe("rgb(74, 144, 217)");
  });

  test("returns null when order has no events", () => {
    const order = makeOrder({ trackingEvents: [] });

    const { container } = render(
      <TrackingStrip order={order} borderColor="#4A90D9" />,
    );

    expect(container.innerHTML).toBe("");
  });
});
