import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrderActions } from "./OrderActions";

describe("OrderActions", () => {
  test('shows "Invia a Milano" button for piazzato state', () => {
    render(
      <OrderActions
        orderId="ORD/001"
        currentState="piazzato"
        onSendToMilano={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("Invia a Milano")).toBeInTheDocument();
    expect(screen.queryByText("Modifica")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Ordine non modificabile"),
    ).not.toBeInTheDocument();
  });

  test('shows "Modifica" button for creato state', () => {
    render(
      <OrderActions
        orderId="ORD/001"
        currentState="creato"
        onSendToMilano={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("Modifica")).toBeInTheDocument();
    expect(screen.queryByText("Invia a Milano")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Ordine non modificabile"),
    ).not.toBeInTheDocument();
  });

  test('shows "Ordine non modificabile" for other states', () => {
    render(
      <OrderActions
        orderId="ORD/001"
        currentState="spedito"
        onSendToMilano={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("Ordine non modificabile")).toBeInTheDocument();
    expect(screen.queryByText("Invia a Milano")).not.toBeInTheDocument();
    expect(screen.queryByText("Modifica")).not.toBeInTheDocument();
  });

  test("calls onSendToMilano when button clicked", () => {
    const onSendToMilano = vi.fn();

    render(
      <OrderActions
        orderId="ORD/001"
        currentState="piazzato"
        onSendToMilano={onSendToMilano}
        onEdit={vi.fn()}
      />,
    );

    const button = screen.getByText("Invia a Milano");
    fireEvent.click(button);

    expect(onSendToMilano).toHaveBeenCalledTimes(1);
  });

  test("calls onEdit when button clicked", () => {
    const onEdit = vi.fn();

    render(
      <OrderActions
        orderId="ORD/001"
        currentState="creato"
        onSendToMilano={vi.fn()}
        onEdit={onEdit}
      />,
    );

    const button = screen.getByText("Modifica");
    fireEvent.click(button);

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test("renders Azioni section title", () => {
    render(
      <OrderActions
        orderId="ORD/001"
        currentState="creato"
        onSendToMilano={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("Azioni")).toBeInTheDocument();
  });
});
