/**
 * status-note.ts — Honest framing for an agent result: the parenthetical status
 * note for a non-normal outcome, and the salvaged partial output of a failure.
 *
 * Lives here rather than in an index.ts closure because both entry points need
 * it — the top-level tools and the nested delegation tools, which can't import
 * from index.ts (that is the extension entry, and it already reaches these tools
 * through agent-runner).
 */

import type { AgentRecord } from "./types.js";

/**
 * Explicit parenthetical note for a non-normal terminal outcome, so the parent
 * agent can't mistake partial output for a completed result. Empty string for a
 * clean completion (and any unknown/non-terminal status).
 *
 * `stopped` (a human aborted it) is deliberately distinct from `aborted` (a
 * limit was hit) — the parent should treat human intervention differently from
 * a budget cutoff. `limitReason` names which limit (`turns` or `context`)
 * wrapped up or aborted the run when the record carries it.
 */
export function getStatusNote(status: string, limitReason?: "turns" | "context"): string {
  switch (status) {
    case "stopped":
      return " (STOPPED BY THE USER before completion — output is partial; the task was NOT finished)";
    case "aborted":
      return limitReason === "context"
        ? " (aborted — hit the context length limit before completion; output may be incomplete)"
        : " (aborted — hit the turn limit before completion; output may be incomplete)";
    case "steered":
      return limitReason === "context"
        ? " (wrapped up at the context length limit — output may be partial)"
        : " (wrapped up at the turn limit — output may be partial)";
    default:
      return "";
  }
}

/**
 * Salvaged partial output of a failed run, as a labeled suffix for the error
 * surfaces (or "" if the run produced nothing). `record.result` is bounded to
 * the run's own turns, so this is never a stale earlier answer (#144).
 */
export function partialOutputSuffix(record: AgentRecord): string {
  const partial = record.result?.trim();
  return partial ? `\n\nPartial output before the failure:\n${partial}` : "";
}
