import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ScanEvent, TrackingStep } from "./TrackingProgressBar";
import { getTrackingSteps, getDayCount, TrackingProgressBar } from "./TrackingProgressBar";

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

describe("getTrackingSteps", () => {
  test("in-transit returns dates on completed steps", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "IT", scanLocation: "FRANKFURT DE", date: "2026-03-04", time: "14:30:00", status: "In transit" }),
      makeScanEvent({ statusCD: "DP", scanLocation: "VERONA IT", date: "2026-03-03", time: "08:00:00", status: "Departed" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
    ];

    const steps = getTrackingSteps(events, "IT");

    expect(steps).toEqual<TrackingStep[]>([
      { label: "Ritirato", detail: "", date: "3 mar", completed: true, active: false },
      { label: "In viaggio", detail: "FRANKFURT DE, 14:30", date: "4 mar", completed: true, active: true },
      { label: "Hub locale", detail: "", date: "", completed: false, active: false },
      { label: "In consegna", detail: "", date: "", completed: false, active: false },
      { label: "Consegnato", detail: "", date: "", completed: false, active: false },
    ]);
  });

  test("delivered returns dates on all steps", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "DL", scanLocation: "NAPOLI IT", date: "2026-03-06", time: "14:30:00", status: "Delivered", delivered: true }),
      makeScanEvent({ statusCD: "OD", scanLocation: "NAPOLI IT", date: "2026-03-06", time: "08:00:00", status: "On vehicle" }),
      makeScanEvent({ statusCD: "AR", scanLocation: "NAPOLI IT", date: "2026-03-05", time: "16:00:00", status: "Arrived" }),
      makeScanEvent({ statusCD: "IT", scanLocation: "FRANKFURT DE", date: "2026-03-04", time: "10:00:00", status: "In transit" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", date: "2026-03-03", time: "07:00:00", status: "Picked up" }),
    ];

    const steps = getTrackingSteps(events, "IT");

    expect(steps).toEqual<TrackingStep[]>([
      { label: "Ritirato", detail: "", date: "3 mar", completed: true, active: false },
      { label: "In viaggio", detail: "", date: "4 mar", completed: true, active: false },
      { label: "Hub locale", detail: "", date: "5 mar", completed: true, active: false },
      { label: "In consegna", detail: "", date: "6 mar", completed: true, active: false },
      { label: "Consegnato", detail: "NAPOLI IT, 14:30", date: "6 mar", completed: true, active: true },
    ]);
  });

  test("empty events returns no dates", () => {
    const steps = getTrackingSteps([], "IT");

    expect(steps).toEqual<TrackingStep[]>([
      { label: "Ritirato", detail: "", date: "", completed: false, active: false },
      { label: "In viaggio", detail: "", date: "", completed: false, active: false },
      { label: "Hub locale", detail: "", date: "", completed: false, active: false },
      { label: "In consegna", detail: "", date: "", completed: false, active: false },
      { label: "Consegnato", detail: "", date: "", completed: false, active: false },
    ]);
  });
});

describe("getDayCount", () => {
  test("returns correct day count for multi-day transit", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "DL", date: "2026-03-06", delivered: true }),
      makeScanEvent({ statusCD: "PU", date: "2026-03-03" }),
    ];

    const result = getDayCount(events);

    expect(result).toEqual(4);
  });

  test("returns 1 for same-day events", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "DL", date: "2026-03-03", delivered: true }),
      makeScanEvent({ statusCD: "PU", date: "2026-03-03" }),
    ];

    const result = getDayCount(events);

    expect(result).toEqual(1);
  });

  test("returns 0 for empty events", () => {
    const result = getDayCount([]);

    expect(result).toEqual(0);
  });
});

describe("TrackingProgressBar", () => {
  test("renders origin, destination, and day counter", () => {
    const steps: TrackingStep[] = [
      { label: "Ritirato", detail: "", date: "3 mar", completed: true, active: false },
      { label: "In viaggio", detail: "FRANKFURT DE, 14:30", date: "4 mar", completed: true, active: true },
      { label: "Hub locale", detail: "", date: "", completed: false, active: false },
      { label: "In consegna", detail: "", date: "", completed: false, active: false },
      { label: "Consegnato", detail: "", date: "", completed: false, active: false },
    ];

    render(
      <TrackingProgressBar
        steps={steps}
        borderColor="#4A90D9"
        origin="VERONA IT"
        destination="NAPOLI, IT"
        dayCount={5}
        delivered={false}
      />,
    );

    expect(screen.getByText("VERONA IT")).toBeDefined();
    expect(screen.getByText("NAPOLI, IT")).toBeDefined();
    expect(screen.getByText("5° giorno")).toBeDefined();
    expect(screen.getByText("FRANKFURT DE, 14:30")).toBeDefined();
  });

  test("renders delivered day counter", () => {
    const steps: TrackingStep[] = [
      { label: "Ritirato", detail: "", date: "3 mar", completed: true, active: false },
      { label: "In viaggio", detail: "", date: "4 mar", completed: true, active: false },
      { label: "Hub locale", detail: "", date: "5 mar", completed: true, active: false },
      { label: "In consegna", detail: "", date: "6 mar", completed: true, active: false },
      { label: "Consegnato", detail: "NAPOLI IT, 14:30", date: "6 mar", completed: true, active: true },
    ];

    render(
      <TrackingProgressBar
        steps={steps}
        borderColor="#4A90D9"
        origin="VERONA IT"
        destination="NAPOLI, IT"
        dayCount={4}
        delivered={true}
      />,
    );

    expect(screen.getByText("consegnato in 4 giorni")).toBeDefined();
  });
});
