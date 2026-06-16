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
  return {
    // Caller-supplied `params.model` wins over the agent's frontmatter
    // default. The param is documented as an "override ... omit to use the
    // agent type's default" — frontmatter is the default, not authoritative.
    modelInput: params.model ?? agentConfig?.model,
    modelFromParams: params.model != null,
    thinking: (agentConfig?.thinking ?? params.thinking) as ThinkingLevel | undefined,
    maxTurns: agentConfig?.maxTurns ?? params.max_turns,
    inheritContext: agentConfig?.inheritContext ?? normalizeAgentInheritContext(params.inherit_context) ?? false,
    runInBackground: agentConfig?.runInBackground ?? params.run_in_background ?? false,
    isolated: agentConfig?.isolated ?? params.isolated ?? false,
    isolation: agentConfig?.isolation ?? params.isolation,
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
