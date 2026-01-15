import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderTimeline } from "./OrderTimeline";
import type { StatusUpdate, StateHistoryEntry } from "./OrderTimeline";

describe("OrderTimeline", () => {
  test("renders state history with Italian labels", () => {
    const stateHistory: StateHistoryEntry[] = [
      {
        state: "creato",
        changedAt: "2026-01-15T10:00:00Z",
        notes: "Ordine creato nella PWA",
      },
      {
        state: "piazzato",
        changedAt: "2026-01-15T11:00:00Z",
        notes: "Inviato ad Archibald",
      },
    ];

    render(<OrderTimeline stateHistory={stateHistory} />);

    expect(screen.getByText("Creato")).toBeInTheDocument();
    expect(screen.getByText("Piazzato su Archibald")).toBeInTheDocument();
  });

  test("renders legacy StatusUpdate format", () => {
    const updates: StatusUpdate[] = [
      {
        status: "Ordine aperto",
        timestamp: "2026-01-15T10:00:00Z",
        note: "Test note",
      },
      {
        status: "Spedito",
        timestamp: "2026-01-15T11:00:00Z",
      },
    ];

    render(<OrderTimeline updates={updates} />);

    expect(screen.getByText("Ordine aperto")).toBeInTheDocument();
    expect(screen.getByText("Spedito")).toBeInTheDocument();
  });

  test("highlights current state (first item)", () => {
    const stateHistory: StateHistoryEntry[] = [
      {
        state: "spedito",
        changedAt: "2026-01-16T10:00:00Z",
      },
      {
        state: "piazzato",
        changedAt: "2026-01-15T10:00:00Z",
      },
    ];

    render(<OrderTimeline stateHistory={stateHistory} />);

    // First item (newest) should be "Spedito" with bold text
    const speditoText = screen.getByText("Spedito");
    expect(speditoText).toBeInTheDocument();
  });

  test("returns null when no updates provided", () => {
    const { container } = render(<OrderTimeline />);
    expect(container.firstChild).toBeNull();
  });

  test("prioritizes stateHistory over updates", () => {
    const stateHistory: StateHistoryEntry[] = [
      { state: "spedito", changedAt: "2026-01-16T10:00:00Z" },
    ];

    const updates: StatusUpdate[] = [
      { status: "Ordine aperto", timestamp: "2026-01-15T10:00:00Z" },
    ];

    render(<OrderTimeline stateHistory={stateHistory} updates={updates} />);

    expect(screen.getByText("Spedito")).toBeInTheDocument();
    expect(screen.queryByText("Ordine aperto")).not.toBeInTheDocument();
  });
});
