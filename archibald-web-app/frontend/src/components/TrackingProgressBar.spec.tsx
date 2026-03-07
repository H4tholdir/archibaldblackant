import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ScanEvent, TrackingStep } from "./TrackingProgressBar";
import { getTrackingSteps, TrackingProgressBar } from "./TrackingProgressBar";

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
  test("in-transit mid-journey: only Ritirato and In viaggio completed", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "AR", scanLocation: "FRANKFURT DE", time: "18:00:00", status: "Arrived at FedEx location" }),
      makeScanEvent({ statusCD: "IT", scanLocation: "NUREMBERG DE", time: "14:30:00", status: "In transit" }),
      makeScanEvent({ statusCD: "DP", scanLocation: "VERONA IT", time: "08:00:00", status: "Departed FedEx location" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", time: "07:00:00", status: "Picked up" }),
    ];

    const steps = getTrackingSteps(events, "FR");

    expect(steps).toEqual([
      { label: "Ritirato", detail: "", completed: true, active: false },
      { label: "In viaggio", detail: "FRANKFURT DE, 18:00", completed: true, active: true },
      { label: "Hub locale", detail: "", completed: false, active: false },
      { label: "In consegna", detail: "", completed: false, active: false },
      { label: "Consegnato", detail: "", completed: false, active: false },
    ]);
  });

  test("arrived at destination country: Ritirato, In viaggio, Hub locale completed", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "AR", scanLocation: "MILANO IT", time: "16:00:00", status: "Arrived at FedEx location" }),
      makeScanEvent({ statusCD: "IT", scanLocation: "FRANKFURT DE", time: "10:00:00", status: "In transit" }),
      makeScanEvent({ statusCD: "DP", scanLocation: "VERONA IT", time: "08:00:00", status: "Departed FedEx location" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", time: "07:00:00", status: "Picked up" }),
    ];

    const steps = getTrackingSteps(events, "IT");

    expect(steps).toEqual([
      { label: "Ritirato", detail: "", completed: true, active: false },
      { label: "In viaggio", detail: "", completed: true, active: false },
      { label: "Hub locale", detail: "MILANO IT, 16:00", completed: true, active: true },
      { label: "In consegna", detail: "", completed: false, active: false },
      { label: "Consegnato", detail: "", completed: false, active: false },
    ]);
  });

  test("delivered: all 5 steps completed, Consegnato active", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "DL", scanLocation: "NAPOLI IT", time: "14:30:00", status: "Delivered", delivered: true }),
      makeScanEvent({ statusCD: "OD", scanLocation: "NAPOLI IT", time: "08:00:00", status: "On FedEx vehicle for delivery" }),
      makeScanEvent({ statusCD: "AR", scanLocation: "NAPOLI IT", time: "06:00:00", status: "At local FedEx facility" }),
      makeScanEvent({ statusCD: "IT", scanLocation: "FRANKFURT DE", time: "22:00:00", status: "In transit" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", time: "07:00:00", status: "Picked up" }),
    ];

    const steps = getTrackingSteps(events, "IT");

    expect(steps).toEqual([
      { label: "Ritirato", detail: "", completed: true, active: false },
      { label: "In viaggio", detail: "", completed: true, active: false },
      { label: "Hub locale", detail: "", completed: true, active: false },
      { label: "In consegna", detail: "", completed: true, active: false },
      { label: "Consegnato", detail: "NAPOLI IT, 14:30", completed: true, active: true },
    ]);
  });

  test("empty events: no steps completed, no active step", () => {
    const steps = getTrackingSteps([], "IT");

    expect(steps).toEqual([
      { label: "Ritirato", detail: "", completed: false, active: false },
      { label: "In viaggio", detail: "", completed: false, active: false },
      { label: "Hub locale", detail: "", completed: false, active: false },
      { label: "In consegna", detail: "", completed: false, active: false },
      { label: "Consegnato", detail: "", completed: false, active: false },
    ]);
  });

  test("only pickup: Ritirato completed and active", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", time: "07:15:00", status: "Picked up" }),
    ];

    const steps = getTrackingSteps(events, "IT");

    expect(steps).toEqual([
      { label: "Ritirato", detail: "VERONA IT, 07:15", completed: true, active: true },
      { label: "In viaggio", detail: "", completed: false, active: false },
      { label: "Hub locale", detail: "", completed: false, active: false },
      { label: "In consegna", detail: "", completed: false, active: false },
      { label: "Consegnato", detail: "", completed: false, active: false },
    ]);
  });

  test("AR at destination country matches Hub locale, not In viaggio", () => {
    const events: ScanEvent[] = [
      makeScanEvent({ statusCD: "AR", scanLocation: "PARIS FR", time: "12:00:00" }),
      makeScanEvent({ statusCD: "PU", scanLocation: "VERONA IT", time: "07:00:00" }),
    ];

    const steps = getTrackingSteps(events, "FR");

    expect(steps[1]).toEqual({ label: "In viaggio", detail: "", completed: true, active: false });
    expect(steps[2]).toEqual({ label: "Hub locale", detail: "PARIS FR, 12:00", completed: true, active: true });
  });
});

describe("TrackingProgressBar", () => {
  test("renders 5 circles, origin, destination, and active detail", () => {
    const steps: TrackingStep[] = [
      { label: "Ritirato", detail: "", completed: true, active: false },
      { label: "In viaggio", detail: "FRANKFURT DE, 18:00", completed: true, active: true },
      { label: "Hub locale", detail: "", completed: false, active: false },
      { label: "In consegna", detail: "", completed: false, active: false },
      { label: "Consegnato", detail: "", completed: false, active: false },
    ];

    const { container } = render(
      <TrackingProgressBar
        steps={steps}
        borderColor="#4A90D9"
        origin="VERONA IT"
        destination="PARIS FR"
      />,
    );

    expect(screen.getByText("VERONA IT")).toBeDefined();
    expect(screen.getByText("PARIS FR")).toBeDefined();
    expect(screen.getByText("FRANKFURT DE, 18:00")).toBeDefined();

    const circles = container.querySelectorAll("div[style*='border-radius: 50%']");
    expect(circles.length).toBe(5);
  });
});
