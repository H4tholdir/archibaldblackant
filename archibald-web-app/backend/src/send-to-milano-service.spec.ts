import { describe, expect, test, beforeEach, vi } from "vitest";
import { SendToMilanoService } from "./send-to-milano-service";
import { config } from "./config";
import { ArchibaldBot } from "./bot/archibald-bot";

vi.mock("./bot/archibald-bot", () => {
  return {
    ArchibaldBot: vi.fn(),
  };
});

const MockedArchibaldBot = vi.mocked(ArchibaldBot);

function createMockBot() {
  const mockBot = {
    initialize: vi.fn().mockResolvedValue(undefined),
    sendOrderToVerona: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  MockedArchibaldBot.mockImplementation(() => mockBot as any);
  return mockBot;
}

describe("SendToMilanoService", () => {
  let service: SendToMilanoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SendToMilanoService();
  });

  describe("sendToMilano", () => {
    test("returns error when feature flag is disabled", async () => {
      vi.spyOn(config.features, "sendToMilanoEnabled", "get").mockReturnValue(
        false,
      );

      const result = await service.sendToMilano("testOrderId", "testUserId");

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Send to Milano feature is currently disabled",
      );
      expect(result.orderId).toBe("testOrderId");
    });

    test("delegates to ArchibaldBot.sendOrderToVerona on success", async () => {
      vi.spyOn(config.features, "sendToMilanoEnabled", "get").mockReturnValue(
        true,
      );
      const mockBot = createMockBot();
      mockBot.sendOrderToVerona.mockResolvedValue({
        success: true,
        message: "Order sent to Verona",
      });

      const result = await service.sendToMilano("testOrderId", "testUserId");

      expect(result.success).toBe(true);
      expect(result.orderId).toBe("testOrderId");
      expect(result.sentAt).toBeDefined();
      expect(mockBot.initialize).toHaveBeenCalled();
      expect(mockBot.sendOrderToVerona).toHaveBeenCalledWith("testOrderId");
      expect(mockBot.close).toHaveBeenCalled();
    });

    test("returns error when bot reports failure", async () => {
      vi.spyOn(config.features, "sendToMilanoEnabled", "get").mockReturnValue(
        true,
      );
      const mockBot = createMockBot();
      mockBot.sendOrderToVerona.mockResolvedValue({
        success: false,
        message: "Order not found in Archibald",
      });

      const result = await service.sendToMilano("testOrderId", "testUserId");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Order not found in Archibald");
      expect(result.orderId).toBe("testOrderId");
    });

    test("handles bot initialization error gracefully", async () => {
      vi.spyOn(config.features, "sendToMilanoEnabled", "get").mockReturnValue(
        true,
      );
      const mockBot = createMockBot();
      mockBot.initialize.mockRejectedValue(new Error("Browser launch failed"));

      const result = await service.sendToMilano("testOrderId", "testUserId");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Browser launch failed");
      expect(result.orderId).toBe("testOrderId");
      expect(mockBot.close).toHaveBeenCalled();
    });

    test("closes bot even when sendOrderToVerona throws", async () => {
      vi.spyOn(config.features, "sendToMilanoEnabled", "get").mockReturnValue(
        true,
      );
      const mockBot = createMockBot();
      mockBot.sendOrderToVerona.mockRejectedValue(
        new Error("Navigation timeout"),
      );

      const result = await service.sendToMilano("testOrderId", "testUserId");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Navigation timeout");
      expect(mockBot.close).toHaveBeenCalled();
    });
  });
});
