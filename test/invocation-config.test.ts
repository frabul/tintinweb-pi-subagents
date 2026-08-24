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
  it("lets tool-call params override agent config for model only; other fields stay config-authoritative", () => {
    // The `model` param is documented as an override ("omit to use the agent
    // type's default"), so the param wins. All other fields remain
    // frontmatter-authoritative — only fill gaps when the config leaves them
    // unspecified.
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

    // Model: param wins
    expect(resolved.modelInput).toBe("provider/param-model");
    expect(resolved.modelFromParams).toBe(true);
    // Other fields: config wins
    expect(resolved.thinking).toBe("high");
    expect(resolved.maxTurns).toBe(42);
    expect(resolved.inheritContext).toBe(false);
    expect(resolved.runInBackground).toBe(false);
    expect(resolved.isolated).toBe(false);
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
    expect(resolved.inheritContext).toBe("summary");
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(true);
    expect(resolved.isolation).toBeUndefined();
  });

  it("lets parent fill in booleans when config leaves them undefined", () => {
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

    expect(resolved.inheritContext).toBe("summary");
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(true);
  });

  it("treats a blank model override as omitted and falls back to frontmatter", () => {
    // The LLM frequently emits an empty-string model override. That must be
    // ignored so the agent type's pinned model (worker.md `model:`) applies,
    // rather than leaking the parent/main-agent model.
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ model: "provider/config-model" }),
      { model: "" },
    );
    expect(resolved.modelInput).toBe("provider/config-model");
    expect(resolved.modelFromParams).toBe(false);
  });

  it("treats a whitespace-only model override as omitted", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ model: "provider/config-model" }),
      { model: "   " },
    );
    expect(resolved.modelInput).toBe("provider/config-model");
    expect(resolved.modelFromParams).toBe(false);
  });

  it("treats a blank thinking override as omitted and falls back to frontmatter", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ thinking: "high" }),
      { thinking: "" },
    );
    expect(resolved.thinking).toBe("high");
  });

  it("treats a blank inherit_context override as omitted and falls back to frontmatter", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ inheritContext: "fork" }),
      { inherit_context: "" },
    );
    expect(resolved.inheritContext).toBe("fork");
  });

  it("treats a blank inherit_context override as omitted (no config) and defaults to false", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ inheritContext: undefined }),
      { inherit_context: "   " },
    );
    expect(resolved.inheritContext).toBe(false);
  });

  it("defaults booleans to false when neither config nor params set them", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        inheritContext: undefined,
        runInBackground: undefined,
        isolated: undefined,
      }),
      {},
    );

    expect(resolved.inheritContext).toBe(false);
    expect(resolved.runInBackground).toBe(false);
    expect(resolved.isolated).toBe(false);
  });
});

describe("resolveJoinMode", () => {
  it("returns the global default for background agents", () => {
    expect(resolveJoinMode("smart", true)).toBe("smart");
    expect(resolveJoinMode("async", true)).toBe("async");
  });

  it("ignores join mode for foreground agents", () => {
    expect(resolveJoinMode("smart", false)).toBeUndefined();
    expect(resolveJoinMode("group", false)).toBeUndefined();
  });
});
