import { describe, expect, test, beforeEach, vi } from "vitest";
import { SlowdownOptimizer } from "./slowdown-optimizer";
import type { ArchibaldBot } from "./archibald-bot";

describe("SlowdownOptimizer", () => {
  let optimizer: SlowdownOptimizer;
  let mockBot: ArchibaldBot;

  beforeEach(() => {
    mockBot = {
      createOrder: vi.fn().mockResolvedValue("ORDER_123"),
      close: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
      login: vi.fn().mockResolvedValue(undefined),
      page: {} as any,
      context: {} as any,
    } as any;

    optimizer = new SlowdownOptimizer(mockBot, "fresis", "TD1272.314");
  });

  describe("optimizeStep", () => {
    test("returns value between 0-200 when all tests pass", async () => {
      const result = await optimizer.optimizeStep("test_step");

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(200);
    });

    test("performs binary search with multiple test values", async () => {
      await optimizer.optimizeStep("test_step");

      // Binary search should test multiple values to converge
      const callCount = (mockBot.createOrder as any).mock.calls.length;
      expect(callCount).toBeGreaterThan(1);
    });

    test("uses correct customer and article in test orders", async () => {
      await optimizer.optimizeStep("test_step");

      const firstCall = (mockBot.createOrder as any).mock.calls[0];
      const orderData = firstCall[0];

      expect(orderData.customerName).toBe("fresis");
      expect(orderData.items[0].articleCode).toBe("TD1272.314");
    });

    test("passes slowdown config to bot.createOrder", async () => {
      await optimizer.optimizeStep("click_ordini");

      const firstCall = (mockBot.createOrder as any).mock.calls[0];
      const slowdownConfig = firstCall[1];

      expect(slowdownConfig).toBeDefined();
      expect(slowdownConfig.click_ordini).toBeDefined();
      expect(typeof slowdownConfig.click_ordini).toBe("number");
    });
  });

  describe("hasConverged", () => {
    test("returns true when range is less than 5ms", () => {
      const step = {
        stepName: "test",
        minValue: 95,
        maxValue: 98,
        testedValues: [],
        crashes: [],
        converged: false,
        optimalValue: null,
      };

      const optimizer = new SlowdownOptimizer(mockBot, "fresis", "TD1272.314");
      const result = (optimizer as any).hasConverged(step);

      expect(result).toBe(true);
    });

    test("returns false when range is 5ms or more", () => {
      const step = {
        stepName: "test",
        minValue: 50,
        maxValue: 100,
        testedValues: [],
        crashes: [],
        converged: false,
        optimalValue: null,
      };

      const optimizer = new SlowdownOptimizer(mockBot, "fresis", "TD1272.314");
      const result = (optimizer as any).hasConverged(step);

      expect(result).toBe(false);
    });
  });

  describe("getNextTestValue", () => {
    test("returns midpoint of range", () => {
      const step = {
        stepName: "test",
        minValue: 0,
        maxValue: 200,
        testedValues: [],
        crashes: [],
        converged: false,
        optimalValue: null,
      };

      const optimizer = new SlowdownOptimizer(mockBot, "fresis", "TD1272.314");
      const result = (optimizer as any).getNextTestValue(step);

      expect(result).toBe(100);
    });

    test("rounds down fractional midpoints", () => {
      const step = {
        stepName: "test",
        minValue: 0,
        maxValue: 101,
        testedValues: [],
        crashes: [],
        converged: false,
        optimalValue: null,
      };

      const optimizer = new SlowdownOptimizer(mockBot, "fresis", "TD1272.314");
      const result = (optimizer as any).getNextTestValue(step);

      expect(result).toBe(50);
    });
  });

  describe("getState", () => {
    test("returns optimization state map", async () => {
      await optimizer.optimizeStep("test_step");

      const state = optimizer.getState();

      expect(state).toBeInstanceOf(Map);
      expect(state.has("test_step")).toBe(true);
    });

    test("includes step details in state", async () => {
      await optimizer.optimizeStep("test_step");

      const state = optimizer.getState();
      const step = state.get("test_step");

      expect(step).toBeDefined();
      expect(step!.stepName).toBe("test_step");
      expect(step!.testedValues.length).toBeGreaterThan(0);
      expect(step!.optimalValue).not.toBeNull();
    });
  });

  describe("crash detection", () => {
    test("detects crash and increases minValue", async () => {
      // Mock bot to fail on first attempt, succeed on subsequent
      let attemptCount = 0;
      mockBot.createOrder = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error("Simulated crash");
        }
        return Promise.resolve("ORDER_123");
      });

      await optimizer.optimizeStep("test_step");

      const state = optimizer.getState();
      const step = state.get("test_step");

      expect(step!.crashes.length).toBe(1);
      expect(step!.crashes[0]).toBe(100); // First midpoint that crashed
    });

    test("stops after max crashes limit", async () => {
      // Mock bot to always fail
      mockBot.createOrder = vi
        .fn()
        .mockRejectedValue(new Error("Always fails"));
      mockBot.close = vi.fn().mockResolvedValue(undefined);
      mockBot.initialize = vi.fn().mockResolvedValue(undefined);
      mockBot.login = vi.fn().mockResolvedValue(undefined);

      await optimizer.optimizeStep("test_step");

      const state = optimizer.getState();
      const step = state.get("test_step");

      // Should stop at max crashes limit (10)
      expect(step!.crashes.length).toBeLessThanOrEqual(10);
    });

    test("calls bot.close after crash", async () => {
      // Mock bot to fail once
      let attemptCount = 0;
      mockBot.createOrder = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error("Simulated crash");
        }
        return Promise.resolve("ORDER_123");
      });
      mockBot.close = vi.fn().mockResolvedValue(undefined);
      mockBot.initialize = vi.fn().mockResolvedValue(undefined);
      mockBot.login = vi.fn().mockResolvedValue(undefined);

      await optimizer.optimizeStep("test_step");

      // Bot should be closed and reinitialized after crash
      expect(mockBot.close).toHaveBeenCalled();
      expect(mockBot.initialize).toHaveBeenCalled();
      expect(mockBot.login).toHaveBeenCalled();
    });
  });
});
