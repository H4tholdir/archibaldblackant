import { describe, it, expect } from "vitest";
import { config } from "./config";

describe("config", () => {
  it("should load config object", () => {
    expect(config).toBeDefined();
    expect(config).toBeTypeOf("object");
  });

  it("should define archibald url", () => {
    expect(config.archibald.url).toBeDefined();
    expect(config.archibald.url).toBeTypeOf("string");
  });

  it("should define server port as a number", () => {
    expect(config.server.port).toBeTypeOf("number");
    expect(config.server.port).toBeGreaterThan(0);
  });
});
