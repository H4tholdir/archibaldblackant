// @ts-nocheck
import { describe, test, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { Customer } from "../../db/schema";

vi.mock("../../db/schema", () => ({
  db: {},
}));

vi.mock("../../services/customers.service", () => ({
  customerService: {
    searchCustomers: vi.fn().mockResolvedValue([]),
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

const mockCustomers: Customer[] = [
  {
    id: "1",
    name: "Mario Rossi",
    code: "MR001",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "2",
    name: "Luigi Verdi",
    code: "LV002",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "3",
    name: "Maria Bianchi",
    code: "MB003",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

let CustomerSelector: any;

describe("CustomerSelector", () => {
  beforeAll(async () => {
    const mod = await import("./CustomerSelector");
    CustomerSelector = mod.CustomerSelector;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  test("renders input with placeholder", async () => {
    render(<CustomerSelector onSelect={vi.fn()} searchFn={vi.fn().mockResolvedValue([])} />);
    expect(
      screen.getByPlaceholderText("Cerca cliente per nome..."),
    ).toBeInTheDocument();
  });

  test("renders label", async () => {
    render(<CustomerSelector onSelect={vi.fn()} searchFn={vi.fn().mockResolvedValue([])} />);
    expect(screen.getByLabelText("Cerca cliente")).toBeInTheDocument();
  });

  test("typing triggers debounced search after 300ms", async () => {
    const mockSearch = vi.fn().mockResolvedValue([mockCustomers[0]]);


    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "mario" } });

    expect(mockSearch).not.toHaveBeenCalled();

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("mario"), {
      timeout: 500,
    });
  });

  test("displays filtered results in dropdown", async () => {
    const mockSearch = vi.fn().mockResolvedValue(mockCustomers);


    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "mario" } });

    await waitFor(() => screen.getByText("Mario Rossi"));

    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("Codice: MR001")).toBeInTheDocument();
  });

  test("clicking result selects customer and closes dropdown", async () => {
    const onSelect = vi.fn();
    const mockSearch = vi.fn().mockResolvedValue([mockCustomers[0]]);


    render(<CustomerSelector onSelect={onSelect} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "mario" } });

    await waitFor(() => screen.getByText("Mario Rossi"));

    fireEvent.click(screen.getByText("Mario Rossi"));

    expect(onSelect).toHaveBeenCalledWith(mockCustomers[0]);

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


    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "mario" } });

    await waitFor(() => expect(mockSearch).toHaveBeenCalled(), {
      timeout: 500,
    });

    expect(screen.getByText("Ricerca in corso...")).toBeInTheDocument();
  });

  test("shows error message on search failure", async () => {
    const mockSearch = vi.fn().mockRejectedValue(new Error("Network error"));


    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "mario" } });

    await waitFor(
      () => {
        expect(
          screen.getByText("Errore durante la ricerca"),
        ).toBeInTheDocument();
      },
      { timeout: 500 },
    );
  });

  test("displays selected customer confirmation", async () => {
    const mockSearch = vi.fn().mockResolvedValue([mockCustomers[0]]);


    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "mario" } });

    await waitFor(() => screen.getByText("Mario Rossi"));

    fireEvent.click(screen.getByText("Mario Rossi"));

    await waitFor(() => {
      expect(
        screen.getByText(/✅ Cliente selezionato:/),
      ).toBeInTheDocument();
      expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
    });
  });

  test("escape key closes dropdown", async () => {
    const mockSearch = vi.fn().mockResolvedValue(mockCustomers);


    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "mario" } });

    await waitFor(() => screen.getByRole("listbox"));

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      const dropdown = screen.queryByRole("listbox");
      expect(dropdown).not.toBeInTheDocument();
    });
  });

  test("arrow keys navigate dropdown items", async () => {
    const mockSearch = vi.fn().mockResolvedValue(mockCustomers);


    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a" } });

    await waitFor(() => screen.getByRole("listbox"));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);

    expect(options[0]).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(input, { key: "ArrowDown" });

    await waitFor(() => {
      expect(options[0]).toHaveAttribute("aria-selected", "true");
    });

    fireEvent.keyDown(input, { key: "ArrowDown" });

    await waitFor(() => {
      expect(options[1]).toHaveAttribute("aria-selected", "true");
    });

    fireEvent.keyDown(input, { key: "ArrowUp" });

    await waitFor(() => {
      expect(options[0]).toHaveAttribute("aria-selected", "true");
    });
  });

  test("Enter key selects highlighted item", async () => {
    const onSelect = vi.fn();
    const mockSearch = vi.fn().mockResolvedValue(mockCustomers);


    render(<CustomerSelector onSelect={onSelect} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a" } });

    await waitFor(() => screen.getByRole("listbox"));

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(mockCustomers[0]);
    });
  });

  test("clears results when search query is empty", async () => {
    const mockSearch = vi.fn().mockResolvedValue(mockCustomers);


    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "mario" } });
    await waitFor(() => screen.getByRole("listbox"));

    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => {
      const dropdown = screen.queryByRole("listbox");
      expect(dropdown).not.toBeInTheDocument();
    });
  });

  test("disabled state prevents input", async () => {
    render(<CustomerSelector onSelect={vi.fn()} disabled={true} searchFn={vi.fn().mockResolvedValue([])} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    expect(input).toBeDisabled();
  });
});
