import { describe, test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ProductSelector } from "./ProductSelector";
import type { ProductWithDetails } from "../../services/products.service";

const mockProduct: ProductWithDetails = {
  id: "1",
  name: "Vite Testa Tonda",
  article: "VTT001",
  description: "Vite testa tonda 6x20mm acciaio",
  lastModified: "2024-01-01",
  hash: "abc123",
  variants: [
    {
      id: 1,
      productId: "1",
      variantId: "V1",
      multipleQty: 10,
      minQty: 10,
      maxQty: 100,
      packageContent: "100pz",
    },
  ],
  price: 15.5,
};

const mockProduct2: ProductWithDetails = {
  id: "2",
  name: "Bullone Esagonale",
  article: "H129",
  description: "Bullone esagonale M8x30 zincato",
  lastModified: "2024-01-02",
  hash: "def456",
  variants: [
    {
      id: 2,
      productId: "2",
      variantId: "V2",
      multipleQty: 1,
      minQty: 1,
      maxQty: 500,
      packageContent: "50pz",
    },
  ],
  price: 22.0,
};

describe("ProductSelector", () => {
  test("renders input with placeholder", () => {
    render(<ProductSelector onSelect={vi.fn()} />);
    expect(
      screen.getByPlaceholderText(
        "Cerca prodotto per nome o codice articolo...",
      ),
    ).toBeInTheDocument();
  });

  test("renders custom placeholder", () => {
    render(
      <ProductSelector onSelect={vi.fn()} placeholder="Cerca prodotto..." />,
    );
    expect(
      screen.getByPlaceholderText("Cerca prodotto..."),
    ).toBeInTheDocument();
  });

  test("typing triggers debounced search after 300ms", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockProduct]);

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "vite");

    // Search should NOT be called immediately
    expect(mockSearch).not.toHaveBeenCalled();

    // Wait for debounce (300ms)
    await waitFor(
      () => {
        expect(mockSearch).toHaveBeenCalledWith("vite");
      },
      { timeout: 500 },
    );
  });

  test("search by product name works", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockProduct]);

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "vite");

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("vite"));

    expect(screen.getByText("Vite Testa Tonda")).toBeInTheDocument();
  });

  test("search by article code works", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockProduct2]);

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "h129");

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("h129"));

    expect(screen.getByText("Bullone Esagonale")).toBeInTheDocument();
  });

  test("displays article code in dropdown", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockProduct]);

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "vite");

    await waitFor(() => screen.getByText("Vite Testa Tonda"));

    expect(screen.getByText(/Codice: VTT001/i)).toBeInTheDocument();
  });

  test("displays description in dropdown", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockProduct]);

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "vite");

    await waitFor(() => screen.getByText("Vite Testa Tonda"));

    expect(
      screen.getByText(/Vite testa tonda 6x20mm acciaio/i),
    ).toBeInTheDocument();
  });

  test("clicking result selects product and closes dropdown", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const mockSearch = vi.fn().mockResolvedValue([mockProduct]);

    render(<ProductSelector onSelect={onSelect} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "vite");

    await waitFor(() => screen.getByText("Vite Testa Tonda"));

    const result = screen.getByText("Vite Testa Tonda");
    await user.click(result);

    expect(onSelect).toHaveBeenCalledWith(mockProduct);

    // Dropdown should be closed
    const dropdown = screen.queryByRole("listbox");
    expect(dropdown).not.toBeInTheDocument();
  });

  test("escape key closes dropdown", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockProduct]);

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "vite");

    await waitFor(() => screen.getByRole("listbox"));

    await user.keyboard("{Escape}");

    const dropdown = screen.queryByRole("listbox");
    expect(dropdown).not.toBeInTheDocument();
  });

  test("arrow keys navigate dropdown items", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockProduct, mockProduct2]);

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "vite");

    await waitFor(() => screen.getByRole("listbox"));

    await user.keyboard("{ArrowDown}");

    // First item should be highlighted
    const firstOption = screen
      .getByText("Vite Testa Tonda")
      .closest('[role="option"]');
    expect(firstOption).toHaveAttribute("aria-selected", "true");
  });

  test("enter key selects highlighted item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const mockSearch = vi.fn().mockResolvedValue([mockProduct, mockProduct2]);

    render(<ProductSelector onSelect={onSelect} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "vite");

    await waitFor(() => screen.getByRole("listbox"));

    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(mockProduct);
  });

  test("shows loading state during search", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([mockProduct]), 100);
        }),
    );

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "vite");

    // Wait for debounce
    await waitFor(() => expect(mockSearch).toHaveBeenCalled());

    // Loading indicator should appear
    expect(screen.getByText("Ricerca in corso...")).toBeInTheDocument();

    // Wait for results
    await waitFor(() => screen.getByText("Vite Testa Tonda"));

    // Loading should be gone
    expect(screen.queryByText("Ricerca in corso...")).not.toBeInTheDocument();
  });

  test("shows error message on search failure", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockRejectedValue(new Error("API error"));

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "vite");

    await waitFor(() =>
      expect(screen.getByText("Errore durante la ricerca")).toBeInTheDocument(),
    );
  });

  test("displays selected product confirmation with article code", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockProduct]);

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    await user.type(input, "vite");

    await waitFor(() => screen.getByText("Vite Testa Tonda"));

    const result = screen.getByText("Vite Testa Tonda");
    await user.click(result);

    // Confirmation message should appear with article code
    expect(screen.getByText(/Prodotto selezionato:/i)).toBeInTheDocument();
    expect(screen.getByText("Vite Testa Tonda")).toBeInTheDocument();
    expect(screen.getByText(/\(VTT001\)/i)).toBeInTheDocument();
  });

  test("has correct ARIA attributes", () => {
    render(<ProductSelector onSelect={vi.fn()} />);

    const input = screen.getByLabelText("Cerca prodotto");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  test("ARIA expanded is true when dropdown open", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockProduct]);

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByLabelText("Cerca prodotto");
    await user.type(input, "vite");

    await waitFor(() => screen.getByRole("listbox"));

    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  test("disabled prop disables input", () => {
    render(<ProductSelector onSelect={vi.fn()} disabled={true} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    expect(input).toBeDisabled();
  });

  test("empty query shows no dropdown", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn();

    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );

    // Type and then clear
    await user.type(input, "vite");
    await user.clear(input);

    // Wait a bit to ensure debounce timeout
    await new Promise((resolve) => setTimeout(resolve, 400));

    const dropdown = screen.queryByRole("listbox");
    expect(dropdown).not.toBeInTheDocument();
  });
});
