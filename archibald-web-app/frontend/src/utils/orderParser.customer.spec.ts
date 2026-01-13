import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateCustomerName } from "./orderParser";
import type { CustomerValidationResult } from "./orderParser";

// Mock fetch globally
global.fetch = vi.fn();

describe("validateCustomerName", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return exact match with 100% confidence", async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          id: "CUST001",
          name: "Mario Rossi",
          confidence: 100,
          matchReason: "exact",
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await validateCustomerName("Mario Rossi");

    expect(result.matchType).toBe("exact");
    expect(result.confidence).toBe(1.0);
    expect(result.customer).toEqual({
      id: "CUST001",
      name: "Mario Rossi",
      vatNumber: undefined,
      email: undefined,
    });
    expect(result.suggestions).toEqual([]);
  });

  it("should return phonetic match without suggestions for exact phonetic match", async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          id: "CUST002",
          name: "Francis",
          confidence: 95,
          matchReason: "phonetic",
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await validateCustomerName("Fresis");

    expect(result.matchType).toBe("phonetic");
    expect(result.confidence).toBe(0.95);
    expect(result.customer).toEqual({
      id: "CUST002",
      name: "Francis",
      vatNumber: undefined,
      email: undefined,
    });
    expect(result.suggestions).toEqual([]); // No additional suggestions for high confidence match
  });

  it("should return phonetic match with suggestions for medium confidence", async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          id: "CUST002",
          name: "Francis",
          confidence: 80,
          matchReason: "phonetic",
        },
        {
          id: "CUST003",
          name: "Frances",
          confidence: 75,
          matchReason: "phonetic",
        },
        {
          id: "CUST004",
          name: "Francesca",
          confidence: 72,
          matchReason: "phonetic",
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await validateCustomerName("Fresis");

    expect(result.matchType).toBe("phonetic");
    expect(result.confidence).toBe(0.80);
    expect(result.customer).toEqual({
      id: "CUST002",
      name: "Francis",
      vatNumber: undefined,
      email: undefined,
    });
    expect(result.suggestions).toHaveLength(2); // Best match + 2 alternatives
    expect(result.suggestions[0].name).toBe("Frances");
    expect(result.suggestions[1].name).toBe("Francesca");
  });

  it("should return fuzzy match with multiple suggestions for low confidence", async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          id: "CUST005",
          name: "Giovanni Bianchi",
          confidence: 65,
          matchReason: "fuzzy",
          vatNumber: "IT12345678901",
        },
        {
          id: "CUST006",
          name: "Giovanni Verdi",
          confidence: 62,
          matchReason: "fuzzy",
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await validateCustomerName("Jovanni");

    expect(result.matchType).toBe("fuzzy");
    expect(result.confidence).toBe(0.65);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].name).toBe("Giovanni Bianchi");
    expect(result.suggestions[0].vatNumber).toBe("IT12345678901");
    expect(result.error).toContain("Forse intendevi");
  });

  it("should return not_found when no customers match", async () => {
    const mockResponse = {
      success: true,
      data: [],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await validateCustomerName("NonExistent");

    expect(result.matchType).toBe("not_found");
    expect(result.confidence).toBe(0.0);
    expect(result.suggestions).toEqual([]);
    expect(result.error).toContain("non trovato");
  });

  it("should handle API errors gracefully", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

    const result = await validateCustomerName("Test");

    expect(result.matchType).toBe("not_found");
    expect(result.confidence).toBe(0.0);
    expect(result.error).toContain("Errore durante la ricerca");
  });

  it("should call API with correct URL and parameters", async () => {
    const mockResponse = {
      success: true,
      data: [],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    await validateCustomerName("Test Customer");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/customers/search?q=Test%20Customer&limit=5",
    );
  });
});
