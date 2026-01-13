import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { EntityBadge } from "./EntityBadge";

describe("EntityBadge", () => {
  test("renders with correct value", () => {
    render(<EntityBadge type="customer" value="Mario Rossi" />);

    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
  });

  test("applies customer color class", () => {
    const { container } = render(
      <EntityBadge type="customer" value="Test" />
    );

    const badge = container.querySelector(".entity-badge");
    expect(badge).toHaveClass("entity-customer");
  });

  test("applies article color class", () => {
    const { container } = render(<EntityBadge type="article" value="SF1000" />);

    const badge = container.querySelector(".entity-badge");
    expect(badge).toHaveClass("entity-article");
  });

  test("applies quantity color class", () => {
    const { container } = render(<EntityBadge type="quantity" value="5" />);

    const badge = container.querySelector(".entity-badge");
    expect(badge).toHaveClass("entity-quantity");
  });

  test("applies price color class", () => {
    const { container } = render(<EntityBadge type="price" value="€50.00" />);

    const badge = container.querySelector(".entity-badge");
    expect(badge).toHaveClass("entity-price");
  });

  test("shows confidence indicator when provided", () => {
    render(<EntityBadge type="customer" value="Test" confidence={0.85} />);

    // Confidence is shown via opacity/style, check it exists
    const badge = screen.getByText("Test").closest(".entity-badge");
    expect(badge).toBeInTheDocument();
  });

  test("low confidence affects opacity", () => {
    const { container } = render(
      <EntityBadge type="article" value="Test" confidence={0.3} />
    );

    const badge = container.querySelector(".entity-badge");
    expect(badge).toHaveClass("entity-low-confidence");
  });

  test("has correct ARIA label", () => {
    render(
      <EntityBadge type="customer" value="Mario Rossi" confidence={0.9} />
    );

    const badge = screen.getByLabelText("customer: Mario Rossi (confidence: 90%)");
    expect(badge).toBeInTheDocument();
  });

  test("ARIA label without confidence", () => {
    render(<EntityBadge type="article" value="SF1000" />);

    const badge = screen.getByLabelText("article: SF1000");
    expect(badge).toBeInTheDocument();
  });

  test("triggers onClick when clicked", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <EntityBadge
        type="customer"
        value="Test"
        onClick={handleClick}
      />
    );

    const badge = screen.getByText("Test");
    await user.click(badge);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test("is clickable when onClick provided", () => {
    const handleClick = vi.fn();
    const { container } = render(
      <EntityBadge type="customer" value="Test" onClick={handleClick} />
    );

    const badge = container.querySelector(".entity-badge");
    expect(badge).toHaveClass("entity-clickable");
  });

  test("is not clickable without onClick", () => {
    const { container } = render(<EntityBadge type="customer" value="Test" />);

    const badge = container.querySelector(".entity-badge");
    expect(badge).not.toHaveClass("entity-clickable");
  });
});
