/**
 * Simple logger utility with environment-aware levels
 * 🔧 FIX: Reduce console clutter in production
 */

const isDevelopment = import.meta.env.MODE === "development";

export const logger = {
  /**
   * Debug logs - only in development
   */
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Info logs - always shown
   */
  info: (...args: any[]) => {
    console.log(...args);
  },

  /**
   * Warning logs - always shown
   */
  warn: (...args: any[]) => {
    console.warn(...args);
  },

  /**
   * Error logs - always shown
   */
  error: (...args: any[]) => {
    console.error(...args);
  },
};
