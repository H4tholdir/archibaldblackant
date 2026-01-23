import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SmartSuggestions } from "./SmartSuggestions";
import type { ArticleValidationResult } from "../utils/orderParser";

describe("SmartSuggestions", () => {
  test("renders basic suggestions with low priority", () => {
    const suggestions = ["Add customer name", "Add article code"];

    render(<SmartSuggestions suggestions={suggestions} priority="low" />);

    expect(screen.getByText("Add customer name")).toBeInTheDocument();
    expect(screen.getByText("Add article code")).toBeInTheDocument();
  });

  test("applies priority styling correctly", () => {
    const { container, rerender } = render(
      <SmartSuggestions suggestions={["Test"]} priority="high" />,
    );

    expect(container.querySelector(".suggestions-high")).toBeInTheDocument();

    rerender(<SmartSuggestions suggestions={["Test"]} priority="medium" />);
    expect(container.querySelector(".suggestions-medium")).toBeInTheDocument();

    rerender(<SmartSuggestions suggestions={["Test"]} priority="low" />);
    expect(container.querySelector(".suggestions-low")).toBeInTheDocument();
  });

  test("renders exact match validation result", () => {
    const validationResult: ArticleValidationResult = {
      matchType: "exact",
      confidence: 1.0,
      product: {
        id: "K2",
        name: "H71.104.032",
        packageContent: "5",
        minQty: 5,
        multipleQty: 5,
        maxQty: 500,
      },
      suggestions: [],
    };

    render(
      <SmartSuggestions
        suggestions={[]}
        priority="low"
        validationResult={validationResult}
      />,
    );

    expect(screen.getByText(/Articolo trovato/i)).toBeInTheDocument();
  });

  test("renders fuzzy match with selectable suggestions", async () => {
    const user = userEvent.setup();
    const onSuggestionClick = vi.fn();

    const validationResult: ArticleValidationResult = {
      matchType: "fuzzy",
      confidence: 0.5,
      suggestions: [
        {
          code: "H71.104.032",
          confidence: 0.95,
          reason: "fuzzy_match",
        },
        {
          code: "H61.104.016",
          confidence: 0.8,
          reason: "fuzzy_match",
        },
      ],
      error: "Article not found",
    };

    render(
      <SmartSuggestions
        suggestions={[]}
        priority="medium"
        validationResult={validationResult}
        onSuggestionClick={onSuggestionClick}
      />,
    );

    expect(screen.getByText(/Articolo simile a/i)).toBeInTheDocument();
    expect(screen.getByText("H71.104.032")).toBeInTheDocument();
    expect(screen.getByText(/95%/i)).toBeInTheDocument();

    const selectButton = screen.getAllByText("Seleziona")[0];
    await user.click(selectButton);

    expect(onSuggestionClick).toHaveBeenCalledWith("H71.104.032");
  });

  test("renders base pattern match with variant list", async () => {
    const user = userEvent.setup();
    const onSuggestionClick = vi.fn();

    const validationResult: ArticleValidationResult = {
      matchType: "base_pattern",
      confidence: 0.7,
      basePattern: "845.104",
      suggestions: [
        {
          code: "845.104.016",
          variant: "016",
          packageInfo: "K2 - 5pz",
          confidence: 0.8,
          reason: "base_match",
        },
        {
          code: "845.104.032",
          variant: "032",
          packageInfo: "K3 - 1pz",
          confidence: 0.8,
          reason: "base_match",
        },
      ],
      error: "Variant not found",
    };

    render(
      <SmartSuggestions
        suggestions={[]}
        priority="high"
        validationResult={validationResult}
        onSuggestionClick={onSuggestionClick}
      />,
    );

    expect(screen.getByText(/Variante non trovata/i)).toBeInTheDocument();
    expect(screen.getByText("845.104.016")).toBeInTheDocument();
    expect(screen.getByText("K2 - 5pz")).toBeInTheDocument();

    const selectButton = screen.getAllByText("Seleziona")[0];
    await user.click(selectButton);

    expect(onSuggestionClick).toHaveBeenCalledWith("845.104.016");
  });

  test("renders not found with retry message", () => {
    const validationResult: ArticleValidationResult = {
      matchType: "not_found",
      confidence: 0.0,
      suggestions: [],
      error: "Article not found",
    };

    render(
      <SmartSuggestions
        suggestions={[]}
        priority="high"
        validationResult={validationResult}
      />,
    );

    expect(screen.getByText(/non trovato/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Riprova o scrivi manualmente/i),
    ).toBeInTheDocument();
  });

  test("renders nothing when no suggestions and no validation result", () => {
    const { container } = render(
      <SmartSuggestions suggestions={[]} priority="low" />,
    );

    expect(
      container.querySelector(".smart-suggestions"),
    ).not.toBeInTheDocument();
  });
});
