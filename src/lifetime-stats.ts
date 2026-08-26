/** lifetime-stats.ts — Permanent store of all evicted subagent work. */

import { addUsage, type LifetimeUsage } from "./usage.js";

/**
 * Aggregate of everything the permanent store counts. Same shape as the fields
 * folded from a departing record, so `accumulateLifetimeStats` takes one:
 * `runs` is 1 for a single record.
 */
export interface LifetimeStats {
  lifetimeUsage: LifetimeUsage;
  toolUses: number;
  durationMs: number;
  runs: number;
}

/**
 * Module-level accumulator. In-memory by design (issue 7u2 sub-question (a)):
 * it survives `/new` and agent cleanup for the pi process lifetime at the cost
 * of a handful of numbers, and dies with the process. A file-backed upgrade is
 * a serialization wrapper around the same accumulate/read API — no call site
 * would change.
 */
const allTime: LifetimeStats = {
  lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
  toolUses: 0,
  durationMs: 0,
  runs: 0,
};

/** Fold a departing record's stats into the permanent store. */
export function accumulateLifetimeStats(stats: LifetimeStats): void {
  addUsage(allTime.lifetimeUsage, stats.lifetimeUsage);
  allTime.toolUses += stats.toolUses;
  allTime.durationMs += stats.durationMs;
  allTime.runs += stats.runs;
}

/** Snapshot of the permanent store; callers cannot mutate it. */
export function getAllTimeStats(): LifetimeStats {
  return { ...allTime, lifetimeUsage: { ...allTime.lifetimeUsage } };
}

/** Test helper: zero the permanent store. */
export function resetLifetimeStats(): void {
  allTime.lifetimeUsage = { input: 0, output: 0, cacheWrite: 0 };
  allTime.toolUses = 0;
  allTime.durationMs = 0;
  allTime.runs = 0;
}