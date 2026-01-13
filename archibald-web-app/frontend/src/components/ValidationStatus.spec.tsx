import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ValidationStatus } from "./ValidationStatus";

describe("ValidationStatus", () => {
  test("renders nothing when status is idle", () => {
    const { container } = render(<ValidationStatus status="idle" />);

    expect(
      container.querySelector(".validation-status"),
    ).not.toBeInTheDocument();
  });

  test("renders spinner when validating", () => {
    render(<ValidationStatus status="validating" message="Validating..." />);

    expect(screen.getByText("Validating...")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  test("renders success checkmark with message", () => {
    render(<ValidationStatus status="success" message="Valid" />);

    const element = screen.getByText("Valid");
    expect(element).toBeInTheDocument();
    expect(element.parentElement).toHaveClass("validation-success");
  });

  test("renders error with message and suggestions", () => {
    const errors = ["Customer not found"];
    const suggestions = ["Did you mean: Mario Rossi?"];

    render(
      <ValidationStatus
        status="error"
        message="Validation failed"
        errors={errors}
        suggestions={suggestions}
      />,
    );

    expect(screen.getByText("Validation failed")).toBeInTheDocument();
    expect(screen.getByText("Customer not found")).toBeInTheDocument();
    expect(screen.getByText("Did you mean: Mario Rossi?")).toBeInTheDocument();
  });

  test("has ARIA live region for accessibility", () => {
    const { container } = render(
      <ValidationStatus status="validating" message="Validating..." />,
    );

    const status = container.querySelector('[role="status"]');
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  test("renders multiple errors", () => {
    const errors = ["Error 1", "Error 2", "Error 3"];

    render(
      <ValidationStatus
        status="error"
        message="Multiple errors"
        errors={errors}
      />,
    );

    errors.forEach((error) => {
      expect(screen.getByText(error)).toBeInTheDocument();
    });
  });

  test("renders without suggestions", () => {
    render(
      <ValidationStatus
        status="error"
        message="Error"
        errors={["Something went wrong"]}
      />,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.queryByText("Suggestions:")).not.toBeInTheDocument();
  });
});
