// @ts-nocheck
import { describe, test, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { Product } from "../../db/schema";

vi.mock("../../db/schema", () => ({
  db: {},
}));

vi.mock("../../services/products.service", () => ({
  productService: {
    searchProducts: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../hooks/useKeyboardScroll", () => ({
  useKeyboardScroll: () => ({
    keyboardHeight: 0,
    keyboardOpen: false,
    scrollFieldIntoView: vi.fn(),
    keyboardPaddingStyle: {},
    modalOverlayKeyboardStyle: {},
  }),
}));

const mockProducts: Product[] = [
  {
    id: "1",
    name: "Vite M6x20",
    article: "H129FSQ.104.023",
    description: "Vite in acciaio inox",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "2",
    name: "Dado M6",
    article: "H130FSQ.105.024",
    description: "Dado esagonale",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "3",
    name: "Rondella M6",
    article: "H131FSQ.106.025",
    description: "Rondella piana",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

let ProductSelector: any;

describe("ProductSelector", () => {
  beforeAll(async () => {
    const mod = await import("./ProductSelector");
    ProductSelector = mod.ProductSelector;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  test("renders input with placeholder", async () => {
    render(<ProductSelector onSelect={vi.fn()} searchFn={vi.fn().mockResolvedValue([])} />);
    expect(
      screen.getByPlaceholderText(
        "Cerca prodotto per nome o codice articolo...",
      ),
    ).toBeInTheDocument();
  });

  test("renders label", async () => {
    render(<ProductSelector onSelect={vi.fn()} searchFn={vi.fn().mockResolvedValue([])} />);
    expect(screen.getByLabelText("Cerca prodotto")).toBeInTheDocument();
  });

  test("typing triggers debounced search after 300ms", async () => {
    const mockSearch = vi.fn().mockResolvedValue([mockProducts[0]]);


    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "vite" } });

    expect(mockSearch).not.toHaveBeenCalled();

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("vite"), {
      timeout: 500,
    });
  });

  test("search by product name works", async () => {
    const mockSearch = vi.fn().mockResolvedValue([mockProducts[0]]);


    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "vite" } });

    await waitFor(() => screen.getByText("Vite M6x20"));

    expect(screen.getByText("Vite M6x20")).toBeInTheDocument();
  });

  test("search by article code works", async () => {
    const mockSearch = vi.fn().mockResolvedValue([mockProducts[0]]);


    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "h129" } });

    await waitFor(() => screen.getByText("Vite M6x20"));

    expect(screen.getByText("Vite M6x20")).toBeInTheDocument();
  });

  test("displays article code and description in dropdown", async () => {
    const mockSearch = vi.fn().mockResolvedValue(mockProducts);


    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "h1" } });

    await waitFor(() => screen.getByText("Vite M6x20"));

    expect(screen.getByText("Vite M6x20")).toBeInTheDocument();
    expect(screen.getByText("Codice: H129FSQ.104.023")).toBeInTheDocument();
    expect(screen.getByText("Vite in acciaio inox")).toBeInTheDocument();
  });

  test("clicking result selects product and closes dropdown", async () => {
    const onSelect = vi.fn();
    const mockSearch = vi.fn().mockResolvedValue([mockProducts[0]]);


    render(<ProductSelector onSelect={onSelect} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "vite" } });

    await waitFor(() => screen.getByText("Vite M6x20"));

    fireEvent.click(screen.getByText("Vite M6x20"));

    expect(onSelect).toHaveBeenCalledWith(mockProducts[0]);

    await waitFor(() => {
      const dropdown = screen.queryByRole("listbox");
      expect(dropdown).not.toBeInTheDocument();
    });
  });

  test("shows loading state during search", async () => {
    const mockSearch = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 200)),
      );


    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "vite" } });

    await waitFor(() => expect(mockSearch).toHaveBeenCalled(), {
      timeout: 500,
    });

    expect(screen.getByText("Ricerca in corso...")).toBeInTheDocument();
  });

  test("shows error message on search failure", async () => {
    const mockSearch = vi.fn().mockRejectedValue(new Error("Network error"));


    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "vite" } });

    await waitFor(
      () => {
        expect(
          screen.getByText("Errore durante la ricerca"),
        ).toBeInTheDocument();
      },
      { timeout: 500 },
    );
  });

  test("displays selected product confirmation", async () => {
    const mockSearch = vi.fn().mockResolvedValue([mockProducts[0]]);


    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "vite" } });

    await waitFor(() => screen.getByText("Vite M6x20"));

    fireEvent.click(screen.getByText("Vite M6x20"));

    await waitFor(() => {
      expect(
        screen.getByText(/✅ Prodotto selezionato:/),
      ).toBeInTheDocument();
      expect(screen.getByText("Vite M6x20")).toBeInTheDocument();
    });
  });

  test("escape key closes dropdown", async () => {
    const mockSearch = vi.fn().mockResolvedValue(mockProducts);


    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "h1" } });

    await waitFor(() => screen.getByRole("listbox"));

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      const dropdown = screen.queryByRole("listbox");
      expect(dropdown).not.toBeInTheDocument();
    });
  });

  test("arrow keys navigate dropdown items", async () => {
    const mockSearch = vi.fn().mockResolvedValue(mockProducts);


    render(<ProductSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "h1" } });

    await waitFor(() => screen.getByRole("listbox"));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);

    fireEvent.keyDown(input, { key: "ArrowDown" });

    await waitFor(() => {
      expect(options[0]).toHaveAttribute("aria-selected", "true");
    });
  });

  test("Enter key selects highlighted item", async () => {
    const onSelect = vi.fn();
    const mockSearch = vi.fn().mockResolvedValue(mockProducts);


    render(<ProductSelector onSelect={onSelect} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "h1" } });

    await waitFor(() => screen.getByRole("listbox"));

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(mockProducts[0]);
    });
  });

  test("disabled state prevents input", async () => {
    render(<ProductSelector onSelect={vi.fn()} disabled={true} searchFn={vi.fn().mockResolvedValue([])} />);

    const input = screen.getByPlaceholderText(
      "Cerca prodotto per nome o codice articolo...",
    );
    expect(input).toBeDisabled();
  });
});
