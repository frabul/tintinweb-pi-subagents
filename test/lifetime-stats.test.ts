/** lifetime-stats.test.ts — the permanent all-time accumulator (issue 7u2). */

import { afterEach, describe, expect, it } from "vitest";
import { accumulateLifetimeStats, getAllTimeStats, resetLifetimeStats } from "../src/lifetime-stats.js";

describe("lifetime-stats permanent store", () => {
  afterEach(resetLifetimeStats);

  it("starts empty", () => {
    const s = getAllTimeStats();
    expect(s.runs).toBe(0);
    expect(s.toolUses).toBe(0);
    expect(s.durationMs).toBe(0);
    expect(s.lifetimeUsage).toEqual({ input: 0, output: 0, cacheWrite: 0 });
  });

  it("accumulates records across evictions", () => {
    accumulateLifetimeStats({
      lifetimeUsage: { input: 100, output: 50, cacheWrite: 10, cacheRead: 500, cost: 0.002 },
      toolUses: 3,
      durationMs: 60_000,
      runs: 1,
    });
    accumulateLifetimeStats({ lifetimeUsage: { input: 20, output: 5, cacheWrite: 2 }, toolUses: 1, durationMs: 30_000, runs: 1 });

    const s = getAllTimeStats();
    expect(s.runs).toBe(2);
    expect(s.toolUses).toBe(4);
    expect(s.durationMs).toBe(90_000);
    expect(s.lifetimeUsage).toEqual({ input: 120, output: 55, cacheWrite: 12, cacheRead: 500, cost: 0.002 });
  });

  it("keeps optional lifetime fields absent until a record contributes them", () => {
    accumulateLifetimeStats({ lifetimeUsage: { input: 10, output: 10, cacheWrite: 5 }, toolUses: 0, durationMs: 0, runs: 1 });
    expect(getAllTimeStats().lifetimeUsage).toEqual({ input: 10, output: 10, cacheWrite: 5 });
  });

  it("returns a snapshot that cannot mutate the store", () => {
    accumulateLifetimeStats({ lifetimeUsage: { input: 1, output: 1, cacheWrite: 1 }, toolUses: 1, durationMs: 1, runs: 1 });
    const s = getAllTimeStats();
    s.runs = 99;
    s.durationMs = 99;
    s.lifetimeUsage.input = 99;
    expect(getAllTimeStats().runs).toBe(1);
    expect(getAllTimeStats().durationMs).toBe(1);
    expect(getAllTimeStats().lifetimeUsage.input).toBe(1);
  });
});