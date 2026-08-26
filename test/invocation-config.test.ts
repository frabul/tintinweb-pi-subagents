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
    // `model` is documented as an explicit override, so the caller wins.
    // Other fields remain frontmatter-authoritative — only fill gaps when the
    // config leaves them unspecified.
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
    expect(resolved.thinking).toBe("high");
    expect(resolved.maxTurns).toBe(42);
    expect(resolved.inheritContext).toBe(false);
    expect(resolved.runInBackground).toBe(true);
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
    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(true);
    // Worktree isolation is frontmatter-only — no param can request it.
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

    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(true);
  });

  it("treats blank optional string params as omitted", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ model: "provider/config-model", thinking: "high", isolation: "worktree" }),
      { model: "   ", thinking: "" },
    );

    expect(resolved.modelInput).toBe("provider/config-model");
    expect(resolved.modelFromParams).toBe(false);
    expect(resolved.thinking).toBe("high");
    // Frontmatter is the only isolation source — it survives unchanged.
    expect(resolved.isolation).toBe("worktree");
    expect(resolved.overridden).toBeUndefined();
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

describe("resolveAgentInvocationConfig — overridden params (#182)", () => {
  it("records only caller values ignored by frontmatter-authoritative fields", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ model: "provider/config-model", thinking: "low" }),
      { model: "provider/param-model", thinking: "max" },
    );

    // The thinking parameter is still ignored when frontmatter sets it. The
    // model parameter wins, so there is no model value to disclose as ignored.
    expect(resolved.overridden).toEqual({ thinking: "max" });
    expect(resolved.modelInput).toBe("provider/param-model");
  });

  it("records nothing when the caller got what they asked for", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ model: "provider/same", thinking: "high" }),
      { model: "provider/same", thinking: "high" },
    );

    expect(resolved.overridden).toBeUndefined();
  });

  it("records nothing when only one side named a value", () => {
    // Config-only is the agent's own default, not an override; param-only won
    // outright. Neither is a request that went unhonored.
    expect(resolveAgentInvocationConfig(
      makeConfig({ model: "provider/config-model", thinking: "low" }),
      {},
    ).overridden).toBeUndefined();

    expect(resolveAgentInvocationConfig(
      makeConfig(),
      { model: "provider/param-model", thinking: "max" },
    ).overridden).toBeUndefined();
  });

  it("records thinking independently from the caller-wins model", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ thinking: "low" }),
      { model: "provider/param-model", thinking: "max" },
    );

    expect(resolved.overridden).toEqual({ thinking: "max" });
    expect(resolved.modelInput).toBe("provider/param-model");
  });

  it("does not record a model override when both sides specify different models", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ model: "provider/config-model" }),
      { model: "provider/param-model" },
    );

    expect(resolved.overridden).toBeUndefined();
  });
});
