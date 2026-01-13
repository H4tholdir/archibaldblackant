import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TranscriptDisplay } from "./TranscriptDisplay";
import type { ParsedOrderWithConfidence } from "../utils/orderParser";

describe("TranscriptDisplay", () => {
  test("renders plain text when no entities", () => {
    const transcript = "hello world";
    const parsedOrder: ParsedOrderWithConfidence = { items: [] };

    render(
      <TranscriptDisplay
        transcript={transcript}
        parsedOrder={parsedOrder}
        isFinal={true}
      />,
    );

    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  test("renders customer name with entity badge", () => {
    const transcript = "cliente Mario Rossi";
    const parsedOrder: ParsedOrderWithConfidence = {
      customerName: "Mario Rossi",
      customerNameConfidence: 0.95,
      items: [],
    };

    render(
      <TranscriptDisplay
        transcript={transcript}
        parsedOrder={parsedOrder}
        isFinal={true}
      />,
    );

    expect(screen.getByText("cliente")).toBeInTheDocument();
    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
    const badge = screen.getByText("Mario Rossi");
    expect(badge).toHaveClass("entity-customer");
  });

  test("renders article code and quantity with badges", () => {
    const transcript = "articolo SF1000 quantità 5";
    const parsedOrder: ParsedOrderWithConfidence = {
      items: [
        {
          articleCode: "SF1000",
          articleCodeConfidence: 0.9,
          description: "",
          quantity: 5,
          quantityConfidence: 0.98,
          price: 0,
        },
      ],
    };

    render(
      <TranscriptDisplay
        transcript={transcript}
        parsedOrder={parsedOrder}
        isFinal={true}
      />,
    );

    const articleBadge = screen.getByText("SF1000");
    expect(articleBadge).toHaveClass("entity-article");

    const quantityBadge = screen.getByText("5");
    expect(quantityBadge).toHaveClass("entity-quantity");
  });

  test("applies interim styling when not final", () => {
    const transcript = "cliente Mario";
    const parsedOrder: ParsedOrderWithConfidence = { items: [] };

    const { container } = render(
      <TranscriptDisplay
        transcript={transcript}
        parsedOrder={parsedOrder}
        isFinal={false}
      />,
    );

    const display = container.querySelector(".transcript-display");
    expect(display).toHaveClass("transcript-interim");
  });

  test("has ARIA live region for accessibility", () => {
    const transcript = "test";
    const parsedOrder: ParsedOrderWithConfidence = { items: [] };

    const { container } = render(
      <TranscriptDisplay
        transcript={transcript}
        parsedOrder={parsedOrder}
        isFinal={true}
      />,
    );

    const display = container.querySelector(".transcript-display");
    expect(display).toHaveAttribute("aria-live", "polite");
    expect(display).toHaveAttribute("role", "status");
  });
});
