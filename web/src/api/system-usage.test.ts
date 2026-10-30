import { describe, expect, it } from "vitest";
import {
  formatCompactNumber,
  formatCost,
  formatNumber,
  formatPercent,
  formatQuotaReset,
  parseProviderUsage,
  parseUsageReport,
} from "./system-usage";

describe("usage formatting", () => {
  it("formats counts with separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(Number.NaN)).toBe("—");
  });

  it("compacts large counts and strips trailing zeros", () => {
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(1500)).toBe("1.5K");
    expect(formatCompactNumber(1_000_000)).toBe("1M");
    expect(formatCompactNumber(2_500_000_000)).toBe("2.5B");
    expect(formatCompactNumber(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("formats costs with extra precision for sub-cent values", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(12.3)).toBe("$12.30");
    expect(formatCost(0.0042)).toBe("$0.0042");
    expect(formatCost(Number.NaN)).toBe("—");
  });

  it("bounds percentages to 0-100 and respects digits", () => {
    expect(formatPercent(72.46)).toBe("72.5%");
    expect(formatPercent(72.46, 0)).toBe("72%");
    expect(formatPercent(-5)).toBe("0.0%");
    expect(formatPercent(120)).toBe("100.0%");
    expect(formatPercent(Number.NaN)).toBe("—");
  });

  it("renders quota resets from minutes or hours", () => {
    expect(formatQuotaReset(undefined)).toBe("");
    expect(formatQuotaReset({ percent: 50, resetMinutes: 42 })).toBe("resets in 42m");
    expect(formatQuotaReset({ percent: 50, resetMinutes: 90 })).toBe("resets in 2h");
    expect(formatQuotaReset({ percent: 50, resetHours: 50 })).toBe("resets in 3d");
    expect(formatQuotaReset({ percent: 50, resetMinutes: 0 })).toBe("resets now");
  });
});

describe("usage parsers", () => {
  it("normalizes an empty report", () => {
    const report = parseUsageReport(null);
    expect(report.summary.totalTokens).toBe(0);
    expect(report.providers).toEqual([]);
    expect(report.scanInfo.transcriptsScanned).toBe(0);
  });

  it("keeps known fields and drops malformed rows", () => {
    const report = parseUsageReport({
      timeRange: "7d",
      granularity: "monthly",
      summary: { totalTokens: 10, cachePercentage: 25 },
      providers: [{ provider: "anthropic", cost: 1 }, null],
      modelBreakdown: [{ model: "m", provider: "anthropic", tokens: 5 }],
    });
    expect(report.timeRange).toBe("7d");
    expect(report.providers).toHaveLength(1);
    expect(report.providers[0]?.name).toBe("anthropic");
    expect(report.modelBreakdown[0]?.tokens).toBe(5);
    expect(report.summary.cachePercentage).toBe(25);
  });

  it("normalizes provider quota windows", () => {
    const usage = parseProviderUsage({
      generatedAt: 5,
      reports: [
        {
          provider: "openai",
          fiveHour: { percent: 10, resetMinutes: 30 },
          sevenDay: { percent: 40, resetHours: 4 },
        },
      ],
    });
    expect(usage.generatedAt).toBe(5);
    expect(usage.reports[0]?.fiveHour?.resetMinutes).toBe(30);
    expect(usage.reports[0]?.sevenDay?.resetHours).toBe(4);
    expect(usage.reports[0]?.monthly).toBeUndefined();
  });
});
