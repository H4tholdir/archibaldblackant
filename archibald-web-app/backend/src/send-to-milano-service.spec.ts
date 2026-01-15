import { describe, expect, test, beforeEach, vi } from "vitest";
import type { BrowserContext, Page } from "puppeteer";
import { SendToMilanoService, type SendToMilanoResult } from "./send-to-milano-service";
import { BrowserPool } from "./browser-pool";
import { config } from "./config";

describe("SendToMilanoService", () => {
  let service: SendToMilanoService;
  let mockContext: BrowserContext;
  let mockPage: Page;

  beforeEach(() => {
    service = new SendToMilanoService();

    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn(),
      click: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      isClosed: vi.fn().mockReturnValue(false),
      url: vi.fn().mockReturnValue("https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/"),
    } as any;

    mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    } as any;
  });

  describe("sendToMilano", () => {
    test("successfully sends order to Milano", async () => {
      vi.spyOn(BrowserPool.getInstance(), "acquireContext").mockResolvedValue(mockContext);
      vi.spyOn(BrowserPool.getInstance(), "releaseContext").mockResolvedValue(undefined);

      vi.spyOn(config.features, "sendToMilanoEnabled", "get").mockReturnValue(true);

      (mockPage.evaluate as any)
        .mockResolvedValueOnce(true) // checkbox found
        .mockResolvedValueOnce(true); // success confirmed

      const result = await service.sendToMilano("testOrderId", "testUserId");

      expect(result.success).toBe(true);
      expect(result.message).toContain("sent to Milano successfully");
      expect(result.orderId).toBe("testOrderId");
      expect(mockPage.goto).toHaveBeenCalledWith(
        "https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/",
        expect.any(Object)
      );
    });

    test("returns error when feature flag is disabled", async () => {
      vi.spyOn(config.features, "sendToMilanoEnabled", "get").mockReturnValue(false);

      const result = await service.sendToMilano("testOrderId", "testUserId");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Send to Milano feature is currently disabled");
      expect(result.orderId).toBe("testOrderId");
    });

    test("returns error when order checkbox not found", async () => {
      vi.spyOn(BrowserPool.getInstance(), "acquireContext").mockResolvedValue(mockContext);
      vi.spyOn(BrowserPool.getInstance(), "releaseContext").mockResolvedValue(undefined);
      vi.spyOn(config.features, "sendToMilanoEnabled", "get").mockReturnValue(true);

      (mockPage.evaluate as any).mockResolvedValueOnce(false); // checkbox not found

      const result = await service.sendToMilano("testOrderId", "testUserId");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Order checkbox not found");
      expect(result.orderId).toBe("testOrderId");
    });

    test("handles network timeout with descriptive error", async () => {
      vi.spyOn(BrowserPool.getInstance(), "acquireContext").mockResolvedValue(mockContext);
      vi.spyOn(BrowserPool.getInstance(), "releaseContext").mockResolvedValue(undefined);
      vi.spyOn(config.features, "sendToMilanoEnabled", "get").mockReturnValue(true);

      (mockPage.goto as any).mockRejectedValueOnce(new Error("Navigation timeout"));

      const result = await service.sendToMilano("testOrderId", "testUserId");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Navigation timeout");
      expect(result.orderId).toBe("testOrderId");
    });

    test("handles Archibald error gracefully", async () => {
      vi.spyOn(BrowserPool.getInstance(), "acquireContext").mockResolvedValue(mockContext);
      vi.spyOn(BrowserPool.getInstance(), "releaseContext").mockResolvedValue(undefined);
      vi.spyOn(config.features, "sendToMilanoEnabled", "get").mockReturnValue(true);

      (mockPage.evaluate as any)
        .mockResolvedValueOnce(true) // checkbox found
        .mockResolvedValueOnce(false); // operation failed

      const result = await service.sendToMilano("testOrderId", "testUserId");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to verify success");
      expect(result.orderId).toBe("testOrderId");
    });

    test("releases context even on error", async () => {
      const releaseContextSpy = vi.spyOn(BrowserPool.getInstance(), "releaseContext");
      vi.spyOn(BrowserPool.getInstance(), "acquireContext").mockResolvedValue(mockContext);
      vi.spyOn(config.features, "sendToMilanoEnabled", "get").mockReturnValue(true);

      (mockPage.goto as any).mockRejectedValueOnce(new Error("Test error"));

      await service.sendToMilano("testOrderId", "testUserId");

      expect(releaseContextSpy).toHaveBeenCalledWith("testUserId", mockContext, false);
    });
  });
});
