import { describe, expect, test } from "vitest";
import { extractCycleSizeWarnings } from "./cycle-size-warning";
import type { CycleSizeWarning } from "./cycle-size-warning";

describe("extractCycleSizeWarnings", () => {
  test("extracts OK warning from stderr", () => {
    const stderr =
      'Detected cycle size: 8 pages\nCYCLE_SIZE_WARNING:{"parser":"products","detected":8,"expected":8,"status":"OK"}\nsome other output';
    const result = extractCycleSizeWarnings(stderr);
    expect(result).toEqual([
      { parser: "products", detected: 8, expected: 8, status: "OK" },
    ]);
  });

  test("extracts CHANGED warning from stderr", () => {
    const stderr =
      'CYCLE_SIZE_WARNING:{"parser":"prices","detected":4,"expected":3,"status":"CHANGED"}';
    const result = extractCycleSizeWarnings(stderr);
    expect(result).toEqual([
      { parser: "prices", detected: 4, expected: 3, status: "CHANGED" },
    ]);
  });

  test("extracts DETECTION_FAILED warning from stderr", () => {
    const stderr =
      'CYCLE_SIZE_WARNING:{"parser":"clienti","detected":9,"expected":9,"status":"DETECTION_FAILED"}';
    const result = extractCycleSizeWarnings(stderr);
    expect(result).toEqual([
      {
        parser: "clienti",
        detected: 9,
        expected: 9,
        status: "DETECTION_FAILED",
      },
    ]);
  });

  test("extracts multiple warnings from mixed stderr", () => {
    const stderr = [
      "Some debug output",
      'CYCLE_SIZE_WARNING:{"parser":"products","detected":8,"expected":8,"status":"OK"}',
      "Warning: something else",
      'CYCLE_SIZE_WARNING:{"parser":"prices","detected":4,"expected":3,"status":"CHANGED"}',
      "",
    ].join("\n");
    const result = extractCycleSizeWarnings(stderr);
    expect(result).toEqual([
      { parser: "products", detected: 8, expected: 8, status: "OK" },
      { parser: "prices", detected: 4, expected: 3, status: "CHANGED" },
    ]);
  });

  test("returns empty array for stderr without warnings", () => {
    const stderr = "Detected cycle size: 8 pages\nSome other output\n";
    expect(extractCycleSizeWarnings(stderr)).toEqual([]);
  });

  test("returns empty array for empty stderr", () => {
    expect(extractCycleSizeWarnings("")).toEqual([]);
  });

  test("ignores malformed warning lines", () => {
    const stderr = [
      "CYCLE_SIZE_WARNING:not-json",
      'CYCLE_SIZE_WARNING:{"parser":"ok","detected":3,"expected":3,"status":"OK"}',
      "CYCLE_SIZE_WARNING:{broken json",
    ].join("\n");
    const result = extractCycleSizeWarnings(stderr);
    expect(result).toEqual([
      { parser: "ok", detected: 3, expected: 3, status: "OK" },
    ]);
  });

  test("ignores warning lines missing required fields", () => {
    const stderr =
      'CYCLE_SIZE_WARNING:{"parser":"test","detected":3}';
    expect(extractCycleSizeWarnings(stderr)).toEqual([]);
  });
});
