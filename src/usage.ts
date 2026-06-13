/** usage.ts — Token usage: shapes, accumulator operators, session-stats readers. */

/**
 * Lifetime usage components, accumulated via `message_end` events. Survives
 * compaction (which replaces session.state.messages and would reset any
 * stats-derived sum).
 */
export type LifetimeUsage = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  cost: number;
};

/** Weighted token score: 3× output + input + 0.2× cacheRead + cacheWrite. */
export function getLifetimeTotal(u?: LifetimeUsage): number {
  return u ? Math.round(3 * u.output + u.input + 0.2 * u.cacheRead + u.cacheWrite) : 0;
}

/** Add a usage delta into a target accumulator (mutates target). */
export function addUsage(into: LifetimeUsage, delta: LifetimeUsage): void {
  into.input += delta.input;
  into.output += delta.output;
  into.cacheWrite += delta.cacheWrite;
  into.cacheRead += delta.cacheRead;
  into.cost += delta.cost;
}

/** Minimal shape we read from upstream `getSessionStats()`. */
export type SessionStatsLike = {
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextUsage?: { percent: number | null };
};
export type SessionLike = { getSessionStats(): SessionStatsLike };

/**
 * Session-scoped weighted token count (same formula as getLifetimeTotal).
 *
 * RESETS at compaction — upstream replaces `session.state.messages` and the
 * stats are derived from that array. For a lifetime total that survives
 * compaction, use `getLifetimeTotal(lifetimeUsage)` instead, which reads
 * from an independent accumulator fed by `message_end` events.
 *
 * The upstream `tokens.total` field sums per-turn `cacheRead` and counts
 * the cumulative cached prefix N times across N turns (issue #38), so we
 * compute our own weighted total instead.
 */
export function getSessionTokens(session: SessionLike | undefined): number {
  if (!session) return 0;
  try {
    const t = session.getSessionStats().tokens;
    return Math.round(3 * t.output + t.input + 0.2 * t.cacheRead + t.cacheWrite);
  } catch { return 0; }
}

/**
 * Context-window utilization (0–100), or null when unavailable
 * (no model contextWindow, or post-compaction before the next response).
 */
export function getSessionContextPercent(session: SessionLike | undefined): number | null {
  if (!session) return null;
  try { return session.getSessionStats().contextUsage?.percent ?? null; }
  catch { return null; }
}
