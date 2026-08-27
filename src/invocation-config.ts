import type { AgentConfig, IsolationMode, JoinMode, ThinkingLevel } from "./types.js";

interface AgentInvocationParams {
  model?: string;
  thinking?: string;
  max_turns?: number;
  max_context_length?: number;
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
  maxContextLength?: number;
  inheritContext: boolean;
  runInBackground: boolean;
  isolated: boolean;
  isolation?: IsolationMode;
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

  // Every caller parameter wins over the agent file's frontmatter: a tool
  // call is the orchestrator's explicit instruction, so `model`, `thinking`,
  // `max_turns`, `inherit_context` and `isolated` all override their frontmatter
  // defaults when supplied. The one field the caller cannot set is worktree
  // isolation — it is configured exclusively in the agent's frontmatter, and
  // only `"worktree"` opts in (anything else or an absent field means no
  // worktree).
  const isolation = agentConfig?.isolation === "worktree"
    && opts?.worktreeAllowed !== false
    ? "worktree"
    : undefined;


  return {
    modelInput: rawModel ?? agentConfig?.model,
    modelFromParams: rawModel != null,
    thinking: (rawThinking ?? agentConfig?.thinking) as ThinkingLevel | undefined,
    maxTurns: params.max_turns ?? agentConfig?.maxTurns,
    // Per-call only — there is no frontmatter `max_context_length` field, so
    // the parameter is the sole source (the project default applies later).
    maxContextLength: params.max_context_length,
    inheritContext: rawInheritContext ?? agentConfig?.inheritContext ?? false,
    // Retain the resolved field for invocation snapshots and older callers,
    // but never allow configuration or legacy options to select inline work.
    runInBackground: true,
    isolated: params.isolated ?? agentConfig?.isolated ?? false,
    isolation,
  };
}

export function resolveJoinMode(defaultJoinMode: JoinMode): JoinMode {
  return defaultJoinMode;
}
