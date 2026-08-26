import type { AgentConfig, IsolationMode, JoinMode, ThinkingLevel } from "./types.js";

interface AgentInvocationParams {
  model?: string;
  thinking?: string;
  max_turns?: number;
  run_in_background?: boolean;
  inherit_context?: boolean;
  isolated?: boolean;
}

interface ResolveOptions {
  /**
   * Whether worktree isolation is permitted at all. False when the project set
   * `worktreeIsolation: false`, which drops a frontmatter `isolation: worktree`
   * request rather than failing the call: the fail-loud precedent covers spawns
   * that *cannot* work, while this one is the user opting out, and throwing
   * would break exactly the spawns the kill-switch exists to refuse. Defaults
   * to allowed.
   */
  worktreeAllowed?: boolean;
  /**
   * Legacy compatibility option. Spawns are always detached now, so callers
   * may continue to pass this field but it no longer changes the result.
   */
  defaultRunInBackground?: boolean;
}

export function resolveAgentInvocationConfig(
  agentConfig: AgentConfig | undefined,
  params: AgentInvocationParams,
  opts?: ResolveOptions,
): {
  modelInput?: string;
  modelFromParams: boolean;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  inheritContext: boolean;
  runInBackground: boolean;
  isolated: boolean;
  isolation?: IsolationMode;
  /**
   * Caller parameters an agent file's frontmatter still outranks for
   * frontmatter-authoritative fields such as `thinking`, so the surfaces can
   * say "(asked X)" instead of presenting the effective value as the requested
   * one (#182). The `model` member was intentionally dropped: `params.model`
   * is an explicit override and wins over the agent file's default, so there is
   * no caller model that can be reported as ignored.
   *
   * `max_turns` is deliberately absent: no surface renders a requested-vs-
   * effective turn limit, so recording one would be dead data.
   */
  overridden?: { thinking?: ThinkingLevel };
} {
  // Normalize optional string params before applying precedence. LLMs often
  // emit blank strings for omitted fields; treating `""` as a real value would
  // make a blank model look like an explicit override and skip frontmatter.
  const rawModel = params.model?.trim() || undefined;
  const rawThinking = params.thinking?.trim() || undefined;
  // `inherit_context` is boolean in the current schema. Keep unvalidated
  // compatibility callers from turning a blank string into a truthy setting.
  const rawInheritContext = typeof params.inherit_context === "boolean"
    ? params.inherit_context
    : undefined;

  // The caller's model is the one deliberate exception to frontmatter-first
  // resolution: `model` is documented as an override, while frontmatter is its
  // default. Worktree isolation has no caller-facing override at all — it is
  // configured exclusively in the agent's frontmatter, and only `"worktree"`
  // opts in (anything else or an absent field means no worktree).
  const isolation = agentConfig?.isolation === "worktree"
    && opts?.worktreeAllowed !== false
    ? "worktree"
    : undefined;

  const overriddenThinking = agentConfig?.thinking != null && rawThinking != null
    && agentConfig.thinking !== rawThinking
    ? rawThinking as ThinkingLevel
    : undefined;

  return {
    modelInput: rawModel ?? agentConfig?.model,
    modelFromParams: rawModel != null,
    thinking: (agentConfig?.thinking ?? rawThinking) as ThinkingLevel | undefined,
    maxTurns: agentConfig?.maxTurns ?? params.max_turns,
    inheritContext: agentConfig?.inheritContext ?? rawInheritContext ?? false,
    // Retain the resolved field for invocation snapshots and older callers,
    // but never allow configuration or legacy options to select inline work.
    runInBackground: true,
    isolated: agentConfig?.isolated ?? params.isolated ?? false,
    isolation,
    // Undefined rather than an empty object when nothing was overridden: callers
    // spread this into the invocation snapshot, and an always-present key would
    // put `requestedThinking: undefined` on every record.
    overridden: overriddenThinking !== undefined ? { thinking: overriddenThinking } : undefined,
  };
}

export function resolveJoinMode(defaultJoinMode: JoinMode): JoinMode {
  return defaultJoinMode;
}
