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
