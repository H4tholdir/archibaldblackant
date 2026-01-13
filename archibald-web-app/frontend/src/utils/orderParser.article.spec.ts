import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateArticleCode } from "./orderParser";

// Mock fetch globally
global.fetch = vi.fn();

describe("validateArticleCode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return exact match with 100% confidence", async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          id: "071104K2",
          name: "H71.104.032",
          description: "Fresa Test",
          packageContent: "5",
          multipleQty: 5,
          price: 25.5,
          confidence: 100,
          matchReason: "exact",
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await validateArticleCode("H71.104.032");

    expect(result.matchType).toBe("exact");
    expect(result.confidence).toBe(1.0);
    expect(result.product).toEqual({
      id: "071104K2",
      name: "H71.104.032",
      description: "Fresa Test",
      packageContent: "5",
      multipleQty: 5,
    });
    expect(result.suggestions).toEqual([]);
  });

  it("should return normalized match for code without dots", async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          id: "129104K2",
          name: "H129FSQ.104.023",
          description: "Fresa H129",
          packageContent: "5",
          multipleQty: 5,
          price: 30.0,
          confidence: 98,
          matchReason: "normalized",
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await validateArticleCode("H129FSQ104023");

    expect(result.matchType).toBe("normalized");
    expect(result.confidence).toBe(0.98);
    expect(result.product).toEqual({
      id: "129104K2",
      name: "H129FSQ.104.023",
      description: "Fresa H129",
      packageContent: "5",
      multipleQty: 5,
    });
    expect(result.suggestions).toEqual([]);
  });

  it("should return base pattern suggestions for wrong variant", async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          id: "845104K2",
          name: "845.104.016",
          description: "Fresa 845",
          packageContent: "5",
          multipleQty: 5,
          confidence: 85,
          matchReason: "fuzzy",
        },
        {
          id: "845104K3",
          name: "845.104.032",
          description: "Fresa 845",
          packageContent: "1",
          multipleQty: 1,
          confidence: 83,
          matchReason: "fuzzy",
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await validateArticleCode("845.104.023");

    expect(result.matchType).toBe("base_pattern");
    expect(result.basePattern).toBe("845.104");
    expect(result.confidence).toBe(0.7);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].code).toBe("845.104.016");
    expect(result.suggestions[0].variant).toBe("016");
    expect(result.suggestions[1].code).toBe("845.104.032");
    expect(result.error).toContain("Variante .023 non trovata");
  });

  it("should return fuzzy match with suggestions for medium confidence", async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          id: "071104K2",
          name: "H71.104.032",
          description: "Fresa H71",
          packageContent: "5",
          multipleQty: 5,
          confidence: 80,
          matchReason: "fuzzy",
        },
        {
          id: "071104K3",
          name: "H71.104.016",
          description: "Fresa H71",
          packageContent: "1",
          multipleQty: 1,
          confidence: 75,
          matchReason: "fuzzy",
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await validateArticleCode("H61.104.032");

    expect(result.matchType).toBe("fuzzy");
    expect(result.confidence).toBe(0.8);
    expect(result.product).toEqual({
      id: "071104K2",
      name: "H71.104.032",
      description: "Fresa H71",
      packageContent: "5",
      multipleQty: 5,
    });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].code).toBe("H71.104.016");
  });

  it("should return not_found when no products match", async () => {
    const mockResponse = {
      success: true,
      data: [],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await validateArticleCode("XXXYYY.999.888");

    expect(result.matchType).toBe("not_found");
    expect(result.confidence).toBe(0.0);
    expect(result.suggestions).toEqual([]);
    expect(result.error).toContain("non trovato");
  });

  it("should handle API errors gracefully", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

    const result = await validateArticleCode("Test");

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

    await validateArticleCode("H71.104.032");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/products/search?q=H71.104.032&limit=5",
    );
  });
});
