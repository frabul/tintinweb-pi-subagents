import { describe, expect, it } from "vitest";
import { resolveAgentInvocationConfig, resolveJoinMode } from "../src/invocation-config.js";
import type { AgentConfig } from "../src/types.js";

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "Explore",
    description: "Explore",
    builtinToolNames: ["read"],
    extensions: false,
    skills: false,
    systemPrompt: "Test agent",
    promptMode: "replace",
    inheritContext: false,
    runInBackground: false,
    isolated: false,
    ...overrides,
  };
}

describe("resolveAgentInvocationConfig", () => {
  it("lets tool-call params override every agent-config field except isolation", () => {
    // An explicit tool call is the orchestrator's instruction, so `model`,
    // `thinking`, `max_turns`, `inherit_context` and `isolated` all win over the
    // agent file's frontmatter. Worktree isolation has no caller-facing
    // parameter and stays frontmatter-only.
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        model: "provider/config-model",
        thinking: "high",
        maxTurns: 42,
        inheritContext: false,
        runInBackground: false,
        isolated: false,
        isolation: "worktree",
      }),
      {
        model: "provider/param-model",
        thinking: "minimal",
        max_turns: 1,
        inherit_context: true,
        run_in_background: true,
        isolated: true,
      },
    );

    expect(resolved.modelInput).toBe("provider/param-model");
    expect(resolved.modelFromParams).toBe(true);
    expect(resolved.thinking).toBe("minimal");
    expect(resolved.maxTurns).toBe(1);
    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(true);
    // Isolation is frontmatter-only — the param cannot set it, and the config
    // value is preserved.
    expect(resolved.isolation).toBe("worktree");
  });

  it("uses tool-call params when no agent config is available", () => {
    const resolved = resolveAgentInvocationConfig(undefined, {
      model: "provider/param-model",
      thinking: "minimal",
      max_turns: 3,
      inherit_context: true,
      run_in_background: true,
      isolated: true,
    });

    expect(resolved.modelInput).toBe("provider/param-model");
    expect(resolved.modelFromParams).toBe(true);
    expect(resolved.thinking).toBe("minimal");
    expect(resolved.maxTurns).toBe(3);
    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(true);
    // Worktree isolation is frontmatter-only — no param can request it.
    expect(resolved.isolation).toBeUndefined();
  });

  it("falls back to the agent config when the caller omits a field", () => {
    // Caller params win, so where the call leaves a field blank the frontmatter
    // default is the fallback (it no longer outranks the caller).
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        model: "provider/config-model",
        thinking: "high",
        maxTurns: 42,
        inheritContext: true,
        isolated: true,
        isolation: "worktree",
      }),
      { model: "provider/param-model" },
    );

    expect(resolved.modelInput).toBe("provider/param-model");
    expect(resolved.thinking).toBe("high");
    expect(resolved.maxTurns).toBe(42);
    expect(resolved.inheritContext).toBe(true);
    expect(resolved.isolated).toBe(true);
    expect(resolved.isolation).toBe("worktree");
  });

  it("lets caller params fill fields the agent config leaves unspecified", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        inheritContext: undefined,
        runInBackground: undefined,
        isolated: undefined,
      }),
      {
        inherit_context: true,
        run_in_background: true,
        isolated: true,
      },
    );

    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(true);
  });

  it("treats blank optional string params as omitted (config wins the gap)", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ model: "provider/config-model", thinking: "high", isolation: "worktree" }),
      { model: "   ", thinking: "" },
    );

    expect(resolved.modelInput).toBe("provider/config-model");
    expect(resolved.modelFromParams).toBe(false);
    expect(resolved.thinking).toBe("high");
    // Frontmatter is the only isolation source — it survives unchanged.
    expect(resolved.isolation).toBe("worktree");
  });

  it("treats a blank inherit_context param as omitted", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ inheritContext: undefined }),
      { inherit_context: "" as unknown as boolean },
    );

    expect(resolved.inheritContext).toBe(false);
  });

  it("defaults execution to background when neither config nor params set it", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        inheritContext: undefined,
        runInBackground: undefined,
        isolated: undefined,
      }),
      {},
    );

    expect(resolved.inheritContext).toBe(false);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(false);
  });

  // Worktree isolation is configured exclusively in agent frontmatter: the
  // resolver reads it from agentConfig only and applies the project kill-switch.
  it('keeps a frontmatter isolation of "worktree"', () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ isolation: "worktree" }), {});
    expect(resolved.isolation).toBe("worktree");
  });

  it("drops worktree isolation when the project disallows it", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ isolation: "worktree" }), {}, { worktreeAllowed: false });
    expect(resolved.isolation).toBeUndefined();
  });

  it("keeps worktree isolation when the project allows it", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ isolation: "worktree" }), {}, { worktreeAllowed: true });
    expect(resolved.isolation).toBe("worktree");
  });
});

describe("resolveJoinMode", () => {
  it("returns the global default for every detached agent", () => {
    expect(resolveJoinMode("smart")).toBe("smart");
    expect(resolveJoinMode("async")).toBe("async");
    expect(resolveJoinMode("group")).toBe("group");
  });
});
