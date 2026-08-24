import type { AgentConfig, IsolationMode, JoinMode, ThinkingLevel } from "./types.js";

interface AgentInvocationParams {
  model?: string;
  thinking?: string;
  max_turns?: number;
  run_in_background?: boolean;
  inherit_context?: boolean | "summary" | "fork";
  isolated?: boolean;
  isolation?: IsolationMode;
}

export function resolveAgentInvocationConfig(
  agentConfig: AgentConfig | undefined,
  params: AgentInvocationParams,
): {
  modelInput?: string;
  modelFromParams: boolean;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  inheritContext: false | "summary" | "fork";
  runInBackground: boolean;
  isolated: boolean;
  isolation?: IsolationMode;
} {
  // Blank/whitespace-only string overrides from the caller are treated as
  // "not specified" — the LLM frequently emits empty-string overrides for
  // optional params. Without normalization, `""` is falsy-but-not-null: `??`
  // would skip the frontmatter default and (for `model`) `!= null` would wrongly
  // flag it as an explicit override, leaking the parent/main-agent value instead
  // of the agent type's pinned default. Each blank string is collapsed to
  // undefined so it falls through to the config default.
  const rawModel = params.model?.trim() || undefined;
  const rawThinking = params.thinking?.trim() || undefined;
  const rawIsolation = params.isolation?.trim() || undefined;
  const rawInheritContext =
    typeof params.inherit_context === "string"
      ? (params.inherit_context.trim() || undefined)
      : params.inherit_context;
  return {
    // Caller-supplied `params.model` wins over the agent's frontmatter
    // default. The param is documented as an "override ... omit to use the
    // agent type's default" — frontmatter is the default, not authoritative.
    // Blank input is normalized to undefined so it falls through to the default.
    modelInput: rawModel ?? agentConfig?.model,
    modelFromParams: rawModel != null,
    thinking: (agentConfig?.thinking ?? rawThinking) as ThinkingLevel | undefined,
    maxTurns: agentConfig?.maxTurns ?? params.max_turns,
    inheritContext: agentConfig?.inheritContext ?? normalizeAgentInheritContext(rawInheritContext) ?? false,
    runInBackground: agentConfig?.runInBackground ?? params.run_in_background ?? false,
    isolated: agentConfig?.isolated ?? params.isolated ?? false,
    isolation: agentConfig?.isolation ?? rawIsolation,
  };
}

export function resolveJoinMode(defaultJoinMode: JoinMode, runInBackground: boolean): JoinMode | undefined {
  return runInBackground ? defaultJoinMode : undefined;
}

/** Normalize inherit_context from tool-call params: true → "summary". */
function normalizeAgentInheritContext(val: boolean | "summary" | "fork" | undefined): false | "summary" | "fork" {
  if (val === true || val === "summary") return "summary";
  if (val === "fork") return "fork";
  return false;
}
