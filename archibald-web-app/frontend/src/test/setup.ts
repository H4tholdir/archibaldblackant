import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { Crypto } from "@peculiar/webcrypto";

// Polyfill Web Crypto API for tests
if (typeof globalThis.crypto === "undefined") {
  const crypto = new Crypto();
  Object.defineProperty(globalThis, "crypto", {
    value: crypto,
    writable: false,
    configurable: false,
  });
}

// Polyfill Temporal API for schedule-x tests
if (typeof globalThis.Temporal === "undefined") {
  // Minimal Temporal polyfill mock for schedule-x
  const plainDateConstructor = function (year: number, month: number, day: number) {
    return { year, month, day };
  };
  plainDateConstructor.from = (input: string | { year: number; month: number; day: number }) => {
    if (typeof input === "string") {
      const [year, month, day] = input.split("-").map(Number);
      return new plainDateConstructor(year, month, day);
    }
    return new plainDateConstructor(input.year, input.month, input.day);
  };
  Object.defineProperty(globalThis, "Temporal", {
    value: {
      PlainDate: plainDateConstructor,
      Now: {
        plainDateISO: () => {
          const now = new Date();
          return new plainDateConstructor(now.getFullYear(), now.getMonth() + 1, now.getDate());
        },
      },
    },
    writable: true,
    configurable: true,
  });
}
