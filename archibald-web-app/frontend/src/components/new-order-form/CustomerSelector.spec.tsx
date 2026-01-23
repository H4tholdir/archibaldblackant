import { describe, test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { CustomerSelector } from "./CustomerSelector";
import type { Customer } from "../../db/schema";

const mockCustomer: Customer = {
  id: "1",
  name: "Mario Rossi",
  code: "MR001",
  taxCode: "RSSMRA80A01H501Z",
  address: "Via Roma 1",
  city: "Milano",
  province: "MI",
  cap: "20100",
  phone: "0212345678",
  email: "mario.rossi@example.com",
  fax: "",
  lastModified: "2024-01-01",
  hash: "abc123",
};

const mockCustomer2: Customer = {
  id: "2",
  name: "Luigi Verdi",
  code: "LV002",
  taxCode: "VRDLGU85B02F205W",
  address: "Via Verdi 2",
  city: "Roma",
  province: "RM",
  cap: "00100",
  phone: "0687654321",
  email: "luigi.verdi@example.com",
  fax: "",
  lastModified: "2024-01-02",
  hash: "def456",
};

describe("CustomerSelector", () => {
  test("renders input with placeholder", () => {
    render(<CustomerSelector onSelect={vi.fn()} />);
    expect(
      screen.getByPlaceholderText("Cerca cliente per nome..."),
    ).toBeInTheDocument();
  });

  test("renders custom placeholder", () => {
    render(
      <CustomerSelector onSelect={vi.fn()} placeholder="Cerca cliente..." />,
    );
    expect(screen.getByPlaceholderText("Cerca cliente...")).toBeInTheDocument();
  });

  test("typing triggers debounced search after 300ms", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockCustomer]);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    await user.type(input, "mario");

    // Search should NOT be called immediately
    expect(mockSearch).not.toHaveBeenCalled();

    // Wait for debounce (300ms)
    await waitFor(
      () => {
        expect(mockSearch).toHaveBeenCalledWith("mario");
      },
      { timeout: 500 },
    );
  });

  test("displays filtered results in dropdown", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockCustomer, mockCustomer2]);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    await user.type(input, "rossi");

    await waitFor(() => expect(mockSearch).toHaveBeenCalled());

    // Check both customers appear
    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("Luigi Verdi")).toBeInTheDocument();
  });

  test("clicking result selects customer and closes dropdown", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const mockSearch = vi.fn().mockResolvedValue([mockCustomer]);

    render(<CustomerSelector onSelect={onSelect} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    await user.type(input, "mario");

    await waitFor(() => screen.getByText("Mario Rossi"));

    const result = screen.getByText("Mario Rossi");
    await user.click(result);

    expect(onSelect).toHaveBeenCalledWith(mockCustomer);

    // Dropdown should be closed (result not visible in dropdown anymore)
    const dropdown = screen.queryByRole("listbox");
    expect(dropdown).not.toBeInTheDocument();
  });

  test("escape key closes dropdown", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockCustomer]);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    await user.type(input, "mario");

    await waitFor(() => screen.getByRole("listbox"));

    await user.keyboard("{Escape}");

    const dropdown = screen.queryByRole("listbox");
    expect(dropdown).not.toBeInTheDocument();
  });

  test("arrow down navigates to next item", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockCustomer, mockCustomer2]);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    await user.type(input, "mario");

    await waitFor(() => screen.getByRole("listbox"));

    await user.keyboard("{ArrowDown}");

    // First item should be highlighted (aria-selected)
    const firstOption = screen
      .getByText("Mario Rossi")
      .closest('[role="option"]');
    expect(firstOption).toHaveAttribute("aria-selected", "true");
  });

  test("arrow up navigates to previous item", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockCustomer, mockCustomer2]);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    await user.type(input, "mario");

    await waitFor(() => screen.getByRole("listbox"));

    // Navigate down twice
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");

    // Navigate up once
    await user.keyboard("{ArrowUp}");

    // First item should be highlighted again
    const firstOption = screen
      .getByText("Mario Rossi")
      .closest('[role="option"]');
    expect(firstOption).toHaveAttribute("aria-selected", "true");
  });

  test("enter key selects highlighted item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const mockSearch = vi.fn().mockResolvedValue([mockCustomer, mockCustomer2]);

    render(<CustomerSelector onSelect={onSelect} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    await user.type(input, "mario");

    await waitFor(() => screen.getByRole("listbox"));

    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(mockCustomer);
  });

  test("shows loading state during search", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([mockCustomer]), 100);
        }),
    );

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    await user.type(input, "mario");

    // Wait for debounce
    await waitFor(() => expect(mockSearch).toHaveBeenCalled());

    // Loading indicator should appear
    expect(screen.getByText("Ricerca in corso...")).toBeInTheDocument();

    // Wait for results
    await waitFor(() => screen.getByText("Mario Rossi"));

    // Loading should be gone
    expect(screen.queryByText("Ricerca in corso...")).not.toBeInTheDocument();
  });

  test("shows error message on search failure", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockRejectedValue(new Error("API error"));

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    await user.type(input, "mario");

    await waitFor(() =>
      expect(screen.getByText("Errore durante la ricerca")).toBeInTheDocument(),
    );
  });

  test("displays selected customer confirmation", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockCustomer]);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    await user.type(input, "mario");

    await waitFor(() => screen.getByText("Mario Rossi"));

    const result = screen.getByText("Mario Rossi");
    await user.click(result);

    // Confirmation message should appear
    expect(screen.getByText(/Cliente selezionato:/i)).toBeInTheDocument();
    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
  });

  test("has correct ARIA attributes", () => {
    render(<CustomerSelector onSelect={vi.fn()} />);

    const input = screen.getByLabelText("Cerca cliente");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  test("ARIA expanded is true when dropdown open", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn().mockResolvedValue([mockCustomer]);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByLabelText("Cerca cliente");
    await user.type(input, "mario");

    await waitFor(() => screen.getByRole("listbox"));

    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  test("disabled prop disables input", () => {
    render(<CustomerSelector onSelect={vi.fn()} disabled={true} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");
    expect(input).toBeDisabled();
  });

  test("empty query shows no dropdown", async () => {
    const user = userEvent.setup();
    const mockSearch = vi.fn();

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText("Cerca cliente per nome...");

    // Type and then clear
    await user.type(input, "mario");
    await user.clear(input);

    // Wait a bit to ensure debounce timeout
    await new Promise((resolve) => setTimeout(resolve, 400));

    const dropdown = screen.queryByRole("listbox");
    expect(dropdown).not.toBeInTheDocument();
  });
});
