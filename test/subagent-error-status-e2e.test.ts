/**
 * subagent-error-status-e2e.test.ts — regression for issue #144: a subagent
 * whose final assistant turn is a provider error must be reported as a
 * failure, not as "completed" with an empty (or stale) result.
 *
 * Full-stack: real pi loader + real extension + real runAgent + real child
 * sessions on a faux model. Faux is the point, not a shortcut — the scenario is
 * a provider error with zero content, which no live model will produce on
 * request. Each run pins `live: false` so the pre-publish smoke's global
 * `PI_E2E_LIVE=1` can't swap a real model in and turn this suite red.
 */
import { type Context, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agentCall,
  type FauxReply,
  type PrintModeRun,
  runPrintMode,
} from "./helpers/print-mode-runner.js";

/** Text of the retrieved result — what the orchestrator LLM sees after the handoff. */
function retrievedResult(session: AgentSession): string {
  const msg = [...session.messages].reverse().find(
    (m) => m.role === "toolResult" && (m as { toolName?: string }).toolName === "get_subagent_result",
  );
  return ((msg?.content ?? []) as Array<{ text?: string }>).map((b) => b.text ?? "").join("");
}

/** Drive a parent through the detached handoff before reading the child result. */
function backgroundRoute(
  description: string,
  prompt: string,
  subagent: (context: Context) => FauxReply,
): (context: Context) => FauxReply {
  return (context) => {
    const isParent = (context.tools ?? []).some((tool) => tool.name === "Agent");
    if (!isParent) return subagent(context);

    const agentResult = [...context.messages].reverse().find(
      (message) => message.role === "toolResult" && (message as { toolName?: string }).toolName === "Agent",
    );
    const fetched = [...context.messages].reverse().find(
      (message) => message.role === "toolResult" && (message as { toolName?: string }).toolName === "get_subagent_result",
    );
    if (fetched) return "parent done";
    if (agentResult) {
      const text = ((agentResult.content ?? []) as Array<{ text?: string }>).map((block) => block.text ?? "").join("");
      const id = /Agent ID:\s*(\S+)/.exec(text)?.[1];
      if (!id) throw new Error(`No agent ID in handoff: ${text}`);
      return fauxToolCall("get_subagent_result", { agent_id: id, wait: true });
    }
    return agentCall({ description, prompt });
  };
}

vi.setConfig({ testTimeout: 30_000 });

// Not matched by pi's transient-error patterns → no auto-retry, deterministic.
const FATAL = "invalid request: provider rejected the prompt";

describe("issue #144 — empty-error final turns must not be 'completed'", () => {
  let run: PrintModeRun | undefined;
  afterEach(async () => {
    await run?.dispose();
    run = undefined;
  });

  it("a run whose ONLY turn errors with no output is a failure, not an empty success", async () => {
    run = await runPrintMode({
      prompt: "Delegate.",
      respond: backgroundRoute("doomed", "Do work.",
        // The child's one and only turn: provider error, zero content.
        () => fauxAssistantMessage([], { stopReason: "error", errorMessage: FATAL }),
      ),
      live: false,
    });

    // DESIRED: the orchestrator sees a failure naming the provider error —
    // not a clean success reading "No output.".
    const toolResult = retrievedResult(run.parentSession);
    expect(toolResult).toContain(FATAL);
    expect(toolResult).not.toContain("No output.");
  });

  it("an earlier turn's text must not mask a failed final turn as a fresh success", async () => {
    run = await runPrintMode({
      prompt: "Delegate.",
      respond: backgroundRoute("masked", "Do work.", (ctx) => {
        const hasToolResult = ctx.messages.some((m) => m.role === "toolResult");
        // Turn 1: real text + a tool call. Turn 2 (after the tool result):
        // provider error with zero content.
        return hasToolResult
          ? fauxAssistantMessage([], { stopReason: "error", errorMessage: FATAL })
          : fauxAssistantMessage([
              fauxText("EARLIER-PARTIAL-TEXT"),
              fauxToolCall("bash", { command: "echo hi" }),
            ]);
      }),
      live: false,
    });

    // The orchestrator sees the failure (not the earlier text as a clean
    // answer), AND the partial output is salvaged, clearly labeled as
    // pre-failure so it can't be mistaken for the final answer.
    const toolResult = retrievedResult(run.parentSession);
    expect(toolResult).toContain(FATAL);
    expect(toolResult).toContain("Partial output before the failure:");
    expect(toolResult).toContain("EARLIER-PARTIAL-TEXT");
    // The failure headline comes before the salvaged partial output.
    expect(toolResult.indexOf(FATAL)).toBeLessThan(toolResult.indexOf("EARLIER-PARTIAL-TEXT"));
  });

  it("a pure empty-error run shows no 'partial output' section", async () => {
    run = await runPrintMode({
      prompt: "Delegate.",
      respond: backgroundRoute("empty", "Do work.",
        () => fauxAssistantMessage([], { stopReason: "error", errorMessage: FATAL }),
      ),
      live: false,
    });

    const toolResult = retrievedResult(run.parentSession);
    expect(toolResult).toContain(FATAL);
    expect(toolResult).not.toContain("Partial output before the failure:");
  });
});
