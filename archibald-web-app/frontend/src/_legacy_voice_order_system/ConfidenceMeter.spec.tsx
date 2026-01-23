import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceMeter } from "./ConfidenceMeter";

describe("ConfidenceMeter", () => {
  test("renders with correct percentage", () => {
    render(<ConfidenceMeter confidence={0.75} label="Test Confidence" />);

    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  test("shows low confidence with red color (0-0.4)", () => {
    const { container } = render(<ConfidenceMeter confidence={0.3} />);

    const progressBar = container.querySelector(".confidence-fill");
    expect(progressBar).toHaveStyle({ width: "30%" });
    expect(progressBar).toHaveClass("confidence-low");
  });

  test("shows medium confidence with yellow color (0.4-0.7)", () => {
    const { container } = render(<ConfidenceMeter confidence={0.5} />);

    const progressBar = container.querySelector(".confidence-fill");
    expect(progressBar).toHaveStyle({ width: "50%" });
    expect(progressBar).toHaveClass("confidence-medium");
  });

  test("shows high confidence with green color (0.7-1.0)", () => {
    const { container } = render(<ConfidenceMeter confidence={0.85} />);

    const progressBar = container.querySelector(".confidence-fill");
    expect(progressBar).toHaveStyle({ width: "85%" });
    expect(progressBar).toHaveClass("confidence-high");
  });

  test("has correct ARIA attributes", () => {
    const { container } = render(
      <ConfidenceMeter confidence={0.6} label="Overall Confidence" />
    );

    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toHaveAttribute("aria-valuenow", "60");
    expect(progressBar).toHaveAttribute("aria-valuemin", "0");
    expect(progressBar).toHaveAttribute("aria-valuemax", "100");
    expect(progressBar).toHaveAttribute("aria-label", "Overall Confidence");
  });

  test("hides percentage when showPercentage is false", () => {
    render(<ConfidenceMeter confidence={0.75} showPercentage={false} />);

    expect(screen.queryByText("75%")).not.toBeInTheDocument();
  });

  test("shows percentage by default", () => {
    render(<ConfidenceMeter confidence={0.42} />);

    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  test("handles edge case: 0% confidence", () => {
    const { container } = render(<ConfidenceMeter confidence={0} />);

    const progressBar = container.querySelector(".confidence-fill");
    expect(progressBar).toHaveStyle({ width: "0%" });
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  test("handles edge case: 100% confidence", () => {
    const { container } = render(<ConfidenceMeter confidence={1} />);

    const progressBar = container.querySelector(".confidence-fill");
    expect(progressBar).toHaveStyle({ width: "100%" });
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
