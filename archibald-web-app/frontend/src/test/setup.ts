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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).Temporal === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plainDateImpl: any = function (year: number, month: number, day: number) {
    return { year, month, day };
  };
  plainDateImpl.from = (input: string | { year: number; month: number; day: number }) => {
    if (typeof input === "string") {
      const [year, month, day] = input.split("-").map(Number);
      return plainDateImpl(year, month, day);
    }
    return plainDateImpl(input.year, input.month, input.day);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Temporal = {
    PlainDate: plainDateImpl,
    Now: {
      plainDateISO: () => {
        const now = new Date();
        return plainDateImpl(now.getFullYear(), now.getMonth() + 1, now.getDate());
      },
    },
  };
}
