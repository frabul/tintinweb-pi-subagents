/** usage.ts — Token usage: shapes, accumulator operators, session-stats readers. */

/**
 * Lifetime usage components, accumulated via `message_end` events. Survives
 * compaction (which replaces session.state.messages and would reset any
 * stats-derived sum).
 *
 * The token DISPLAY total deliberately condenses all four token components into
 * one weighted score: output is weighted at 3×, cacheRead at 0.2×, and input
 * and cacheWrite at 1×. Upstream's `tokens.total` sums a cumulative cached
 * prefix once per turn (issue #38), so giving `cacheRead` a reduced weight
 * avoids letting repeated prefix reads dominate while still representing all
 * four stats. `cacheRead` is optional for compatibility with older
 * accumulators and absent reads as 0.
 *
 * Cost is accumulated separately as a plain sum: it is what pi charged for each
 * message (`usage.cost.total`, priced from the model's rates), not a token
 * component. It is optional because a model with no pricing data reports no
 * cost, and because every accumulator predates it; absent reads as 0.
 */
export type LifetimeUsage = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead?: number;
  cost?: number;
};

/** Weighted lifetime token score for DISPLAY, or 0 if undefined. */
export function getLifetimeTotal(u?: LifetimeUsage): number {
  return u ? Math.round(3 * u.output + u.input + 0.2 * (u.cacheRead ?? 0) + u.cacheWrite) : 0;
}

/** Accumulated cost in USD, or 0 when unpriced/undefined. */
export function getLifetimeCost(u?: LifetimeUsage): number {
  return u?.cost ?? 0;
}

/** Add a usage delta into a target accumulator (mutates target). */
export function addUsage(into: LifetimeUsage, delta: LifetimeUsage): void {
  into.input += delta.input;
  into.output += delta.output;
  into.cacheWrite += delta.cacheWrite;
  if (delta.cacheRead) into.cacheRead = (into.cacheRead ?? 0) + delta.cacheRead;
  if (delta.cost) into.cost = (into.cost ?? 0) + delta.cost;
}

/**
 * A pi `Usage`. Rebuilt here rather than imported so this module stays
 * dependency-free for tests; the fields are pi's, and every one of them must be
 * present: pi's `addUsageToTotals` dereferences `usage.cost.total` with no
 * guard, so a partial object throws inside pi rather than at the call site.
 *
 * This is pi's convention for spend in anything handed to a consumer — every
 * extension-facing payload that carries it takes the whole object
 * (`ToolResultEvent`, `ToolResultEventResult`, `AssistantMessage`, …), never a
 * flattened cost. Pi flattens only in computed read APIs it expects you to
 * render, like `SessionStats`. So both places we hand usage to someone else —
 * `AgentToolResult.usage` and the `subagents:completed` / `subagents:failed`
 * events — carry this, and gain whatever pi adds to `Usage` for free.
 */
export type ReportedUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
};

/**
 * Render an accumulator as a pi `Usage`, or undefined when nothing was spent —
 * callers attach nothing rather than a zero, so a consumer can tell "spent
 * nothing" from "never ran".
 *
 * `cacheRead` is included at its full (unweighted) value, unlike in the
 * weighted `getLifetimeTotal`: pi sums it across a session's own assistant
 * messages, and the prefix genuinely is re-read and re-billed on every call.
 * Only `total` is populated on the cost breakdown; pi reads nothing else from
 * it, and the per-kind split is not tracked.
 */
export function toReportedUsage(u: LifetimeUsage): ReportedUsage | undefined {
  const { input, output, cacheWrite, cacheRead = 0, cost = 0 } = u;
  if (input === 0 && output === 0 && cacheWrite === 0 && cacheRead === 0 && cost === 0) return undefined;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
  };
}

/**
 * Subagent spend that the parent session has not been told about yet.
 *
 * Subagents run in their own pi sessions, so none of what they spend appears in
 * the parent's `getSessionStats()`. Pi does aggregate `toolResult.usage` into
 * those stats, though — so the way back into the parent's footer and `/cost` is
 * to hang the spend on a tool result. Background and scheduled agents finish
 * between tool calls with nothing to hang it on, hence a pool: every assistant
 * message lands here as it happens, and the next tool result we return carries
 * whatever has accumulated.
 *
 * Drain empties it, so each message is reported exactly once no matter how many
 * results are returned or how many agents were running.
 */
export class PendingUsagePool {
  private pending: LifetimeUsage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 };
  private dirty = false;

  add(delta: LifetimeUsage): void {
    addUsage(this.pending, delta);
    this.dirty = true;
  }

  /**
   * Take everything accumulated so far as a pi `Usage`, resetting the pool.
   * Returns undefined when nothing is pending, so callers can leave the tool
   * result untouched rather than attaching a zero.
   */
  drain(): ReportedUsage | undefined {
    if (!this.dirty) return undefined;
    const drained = toReportedUsage(this.pending);
    this.pending = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 };
    this.dirty = false;
    return drained;
  }
}

/** Minimal shape we read from upstream `getSessionStats()`. */
export type SessionStatsLike = {
  tokens: { input: number; output: number; cacheWrite: number; cacheRead?: number };
  contextUsage?: { percent: number | null };
};
export type SessionLike = { getSessionStats(): SessionStatsLike };

/**
 * Session-scoped weighted token score (same formula as getLifetimeTotal).
 * It is reported by upstream `getSessionStats().tokens` for the *current*
 * session window.
 *
 * RESETS at compaction — upstream replaces `session.state.messages` and the
 * stats are derived from that array. For a lifetime total that survives
 * compaction, use `getLifetimeTotal(lifetimeUsage)` instead, which reads
 * from an independent accumulator fed by `message_end` events.
 *
 * Avoids upstream's `tokens.total` field: it sums per-turn `cacheRead` and so
 * counts the cumulative cached prefix N times across N turns (issue #38). The
 * same weighted formula as the lifetime display keeps that prefix represented
 * without letting it dominate the score.
 */
export function getSessionTokens(session: SessionLike | undefined): number {
  if (!session) return 0;
  try {
    const t = session.getSessionStats().tokens;
    return Math.round(3 * t.output + t.input + 0.2 * (t.cacheRead ?? 0) + t.cacheWrite);
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
