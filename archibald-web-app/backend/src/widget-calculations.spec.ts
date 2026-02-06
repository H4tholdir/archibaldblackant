import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { determineHeroStatus } from "./widget-calculations";
import type { WidgetStatus } from "./widget-calculations";

const STATUS_RANK: Record<WidgetStatus, number> = {
  emergency: 0,
  critical: 1,
  attention: 2,
  "on-track": 3,
  excellent: 4,
  champion: 5,
  legendary: 6,
};

describe("determineHeroStatus", () => {
  test("14983/25000 al giorno 6 su 22 lavorativi → legendary", () => {
    const result = determineHeroStatus(14983, 25000, 14983 / 6, 16, 6);

    expect(result.status).toBe("legendary");
    expect(result.projectedMonthRevenue).toBeGreaterThan(25000 * 2);
  });

  test("target raggiunto con passo basso → almeno excellent", () => {
    const result = determineHeroStatus(25000, 25000, 500, 5, 25);

    expect(STATUS_RANK[result.status]).toBeGreaterThanOrEqual(
      STATUS_RANK["excellent"],
    );
  });

  test("meta' mese con buon passo → on-track o meglio", () => {
    const monthlyTarget = 25000;
    const dayOfMonth = 15;
    const currentRevenue = 14000;
    const avgDaily = currentRevenue / dayOfMonth;
    const workingDaysRemaining = 10;

    const result = determineHeroStatus(
      currentRevenue,
      monthlyTarget,
      avgDaily,
      workingDaysRemaining,
      dayOfMonth,
    );

    // proiezione = 14000 + 933*10 = ~23333, 93% del target → on-track
    expect(STATUS_RANK[result.status]).toBeGreaterThanOrEqual(
      STATUS_RANK["on-track"],
    );
  });

  test("giorno 1, zero fatturato → on-track (guardrail)", () => {
    const result = determineHeroStatus(0, 25000, 0, 22, 1);

    expect(result.status).toBe("on-track");
  });

  test("giorno 3, fatturato < 10% → on-track (guardrail)", () => {
    const result = determineHeroStatus(2000, 25000, 666, 20, 3);

    expect(result.status).toBe("on-track");
  });

  test("giorno 4, fatturato < 10% → non usa guardrail", () => {
    const result = determineHeroStatus(100, 25000, 25, 18, 4);

    expect(result.status).not.toBe("on-track");
  });

  test("fine mese, sotto target con passo basso → critical o emergency", () => {
    const result = determineHeroStatus(5000, 25000, 200, 2, 28);

    expect(STATUS_RANK[result.status]).toBeLessThanOrEqual(
      STATUS_RANK["critical"],
    );
  });

  test("fatturato >= 200% del target → legendary (override assoluto)", () => {
    const result = determineHeroStatus(50000, 25000, 100, 5, 25);

    expect(result.status).toBe("legendary");
  });

  test("fatturato >= 100% del target → almeno excellent (override assoluto)", () => {
    const result = determineHeroStatus(25000, 25000, 0, 0, 30);

    expect(STATUS_RANK[result.status]).toBeGreaterThanOrEqual(
      STATUS_RANK["excellent"],
    );
  });

  test("projectedMonthRevenue = revenue + avgDaily * daysRemaining", () => {
    const currentRevenue = 10000;
    const avgDaily = 1000;
    const daysRemaining = 10;

    const result = determineHeroStatus(
      currentRevenue,
      25000,
      avgDaily,
      daysRemaining,
      15,
    );

    expect(result.projectedMonthRevenue).toBe(
      currentRevenue + avgDaily * daysRemaining,
    );
  });

  test("projectedProgress = projectedRevenue / target", () => {
    const target = 25000;
    const currentRevenue = 10000;
    const avgDaily = 1000;
    const daysRemaining = 10;

    const result = determineHeroStatus(
      currentRevenue,
      target,
      avgDaily,
      daysRemaining,
      15,
    );

    const expectedProjected = currentRevenue + avgDaily * daysRemaining;
    expect(result.projectedProgress).toBe(expectedProjected / target);
  });

  describe("properties", () => {
    test("monotonicity: piu' alta la proiezione, status uguale o migliore", () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 50000 }),
          fc.nat({ max: 50000 }),
          fc.nat({ max: 5000 }),
          fc.nat({ max: 22 }),
          fc.integer({ min: 4, max: 28 }),
          (revenue, target, avgDaily, daysRemaining, dayOfMonth) => {
            if (target === 0) return true;

            const resultLow = determineHeroStatus(
              revenue,
              target,
              avgDaily,
              daysRemaining,
              dayOfMonth,
            );
            const resultHigh = determineHeroStatus(
              revenue,
              target,
              avgDaily + 500,
              daysRemaining,
              dayOfMonth,
            );

            return (
              STATUS_RANK[resultHigh.status] >= STATUS_RANK[resultLow.status]
            );
          },
        ),
      );
    });

    test("override assoluto: revenue >= target * 2 → sempre legendary", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100000 }),
          fc.nat({ max: 5000 }),
          fc.nat({ max: 22 }),
          fc.integer({ min: 1, max: 28 }),
          (target, avgDaily, daysRemaining, dayOfMonth) => {
            const revenue = target * 2;
            const result = determineHeroStatus(
              revenue,
              target,
              avgDaily,
              daysRemaining,
              dayOfMonth,
            );
            return result.status === "legendary";
          },
        ),
      );
    });

    test("override assoluto: revenue >= target → almeno excellent", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100000 }),
          fc.nat({ max: 5000 }),
          fc.nat({ max: 22 }),
          fc.integer({ min: 1, max: 28 }),
          (target, avgDaily, daysRemaining, dayOfMonth) => {
            const revenue = target;
            const result = determineHeroStatus(
              revenue,
              target,
              avgDaily,
              daysRemaining,
              dayOfMonth,
            );
            return STATUS_RANK[result.status] >= STATUS_RANK["excellent"];
          },
        ),
      );
    });

    test("status e' sempre un WidgetStatus valido", () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 100000 }),
          fc.integer({ min: 1, max: 100000 }),
          fc.nat({ max: 10000 }),
          fc.nat({ max: 30 }),
          fc.integer({ min: 1, max: 31 }),
          (revenue, target, avgDaily, daysRemaining, dayOfMonth) => {
            const result = determineHeroStatus(
              revenue,
              target,
              avgDaily,
              daysRemaining,
              dayOfMonth,
            );
            return result.status in STATUS_RANK;
          },
        ),
      );
    });
  });
});
