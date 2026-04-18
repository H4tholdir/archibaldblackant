import { describe, expect, test, vi, beforeEach } from "vitest";
import { addFresisDiscountForProduct } from "./fresis-discounts";
import { fetchWithRetry } from "../utils/fetch-with-retry";

vi.mock("../utils/fetch-with-retry", () => ({
  fetchWithRetry: vi.fn(),
}));

describe("addFresisDiscountForProduct", () => {
  const token = "test-token";
  const productId = "TD4041.000.";
  const discountPercent = 63;

  beforeEach(() => {
    vi.mocked(fetchWithRetry).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);
  });

  test("POSTa a /api/fresis-history/discounts con id, articleCode e discountPercent", async () => {
    await addFresisDiscountForProduct(token, productId, discountPercent);

    expect(fetchWithRetry).toHaveBeenCalledWith(
      "/api/fresis-history/discounts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          id: productId,
          articleCode: productId,
          discountPercent,
        }),
      }),
    );
  });

  test("lancia errore se la risposta non è ok", async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    } as Response);

    await expect(
      addFresisDiscountForProduct(token, productId, discountPercent),
    ).rejects.toThrow("Server error");
  });
});
