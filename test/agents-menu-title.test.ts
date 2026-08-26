/** agents-menu-title.test.ts — the /agents menu stats headline (issue 7u2). */

import { afterEach, describe, expect, it } from "vitest";
import { agentsMenuTitle } from "../src/index.js";
import { accumulateLifetimeStats, resetLifetimeStats } from "../src/lifetime-stats.js";

describe("agentsMenuTitle", () => {
  afterEach(resetLifetimeStats);

  it("is a plain title when nothing has run", () => {
    expect(agentsMenuTitle([])).toBe("Agents");
    expect(agentsMenuTitle([{ lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 }, toolUses: 0 }])).toBe("Agents");
  });

  it("shows the session total from live records", () => {
    const title = agentsMenuTitle([
      { lifetimeUsage: { input: 100, output: 200, cacheWrite: 50 }, toolUses: 3 },
    ]);
    expect(title).toContain("Session total: 750 token · 󱁤 3");
    expect(title).not.toContain("All-time total");
  });

  it("shows the all-time total from the permanent store", () => {
    accumulateLifetimeStats({
      lifetimeUsage: { input: 1_000, output: 2_000, cacheWrite: 100, cacheRead: 500, cost: 0.0042 },
      toolUses: 5,
      durationMs: 120_000,
      runs: 2,
    });
    const title = agentsMenuTitle([]);
    // Weighted: 3 × 2000 + 1000 + 0.2 × 500 + 100 = 7200.
    expect(title).toContain("All-time total: 7.2k token · ~$0.0042 · 󱁤 5 · 2 runs · 120.0s");
    expect(title).not.toContain("Session total");
  });

  it("combines session and all-time totals", () => {
    accumulateLifetimeStats({ lifetimeUsage: { input: 10, output: 20, cacheWrite: 5 }, toolUses: 1, durationMs: 1_000, runs: 1 });
    const title = agentsMenuTitle([{ lifetimeUsage: { input: 100, output: 200, cacheWrite: 50, cost: 0.001 }, toolUses: 2 }]);
    expect(title).toContain("Session total: 750 token · ~$0.001 · 󱁤 2");
    expect(title).toContain("All-time total: 75 token · 󱁤 1 · 1 run · 1.0s");
  });
});