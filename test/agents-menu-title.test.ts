/** agents-menu-title.test.ts — the /agents menu stats headline (merged Total). */

import { afterEach, describe, expect, it } from "vitest";
import { agentsMenuTitle } from "../src/index.js";
import { accumulateLifetimeStats, resetLifetimeStats } from "../src/lifetime-stats.js";

describe("agentsMenuTitle", () => {
  afterEach(resetLifetimeStats);

  it("is a plain title when nothing has run", () => {
    expect(agentsMenuTitle([])).toBe("Agents");
    expect(agentsMenuTitle([{ lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 }, toolUses: 0 }])).toBe("Agents");
  });

  it("shows the merged total from live records", () => {
    const title = agentsMenuTitle([
      { lifetimeUsage: { input: 100, output: 200, cacheWrite: 50 }, toolUses: 3 },
    ]);
    // Live only: weighted 3*200+100+50=750, plus 1 live run (no timing)
    expect(title).toContain("Total: 750 token");
    expect(title).toContain("󱁤 3");
    expect(title).toContain("1 run");
    expect(title).not.toContain("Session total");
    expect(title).not.toContain("All-time");
  });

  it("shows the merged total from the permanent store", () => {
    accumulateLifetimeStats({
      lifetimeUsage: { input: 1_000, output: 2_000, cacheWrite: 100, cacheRead: 500, cost: 0.0042 },
      toolUses: 5,
      durationMs: 120_000,
      runs: 2,
    });
    const title = agentsMenuTitle([]);
    // Weighted: 3 × 2000 + 1000 + 0.2 × 500 + 100 = 7200.
    expect(title).toContain("Total: 7.2k token · ~$0.0042 · 󱁤 5 · 2 runs · 120.0s");
    expect(title).not.toContain("Session total");
    expect(title).not.toContain("All-time");
  });

  it("combines live and evicted totals into one Total", () => {
    accumulateLifetimeStats({ lifetimeUsage: { input: 10, output: 20, cacheWrite: 5 }, toolUses: 1, durationMs: 1_000, runs: 1 });
    const title = agentsMenuTitle([{ lifetimeUsage: { input: 100, output: 200, cacheWrite: 50, cost: 0.001 }, toolUses: 2 }]);
    // Combined tokens 750+75=825, cost 0.001, toolUses 2+1=3, runs 1+1=2, duration 1.0s
    expect(title).toContain("Total:");
    expect(title).toContain("825 token");
    expect(title).toContain("󱁤 3");
    expect(title).toContain("2 runs");
    expect(title).toContain("1.0s");
    expect(title).not.toContain("Session total");
    expect(title).not.toContain("All-time");
  });

  it("live agents with timing contribute duration", () => {
    const now = Date.now();
    const title = agentsMenuTitle([
      { lifetimeUsage: { input: 100, output: 200, cacheWrite: 50 }, toolUses: 1, started: true, startedAt: now - 5_000, completedAt: now },
    ]);
    expect(title).toContain("Total:");
    expect(title).toContain("5.0s");
    expect(title).toContain("1 run");
  });

  it("never-started queued agents contribute nothing", () => {
    const title = agentsMenuTitle([
      { lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 }, toolUses: 0, started: false },
    ]);
    expect(title).toBe("Agents");
  });
});
