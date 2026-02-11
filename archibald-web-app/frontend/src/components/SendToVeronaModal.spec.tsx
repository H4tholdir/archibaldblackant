import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SendToVeronaModal } from "./SendToVeronaModal";

describe("SendToVeronaModal", () => {
  test("does not render when isOpen is false", () => {
    const { container } = render(
      <SendToVeronaModal
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        orderId="ORD/001"
        customerName="Test Customer"
        isLoading={false}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  test("renders modal with order info when open", () => {
    render(
      <SendToVeronaModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        orderId="ORD/001"
        customerName="Test Customer"
        isLoading={false}
      />,
    );

    expect(screen.getByText("Invia Ordine a Verona")).toBeInTheDocument();
    expect(screen.getByText(/Test Customer/)).toBeInTheDocument();
    expect(screen.getByText(/ORD\/001/)).toBeInTheDocument();
  });

  test("displays warning message prominently", () => {
    render(
      <SendToVeronaModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        orderId="ORD/001"
        customerName="Test Customer"
        isLoading={false}
      />,
    );

    expect(screen.getByText("Attenzione")).toBeInTheDocument();
    expect(
      screen.getByText(/NON potrà più essere modificato/),
    ).toBeInTheDocument();
    expect(screen.getByText(/irreversibile/)).toBeInTheDocument();
  });

  test("calls onConfirm when confirm button clicked", () => {
    const onConfirm = vi.fn();

    render(
      <SendToVeronaModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        orderId="ORD/001"
        customerName="Test Customer"
        isLoading={false}
      />,
    );

    const confirmButton = screen.getByText("Conferma e Invia");
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("calls onClose when cancel button clicked", () => {
    const onClose = vi.fn();

    render(
      <SendToVeronaModal
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        orderId="ORD/001"
        customerName="Test Customer"
        isLoading={false}
      />,
    );

    const cancelButton = screen.getByText("Annulla");
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("disables buttons when loading", () => {
    render(
      <SendToVeronaModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        orderId="ORD/001"
        customerName="Test Customer"
        isLoading={true}
      />,
    );

    const buttons = screen.getAllByRole("button");
    const cancelButton = buttons.find((btn) => btn.textContent === "Annulla");
    const confirmButton = buttons.find((btn) =>
      btn.textContent?.includes("Invio in corso"),
    );

    expect(cancelButton).toBeDisabled();
    expect(confirmButton).toBeDisabled();
  });

  test("shows loading state on confirm button", () => {
    render(
      <SendToVeronaModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        orderId="ORD/001"
        customerName="Test Customer"
        isLoading={true}
      />,
    );

    expect(screen.getByText("Invio in corso...")).toBeInTheDocument();
    expect(screen.queryByText("Conferma e Invia")).not.toBeInTheDocument();
  });
});
