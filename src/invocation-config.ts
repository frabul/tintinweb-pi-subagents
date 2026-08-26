import { Type } from "@sinclair/typebox";
import type { AgentConfig, IsolationMode, JoinMode, ThinkingLevel } from "./types.js";

/**
 * The model-facing `isolation` parameter, shared by the `Agent` tool and the
 * nested delegation tool so the two cannot drift.
 *
 * Shape matters more than wording here. As a single-value optional literal,
 * models that fill every optional parameter — the transcript on #231 shows one
 * emitting `resume: ""`, `schedule: ""` and `model: "default"` alongside it —
 * had only `"worktree"` available to fill it with, and kept spawning worktrees
 * across three turns while their own reasoning said to omit the field. Every
 * other optional parameter has an inert filler; this one did not. `"off"` is
 * listed first and described as the default so the harmless value is the
 * obvious one to reach for.
 *
 * The wording tracks Claude Code's own `isolation` parameter, whose phrasing
 * models have the most exposure to: one description on the union rather than
 * per-value ones, opening "Isolation mode.", then a sentence per value in
 * schema order, each with its caveats in a trailing parenthetical. Two clauses
 * are ours, because our shape is not theirs — `"off"` has no counterpart there
 * (their enum is `worktree | remote`, so both of their values do something),
 * and neither does the uncommitted-work warning, which is the specific trap
 * #231 fell into. Deliberately absent is any "only use a worktree when…"
 * restriction: Claude Code's `Agent` tool states the capability and stops, and
 * a second legal value is what lets a model decline one, not being told to.
 */
const isolationParamShape = {
  isolation: Type.Optional(
    Type.Union([Type.Literal("off"), Type.Literal("worktree")], {
      description:
        'Isolation mode. Default "off". "off" runs the agent in the current checkout, the same as omitting the field. "worktree" creates a temporary git worktree so the agent works on an isolated copy of the repo (a copy cannot see uncommitted or staged changes in the main checkout).',
    }),
  ),
};

/**
 * Build the `isolation` parameter for a tool schema, or nothing when the
 * project disabled worktrees (`worktreeIsolation: false`).
 *
 * Dropping the field beats accepting it and quietly downgrading. The setting is
 * for a project whose model passes `"worktree"` on *every* call, so a
 * per-result "isolation was disabled" note would be noise on every result and
 * would keep raising the salience of a capability that isn't there. With no
 * field there is nothing to pass, nothing to drop, and nothing to explain — the
 * same trade `scheduleParam` makes for disabled scheduling, at zero LLM-context
 * cost. The resolver gate and the `agent-manager` check still cover the paths a
 * schema can't reach: agent files, the scheduler, and cross-extension RPC.
 *
 * Like `scheduleParam`, this is read once at tool registration — flipping the
 * setting needs a new pi session for the schema to change.
 */
export function isolationParam(enabled: boolean): Partial<typeof isolationParamShape> {
  return enabled ? isolationParamShape : {};
}

interface AgentInvocationParams {
  model?: string;
  thinking?: string;
  max_turns?: number;
  run_in_background?: boolean;
  inherit_context?: boolean;
  isolated?: boolean;
  /**
   * Untyped on purpose. Both tool schemas now build this field conditionally
   * and spread it, which erases TypeBox's literal inference to `unknown` (the
   * `schedule` param has the same shape). The resolver below narrows by
   * comparison rather than trusting the declaration, which also makes it safe
   * for the cross-extension RPC path, where options arrive unvalidated.
   */
  isolation?: unknown;
}

interface ResolveOptions {
  /**
   * Whether worktree isolation is permitted at all. False when the project set
   * `worktreeIsolation: false`, which drops a requested worktree rather than
   * failing the call: the fail-loud precedent covers spawns that *cannot* work,
   * while this one is the user opting out, and throwing would break exactly the
   * calls the `"off"` value exists to tolerate. Defaults to allowed.
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
  const rawIsolation = typeof params.isolation === "string"
    ? params.isolation.trim() || undefined
    : params.isolation;
  // `inherit_context` is boolean in the current schema. Keep unvalidated
  // compatibility callers from turning a blank string into a truthy setting.
  const rawInheritContext = typeof params.inherit_context === "boolean"
    ? params.inherit_context
    : undefined;

  // The caller's model is the one deliberate exception to frontmatter-first
  // resolution: `model` is documented as an override, while frontmatter is its
  // default. Isolation keeps its existing frontmatter veto semantics.
  const requested = agentConfig?.isolation ?? rawIsolation;
  const isolation = requested === "worktree" && opts?.worktreeAllowed !== false ? "worktree" : undefined;

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
