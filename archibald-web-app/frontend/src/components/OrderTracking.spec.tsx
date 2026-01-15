import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderTracking } from "./OrderTracking";

describe("OrderTracking", () => {
  test("displays DDT number when provided", () => {
    render(<OrderTracking ddtNumber="DDT/26000515" />);

    expect(screen.getByText("DDT")).toBeInTheDocument();
    expect(screen.getByText("DDT/26000515")).toBeInTheDocument();
  });

  test("displays tracking number and courier", () => {
    render(
      <OrderTracking trackingNumber="445291888246" trackingCourier="FedEx" />,
    );

    expect(screen.getByText("Tracking")).toBeInTheDocument();
    expect(screen.getByText("FedEx")).toBeInTheDocument();
    expect(screen.getByText("445291888246")).toBeInTheDocument();
  });

  test("displays tracking link when URL provided", () => {
    render(
      <OrderTracking
        trackingNumber="445291888246"
        trackingUrl="https://fedex.com/track/445291888246"
      />,
    );

    const link = screen.getByText("🔗 Traccia spedizione");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "https://fedex.com/track/445291888246",
    );
    expect(link.closest("a")).toHaveAttribute("target", "_blank");
  });

  test("shows fallback message when no tracking data", () => {
    render(<OrderTracking />);

    expect(
      screen.getByText("📦 Tracciamento non ancora disponibile"),
    ).toBeInTheDocument();
  });

  test("displays both DDT and tracking when both provided", () => {
    render(
      <OrderTracking
        ddtNumber="DDT/26000515"
        trackingNumber="445291888246"
        trackingCourier="DHL"
      />,
    );

    expect(screen.getByText("DDT/26000515")).toBeInTheDocument();
    expect(screen.getByText("DHL")).toBeInTheDocument();
    expect(screen.getByText("445291888246")).toBeInTheDocument();
  });
});
