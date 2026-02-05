import { describe, test, expect } from "vitest";
import {
  calculateArticleProgress,
  formatProgressLabel,
  getProgressMilestone,
} from "./job-progress-mapper";

describe("calculateArticleProgress", () => {
  test("returns 42% for first of 5 articles", () => {
    expect(calculateArticleProgress(1, 5)).toBe(42);
  });

  test("returns 70% for last article", () => {
    expect(calculateArticleProgress(5, 5)).toBe(70);
  });

  test("returns 35% for first article", () => {
    expect(calculateArticleProgress(1, 10)).toBe(39);
  });
});

describe("formatProgressLabel", () => {
  test("replaces placeholders", () => {
    expect(
      formatProgressLabel("Articolo {current} di {total}", {
        current: 2,
        total: 5,
      }),
    ).toBe("Articolo 2 di 5");
  });

  test("returns template as-is when no metadata", () => {
    expect(formatProgressLabel("Test label")).toBe("Test label");
  });

  test("handles multiple placeholders", () => {
    expect(
      formatProgressLabel("{type} {current} di {total}", {
        type: "Item",
        current: 3,
        total: 10,
      }),
    ).toBe("Item 3 di 10");
  });
});

describe("getProgressMilestone", () => {
  test("returns milestone for navigation.ordini", () => {
    const result = getProgressMilestone("navigation.ordini");
    expect(result).toEqual({ progress: 10, label: "Apertura sezione ordini" });
  });

  test("calculates dynamic progress for articles", () => {
    const result = getProgressMilestone("form.articles.progress", {
      currentArticle: 2,
      totalArticles: 5,
    });
    expect(result?.progress).toBe(49);
    expect(result?.label).toBe("Inserimento articolo 2 di 5");
  });

  test("returns null for unknown category", () => {
    const result = getProgressMilestone("unknown.category");
    expect(result).toBeNull();
  });

  test("returns milestone for form.customer", () => {
    const result = getProgressMilestone("form.customer");
    expect(result).toEqual({ progress: 25, label: "Inserimento cliente" });
  });
});
