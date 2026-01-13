import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackageDisambiguationModal } from "./PackageDisambiguationModal";
import type { PackageSolution } from "../utils/orderParser";

describe("PackageDisambiguationModal", () => {
  const mockSolutions: PackageSolution[] = [
    {
      totalPackages: 3,
      breakdown: [
        { variantId: "K2", packageContent: 5, count: 1 },
        { variantId: "K3", packageContent: 1, count: 2 },
      ],
      isOptimal: true,
    },
    {
      totalPackages: 7,
      breakdown: [{ variantId: "K3", packageContent: 1, count: 7 }],
      isOptimal: false,
    },
  ];

  test("renders article code and quantity", () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(
      <PackageDisambiguationModal
        articleCode="H71.104.032"
        quantity={7}
        solutions={mockSolutions}
        onSelect={onSelect}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText(/H71\.104\.032/)).toBeInTheDocument();
    expect(
      screen.getByText((_content, element) => {
        return (
          element?.textContent === "Articolo H71.104.032, quantità 7 pezzi"
        );
      }),
    ).toBeInTheDocument();
  });

  test("renders all solutions", () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(
      <PackageDisambiguationModal
        articleCode="H71.104.032"
        quantity={7}
        solutions={mockSolutions}
        onSelect={onSelect}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText(/3 confezioni totali/)).toBeInTheDocument();
    expect(screen.getByText(/7 confezioni totali/)).toBeInTheDocument();
  });

  test("marks optimal solution with badge", () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(
      <PackageDisambiguationModal
        articleCode="H71.104.032"
        quantity={7}
        solutions={mockSolutions}
        onSelect={onSelect}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText(/Raccomandato/)).toBeInTheDocument();
  });

  test("renders breakdown for each solution", () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(
      <PackageDisambiguationModal
        articleCode="H71.104.032"
        quantity={7}
        solutions={mockSolutions}
        onSelect={onSelect}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText(/1× 5pz/)).toBeInTheDocument();
    expect(screen.getByText(/2× 1pz/)).toBeInTheDocument();
    expect(screen.getByText(/7× 1pz/)).toBeInTheDocument();
  });

  test("calls onSelect with correct solution when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(
      <PackageDisambiguationModal
        articleCode="H71.104.032"
        quantity={7}
        solutions={mockSolutions}
        onSelect={onSelect}
        onCancel={onCancel}
      />,
    );

    const firstSolution = screen
      .getByText(/3 confezioni totali/)
      .closest("button");
    await user.click(firstSolution!);

    expect(onSelect).toHaveBeenCalledWith(mockSolutions[0]);
  });

  test("calls onCancel when cancel button clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(
      <PackageDisambiguationModal
        articleCode="H71.104.032"
        quantity={7}
        solutions={mockSolutions}
        onSelect={onSelect}
        onCancel={onCancel}
      />,
    );

    const cancelButton = screen.getByText("Annulla");
    await user.click(cancelButton);

    expect(onCancel).toHaveBeenCalled();
  });

  test("has modal overlay", () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    const { container } = render(
      <PackageDisambiguationModal
        articleCode="H71.104.032"
        quantity={7}
        solutions={mockSolutions}
        onSelect={onSelect}
        onCancel={onCancel}
      />,
    );

    expect(
      container.querySelector(".disambiguation-modal-overlay"),
    ).toBeInTheDocument();
  });
});
